---
title: The Rails Monolith That Scales Skill
category: Coding
description: Build a Rails app that stays fast and maintainable past 100k lines without shattering it into microservices. Covers service objects, the real difference between includes/preload/eager_load, zero-downtime migrations, counter caches, idempotent jobs, and Hotwire as the default UI answer.
usage: Load this skill before asking your AI assistant to add a feature, write a migration, or refactor a controller in a Rails codebase. Say "use the Rails monolith skill" and describe the feature; the assistant will produce models, service objects, and migrations that follow these patterns instead of scaffold output.
platforms: [Claude, Cursor, ChatGPT]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://github.com/rails/rails
---

# The Rails Monolith That Scales Skill

## 1. Philosophy

The monolith is not the thing that failed you. Undisciplined layering is. Every "we had to move to microservices" story I have read up close was really a story about a 2,000-line `User` model, a controller that opened a transaction and called three APIs inside it, and a test suite that took 40 minutes because everything touched everything.

Rails gives you convention over configuration. The mistake is treating that as a style guide instead of a budget. **Conventions are free; deviations cost.** Spend your novelty budget on the three or four places where your domain genuinely is not CRUD.

Three rules govern everything below:

1. **Fat model, skinny controller is a floor, not a ceiling.** Correct until the model hits ~200 lines, at which point "fat model" becomes "God object." The next move is not a service layer for everything — it is a service object for the specific verbs that coordinate more than one aggregate.
2. **Every query has a shape, and you must know it.** Rails makes it trivially easy to write a `.each` that fires 400 queries. `bullet` in development is a spell-checker for the only bug class that reliably takes a Rails app down.
3. **Migrations run against a live database with real traffic.** A migration that passes locally on 400 rows and locks a 40-million-row table in production is not a working migration. It is an outage with a green CI badge.

## 2. Tech Stack

- **Ruby on Rails** — https://github.com/rails/rails — licensed **MIT**. ActiveRecord, ActionPack, ActiveJob, Hotwire, and the conventions that make a monolith survivable.
- **Ruby 3.2+** — for pattern matching and the YJIT wins that are actually free.
- **PostgreSQL 14+** — the concurrent-index and lock-timeout behavior below assumes Postgres.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Ruby on Rails maintainers. All example code is original to this skill.

Recommended companions: `strong_migrations` (fails the build on unsafe DDL), `bullet` (N+1 detection), `rack-mini-profiler` (per-request SQL timing in the browser), and `sidekiq` for ActiveJob's backend.

## 3. Patterns

### 3.1 Service objects: one public verb, no `#call` soup

A service object performs one domain verb across more than one aggregate. It is not a place to hide code you did not want in the controller.

```ruby
# app/services/enrollments/create.rb
module Enrollments
  class Create
    Result = Struct.new(:ok?, :enrollment, :error, keyword_init: true)

    def initialize(student:, course:, clock: Time)
      @student, @course, @clock = student, course, clock
    end

    def call
      return failure("Course is full") if @course.seats_remaining.zero?
      return failure("Already enrolled") if @course.enrollments.exists?(student: @student)

      enrollment = nil
      ActiveRecord::Base.transaction do
        enrollment = @course.enrollments.create!(student: @student, enrolled_at: @clock.current)
        @course.decrement!(:seats_remaining)
      end

      EnrollmentMailer.with(enrollment: enrollment).welcome.deliver_later # AFTER commit, never inside
      Result.new(ok?: true, enrollment: enrollment)
    end

    private

    def failure(message) = Result.new(ok?: false, error: message)
  end
end
```

Return a result object, never a boolean — controllers need to know *why* something failed. Inject collaborators (`clock:`) so tests do not need `travel_to`. **Enqueue jobs and send mail after commit**: Sidekiq is faster than your database, and a job that reads the row before the commit lands finds nothing, which is a day spent blaming Redis. One public method — if you need `#call`, `#preview`, and `#undo`, you have three service objects.

### 3.2 `includes` vs `preload` vs `eager_load` — the actual difference

This trips up senior developers, because `includes` is documented as "smart" and its smartness is the problem.

**`preload`** always runs **separate queries** — one per association, and cannot filter on the association. **`eager_load`** always runs **one query with a LEFT OUTER JOIN**, aliasing every column, and can filter. **`includes`** picks one for you: `preload` normally, silently switching to `eager_load` if it detects the association referenced in a `where` or `order` — which requires `references`.

```ruby
Course.preload(:instructor, :enrollments).limit(20)                   # two queries; fastest plain list
Course.eager_load(:instructor).where(instructors: { active: true })   # one JOIN; can filter
Course.includes(:instructor).where("instructors.active = true").references(:instructors)
```

My rule: **say what you mean.** `preload` when you just need the data, `eager_load` when you filter or sort on the association. The single-JOIN form looks cheaper but multiplies rows across `has_many` — a course with 500 enrollments becomes 500 duplicated course rows that Rails de-duplicates in Ruby. On wide tables `preload` is often several times faster despite the extra round trip.

### 3.3 Migrations that do not lock the table

```ruby
class AddIndexToEnrollments < ActiveRecord::Migration[7.1]
  disable_ddl_transaction!   # concurrent index creation cannot run inside a transaction

  def change
    add_index :enrollments, [:course_id, :enrolled_at], algorithm: :concurrently, if_not_exists: true
  end
end
```

- `disable_ddl_transaction!` **must** accompany `algorithm: :concurrently` or Postgres errors out. A failed concurrent run leaves an **invalid index** you must drop by hand — check `pg_index.indisvalid` before retrying.
- **A `NOT NULL` column with a default is safe on Postgres 11+** — no table rewrite. Adding `NOT NULL` to an *existing* column still scans it; add it `NOT VALID`, then `VALIDATE CONSTRAINT` in a second migration.
- **Never rename a column** in a live app. Old code is still serving requests during the deploy and will `SELECT` a column that no longer exists. Add, backfill, dual-write, switch reads, drop later. Four deploys, not optional.
- **Backfill in batches, outside the migration** (`in_batches` in a rake task) — `update_all` on 40M rows is one enormous transaction. And set `lock_timeout = '5s'` so a migration that cannot get its lock fails fast instead of queueing every write behind it.

### 3.4 Scopes and `merge`: composition without leaking SQL

```ruby
class Course < ApplicationRecord
  scope :published, -> { where.not(published_at: nil) }
end

class Enrollment < ApplicationRecord
  belongs_to :course
  scope :on_published_courses, -> { joins(:course).merge(Course.published) }  # reuses the predicate
end
```

Two gotchas worth the price of this file: a scope returning `nil` breaks chaining, so always end with a relation — `-> (q) { q.present? ? where(name: q) : all }`, where that `all` is load-bearing. And `merge` with conflicting `where`s on the same column **keeps the last one** rather than AND-ing them, so never use it to intersect ranges.

### 3.5 Counter caches: stop counting rows to render a badge

```ruby
class Enrollment < ApplicationRecord
  belongs_to :course, counter_cache: true   # expects courses.enrollments_count
end
```

`course.enrollments.count` fires SQL every call. `course.enrollments.size` uses the counter cache if the column exists — **prefer `size` in views, always.** Adding one to an existing table is a three-step dance: add the column defaulting to 0, backfill with `Course.reset_counters(id, :enrollments)`, *then* add `counter_cache: true`. Reverse that order and every new row increments a counter that was never initialized. Counter caches drift under `update_all`, `delete_all`, and raw SQL, none of which fire callbacks. If a number must be exactly right for money, compute it; if it renders a badge, cache it.

### 3.6 ActiveJob idempotency: at-least-once is the contract

Your queue will run a job twice. Redis fails over, a worker gets SIGKILLed mid-ack, someone re-enqueues.

```ruby
class ChargeInvoiceJob < ApplicationJob
  queue_as :payments
  retry_on Stripe::RateLimitError, wait: :polynomially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound   # the record is gone; retrying is pointless

  def perform(invoice_id)                   # ID, never the object
    invoice = Invoice.lock.find(invoice_id) # SELECT ... FOR UPDATE
    return if invoice.charged?              # idempotency guard: guard first, act second

    charge = PaymentGateway.charge(
      amount: invoice.amount_cents,
      idempotency_key: "invoice-#{invoice.id}-#{invoice.amount_cents}"
    )
    invoice.update!(charged_at: Time.current, charge_id: charge.id)
  end
end
```

Serializing an AR object into Redis freezes stale attributes; by the time it runs, the row has changed. Push the idempotency key down to the third party when they support one — your guard protects your database, theirs protects your customer's card. And `discard_on` the errors that will never succeed; a job retrying `RecordNotFound` 25 times is noise with a backoff curve.

### 3.7 Hotwire is the default answer for UI

Ninety percent of "interactive" in a business app is: submit a form and update part of the page.

```ruby
def destroy
  @enrollment.destroy!
  respond_to do |format|
    format.turbo_stream { render turbo_stream: turbo_stream.remove(dom_id(@enrollment)) }
    format.html         { redirect_to course_path(@enrollment.course) }
  end
end
```

Wrap the row in `turbo_frame_tag dom_id(enrollment)` and that is the whole feature — no JSON API, no client-side store, no duplicate validation logic. Reach for a real SPA when you have genuinely offline-capable, high-frequency-interaction UI — a spreadsheet, a canvas editor. Not for a table with a delete button.

### 3.8 Russian doll caching

```erb
<% cache @course do %>                    <%# Enrollment: belongs_to :course, touch: true %>
  <% @course.enrollments.each do |e| %>
    <% cache e do %><%= render e %><% end %>
  <% end %>
<% end %>
```

`touch: true` on the child bumps `course.updated_at`, so an inner change busts the outer shell. The cache key includes the template digest, so editing the partial invalidates it automatically — no manual version bumps. Two caveats: `touch: true` on a hot child table means every write also writes the parent row, creating lock contention on a popular parent; and you still need `preload` inside the loop, because a cache miss on 50 rows fires 50 queries.

### 3.9 Instrumentation you leave on, and a testing pyramid

Set `Bullet.enable = true` and `Bullet.raise = true` in development — yes, raise. A warning you can ignore is a warning you will ignore. Add `rack-mini-profiler` and the SQL badge sits in the corner of every page, so a 60-query page is something you find while writing it, not from an APM alert at 2am. Set `Bullet.raise = true` in the test environment too and your N+1s become failing tests.

Model and service specs are where coverage belongs. System specs are expensive; write a handful covering the money paths and stop. **Fixtures load once per suite with raw SQL and are effectively free.** Factories build object graphs per example, and a `create(:course)` cascading into six associated records — each with callbacks — is why your suite takes 40 minutes. Fixtures for the stable backbone (users, plans, orgs); factories only where a test needs a bespoke graph; `build_stubbed` over `create` whenever the test never hits the database.

## 4. Anti-patterns

- **Concerns as a dumping ground.** `app/models/concerns/` full of `Searchable`, `Sortable`, `Utilities` is not modularization — it is a 2,000-line model with the lines stored in different files. A concern is legitimate when it is a reusable *role* with its own state and invariants (`Archivable`), used by three or more models. Used by one model, it is that model's code.
- **Callbacks that talk to the network.** `after_save :sync_to_salesforce` makes an HTTP timeout into a rolled-back user signup. Callbacks may touch the current record and enqueue jobs. Nothing else.
- **`default_scope`.** It leaks into `new` and `create` as attribute defaults and cannot be reliably removed. Someone will spend a day asking why a record "does not exist." Use a named scope.
- **`update_all` / `delete_all` on tables with counter caches or `dependent: :destroy`.** They skip callbacks by design. Counters drift; children orphan.
- **`.count` in a view loop.** Every render is a `SELECT COUNT(*)`. Use `size`, backed by a counter cache.
- **Business logic in controllers.** An action longer than ten lines is a service object that has not been extracted yet. Related: `rescue => e` around ActiveRecord, where swallowing `RecordInvalid` is silent data loss with a 200 OK.
- **Renaming or dropping a column in the same deploy as the code change.** Old processes are still serving requests. Multi-step or outage; pick one — and keep `strong_migrations` in the Gemfile to enforce it. It has prevented more production incidents than any code review I have sat in.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the feature in domain sentences, including the verbs: "Courses have enrollments. Students enroll if seats remain. Enrolling emails the student and decrements seats. Instructors can drop a student."
3. Ask for, in order: (a) the migration with indexes and `algorithm: :concurrently` where the table is large, (b) model associations, scopes, and counter caches, (c) a service object per coordinating verb, (d) the controller and Turbo Frame view, (e) the specs.
4. For every query generated inside a loop, make the assistant state which of `preload` / `eager_load` it used and why. Then run section 4 as a pre-merge checklist.

The assistant should refuse to put network calls in callbacks, should never emit `default_scope`, and should flag any migration that would lock a table with more than a million rows.

## 6. Example Output

Prompt given with this skill loaded: *"Add waitlisting. When a course is full, enrolling puts the student on a waitlist. When someone drops, promote the oldest waitlist entry."*

Expected shape of the answer — a concurrent unique index on `[:course_id, :student_id]`, a partial index on `[:course_id, :created_at] where promoted_at IS NULL` matching the promoter's query exactly, and:

```ruby
module Enrollments
  class PromoteFromWaitlist
    def initialize(course:) = @course = course

    def call
      promoted = nil
      ActiveRecord::Base.transaction do
        entry = @course.waitlist_entries.pending.order(:created_at).lock.first
        return Result.new(ok?: true, enrollment: nil) if entry.nil?

        promoted = @course.enrollments.create!(student: entry.student, enrolled_at: Time.current)
        entry.update!(promoted_at: Time.current)
      end
      WaitlistMailer.with(enrollment: promoted).promoted.deliver_later
      Result.new(ok?: true, enrollment: promoted)
    end
  end
end
```

Note what the output does *not* contain: no `after_destroy :promote_next` callback firing mail inside a transaction, no `.count` to check fullness, no unindexed lookup of the oldest pending entry, and a partial index matching the exact query the promoter runs. The monolith stays boring, and boring scales.
