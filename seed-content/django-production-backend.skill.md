---
title: Django Backend That Survives Production Skill
category: Coding
description: Take a Django project from tutorial-shaped to production-shaped: settings split by environment, a custom user model set before the first migrate, N+1 queries eliminated, and migrations that deploy without locking a table. Covers managers, transactions and row locking, pgbouncer, DRF serializer performance, Celery boundaries, and why signals are usually a trap.
usage: Load this skill before asking your AI assistant to write Django models, views, serializers, or migrations. Say "use the Django production backend skill" and describe the feature; the assistant will write querysets that don't N+1, migrations that are reversible and lock-safe, and business logic in managers rather than fat views.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 6
timeSavedHours: 22
pocUrl: https://github.com/django/django
---

# Django Backend That Survives Production Skill

## 1. Philosophy

Django's ORM is so pleasant that it hides the database from you until the database stops being hideable — usually around 50,000 rows, in production, on a Friday. Every performance incident I have had in a Django app traces to the same root: someone wrote a loop over a queryset and Django obligingly issued 4,000 queries without complaining once.

The mental model that keeps a Django app alive:

**A queryset is a promise, not a result, and every attribute access on a related object is a potential round trip.** `Invoice.objects.all()` costs nothing. Iterating costs one query. Touching `invoice.customer.name` inside that loop costs one query *per row*. Django never warns you. The template renders fine. Staging has 12 rows.

Three rules govern everything below:

1. **Decide the shape of the SQL before you write the Python.** If you cannot say roughly how many queries a view issues, you do not know what you built. Query count is an assertion (`assertNumQueries`), not a vibe.
2. **Business logic lives in managers and querysets, not views.** A view translates HTTP to a method call and back. When the same rule must hold for the admin, a Celery task, a management command, and a DRF endpoint, it must live where all four reach it.
3. **Migrations are deploys, and deploys hold locks.** A migration is a program running against a live table while users hit it. `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock. What is instant on an empty dev database can take production down for four minutes.

## 2. Tech Stack

- **Django** — https://github.com/django/django — licensed **BSD-3-Clause**. The framework, ORM, migrations, and admin. Examples target 4.2 LTS and 5.x.
- **PostgreSQL 14+** — assumed throughout; the locking, `select_for_update`, and `contrib.postgres` advice is Postgres-specific.
- **psycopg 3** (LGPL) — the current adapter; psycopg2 works but is in maintenance.
- **Django REST Framework 3.15+** (BSD-3-Clause), **Celery 5.4+** (BSD-3-Clause), **pgbouncer** (ISC) for the later sections.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Django maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Settings: a package, not a file with `if DEBUG`

```python
# config/settings/base.py
SECRET_KEY = env("DJANGO_SECRET_KEY")       # no default: production must supply it
DEBUG = False                                # the safe default; local.py opts IN
AUTH_USER_MODEL = "accounts.User"            # see 3.2 — set this on day zero
DATABASES = {"default": env.db("DATABASE_URL")}
```

```python
# config/settings/production.py
from .base import *  # noqa
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31_536_000
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")   # only behind a trusted proxy
```

The rule: **`DEBUG = False` in `base.py`**, and `local.py` turns it on. Default it to `True` and rely on an env var to disable it, and one missing variable in a new environment serves your settings and stack traces to the internet. Run `manage.py check --deploy` before every production deploy. And never set `SECURE_PROXY_SSL_HEADER` without a proxy that strips the client's `X-Forwarded-Proto` — a client can send it and spoof HTTPS.

### 3.2 The custom user model: before the first migrate, or never

```python
# accounts/models.py
class User(AbstractUser):
    username = models.CharField(max_length=32, unique=True)
    email = models.EmailField(unique=True)
    is_verified = models.BooleanField(default=False)
```

This is the one irreversible decision in a Django project. `AUTH_USER_MODEL` must be set and this app must exist **before the first `migrate`**. Once `auth.User` exists and is referenced by `contenttypes`, permissions, admin log entries, and every `ForeignKey(User)`, swapping it is multi-day surgery with hand-written migrations. There is no management command for it. Start every project with a custom user model even if it is empty: eight lines now, a fortnight later.

Reference it correctly: `settings.AUTH_USER_MODEL` in models and migrations, `get_user_model()` at runtime. Never import the `User` class at module level in a reusable app — it evaluates at import time and breaks app loading order.

```python
seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="skills")
```

### 3.3 The N+1 problem, which is your problem

```python
for skill in Skill.objects.filter(status="live"):
    print(skill.seller.username)          # 1 + N queries. 200 skills = 201 queries.

for skill in Skill.objects.filter(status="live").select_related("seller"):
    print(skill.seller.username)          # 1 query, joined.
```

The distinction people get wrong constantly: **`select_related`** is for `ForeignKey`/`OneToOne` — forward, single-valued, compiles to a SQL `JOIN`, one query. **`prefetch_related`** is for `ManyToMany` and reverse FKs — multi-valued, issues a second query and joins in Python. You cannot `select_related` a reverse FK; the join would multiply your rows.

```python
skills = (
    Skill.objects.filter(status="live")
    .select_related("seller")
    .prefetch_related(Prefetch(
        "reviews",
        queryset=Review.objects.select_related("buyer").order_by("-created_at")[:5],
        to_attr="recent_reviews",                     # skill.recent_reviews, a plain list
    ))
    .annotate(review_count=Count("reviews", distinct=True), avg_rating=Avg("reviews__rating"))
)
```

Three traps in that block:

- **`.only()` is a foot-gun with `select_related`.** Accessing a deferred field later fires a fresh query per object — you rebuilt the N+1 you just fixed.
- **Multiple `annotate(Count(...))` across different joins multiply each other.** `Count("reviews")` and `Count("purchases")` together produce wrong numbers — the fan-out join counts a cartesian product. `distinct=True` patches it at real cost; two subqueries are usually better.
- **A slice inside `Prefetch` works; `skill.reviews.all()[:5]` inside a loop re-queries per skill.**

Two methods nobody uses enough: `.values_list("id", "title")` when you don't need model instances (exports, reports), and `.iterator(chunk_size=2000)` for large scans that must not load everything into memory — it disables the result cache, so mind the interaction with `prefetch_related`.

### 3.4 Managers and querysets: where the logic goes

```python
class SkillQuerySet(models.QuerySet):
    def live(self):
        return self.filter(status="live")

    def by_category(self, category):
        return self.filter(category=category) if category else self

    def searchable(self, term):
        return self.filter(Q(title__icontains=term) | Q(description__icontains=term)) if term else self

    def for_listing(self):
        return self.select_related("seller").annotate(avg_rating=Avg("reviews__rating"))

class Skill(models.Model):
    objects = SkillQuerySet.as_manager()
```

Now the view is three lines and every caller inherits the same rules:

```python
def marketplace(request):
    skills = (Skill.objects.live()
              .by_category(request.GET.get("category"))
              .searchable(request.GET.get("q"))
              .for_listing()
              .order_by("-downloads_count"))
    return render(request, "marketplace.html", {"skills": skills[:24]})
```

Slice last, in the view: a sliced queryset cannot be filtered further — `Skill.objects.live()[:24].filter(...)` raises. And do **not** override `get_queryset()` on the default manager to hide rows ("soft delete"). Related descriptors, the admin, and `dumpdata` all use the default manager, and rows will vanish in ways that take days to trace. Add a second manager and leave `objects` honest.

### 3.5 Migrations that don't take the site down

Every `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock — it waits for every in-flight query on the table and blocks every new one while it waits. A migration queued behind a slow read is an outage.

Safe on Postgres 11+ (metadata only): `ADD COLUMN` nullable or with a non-volatile default, `DROP CONSTRAINT`, renaming an index. Dangerous: `ADD COLUMN NOT NULL` with a **volatile** default (`default=uuid4`) and `ALTER COLUMN TYPE` (both rewrite the table), `CREATE INDEX` without `CONCURRENTLY` (blocks writes), adding a `FOREIGN KEY` (locks both tables to validate).

The zero-downtime column add is three deploys, not one — add nullable, backfill in batches while code writes both, then enforce:

```python
def backfill(apps, schema_editor):
    Skill = apps.get_model("skills", "Skill")     # HISTORICAL model, never a direct import
    qs = Skill.objects.filter(time_saved_hours__isnull=True)
    while qs.exists():
        ids = list(qs.values_list("id", flat=True)[:1000])
        Skill.objects.filter(id__in=ids).update(time_saved_hours=0)     # bounded batches

def unbackfill(apps, schema_editor):
    apps.get_model("skills", "Skill").objects.update(time_saved_hours=None)

class Migration(migrations.Migration):
    atomic = False                                 # batches commit independently, locks release
    operations = [migrations.RunPython(backfill, unbackfill)]
```

Rules for `RunPython`: **always `apps.get_model()`** — an imported class is today's model, but the migration must run against the schema as it was at that point in history, so a direct import turns a replayed migration into an error six months later. **Always supply a reverse** (`RunPython.noop` when there genuinely is none) or your rollback plan is "restore from backup." **Batch, never `.update()` a whole table** — one statement over 5M rows holds a lock and bloats WAL.

```python
class Migration(migrations.Migration):
    atomic = False                                 # required: CONCURRENTLY can't run in a transaction
    operations = [AddIndexConcurrently("skill",
        models.Index(fields=["category", "-downloads_count"], name="skill_cat_downloads_idx"))]
```

Squash past ~50 migrations per app, keeping the originals for one release cycle. **Never edit an applied migration** — someone's database already recorded it.

### 3.6 Transactions and locking

`ATOMIC_REQUESTS = True` wraps every request in a transaction: defensible for consistency, bad for throughput. The transaction stays open across template rendering and any HTTP call to Stripe, so a slow third party becomes a held Postgres connection. I prefer `False` and being deliberate.

```python
@transaction.atomic
def record_purchase(*, skill_id, buyer, amount_cents):
    skill = Skill.objects.select_for_update().get(pk=skill_id)      # row lock until commit
    purchase = Purchase.objects.create(
        skill=skill, buyer=buyer, amount_cents=amount_cents,
        commission_cents=round(amount_cents * 0.10),                # stored, never recomputed
    )
    Skill.objects.filter(pk=skill_id).update(downloads_count=F("downloads_count") + 1)
    transaction.on_commit(lambda: send_receipt.delay(purchase.id))  # fires only if the tx commits
    return purchase
```

Four things to internalize:

- **`F()` avoids read-modify-write races.** `skill.downloads_count += 1; skill.save()` loses increments under concurrency; `F(...) + 1` is one atomic statement.
- **`select_for_update()` needs an open transaction** or it raises, and it holds rows until commit. `nowait=True` / `skip_locked=True` are how you build a queue table.
- **`transaction.on_commit()` is mandatory for side effects.** Called inline, `send_receipt.delay()` fires immediately; if the transaction then rolls back, a worker looks up a row that never existed. This is the single most common Django + Celery bug.
- **Lock ordering prevents deadlocks.** Two code paths locking a skill and a user in opposite orders will deadlock under load. Pick a canonical order, document it.

### 3.7 Signals: a trap with good ergonomics

```python
@receiver(post_save, sender=Purchase)
def bump_downloads(sender, instance, created, **kwargs):
    if created:
        instance.skill.downloads_count += 1
        instance.skill.save()
```

Elegant, and a liability, in the order it will bite you. **Invisible control flow** — a reader of `record_purchase` cannot know a counter changed, and `grep` won't find it. **They don't fire for bulk operations** — `bulk_create`, `.update()`, and raw SQL skip signals, so your counter silently desyncs the first time someone writes a management command. **They fire in tests and fixtures** — `loaddata` triggers `post_save` on every row; watch your suite email a thousand people. **They run inside the caller's transaction**, extending a lock window they don't know about. **Ordering is registration order**, which follows import order, which follows `INSTALLED_APPS` — not a dependency graph.

Legitimate uses: reacting to signals from apps you don't own, and `pre_delete` cleanup of external resources. For your own domain logic, call the function.

### 3.8 The admin, honestly

A superb internal CRUD tool, a terrible customer-facing product, and an N+1 machine by default.

```python
@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("title", "seller", "status", "downloads_count")
    list_select_related = ("seller",)      # without it: one query per row for the FK column
    raw_id_fields = ("seller",)            # without it: a <select> with 200k <option> tags
    search_fields = ("title", "seller__username")
    readonly_fields = ("downloads_count", "created_at")
```

Those two settings separate an admin that loads in 80ms from one that times out. Also: `save_model` does not fire for bulk actions, actions using `.update()` bypass `save()` entirely, and `readonly_fields` is a UI affordance, not a permission. Admin access is production write access.

### 3.9 CONN_MAX_AGE, pgbouncer, and the connection you didn't budget

`CONN_MAX_AGE = 0` (the default) opens and closes a connection per request — a millisecond on a local socket, 20-50ms over TLS to RDS, plus a forked Postgres backend each time. `CONN_MAX_AGE = 600` holds connections per worker, and the arithmetic bites: **connections = workers × threads × instances**. Twenty gunicorn workers across four instances is 80 connections against a `max_connections` of 100. Add Celery and you are out of connections at 5% CPU.

The answer is pgbouncer in **transaction mode**, with the constraints it imposes:

- **`CONN_MAX_AGE = 0` when Django talks to pgbouncer.** Persistent connections plus a transaction-mode pooler defeats the pooler — you pin a server connection per worker and pgbouncer becomes a proxy. Let it own the pooling. (`CONN_HEALTH_CHECKS` only matters when `CONN_MAX_AGE > 0`.)
- **No server-side cursors** — set `DISABLE_SERVER_SIDE_CURSORS = True` or `.iterator()` breaks, because the cursor opens on one server connection and the next statement lands on another.
- **No `LISTEN/NOTIFY`, no session-level advisory locks.** Transaction-scoped ones (`pg_advisory_xact_lock`) are fine.

### 3.10 DRF serializers: the second N+1

```python
class SkillSerializer(serializers.ModelSerializer):
    seller_username = serializers.CharField(source="seller.username", read_only=True)
    avg_rating = serializers.FloatField(read_only=True)           # from annotate(), not a method
    recent_reviews = ReviewSerializer(many=True, read_only=True)  # from Prefetch(to_attr=...)

class SkillViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SkillSerializer
    pagination_class = CursorPagination                            # not PageNumber on a large table

    def get_queryset(self):
        return (Skill.objects.live().select_related("seller")
                .prefetch_related(Prefetch("reviews", to_attr="recent_reviews",
                    queryset=Review.objects.select_related("buyer")[:5]))
                .annotate(avg_rating=Avg("reviews__rating")))
```

**A `SerializerMethodField` that touches the database is an N+1 by construction** — it runs per object with no queryset context. Push it into `annotate()` and read it as a plain field. `source="seller.username"` is safe *only* because `select_related("seller")` is on the queryset. And use `CursorPagination` on anything that grows: `PageNumberPagination` runs `COUNT(*)` over the filtered set every request, and `OFFSET 40000` makes Postgres walk 40,000 rows to discard them.

### 3.11 Celery: what belongs on the other side of the boundary

Push to a worker: third-party calls (email, webhooks out), slow work (PDFs, image processing, S3), and anything scheduled. Keep in the request: anything the user must see the result of, and anything that must stay consistent with the spawning transaction.

```python
@shared_task(bind=True, max_retries=3, autoretry_for=(RequestException,),
             retry_backoff=True, retry_jitter=True, acks_late=True)
def send_receipt(self, purchase_id: int):          # an ID, never a model instance
    purchase = Purchase.objects.select_related("buyer", "skill").get(pk=purchase_id)
    mail_service.send(purchase.buyer.email, render_receipt(purchase))
```

**Pass primary keys, not objects** — a pickled model is a stale snapshot deserialized against a schema that may have moved. **Enqueue in `on_commit`** or the worker races the commit and raises `DoesNotExist`, intermittently, only under load. **Tasks must be idempotent**: `acks_late=True` plus a worker crash means it runs twice. **Retries need backoff and a ceiling** — unbounded retries against a down provider are a self-inflicted DDoS with a Celery logo.

### 3.12 The `django.contrib.postgres` box people leave unopened

```python
class Skill(models.Model):
    platforms = ArrayField(models.CharField(max_length=20), default=list)   # no join table
    search_vector = SearchVectorField(null=True)                            # trigger-maintained

    class Meta:
        indexes = [GinIndex(fields=["search_vector"]), GinIndex(fields=["platforms"])]
        constraints = [
            UniqueConstraint(fields=["seller", "slug"], name="uniq_seller_slug"),
            CheckConstraint(check=Q(price_cents__gte=0), name="price_non_negative"),
        ]

Skill.objects.annotate(rank=SearchRank(F("search_vector"), SearchQuery("chrome extension"))) \
             .filter(rank__gt=0.1).order_by("-rank")        # beats icontains at every size
```

The constraints are the point. Validation in a serializer is advice; a constraint is a fact. `clean()` does not run on `bulk_create`, `.update()`, admin bulk actions, or the psql session your future self opens at midnight. The constraint runs every time. Catch `IntegrityError` and map it to a 409 — that is a race-free uniqueness check, unlike the `if Model.objects.filter(...).exists()` that loses whenever two requests arrive together.

## 4. Anti-patterns

- **Starting on `django.contrib.auth.User`.** Unfixable later without hand surgery. Eight lines on day zero.
- **`DEBUG = True` as the default in `base.py`.** One missing env var and production serves stack traces.
- **A loop over a queryset touching `.related.field`.** The N+1. Add the prefetch and assert the query count.
- **`obj.count += 1; obj.save()`.** Lost updates under concurrency. Use `F()`.
- **`.save()` with no `update_fields` inside a loop.** Writes every column of every row, clobbering concurrent writers' fields.
- **Business logic in views.** The Celery task and the management command grow their own copies, which drift.
- **`get_queryset()` overridden on the default manager to hide rows.** Related lookups and the admin start lying to you.
- **`.update()` on a full table in a `RunPython`.** One lock, one giant WAL entry, one incident.
- **`RunPython` importing the model directly.** Works today; breaks when someone replays migrations.
- **`RunPython` with no reverse.** Your rollback plan is now a database restore.
- **Editing an applied migration.** It already ran somewhere. Write a new one.
- **`CREATE INDEX` without `CONCURRENTLY` on a hot table.** Writes block for the whole build.
- **`ATOMIC_REQUESTS = True` with an HTTP call in the view.** A transaction held open across a third party's p99.
- **`task.delay()` inline instead of in `on_commit()`.** The worker beats your commit and reads a row that isn't there.
- **Pickled model instances as Celery arguments.** Stale data plus a deserialization bomb.
- **Signals for domain logic.** Invisible, skipped by bulk ops, fired by fixtures, ordered by import chance.
- **`SerializerMethodField` doing a query.** An N+1 with a decorator on it.
- **`PageNumberPagination` on a large table.** `COUNT(*)` plus a deep `OFFSET` on every page.
- **`CONN_MAX_AGE > 0` behind transaction-mode pgbouncer.** You pinned the connections the pooler exists to share.
- **Validation only in `clean()` or a serializer.** Add the database constraint; everything else is a suggestion.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill / Cursor rule).
2. Describe the feature in domain terms, plus access rules and expected volume. Example: "Skill detail: title, seller, average rating, latest five reviews with reviewer names. ~50k skills, 400k reviews, most-hit route."
3. Ask for, in order: (a) models with constraints and indexes, (b) the manager/queryset methods, (c) the view or serializer, (d) **the expected query count**, (e) the migration with its locking impact called out.
4. Push back on: any `SerializerMethodField` with a query, any signal doing domain work, any `.save()` in a loop, any `RunPython` without a reverse, any `ALTER TABLE` on a hot table with no note about the lock.
5. Add `assertNumQueries` to the test for every list view. It is the only regression test that catches an N+1 before your users do.

The assistant should never generate a project without a custom user model, should state the query count of any queryset it writes, and should flag the locking behavior of any migration it produces.

## 6. Example Output

Prompt given with this skill loaded: *"Add reviews to skills. One review per buyer per skill, only buyers can review, and the skill list must show the average rating."*

Expected shape of the answer:

```python
class Review(models.Model):
    skill = models.ForeignKey(Skill, on_delete=models.CASCADE, related_name="reviews")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField()
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["skill", "buyer"], name="uniq_review_per_buyer_skill"),
            CheckConstraint(check=Q(rating__gte=1) & Q(rating__lte=5), name="rating_1_to_5"),
        ]
        indexes = [models.Index(fields=["skill", "-created_at"])]
```

```python
# skills/services.py — one place; the API, the admin, and any command all call this.
@transaction.atomic
def create_review(*, skill_id: int, buyer, rating: int, text: str) -> Review:
    if not Purchase.objects.filter(skill_id=skill_id, buyer=buyer).exists():
        raise PermissionDenied("Only buyers can review this skill.")
    try:
        return Review.objects.create(skill_id=skill_id, buyer=buyer, rating=rating, text=text)
    except IntegrityError as exc:
        raise Conflict("You already reviewed this skill.") from exc    # the constraint IS the check
```

```python
# 2 queries total, regardless of page size — asserted, not assumed.
class SkillListView(generics.ListAPIView):
    pagination_class = CursorPagination
    serializer_class = SkillListSerializer

    def get_queryset(self):
        return (Skill.objects.live().select_related("seller")
                .annotate(avg_rating=Avg("reviews__rating"), review_count=Count("reviews"))
                .order_by("-downloads_count", "-id"))

def test_skill_list_query_count(client, skills_factory, django_assert_num_queries):
    skills_factory(50)
    with django_assert_num_queries(2):
        client.get("/api/skills/")
```

Note what the output does *not* contain: no `post_save` signal recomputing a rating, no `SerializerMethodField` querying reviews per row, no `exists()`-then-`create()` race pretending to be a uniqueness check, no unbounded page. The constraint enforces the rule, the annotation replaces the N+1, and the query count is a test rather than a hope.
