---
title: Laravel Application Architecture Skill
category: Coding
description: Structure a Laravel application so it survives its second year: container bindings against interfaces, Form Requests that own validation and authorization, Eloquent that does not N+1, and queues that tolerate being run twice. Includes the chunk() correctness bug and why env() returns null in production.
usage: Load this skill before asking your AI assistant to build a controller, model, job, or API endpoint in a Laravel codebase. Say "use the Laravel architecture skill" and describe the feature; the assistant will produce Form Requests, Policies, API Resources, and jobs that follow these patterns rather than putting everything in the controller.
platforms: [Claude, Cursor, Copilot]
priceUsd: 5
timeSavedHours: 18
pocUrl: https://github.com/laravel/framework
---

# Laravel Application Architecture Skill

## 1. Philosophy

Laravel is the most productive PHP framework ever built, and that productivity is exactly what lets you write a 400-line controller in an afternoon. Every facade, every helper, every magic method is a loaded invitation to put the logic wherever you happen to be standing.

The mental model that fixes this: **a controller is a translator, not a worker.** It converts an HTTP request into a domain call and a domain result into an HTTP response. That is the entire job. If a controller method contains a `validate()` call, an `if ($user->id !== $post->user_id)` check, a database write, and a `Mail::send()`, you have written four classes and saved them all in one file.

Three rules govern everything below:

1. **Validation and authorization happen before the controller runs.** That is what Form Requests and Policies are for. A controller that has to ask "is this input valid, and is this person allowed?" is one that will eventually forget to ask.
2. **Bind interfaces, not implementations.** The container is the only reason your payment gateway is swappable and your tests do not hit Stripe.
3. **Eloquent is a footgun with a beautiful API.** `$posts->each(fn ($p) => $p->author->name)` is 101 queries and reads like English. Turn on `preventLazyLoading` outside production and let the framework catch you.

## 2. Tech Stack

- **Laravel** — https://github.com/laravel/framework — licensed **MIT**. Routing, Eloquent, the service container, queues, validation.
- **PHP 8.2+** — readonly properties, enums, constructor promotion, all used below.
- **MySQL 8 / PostgreSQL 14+** and **Redis** for the queue driver.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Laravel maintainers. All example code is original to this skill.

Recommended companions: Pest for tests, Horizon for queue visibility, Telescope in local only, and `larastan` at level 6+ — Eloquent's magic hides real type errors that static analysis surfaces.

## 3. Patterns

### 3.1 The container: bind contracts, resolve implementations

Write the interface first. Bind it in a provider. Type-hint it everywhere else and never say `new`.

```php
interface InvoiceNumberGenerator { public function next(int $tenantId): string; }
```

```php
// app/Providers/DomainServiceProvider.php
public function register(): void
{
    $this->app->bind(InvoiceNumberGenerator::class, SequentialInvoiceNumbers::class);

    // Singleton when the object holds a connection or expensive state.
    $this->app->singleton(PaymentGateway::class,
        fn ($app) => new StripeGateway(config('services.stripe.secret')));

    // Contextual binding: same contract, different implementation per consumer.
    $this->app->when(BulkImportController::class)
              ->needs(PaymentGateway::class)
              ->give(SandboxGateway::class);
}
```

The payoff is not purity. It is that `$this->mock(PaymentGateway::class)` swaps the real thing out in one line, with no HTTP fakes and no `if (app()->environment('testing'))` branches rotting inside domain code.

`bind` gives a fresh instance per resolve; `singleton` gives one per request lifecycle. Getting this backwards on a stateful object produces bugs that appear only under Octane, where the container survives between requests.

### 3.2 Form Requests own validation AND authorization

Both. The `authorize()` method is the half everyone forgets.

```php
final class StoreInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Delegate to the Policy. Do not re-implement the rule here.
        return $this->user()->can('create', [Invoice::class, $this->route('tenant')]);
    }

    public function rules(): array
    {
        return [
            'customer_id'      => ['required', 'integer', Rule::exists('customers', 'id')
                                     ->where('tenant_id', $this->route('tenant')->id)],
            'currency'         => ['required', Rule::enum(Currency::class)],
            'due_on'           => ['required', 'date', 'after_or_equal:today'],
            'lines'            => ['required', 'array', 'min:1', 'max:200'],
            'lines.*.sku'      => ['required', 'string', 'max:64'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
        ];
    }
}
```

Note `Rule::exists(...)->where('tenant_id', ...)`. A bare `exists:customers,id` is a cross-tenant data leak: a user from tenant A passes a customer id from tenant B and it validates clean. **Every `exists` rule in a multi-tenant app needs a tenant scope.**

The controller is now four lines, with nothing left in it to get wrong:

```php
public function store(StoreInvoiceRequest $request, Tenant $tenant, IssueInvoice $action)
{
    $invoice = $action->handle($request->toCommand($tenant));
    return new InvoiceResource($invoice->load('lines', 'customer'));
}
```

### 3.3 Eloquent: `with`, `withCount`, and never trusting a loop

```php
// N+1: 1 query, then 2 per invoice. 201 queries.
$invoices = Invoice::latest()->take(100)->get();
foreach ($invoices as $invoice) { echo $invoice->customer->name, $invoice->lines->count(); }

// 3 queries. Always.
$invoices = Invoice::query()
    ->with(['customer:id,name', 'lines:id,invoice_id,cents'])
    ->withCount('lines')
    ->withSum('lines', 'cents')
    ->latest()->take(100)->get();
```

- **Column-constrained eager loads must include the foreign key.** `customer:id,name` without `id` means Laravel cannot match the relation back and you silently get `null`. Thirty minutes of debugging, every time.
- **`withCount` beats `->lines->count()`** — a correlated subquery instead of hydrating every child row.
- **Constrained eager loading** (`with(['invoices' => fn ($q) => $q->latest()->limit(5)])`) uses a window function on MySQL 8 / Postgres. On older engines it silently limits the *whole* result set, not per-parent. Check the query log before trusting it.

### 3.4 Chunking: `chunkById`, and the `chunk()` bug that skips rows

The most valuable paragraph in this file. `chunk()` paginates with `OFFSET`. If the callback **modifies rows so they no longer match the query**, the result set shrinks under you and the next offset lands past rows you never processed.

```php
// BROKEN. Silently processes roughly half the rows.
Invoice::where('status', 'pending')->chunk(500, function ($invoices) {
    foreach ($invoices as $invoice) {
        $invoice->update(['status' => 'processing']); // row leaves the result set
    }
});
```

Walk it: page 1 takes offset 0-499 and marks them `processing`. Only rows 500+ still match `pending`. Page 2 asks for `OFFSET 500` **of the new, smaller set** — skipping 500 rows entirely. No error. No warning. You find out from a customer.

```php
// CORRECT. Keys off the primary key, so a shrinking set cannot shift the window.
Invoice::where('status', 'pending')->chunkById(500, function ($invoices) {
    foreach ($invoices as $invoice) {
        ProcessInvoice::dispatch($invoice->id);
        $invoice->update(['status' => 'processing']);
    }
});

// Better for pure dispatch — never hydrates the models at all.
Invoice::where('status', 'pending')->select('id')->lazyById(1000)
    ->each(fn ($i) => ProcessInvoice::dispatch($i->id));
```

The rule: **if the callback writes to the rows it iterates, `chunk()` is a bug.**

### 3.5 API Resources shape the response; models never do

Returning `$invoice` serializes whatever columns exist. Add an `internal_notes` column six months from now and you have shipped it to every API client without touching an API file.

```php
final class InvoiceResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'         => $this->id,
            'number'     => $this->number,
            'status'     => $this->status->value,
            'total'      => ['cents' => $this->total_cents, 'currency' => $this->currency->value],
            // whenLoaded prevents the resource from triggering its own N+1.
            'customer'   => CustomerResource::make($this->whenLoaded('customer')),
            'lines'      => InvoiceLineResource::collection($this->whenLoaded('lines')),
            'line_count' => $this->whenCounted('lines'),
            'notes'      => $this->when($request->user()?->can('viewInternal', $this->resource),
                                        fn () => $this->internal_notes),
        ];
    }
}
```

`whenLoaded` is load-bearing. Without it, a collection of 100 invoices lazily loads `customer` 100 times — an N+1 living in the serialization layer, where nobody thinks to look.

### 3.6 Policies and Gates: one rule, one place

Policies for model-scoped rules, Gates for everything else (dashboards, admin panels, non-model abilities).

```php
final class InvoicePolicy
{
    public function before(User $user): ?bool
    {
        return $user->isSuperAdmin() ? true : null; // null = fall through
    }

    public function update(User $user, Invoice $invoice): Response
    {
        if ($user->tenant_id !== $invoice->tenant_id) {
            return Response::denyAsNotFound();   // 404, not 403
        }
        return $invoice->status === InvoiceStatus::Draft
            ? Response::allow()
            : Response::deny('Issued invoices cannot be edited.');
    }
}
```

`denyAsNotFound()` matters more than it looks. A 403 on a resource in someone else's tenant confirms the record exists — an enumeration oracle. Return 404 across tenant boundaries. And be careful with `before()`: it short-circuits **every** ability including `forceDelete`.

### 3.7 `config()` vs `env()` — the production-only null

**Call `env()` in exactly one place: `config/*.php`. Nowhere else. Ever.**

When you run `php artisan config:cache` — which you do on every production deploy — Laravel serializes config to a single PHP file and **stops loading `.env` entirely**. Any `env()` call outside a config file then returns `null`.

```php
// config/services.php — correct: only ever read at cache time
return ['stripe' => ['secret' => env('STRIPE_SECRET')]];
```

```php
// app/Services/StripeGateway.php
$this->key = env('STRIPE_SECRET');              // WRONG: null in production only
$this->key = config('services.stripe.secret');  // correct
```

The failure mode is vicious: works local, works CI, works staging if staging skips `config:cache`, `null` in production. The gateway constructs with an empty key and fails at the first charge. Grep `app/` for `env(` before every launch; the acceptable count is zero.

### 3.8 Queues: idempotent jobs, and dispatching after commit

```php
final class ChargeInvoice implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $tries = 5;
    public int $timeout = 30;

    public function __construct(public readonly int $invoiceId) {}   // ID, never the model

    public function backoff(): array { return [10, 30, 120, 600]; }
    public function uniqueId(): string { return "charge-invoice-{$this->invoiceId}"; }

    public function handle(PaymentGateway $gateway): void
    {
        $invoice = Invoice::findOrFail($this->invoiceId);
        if ($invoice->isPaid()) return;   // idempotency guard: this WILL run twice

        $charge = $gateway->charge($invoice->total_cents,
            idempotencyKey: "invoice-{$invoice->id}-{$invoice->total_cents}");
        $invoice->markPaid($charge->id);
    }

    public function failed(?Throwable $e): void
    {
        Invoice::find($this->invoiceId)?->update(['status' => InvoiceStatus::ChargeFailed]);
    }
}
```

- **Serialize IDs, not models.** `SerializesModels` re-fetches on unserialize — `ModelNotFoundException` if the row was deleted, or a quietly *newer* version than you dispatched with.
- **Dispatch after commit.** `ChargeInvoice::dispatch($id)->afterCommit()`, or `after_commit => true` on the connection. Redis is faster than your database; a job dispatched inside a transaction can run and `findOrFail` a row that has not committed. This is the most common "works locally, not in prod" queue bug.
- **`failed_jobs` is not an archive.** Alert on inserts. A table nobody queries is where money quietly disappears.

### 3.9 Events and listeners: for facts, not control flow

Fire an event when something **happened** (`InvoiceIssued`). Do not fire one to make something happen. Listeners are for decoupled side effects the core operation must not depend on.

The boundary test: **if the operation is broken when the listener does not run, it is not a listener — it is a step in your action.** Sending the invoice PDF belongs in `IssueInvoice::handle()`. Bumping a metrics counter does not.

Synchronous listeners run inside the request. One that makes an HTTP call has added that vendor's p99 to yours. `implements ShouldQueue` on anything touching the network.

### 3.10 Migrations describe schema, and nothing else

Never `User::create()` in a migration — the model drifts from the schema and a fresh `migrate` fatals six months later.

```php
Schema::create('invoices', function (Blueprint $table) {
    $table->id();
    $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
    $table->foreignId('customer_id')->constrained()->restrictOnDelete();
    $table->string('number');
    $table->unsignedBigInteger('total_cents');
    $table->date('due_on');
    $table->timestamps();

    $table->unique(['tenant_id', 'number']);           // scoped uniqueness, enforced in the DB
    $table->index(['tenant_id', 'status', 'due_on']);  // matches the dashboard query exactly
});
```

`restrictOnDelete` on `customer_id` is deliberate: deleting a customer must not vaporize their invoice history. Choose each cascade rule on purpose.

### 3.11 Tests: `preventLazyLoading` as a tripwire

```php
// app/Providers/AppServiceProvider.php — boot()
Model::preventLazyLoading(! app()->isProduction());
Model::preventSilentlyDiscardingAttributes(! app()->isProduction());
```

This turns every N+1 into a thrown `LazyLoadingViolationException` in local and CI. Your suite becomes an N+1 detector for free. Leave it off in production — you want a slow page, not a 500 — but if it throws in CI, the query is wrong and it does not merge.

```php
it('rejects a customer from another tenant', function () {
    $mine   = Tenant::factory()->create();
    $theirs = Customer::factory()->for(Tenant::factory())->create();

    $this->actingAs(User::factory()->for($mine)->create())
        ->postJson("/api/tenants/{$mine->id}/invoices", ['customer_id' => $theirs->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('customer_id');
});
```

That test is the one that matters. Every multi-tenant endpoint gets a cross-tenant test, or the tenant scope in your `exists` rule gets deleted by someone "simplifying the validation."

## 4. Anti-patterns

- **Validating in the controller.** Rules cannot be reused or tested in isolation, get copy-pasted into `update()`, and immediately drift from `store()`.
- **`exists:table,id` without a tenant scope.** A cross-tenant IDOR that passes validation and looks idiomatic in review.
- **`env()` outside `config/`.** Returns `null` under `config:cache`. Production-only, and it will be the payment key.
- **`chunk()` while modifying the chunked rows.** Silently skips half your data. Use `chunkById`.
- **Returning models from controllers.** Every future column is an unplanned API change.
- **Passing models into jobs.** Stale on unserialize, or `ModelNotFoundException` if deleted. Pass the id.
- **Dispatching inside a transaction without `afterCommit()`.** The worker wins the race and reads a row that does not exist yet.
- **Model observers doing network calls.** `static::created(fn ($m) => Http::post(...))` makes a vendor's downtime into your failed write.
- **`$fillable` as security.** It stops mass assignment; it does not stop `role=admin` if `role` is fillable. Validate the field, do not just guard it.
- **Business logic in Blade.** `@if ($user->subscription->plan->features->contains('x'))` is three lazy loads per render and a rule nobody can unit test.
- **`DB::raw()` with interpolated input.** Eloquent's escaping stops at the raw boundary. Bind the parameter.
- **Telescope in production.** It records every query and request payload, including the ones with tokens in them.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the feature as sentences with actors and rules: "Tenants have customers and invoices. A tenant admin issues an invoice against their own customer. Issued invoices cannot be edited. Issuing queues a charge and emails the customer."
3. Ask for, in order: (a) the migration with the exact indexes the queries need, (b) the Form Request with `authorize()` delegating to a Policy and tenant-scoped `exists` rules, (c) the Policy, (d) the action class, (e) the job, (f) the API Resource, (g) Pest feature tests including a cross-tenant rejection.
4. Ask the assistant to state the query count for every endpoint it writes. If it cannot, the eager loading is not thought through.
5. Run section 4 as a pre-merge checklist. Grep for `env(` outside `config/` before every deploy.

The assistant should refuse to write validation inline in a controller, should never use `chunk()` on a mutating callback, and should flag any `exists` rule in a multi-tenant app lacking a tenant constraint.

## 6. Example Output

Prompt given with this skill loaded: *"Add credit notes. A tenant admin can issue a credit note against an issued invoice for up to the remaining balance."*

Expected shape of the answer:

```php
final class StoreCreditNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('credit', $this->route('invoice'));
    }

    public function rules(): array
    {
        return [
            'cents'  => ['required', 'integer', 'min:1',
                         "max:{$this->route('invoice')->remaining_cents}"],
            'reason' => ['required', 'string', 'max:500'],
        ];
    }
}
```

```php
final class IssueCreditNote
{
    public function handle(Invoice $invoice, int $cents, string $reason): CreditNote
    {
        $note = DB::transaction(function () use ($invoice, $cents, $reason) {
            // Row lock: two concurrent requests must not both pass the balance check.
            $locked = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            throw_if($cents > $locked->remaining_cents, new CreditExceedsBalance($locked->id));

            $note = $locked->creditNotes()->create(['cents' => $cents, 'reason' => $reason]);
            $locked->decrement('remaining_cents', $cents);
            return $note;
        });

        CreditNoteIssued::dispatch($note->id);   // after the transaction closes
        return $note;
    }
}
```

Note what the output does *not* contain: no validation in the controller, no ownership check written twice, no balance check outside a lock (the race that lets two concurrent credits over-refund a customer), and no model returned raw from the endpoint. The controller is a translator. Everything else has a home.
