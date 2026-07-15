---
title: Contract-First API Design with OpenAPI Skill
category: Other
description: Design HTTP APIs the spec-first way — write the contract, generate the types and mocks, then implement against it — so clients start on day one and drift becomes a CI failure instead of a support ticket. Covers resource modelling, error shapes, pagination that survives inserts, versioning you can actually deprecate, and the linting rules that stop a 4,000-line spec from rotting.
usage: Load this skill before designing or reviewing an HTTP API. Describe the domain and the operations you need, and your assistant will produce an OpenAPI 3.1 document with reusable components, RFC 9457 errors, and cursor pagination — then generate types, a mock, and contract tests from the same file rather than hand-writing any of them.
platforms: [Claude, Cursor]
priceUsd: 8
timeSavedHours: 20
pocUrl: https://github.com/OAI/OpenAPI-Specification
---

# Contract-First API Design with OpenAPI Skill

## 1. Philosophy

The spec is the API. The server is one implementation of it; your SDK is another; the mock the frontend developed against for three weeks is a third. Once you accept that, every rule below follows.

1. **Write the contract before the handler.** Not because documentation is virtuous, but because the frontend team can start immediately against a generated mock, and because you will discover your resource model is wrong while it costs an hour to change instead of a quarter.
2. **A spec generated from code is a description, not a design.** Annotation-driven generation guarantees the spec matches the server — which sounds like the goal, until you notice it also means every accidental behavior is now the contract, and nobody ever reviewed it. The spec should be reviewed like a schema migration, because that's what it is.
3. **Drift is a CI failure, not a support ticket.** If the only thing checking that your server matches its spec is a customer, you don't have a contract, you have a wish. Validate responses against the schema in your integration tests.
4. **Design the errors as carefully as the successes.** Every consumer writes more code for your failure paths than your happy paths. An API with 14 beautifully modelled resources and `{"error": "something went wrong"}` has offloaded its hardest design problem onto every client, forever.
5. **You cannot un-ship a field.** Every property you expose is a permanent liability. Additive is free; anything else costs a version, a deprecation window, and someone's quarter. Ship the smallest thing that works.
6. **Optimize for the client's next request, not your table layout.** If reading a checkout screen takes six round trips because you exposed your normalized schema as resources, you designed a database, not an API.

## 2. Tech Stack

- **OpenAPI Specification 3.1** — https://github.com/OAI/OpenAPI-Specification — licensed **Apache-2.0**, stewarded by the OpenAPI Initiative. 3.1 is the version to use: it's a proper superset of JSON Schema 2020-12, which is what lets you share one schema between the spec, runtime validation, and type generation. 3.0's schema dialect is subtly its own thing and will bite you exactly there.
- **RFC 9457, "Problem Details for HTTP APIs"** — https://www.rfc-editor.org/rfc/rfc9457 — an IETF standards-track document. The error shape in §3.4. Use it rather than inventing one; it's free, it's stable, and tooling recognizes `application/problem+json`.
- **Spectral** — https://github.com/stoplightio/spectral — **Apache-2.0**. Spec linter. The `oas` ruleset plus a handful of local rules is what keeps a spec from rotting.
- **openapi-typescript** — https://github.com/openapi-ts/openapi-typescript — **MIT**. Generates TS types from the spec with no runtime.
- **Prism** — https://github.com/stoplightio/prism — **Apache-2.0**. Mock server driven straight from the spec, including validation of incoming requests.
- **Redocly CLI** — https://github.com/Redocly/redocly-cli — **MIT**. Bundling multi-file specs and diffing two versions for breaking changes.

This skill is an independent, original guide; it is not affiliated with or endorsed by the OpenAPI Initiative maintainers. All example specs and code are original to this skill.

## 3. Patterns

### 3.1 Model resources around client journeys

Start from the screens and the jobs, not the tables. Write the list of things a consumer needs to do, then find the smallest set of nouns that serves them.

Rules that hold up:

- **Plural collections, opaque IDs.** `/invoices`, `/invoices/{invoiceId}`. Never expose an auto-increment integer — it leaks volume, invites enumeration, and welds you to one database forever. Prefix them: `inv_8Kd2Lm`. A client logging a bare UUID has no idea what it is; a prefixed ID is self-describing in a stack trace at 3am.
- **Sub-resources only for genuine containment.** `/invoices/{id}/line-items` is fine — a line item cannot exist without its invoice. `/customers/{id}/invoices` is a *filter* wearing a hierarchy costume; make it `/invoices?customerId=`, or you'll need the same list under three parents.
- **Nesting stops at two levels.** `/a/{x}/b/{y}/c/{z}` means you have a missing top-level resource.
- **When the domain has a verb, use it.** Some operations are not CRUD. `POST /invoices/{id}/void` is honest and idempotent-able; `PATCH /invoices/{id}` with `{"status": "void"}` pretends that voiding is a field assignment, and now every client can attempt illegal state transitions and your handler is a switch statement validating a state machine it can't see.

### 3.2 Components, or the spec that ate itself

The difference between a spec that survives two years and one that gets abandoned is whether schemas are defined once.

```yaml
openapi: 3.1.0
info:
  title: Billing API
  version: 2026-03-01          # date-based; see §3.6
  description: |
    All money is in minor units (cents) as integers. Never floats — see the
    `Money` schema. All timestamps are RFC 3339 UTC.

servers:
  - url: https://api.example.com/v2

paths:
  /invoices:
    get:
      operationId: listInvoices          # REQUIRED. This becomes your SDK method name.
      summary: List invoices
      parameters:
        - $ref: '#/components/parameters/Cursor'
        - $ref: '#/components/parameters/Limit'
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/InvoiceStatus'
      responses:
        '200':
          description: A page of invoices, newest first.
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items: { $ref: '#/components/schemas/Invoice' }
                  pagination: { $ref: '#/components/schemas/Pagination' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }

components:
  schemas:
    Money:
      type: object
      required: [amount, currency]
      properties:
        amount:
          type: integer
          description: Minor units. 1250 = $12.50. Integer, always — never a float.
          examples: [1250]
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
          examples: [USD]

    InvoiceStatus:
      type: string
      enum: [draft, open, paid, void, uncollectible]
      description: |
        Clients MUST tolerate unknown values here — we add states additively and
        an unrecognized status must not crash your deserializer.

    Invoice:
      type: object
      required: [id, status, total, createdAt]     # be brutal about this list
      properties:
        id:
          type: string
          pattern: '^inv_[a-zA-Z0-9]{8,}$'
          examples: [inv_8Kd2Lm4p]
        status: { $ref: '#/components/schemas/InvoiceStatus' }
        total: { $ref: '#/components/schemas/Money' }
        customerId:
          type: string
          pattern: '^cus_[a-zA-Z0-9]{8,}$'
        createdAt:
          type: string
          format: date-time
        voidedAt:
          type: [string, 'null']       # 3.1 nullable syntax; NOT `nullable: true`
          format: date-time
          description: Set iff status is `void`.
```

Three things that are load-bearing here:

- **`required` is a promise you can never break.** Adding a field to `required` later breaks every client that constructs the object. Under-promise: if a field could ever be absent, it isn't required.
- **`operationId` on every operation.** It's the generated method name. Leave it out and your SDK has `getInvoicesById_2`. Spectral should fail the build without it.
- **`type: [string, 'null']`, not `nullable: true`.** `nullable` is 3.0 syntax and 3.1 tooling silently ignores it — so your generated type says `string`, your server sends `null`, and the crash is in someone else's client three weeks later.

Money as an integer in minor units is not a style choice. Float money is the single most common irreversible API design error, it survives every code review because `12.50` looks correct, and it surfaces as a one-cent reconciliation drift eight months in.

### 3.3 Pagination: cursors, not offsets

Offset pagination is broken by construction on any collection that receives inserts, which is all of them.

The failure: 100 invoices, `?offset=0&limit=20` returns 1–20. A new invoice arrives, sorted newest-first. `?offset=20` now returns what used to be items 20–39 — the reader sees item 20 twice and never sees item 40 at all. It's not a rare race; on an active collection it's most page-throughs. It also gets slower linearly — `OFFSET 40000` makes the database walk 40,000 rows to discard them.

```yaml
components:
  parameters:
    Cursor:
      name: cursor
      in: query
      description: |
        Opaque. Pass the `pagination.nextCursor` from the previous response verbatim.
        Do not construct, parse, or persist these — the encoding is not part of the
        contract and will change.
      schema: { type: string }
      examples:
        next: { value: 'eyJjIjoiMjAyNi0wMy0wMVQxMjowMDowMFoiLCJpIjoiaW52XzhLZDJMbSJ9' }
    Limit:
      name: limit
      in: query
      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }

  schemas:
    Pagination:
      type: object
      required: [hasMore]
      properties:
        hasMore:
          type: boolean
          description: If true, `nextCursor` is present. Loop on this, not on a page count.
        nextCursor:
          type: [string, 'null']
```

The cursor encodes the sort key **plus a tiebreaker**: `(createdAt, id)`. Sorting on `createdAt` alone silently drops rows whenever two records share a timestamp — which happens constantly on bulk imports, and produces a bug report that reads "some invoices are missing sometimes" and takes a week to find.

Deliberately absent: `totalCount`. It forces a second `COUNT(*)` over the same predicate on every page, it's stale the moment you compute it, and 95% of clients only need it to render a spinner. Offer it behind `?include=totalCount` if someone demands it, and let them pay for it.

### 3.4 Errors: RFC 9457, and the fields that matter

```yaml
components:
  schemas:
    Problem:
      type: object
      required: [type, title, status]
      properties:
        type:
          type: string
          format: uri
          description: Stable URI identifying the error class. THIS is what clients switch on.
          examples: ['https://api.example.com/problems/insufficient-funds']
        title:
          type: string
          description: Short, human-readable, stable for a given `type`. Not for machines.
        status: { type: integer, examples: [402] }
        detail:
          type: string
          description: Human-readable, specific to THIS occurrence. Never parse this.
        instance:
          type: string
          description: Request ID. The thing a customer pastes into a support ticket.
          examples: ['req_9fK2mQ']
        errors:
          type: array
          description: Field-level failures. Present on 400 validation problems.
          items:
            type: object
            required: [pointer, detail]
            properties:
              pointer:
                type: string
                description: RFC 6901 JSON Pointer into the request body.
                examples: ['/lineItems/2/quantity']
              detail: { type: string, examples: ['must be >= 1'] }

  responses:
    BadRequest:
      description: The request was malformed or failed validation.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
          examples:
            validation:
              value:
                type: 'https://api.example.com/problems/validation-failed'
                title: 'Request validation failed'
                status: 400
                detail: 'The invoice has 1 invalid line item.'
                instance: 'req_9fK2mQ'
                errors:
                  - pointer: '/lineItems/2/quantity'
                    detail: 'must be >= 1'
```

What makes this work in practice:

- **`type` is the machine-readable contract; `title` and `detail` are prose.** Clients switch on `type`. That means you can rewrite every message for clarity without a breaking change — a freedom you will want, because your first error messages are bad.
- **`instance` carries the request ID.** This is the difference between a support ticket you can solve in 30 seconds and one that takes a day. Put the same ID in a response header and your logs.
- **`pointer` uses JSON Pointer into the request.** A client can highlight the exact field. `"detail": "quantity is invalid"` on a 40-line invoice makes the user hunt.

Status codes, opinionated and sufficient: `400` malformed/invalid, `401` no or bad credentials, `403` authenticated but not allowed, `404` doesn't exist *or* you can't see it (do not leak existence via 403), `409` state conflict — voiding a paid invoice, `422` only if you need to distinguish syntactically-valid-but-semantically-wrong from `400` and your team agrees on the line, `429` rate limited, always with `Retry-After`. Stop there. `418` is a joke; `451` is not your problem yet.

### 3.5 Idempotency for unsafe operations

Any `POST` that moves money needs this, and it belongs in the spec, not in a wiki page.

```yaml
  /invoices/{invoiceId}/pay:
    post:
      operationId: payInvoice
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          description: |
            Client-generated UUID, unique per logical attempt. Retries of the SAME
            attempt reuse the key and return the ORIGINAL response — including the
            original error. Key is scoped to this endpoint and retained 24h.
            Reusing a key with a different body is a 409.
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: |
            Payment succeeded. May be a replay — check the `Idempotent-Replay` header.
          headers:
            Idempotent-Replay:
              schema: { type: boolean }
        '409': { $ref: '#/components/responses/Conflict' }
```

The requirement people miss: a replay must return the **original** response, error included. If the first attempt 402'd on insufficient funds and the retry — same key — returns 200 because the customer topped up in between, you've broken the guarantee in the worst possible direction.

### 3.6 Versioning you can actually deprecate

Date-based versions pinned per-client beat `/v1`, `/v2` for anything with real customers. `/v2` means you maintain two full trees and can never remove the first, because "when will you turn off v1" has no answer. A date version is a *snapshot*: clients pin `2026-03-01`, you transform their responses forward, and the number of live versions is bounded by your deprecation policy rather than by your courage.

If you're going with path versioning anyway — and for a small internal API, do, it's simpler — then version *only* on a breaking change, and be honest about what breaking means:

**Not breaking (ship freely):** adding an optional request field, adding a response field, adding an enum value *if you documented that clients must tolerate unknowns*, adding a new endpoint, relaxing a validation rule.

**Breaking (needs a version):** removing or renaming anything, adding a `required` request field, tightening validation, changing a type (`integer` → `string` — yes, even `id: 42` → `id: "42"`), changing a status code for an existing condition, changing a default, changing the meaning of a field while keeping its name (the worst one — it passes every automated check and silently corrupts data).

Automate it. Humans are terrible at spotting a tightened `maxLength`:

```sh
redocly diff openapi/main.yaml openapi/head.yaml --severity error
```

Deprecate in the spec so it lands in the generated SDK and the client's IDE:

```yaml
        legacyTotal:
          type: number
          deprecated: true
          description: |
            DEPRECATED — removal 2026-09-01. Float dollars; use `total` (Money, minor
            units) instead. This field rounds and has produced reconciliation drift.
```

### 3.7 The pipeline that makes it real

Contract-first is a claim you have to enforce, or the spec becomes a lie within two sprints.

```sh
# 1. Lint. This runs on every PR touching the spec.
npx spectral lint openapi/main.yaml --ruleset .spectral.yaml --fail-severity warn

# 2. Breaking-change gate against the merge base.
npx redocly diff openapi/main.yaml openapi/head.yaml --severity error

# 3. Types for the server AND the client, from one source.
npx openapi-typescript openapi/main.yaml -o src/generated/api.d.ts

# 4. Mock server — the frontend builds against this from day one.
npx prism mock openapi/main.yaml --errors    # --errors: reject invalid requests too
```

```yaml
# .spectral.yaml — the local rules that matter more than the defaults
extends: ['spectral:oas']
rules:
  operation-operationId: error
  operation-operationId-unique: error
  operation-tag-defined: error
  oas3-valid-schema-example: error       # your examples must validate. they won't.
  operation-4xx-response: error          # every operation declares its failures
  no-float-money:
    description: Money must be an integer in minor units.
    given: "$..properties[?(@property.match(/amount|total|price|fee/i))].type"
    then: { function: pattern, functionOptions: { notMatch: 'number' } }
    severity: error
  no-offset-pagination:
    description: Use cursor pagination (see §3.3).
    given: "$.paths[*].get.parameters[*].name"
    then: { function: pattern, functionOptions: { notMatch: '^(offset|page)$' } }
    severity: error
```

And the step that actually closes the loop — validate real responses against the schema in your integration tests:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const spec = parse(readFileSync('openapi/main.yaml', 'utf8'))
const ajv = addFormats(new Ajv2020({ strict: false }))
ajv.addSchema(spec, 'api')   // $refs resolve against the whole document

function schemaFor(path: string, method: string, status: string) {
  const s = spec.paths[path][method].responses[status].content
  return Object.values(s)[0].schema
}

describe('GET /invoices conforms to its contract', () => {
  it('validates the real 200 body', async () => {
    const res = await fetch(`${BASE}/invoices?limit=2`, { headers: AUTH })
    const validate = ajv.compile(schemaFor('/invoices', 'get', '200'))

    expect(res.status).toBe(200)
    expect(validate(await res.json()), JSON.stringify(validate.errors)).toBe(true)
  })

  it('returns problem+json, not a bare string, on a bad cursor', async () => {
    const res = await fetch(`${BASE}/invoices?cursor=garbage`, { headers: AUTH })
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(ajv.compile(schemaFor('/invoices', 'get', '400'))(await res.json())).toBe(true)
  })
})
```

That last test is the one nobody writes and everybody needs. Error paths drift first, because nothing generates them and no demo exercises them.

## 4. Anti-patterns

- **Money as a float.** `"total": 12.50` looks right in every review and produces reconciliation drift eight months later. Integer minor units, lint it, no exceptions.
- **`nullable: true` in a 3.1 spec.** Silently ignored. Generated types say non-null, the server sends null, and the crash is in a client you don't control. `type: [string, 'null']`.
- **Offset pagination.** Duplicates and skips on any collection with inserts, and `OFFSET 40000` makes the DB walk 40,000 rows to throw them away.
- **A cursor sorted on a timestamp without a tiebreaker.** Silently drops rows that share a millisecond. Bug report: "sometimes invoices are missing." Debugging time: one week.
- **`{"error": "something went wrong"}`.** You've moved your hardest design problem into every client, permanently. RFC 9457 is free.
- **Clients switching on `title` or `detail`.** Now your error prose is frozen forever and you can never improve a message.
- **Exposing auto-increment integer IDs.** Leaks volume, invites enumeration, welds you to one database. Prefixed opaque strings.
- **A spec generated from code annotations, reviewed by nobody.** Guarantees the spec matches the server, which means every accident is now the contract.
- **A spec that no test validates responses against.** It's documentation, and documentation drifts silently. Compile the schema in CI.
- **Missing `operationId`.** Your SDK ends up with `getInvoicesById_2`. Fail the lint.
- **Over-declaring `required`.** You can never un-require a field. If it could ever be absent, it isn't required.
- **`totalCount` on every list.** A `COUNT(*)` per page, stale on arrival, needed by almost nobody.
- **Sub-resources that are really filters.** `/customers/{id}/invoices` forces the same list under three parents. Query param.
- **`PATCH` with a `status` field as a state machine.** Every client can now attempt an illegal transition. Give the verb a URL.
- **Changing a field's meaning while keeping its name.** Passes every diff tool, every test, every review. Corrupts data quietly. The only breaking change automation cannot catch — which is why the spec needs human review.

## 5. Usage

1. Load this skill, then describe the **domain and the client journeys**, not the tables: "Billing API. A dashboard lists invoices newest-first with status filters, opens one with its line items, and pays or voids it. Invoices belong to customers." Resource design falls out of the journeys.
2. Ask for the spec first and the handlers not at all: "Give me OpenAPI 3.1 for these operations — components for shared schemas, RFC 9457 errors, cursor pagination, money as integer minor units." Read the `required` arrays before anything else; that's the promise you can't retract.
3. Reject any spec with `nullable: true`, float money, `offset`/`page` params, a missing `operationId`, or an operation with no declared 4xx. These are the five that are expensive to fix later and trivial to fix now.
4. Ask it to write `.spectral.yaml` with your local rules and wire the four commands in §3.7 into CI *before* you implement anything. Contract-first collapses into code-first the moment the gate is missing.
5. Then generate: types, mock, and contract tests from the same file. Never hand-write a type that the spec could produce — a hand-written type is a copy that starts drifting the day it's written.
6. When you need to change a shipped API, paste both spec versions and ask which changes are breaking against the §3.6 list. Then run `redocly diff` and compare — the gap between the two is where the interesting mistakes are, and it's usually a meaning change with a stable name.

## 6. Example Output

Prompt with this skill loaded: *"Add an endpoint to void an invoice. It can only be voided if it's `open` — a paid one can't be. It needs to be safe to retry."*

```yaml
  /invoices/{invoiceId}/void:
    post:                             # a verb, not PATCH {"status":"void"} — see §3.1
      operationId: voidInvoice
      summary: Void an open invoice
      description: |
        Permanent and irreversible. Only an `open` invoice may be voided; `paid`,
        `void`, and `uncollectible` all return 409. Voiding is not a refund — if the
        invoice was paid, you need `POST /refunds` instead.
      tags: [Invoices]
      parameters:
        - name: invoiceId
          in: path
          required: true
          schema: { type: string, pattern: '^inv_[a-zA-Z0-9]{8,}$' }
        - name: Idempotency-Key
          in: header
          required: true              # required, not optional: this is irreversible
          description: |
            Client-generated UUID. A retry with the same key returns the ORIGINAL
            response — including the original 409. Retained 24h. Same key with a
            different `invoiceId` is a 409 `idempotency-key-reuse`.
          schema: { type: string, format: uuid }
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                reason:
                  type: string
                  maxLength: 500
                  description: Optional, surfaced in the audit log. Not shown to customers.
      responses:
        '200':
          description: |
            The voided invoice. Returned on a first void AND on a replay — a replay
            is not a 201/200 distinction, check `Idempotent-Replay`.
          headers:
            Idempotent-Replay:
              description: True if this response was served from the idempotency store.
              schema: { type: boolean }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Invoice' }
              examples:
                voided:
                  value:
                    id: inv_8Kd2Lm4p
                    status: void
                    total: { amount: 1250, currency: USD }
                    customerId: cus_3Nq7Rt1w
                    createdAt: '2026-02-11T09:14:22Z'
                    voidedAt: '2026-03-04T11:02:07Z'
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

components:
  responses:
    Conflict:
      description: The invoice is not in a voidable state.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
          examples:
            alreadyPaid:
              value:
                type: 'https://api.example.com/problems/invoice-not-voidable'
                title: 'Invoice cannot be voided'
                status: 409
                detail: 'Invoice inv_8Kd2Lm4p is paid. Voiding is only permitted from `open`. To reverse a paid invoice, create a refund.'
                instance: 'req_9fK2mQ'
```

```ts
// tests/contract/void-invoice.test.ts — the spec is only real if a test enforces it
describe('POST /invoices/{id}/void', () => {
  it('voids an open invoice and matches the 200 schema', async () => {
    const invoice = await createOpenInvoice()
    const res = await fetch(`${BASE}/invoices/${invoice.id}/void`, {
      method: 'POST',
      headers: { ...AUTH, 'Idempotency-Key': crypto.randomUUID() },
    })
    const body = await res.json()
    const validate = ajv.compile(schemaFor('/invoices/{invoiceId}/void', 'post', '200'))

    expect(res.status).toBe(200)
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true)
    expect(body.status).toBe('void')
    expect(body.voidedAt).not.toBeNull()      // documented as "set iff status is void"
  })

  it('replays the ORIGINAL response for a repeated key — including the error', async () => {
    const paid = await createPaidInvoice()
    const key = crypto.randomUUID()
    const call = () => fetch(`${BASE}/invoices/${paid.id}/void`, {
      method: 'POST', headers: { ...AUTH, 'Idempotency-Key': key },
    })

    const first = await call()
    expect(first.status).toBe(409)

    const replay = await call()
    expect(replay.status).toBe(409)                              // NOT a fresh evaluation
    expect(replay.headers.get('Idempotent-Replay')).toBe('true')
    expect(await replay.json()).toEqual(await first.clone().json())
  })

  it('returns problem+json on the 409, matching the schema', async () => {
    const paid = await createPaidInvoice()
    const res = await fetch(`${BASE}/invoices/${paid.id}/void`, {
      method: 'POST', headers: { ...AUTH, 'Idempotency-Key': crypto.randomUUID() },
    })
    const body = await res.json()

    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(ajv.compile(schemaFor('/invoices/{invoiceId}/void', 'post', '409'))(body)).toBe(true)
    expect(body.type).toBe('https://api.example.com/problems/invoice-not-voidable')
    expect(body.instance).toMatch(/^req_/)    // support needs this in the ticket
  })
})
```

Markers of skill-compliant output: voiding is a verb URL rather than a `status` assignment through `PATCH`, so illegal transitions are unrepresentable instead of validated; `Idempotency-Key` is `required` because the operation is irreversible, and the replay test asserts the *original 409* comes back rather than a fresh evaluation — the guarantee that breaks in the most damaging direction; the 409 `detail` tells the client what to do instead (create a refund) while the machine-readable `type` stays stable, so that prose can be improved without a breaking change; `instance` carries the request ID a support ticket needs; the description states the non-obvious domain rule that voiding is not a refund; and every response — success and failure — is validated against the spec's own schema in CI, because the error path is where drift starts.
