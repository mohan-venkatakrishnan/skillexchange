---
title: Rust Web Services with Axum Skill
category: Coding
description: Build a production Axum service without fighting the type system — extractors in the right order, one domain error enum that becomes every HTTP response, and tower layers that wrap in the direction you meant. Covers State vs Extension, custom auth extractors, sqlx pools, tracing, graceful shutdown, and the borrow errors that eat an afternoon.
usage: Load this skill before asking your AI assistant to write or refactor an Axum service. Say "use the Axum web services skill", name your Axum version, and describe your routes; the assistant will produce handlers, extractors, error types, and oneshot tests that compile the first time instead of the trait soup an untrained model emits.
platforms: [Claude, Cursor]
priceUsd: 8
timeSavedHours: 26
pocUrl: https://github.com/tokio-rs/axum
---

# Rust Web Services with Axum Skill

## 1. Philosophy

Axum has no macros, no magic, and no framework-specific runtime. A handler is an `async fn`. Everything else — middleware, timeouts, tracing, compression — is `tower`, which predates Axum and is used by things that are not web servers.

That design is also why the error messages are terrible. When a handler does not compile, Axum cannot say "your extractor is in the wrong place." It can only say that `fn(A, B) -> C` does not implement `Handler<T, S>`, which is true, unhelpful, and ninety lines long.

So the skill is not "learn the API." It is **the four rules behind 95% of the compile failures**:

1. **The body-consuming extractor goes last.** `Json`, `Form`, `String`, `Bytes` consume the body. Only one can, and it must be the final argument. Nothing in the error will mention the word "order."
2. **`State` is typed and checked at compile time; `Extension` is a runtime `TypeMap` lookup that 500s when you forget the layer.** Use `State`. `Extension` is for middleware-injected per-request values — a genuinely different job.
3. **Every fallible handler returns `Result<T, AppError>` where `AppError` implements `IntoResponse` once.** Not `Result<Json<T>, (StatusCode, String)>` forty times. The error enum is your HTTP contract, expressed in the type system.
4. **Handlers own their data.** A handler's future must be `'static` and `Send`. Holding a `MutexGuard` across `.await` is the borrow error you will hit most; the fix is nearly always "clone the small thing" or "do not hold a std lock across await."

Learn those four and the compiler goes back to being what it should be: the thing that catches your missing state before a user does.

## 2. Tech Stack

- **Axum** — https://github.com/tokio-rs/axum — licensed **MIT**. HTTP framework on `tower`, `tower-http`, `hyper`, and `tokio`. Examples target **0.8**. On 0.7, `Server::bind` is already gone (use `axum::serve` with a `TcpListener`), paths use `:id` rather than `{id}`, and `FromRequestParts` still needs `#[async_trait]`.
- **tokio** (MIT) — the runtime.
- **tower** / **tower-http** (MIT) — `TraceLayer`, `CorsLayer`, `TimeoutLayer` come from here, not from Axum.
- **sqlx 0.8** (MIT/Apache-2.0) — compile-time checked SQL.
- **thiserror** (MIT/Apache-2.0) — derives the domain error enum. Your HTTP error type is a `thiserror` enum with a fixed set of variants, never `anyhow` all the way down.
- **tracing** / **tracing-subscriber** (MIT) — span-based structured logging.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Axum maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 AppState: one struct, cheap to clone

`State<T>` requires `T: Clone`. The lazy fix is `State<Arc<AppState>>` everywhere; the better shape puts the `Arc` inside so handlers never mention it.

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,               // already refcounted internally — clone is a refcount bump
    pub cfg: Arc<Config>,         // big, immutable, read everywhere
    pub tokens: Arc<TokenVerifier>,
}
```

Wrapping `PgPool` in another `Arc` is noise. `Config` is not refcounted, so it gets one. If you prefer `Arc<AppState>`, commit project-wide — what breaks builds is mixing: `with_state(Arc::new(app))` against a handler asking for `State<AppState>` produces a `Handler` trait error naming neither type usefully.

`FromRef` gives you substates, so a handler can extract only what it touches:

```rust
impl FromRef<AppState> for PgPool {
    fn from_ref(app: &AppState) -> Self { app.db.clone() }
}

// valid, and this handler provably cannot read config or tokens:
async fn health(State(db): State<PgPool>) -> StatusCode { /* ... */ }
```

### 3.2 Extractor order: the rule that costs everyone an afternoon

Extractors run left to right. `FromRequestParts` extractors (`Path`, `Query`, `State`, `HeaderMap`, your auth extractor) touch only headers and URI; any number, any order. `FromRequest` extractors (`Json`, `Form`, `Bytes`, `String`) consume the body — exactly one, and **last**.

```rust
// COMPILES
async fn create_order(
    State(app): State<AppState>,
    AuthUser(user): AuthUser,
    Query(opts): Query<CreateOpts>,
    Json(body): Json<CreateOrderRequest>,   // last
) -> Result<(StatusCode, Json<OrderResponse>), AppError> { /* ... */ }

// DOES NOT COMPILE — and the error will not say "move Json to the end"
async fn bad(Json(body): Json<CreateOrderRequest>, State(app): State<AppState>) -> impl IntoResponse { }
```

When a handler stops compiling and the error is a wall of `Handler<...>` bounds, check in this order: (1) is the body extractor last, (2) does the state type match `with_state` exactly, (3) does the return type implement `IntoResponse`, (4) is everything the future holds `Send`. It is one of those four essentially every time.

Keep `#[axum::debug_handler]` on the handler while you work — it turns the trait soup into a message that names the offending argument.

### 3.3 The error enum IS the HTTP contract

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("order not found")]      NotFound,
    #[error("not permitted")]        Forbidden,
    #[error("unauthenticated")]      Unauthorized,
    #[error("{0}")]                  Validation(String),
    #[error("order is {0} and cannot be cancelled")] Conflict(String),
    #[error(transparent)]            Database(#[from] sqlx::Error),   // `?` on any sqlx call now works
    #[error(transparent)]            Unexpected(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::NotFound     => (StatusCode::NOT_FOUND, "not_found", self.to_string()),
            AppError::Forbidden    => (StatusCode::FORBIDDEN, "forbidden", self.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", self.to_string()),
            AppError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "validation_failed", self.to_string()),
            AppError::Conflict(_)  => (StatusCode::CONFLICT, "conflict", self.to_string()),

            // Below here it is our fault: log the detail, tell the client nothing.
            AppError::Database(e) => {
                tracing::error!(error = ?e, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal", "something went wrong".to_owned())
            }
            AppError::Unexpected(e) => {
                tracing::error!(error = ?e, "unexpected error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal", "something went wrong".to_owned())
            }
        };
        (status, Json(json!({ "error": code, "message": message }))).into_response()
    }
}
```

A `sqlx::Error`'s Display can contain the query, the constraint name, and occasionally the connection string. It never reaches a client. And keep the match arms explicit rather than a helper that guesses — the exhaustiveness check is the entire reason to use an enum here.

Handlers become boring:

```rust
async fn get_order(
    State(app): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<OrderResponse>, AppError> {
    let order = orders::fetch(&app.db, id).await?.ok_or(AppError::NotFound)?;
    if order.buyer_id != user.id { return Err(AppError::Forbidden); }
    Ok(Json(order.into()))
}
```

### 3.4 A custom auth extractor with FromRequestParts

Auth as an extractor rather than middleware writing into `Extension` buys a compile-time guarantee: a handler naming `AuthUser` cannot be reached without a validated token, and one that omits it provably never reads identity.

```rust
pub struct AuthUser(pub User);

impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,   // not `S = AppState` — this stays reusable in a sub-router
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app = AppState::from_ref(state);

        let raw = parts.headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;

        let claims = app.tokens.verify(raw).map_err(|_| AppError::Unauthorized)?;

        // Record on the current span: every log line under this request gets it free.
        tracing::Span::current().record("user_id", tracing::field::display(&claims.sub));
        Ok(AuthUser(User { id: claims.sub, org_id: claims.org }))
    }
}
```

On 0.7 this impl needs `#[async_trait]`; on 0.8 the trait uses native async fn in traits and the attribute is gone. That difference is the most common reason a copied snippet does not compile.

### 3.5 Layers wrap, so they read bottom-up

`Router::layer` wraps everything added **before** it, so the last `.layer()` is the **outermost** and sees the request **first**. Use `ServiceBuilder` precisely because it flips the model back to top-down = request order.

```rust
let app = Router::new()
    .route("/v1/orders", post(create_order).get(list_orders))
    .route("/v1/orders/{id}", get(get_order).delete(cancel_order))  // {id} is 0.8; 0.7 used :id
    .with_state(state)   // before .layer() — afterwards the router's state type is (), which layers expect
    .layer(
        ServiceBuilder::new()
            .layer(TraceLayer::new_for_http().make_span_with(|req: &Request<_>| {
                tracing::info_span!("http",
                    method = %req.method(),
                    path = %req.uri().path(),
                    user_id = tracing::field::Empty)   // filled in by AuthUser (3.4)
            }))
            .layer(TimeoutLayer::new(Duration::from_secs(15)))
            .layer(CorsLayer::new()
                .allow_origin(cfg.allowed_origin.parse::<HeaderValue>()?)
                .allow_methods([Method::GET, Method::POST, Method::DELETE])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]))
            .layer(RequestBodyLimitLayer::new(64 * 1024)),
    )
    .fallback(|| async { AppError::NotFound });
```

Trace outermost so it records timeouts and rejections — precisely the requests you needed a trace for. Body limit innermost so nothing above it buffers a 2GB upload first.

### 3.6 sqlx: compile-time checked queries, pool in State

`query_as!` verifies SQL against a real schema at build time. Column typo, wrong nullability, renamed table: build failure, not a 3am page.

```rust
pub async fn fetch(db: &PgPool, id: Uuid) -> Result<Option<OrderRow>, sqlx::Error> {
    sqlx::query_as!(OrderRow,
        r#"select id, buyer_id, sku, status from orders where id = $1"#, id)
        .fetch_optional(db)   // Option -> `.ok_or(AppError::NotFound)?` reads cleanly
        .await
}
```

`fetch_one` instead yields `sqlx::Error::RowNotFound`, which your `#[from]` maps to a 500 — a not-found rendered as a server error is a bug you will ship at least once.

```rust
let db = PgPoolOptions::new()
    .max_connections(cfg.db_max_connections)   // instances * this must fit under Postgres max_connections
    .min_connections(2)
    .acquire_timeout(Duration::from_secs(3))   // fail fast; do not queue behind an exhausted pool
    .max_lifetime(Duration::from_secs(1800))   // survives failover / DNS change
    .connect(&cfg.database_url).await?;
```

Run `cargo sqlx prepare` and commit `.sqlx/`, or CI has no database, cannot type-check a query, and someone "temporarily" switches to unchecked `query`. This is sqlx's number one works-on-my-machine failure.

### 3.7 Borrow and lifetime failures you will actually hit

**A `std::sync::Mutex` guard held across `.await`.** The guard is not `Send`, so the future is not `Send`, so the handler is not a `Handler`. The error mentions `MutexGuard` somewhere around line 60.

```rust
// BROKEN — the guard is alive across the await
let cache = app.cache.lock().unwrap();
let items = load_from_db(&app.db).await?;
Ok(Json(cache.merge(items)))

// FIXED — narrow the scope so it drops before any await
let snapshot = { app.cache.lock().unwrap().snapshot() };
let items = load_from_db(&app.db).await?;
Ok(Json(merge(snapshot, items)))
```

If a lock must genuinely span an `.await`, it is `tokio::sync::Mutex` — but first ask why a request holds a lock across I/O at all.

**Returning a reference from a handler.** The future must be `'static`; `&str` out of an `Arc<Config>` will not go. Return owned data and stop optimising an allocation cheaper than the TCP write.

**`?` on an error with no `From`.** Add a variant with `#[from]`, or `.map_err(AppError::Validation)`. Do not reach for `Box<dyn Error>` — it destroys the exhaustive match, which was the point.

### 3.8 Graceful shutdown

```rust
axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.expect("install ctrl-c handler") };

    #[cfg(unix)]
    let term = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler").recv().await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutdown signal received, draining");
}
```

Handling only `ctrl_c` means SIGTERM kills you instantly — and SIGTERM is exactly what Kubernetes and systemd send. The `#[cfg(unix)]` split is not optional if anyone develops on Windows.

### 3.9 Testing: oneshot, no ports, no sleeps

`Router` is a `tower::Service`. Drive it directly.

```rust
use tower::ServiceExt; // brings `oneshot` into scope — the import everyone forgets

#[tokio::test]
async fn create_order_rejects_zero_quantity() {
    let app = router(test_state().await);

    let res = app.oneshot(
        Request::builder().method(Method::POST).uri("/v1/orders")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::AUTHORIZATION, format!("Bearer {}", test_token()))
            .body(Body::from(r#"{"sku":"ABC","quantity":0}"#)).unwrap()
    ).await.unwrap();

    assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(body["error"], "validation_failed"); // codes are contract; messages are copy
}
```

`oneshot` consumes the router, so each test builds its own — correct anyway, since shared routers share state. For repo tests use `#[sqlx::test]`, which hands each test a fresh migrated database and drops it after.

## 4. Anti-patterns

- **`Json` anywhere but last.** The compile error will never say this. Check it first, every time.
- **`Extension<Arc<AppState>>` for application state.** A missing layer becomes a runtime 500 on the one route you forgot to test. `State` makes it a build error.
- **`Result<Json<T>, (StatusCode, String)>` in handler signatures.** Forty handlers, forty error bodies, no exhaustiveness.
- **`.unwrap()` in a handler.** A panic aborts the connection: no status, no body, nothing the client can parse. Return `Err`. Reserve `expect` for startup, where crashing is correct.
- **Letting `sqlx::Error` Display reach the client.** Constraint names, query text, sometimes credentials.
- **`fetch_one` where a row may legitimately be absent.** `RowNotFound` maps through `#[from]` to a 500.
- **`std::sync::Mutex` held across `.await`.** Non-`Send` future, opaque error, an hour gone.
- **`TraceLayer` innermost.** It then never sees requests rejected by timeout, body limit, or CORS.
- **No `RequestBodyLimitLayer` on public routes.** `Json<T>` buffers the whole body before deserializing: memory exhaustion via a curl one-liner.
- **`.sqlx/` not committed.** CI cannot check a single `query_as!`.
- **Copying 0.6/0.7 snippets into 0.8.** `Server::bind` gone, `:id` became `{id}`, `#[async_trait]` no longer needed. Pin the version in your prompt.
- **Mixing `Arc<AppState>` and `AppState` across handlers.** Pick one; the mismatch surfaces as an unreadable `Handler` error.

## 5. Usage

1. Load this skill into your assistant (project skill in Claude Code, a rule in Cursor). **State your Axum version** — "Axum 0.8" — because the differences in 3.4 and 3.5 decide whether the code compiles at all.
2. Describe the service in domain terms. Example: "Orders API on Axum 0.8 + sqlx/Postgres. Bearer JWT. POST /v1/orders, GET /v1/orders/{id}, DELETE /v1/orders/{id} (buyer only, pending only)."
3. Ask for, in order: (a) `AppState` and `router()`, (b) the `AppError` enum with `IntoResponse`, (c) the `AuthUser` extractor, (d) handlers, (e) the sqlx repo with `query_as!`, (f) `main.rs` with tracing, pool options, graceful shutdown, (g) `oneshot` tests for auth-required, validation failure, not-found.
4. Run section 4 as a checklist. The three-second version: is the body extractor last, does anything unwrap in a handler, can a `sqlx::Error` reach a response body.

The assistant should refuse to put `Json` before other extractors, refuse `unwrap()` inside a handler, and reach for `State` over `Extension` unless the value is genuinely per-request and middleware-injected.

## 6. Example Output

Prompt given with this skill loaded: *"Add DELETE /v1/orders/{id} to cancel an order. Only the buyer can cancel, and only while status is 'pending'."*

Expected shape of the answer:

```rust
// repo.rs — the guards live in the WHERE clause, so two concurrent cancels cannot both win
pub async fn cancel_if_pending(db: &PgPool, id: Uuid, buyer: Uuid) -> Result<u64, sqlx::Error> {
    let res = sqlx::query!(
        r#"update orders set status = 'cancelled', cancelled_at = now()
           where id = $1 and buyer_id = $2 and status = 'pending'"#, id, buyer)
        .execute(db).await?;
    Ok(res.rows_affected())
}

// handler.rs
async fn cancel_order(
    State(app): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if cancel_if_pending(&app.db, id, user.id).await? == 1 {
        return Ok(StatusCode::NO_CONTENT);
    }
    // Zero rows: distinguish gone / not yours / wrong state. Cold path, so the extra read is free.
    match orders::fetch(&app.db, id).await? {
        None => Err(AppError::NotFound),
        Some(o) if o.buyer_id != user.id => Err(AppError::Forbidden),
        Some(o) => Err(AppError::Conflict(o.status)),
    }
}
```

Note what the output does *not* contain: no read-then-write race, no `unwrap`, no hand-built `(StatusCode, String)` tuple, and no `Json` extractor competing for a body this handler does not have. Adding `Conflict` to the enum made the compiler demand a status code for it — the contract could not drift even if you wanted it to.
