---
title: Go REST APIs with Gin Skill
category: Coding
description: Build a Go REST API with Gin that survives production — layered without ceremony, cancellable end to end, and shut down cleanly. Covers project layout, the middleware you actually need, struct-tag validation with custom validators, a central error mapper, and the context traps that leak goroutines.
usage: Load this skill before asking your AI assistant to scaffold or extend a Gin service. Say "use the Go Gin REST API skill" and describe your endpoints and domain; the assistant will produce handler/service/repo code, middleware, and tests that follow these patterns instead of the single-file tutorial style Gin examples encourage.
platforms: [Claude, Cursor, ChatGPT]
priceUsd: 5
timeSavedHours: 14
pocUrl: https://github.com/gin-gonic/gin
---

# Go REST APIs with Gin Skill

## 1. Philosophy

Gin is a router with a fast tree lookup and a middleware chain. That is the whole product. Nearly every problem people blame on Gin is a problem with the code they hung off it.

Two failure modes dominate. **The single main.go**: four hundred lines, SQL inline in handlers, no seam to test against. And **the Java cosplay**: an interface per struct, a DI container, `IUserServiceImpl`. The second is more expensive because it looks like engineering.

1. **Three layers, and you must be able to say why each exists.** Handler translates HTTP to domain. Service holds the decisions. Repo talks to storage. If a layer only forwards arguments, delete it — adding it back later is a twenty-minute refactor and the compiler finds every call site.
2. **Interfaces are declared by the consumer, at the point of use, and only when there are two implementations or a test needing a fake.** Never write the interface before the implementation.
3. **`context.Context` is the first argument of every function below the handler.** A service method without a `ctx` is a function you cannot time out.
4. **`*gin.Context` never leaves the handler.** It is an HTTP concern with a pooled, request-scoped lifetime. Passing it down hands that lifetime to code that may outlive the request.

The `handler` package should be boring. All the interesting code lives where Gin cannot see it.

## 2. Tech Stack

- **Gin** — https://github.com/gin-gonic/gin — licensed **MIT**. HTTP router and middleware chain for Go. Use v1.10+; older versions predate several `binding` fixes.
- **Go 1.22+** — for `log/slog` in the standard library and the loop-variable semantics assumed below.
- **go-playground/validator/v10** (MIT) — vendored by Gin as its `binding` validator; reached through struct tags.
- **`database/sql` + `pgx/v5` stdlib driver** (MIT) — examples use Postgres; the pool advice applies to any driver.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Gin maintainers. All example code is original to this skill.

Companions: `golangci-lint` with `errcheck`, `contextcheck`, `bodyclose`; `testify/require`; `golang-migrate`.

## 3. Patterns

### 3.1 Layout: `cmd/` is a wiring file, `internal/` is the program

```
cmd/api/main.go            // config, wiring, graceful shutdown. No logic.
internal/http/router.go    // the whole route table on one screen
internal/http/middleware/  // requestid.go, logging.go, recovery.go, cors.go
internal/http/handler/     // thin
internal/http/httperr/     // the error mapper (3.4)
internal/order/            // service.go (decisions), repo_postgres.go, order.go (types + sentinel errors)
```

`internal/` is not decoration — the compiler forbids external imports, so you refactor without a deprecation cycle. Package by feature (`order`, `user`), not by layer: a `models` package becomes an import-cycle magnet the first time two features reference each other.

```go
func NewRouter(deps Deps) *gin.Engine {
	r := gin.New() // NOT gin.Default() — Default installs its own logger+recovery on top of yours
	r.Use(middleware.RequestID(), middleware.Logger(deps.Log), middleware.Recovery(deps.Log),
		middleware.CORS(deps.Cfg.AllowedOrigins), middleware.Timeout(10*time.Second))
	orders := r.Group("/v1/orders", middleware.RequireAuth(deps.Tokens))
	orders.POST("", handler.CreateOrder(deps.Orders))
	orders.GET("/:id", handler.GetOrder(deps.Orders))
	return r
}
```

### 3.2 Handlers are closures; tags own shape; validators own your domain

Skip the receiver-struct-with-a-constructor ritual. A handler needs one thing, so close over it — which also makes the dependency visible in the route table above.

```go
type OrderService interface { // declared by the consumer, sized to what it uses
	Create(ctx context.Context, in order.CreateInput) (order.Order, error)
}
type createOrderRequest struct {
	SKU      string `json:"sku" binding:"required,alphanum,max=32"`
	Quantity int    `json:"quantity" binding:"required,gt=0,lte=100"`
	ShipDate string `json:"ship_date" binding:"required,futuredate"` // custom rule, registered below
	Currency string `json:"currency" binding:"required,iso4217"`
}
func CreateOrder(svc OrderService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req createOrderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			httperr.Write(c, httperr.FromBinding(err)) // never hand-roll the 400 here
			return
		}
		out, err := svc.Create(c.Request.Context(), order.CreateInput{SKU: req.SKU, Quantity: req.Quantity})
		if err != nil {
			httperr.Write(c, err)
			return
		}
		c.JSON(http.StatusCreated, toOrderResponse(out))
	}
}
```

Decode, delegate, encode. Nothing else. `c.Request.Context()` — not `c` — is what crosses the boundary; it is the most important line in the file.

Domain rules get registered once at boot, against the validator engine Gin already holds:

```go
v := binding.Validator.Engine().(*validator.Validate)
v.RegisterTagNameFunc(func(f reflect.StructField) string { // report fields as the CLIENT named them
	name := strings.Split(f.Tag.Get("json"), ",")[0]
	if name == "-" { return "" }
	return name
})
v.RegisterValidation("futuredate", func(fl validator.FieldLevel) bool {
	d, err := time.Parse("2006-01-02", fl.Field().String())
	return err == nil && d.After(time.Now().UTC().Truncate(24*time.Hour))
})
```

Without `RegisterTagNameFunc` a failure on `ShipDate` reports `"ShipDate"` to a client that sent `ship_date`. Register it once; every error message in the API improves for free.

### 3.3 The gin.Context trap, leaked goroutines, and timeout propagation

`*gin.Context` implements `context.Context`. That is a loaded gun: Gin pools `Context` objects and resets them when the handler returns, so `go audit.Record(c, c.Param("id"))` reads a value that already belongs to a different request.

For work outliving the request, copy values out and start a fresh context with its own deadline:

```go
id := c.Param("id")                                     // copy the value out NOW
reqID := middleware.RequestIDFrom(c.Request.Context())
go func() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := auditor.Record(middleware.WithRequestID(ctx, reqID), id); err != nil { /* log; never panic here */ }
}()
c.Status(http.StatusAccepted)
```

The rule: **anything spawned in a handler either finishes before the handler returns, or gets a fresh context and copied-out values.** Never both. `c.Copy()` fixes the pooling but its `Done()` never fires — you still need your own deadline, or that goroutine lives forever when the downstream call hangs.

Propagating a timeout requires rewriting the request, the step everyone forgets:

```go
func Timeout(d time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), d)
		defer cancel()
		c.Request = c.Request.WithContext(ctx) // without this you built a deadline nobody reads
		c.Next()
	}
}
```

Downstream, use `QueryRowContext`, never `QueryRow`. The non-Context variants are `context.Background()` in a trenchcoat: the client hangs up, the query keeps burning a connection.

```go
func (r *PostgresRepo) Get(ctx context.Context, id string) (order.Order, error) {
	var o order.Order
	err := r.db.QueryRowContext(ctx, `select id, sku, status from orders where id=$1`, id).Scan(&o.ID, &o.SKU, &o.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return order.Order{}, fmt.Errorf("get order %s: %w", id, order.ErrNotFound) // translate at the boundary
	}
	return o, err
}
```

### 3.4 One error mapper, typed responses, no hand-written 500s

Domain packages define sentinel errors (`order.ErrNotFound`, `ErrConflict`, `ErrNotAllowed`). Only the HTTP layer knows their status codes.

```go
type Response struct {
	Error   string            `json:"error"`            // stable machine code
	Message string            `json:"message"`          // human copy
	Fields  map[string]string `json:"fields,omitempty"` // per-field validation detail
	TraceID string            `json:"trace_id,omitempty"`
}

func Write(c *gin.Context, err error) {
	tid := middleware.RequestIDFrom(c.Request.Context())
	var ae *apiError // carries status/code/fields; produced by FromBinding
	switch {
	case errors.As(err, &ae):
		c.AbortWithStatusJSON(ae.status, Response{ae.code, ae.message, ae.fields, tid})
	case errors.Is(err, order.ErrNotFound):
		c.AbortWithStatusJSON(http.StatusNotFound, Response{Error: "not_found", Message: "resource does not exist", TraceID: tid})
	case errors.Is(err, order.ErrNotAllowed):
		c.AbortWithStatusJSON(http.StatusForbidden, Response{Error: "forbidden", Message: "not permitted", TraceID: tid})
	case errors.Is(err, context.DeadlineExceeded):
		c.AbortWithStatusJSON(http.StatusGatewayTimeout, Response{Error: "timeout", Message: "request took too long", TraceID: tid})
	default: // unknown: log it in full, tell the client nothing
		slog.ErrorContext(c.Request.Context(), "unhandled error", "err", err, "path", c.FullPath())
		c.AbortWithStatusJSON(http.StatusInternalServerError, Response{Error: "internal", Message: "something went wrong", TraceID: tid})
	}
}
```

`AbortWithStatusJSON`, not `JSON` — abort stops the chain so a later middleware cannot append a second body. A raw `err.Error()` in that `default` branch has leaked more DSNs than any breach I have read about.

### 3.5 Middleware: request ID, slog, recovery

Order is not arbitrary: request ID first (everything wants it), logger next (so it times the rest), recovery inside the logger (so a panic still gets logged with its request ID).

```go
type ctxKey struct{} // unexported type — a string key collides with every other package

func Logger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next() // the rest of the chain runs here
		log.LogAttrs(c.Request.Context(), slog.LevelInfo, "http_request",
			slog.String("route", c.FullPath()), // route pattern, NOT c.Request.URL.Path
			slog.Int("status", c.Writer.Status()),
			slog.Duration("took", time.Since(start)),
			slog.String("request_id", RequestIDFrom(c.Request.Context())))
	}
}
```

`RequestID` generates or accepts `X-Request-ID`, stores it via `c.Request = c.Request.WithContext(context.WithValue(...))`, and echoes it back as a header. Log `c.FullPath()` (`/v1/orders/:id`), never the raw path: raw paths make every request a unique metrics label and turn cardinality into a bill.

### 3.6 Graceful shutdown and pool tuning

`r.Run()` is for demos — it cannot be stopped, so every deploy kills in-flight requests.

```go
srv := &http.Server{Addr: cfg.Addr, Handler: NewRouter(deps),
	ReadHeaderTimeout: 5 * time.Second, // slowloris protection; the one timeout with no safe default
	WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
go func() {
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("listen failed", "err", err); os.Exit(1)
	}
}()
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
<-ctx.Done() // SIGTERM is what Kubernetes sends; handling only Interrupt means no drain in prod
shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
defer cancel()
if err := srv.Shutdown(shutdownCtx); err != nil { log.Error("forced shutdown", "err", err) }
```

Keep the drain shorter than your orchestrator's grace period (Kubernetes defaults to 30s), or the platform SIGKILLs you mid-drain and the exercise was theatre.

`database/sql` defaults to unlimited open connections and **2 idle**. Under a spike you open 900 connections, Postgres refuses at `max_connections`, and everything fails at once:

```go
db.SetMaxOpenConns(cfg.DBMaxOpen)       // instances * this must fit under Postgres max_connections
db.SetMaxIdleConns(cfg.DBMaxOpen)       // idle == open; a lower idle cap churns TCP+TLS under steady load
db.SetConnMaxLifetime(30 * time.Minute) // lets a failover / DNS change be picked up
```

Leaving `MaxIdleConns` at 2 with `MaxOpenConns(50)` is the classic "it's slow but the query is fast" ticket.

### 3.7 Testing handlers with httptest

The router is an `http.Handler`. Serve it directly — no listener, no ports, no flake.

```go
func TestGetOrder_NotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := NewRouter(Deps{Log: slog.New(slog.DiscardHandler), Orders: &fakeOrders{
		get: func(ctx context.Context, id string) (order.Order, error) { return order.Order{}, order.ErrNotFound }}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orders/abc", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusNotFound, w.Code)
	var body httperr.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Equal(t, "not_found", body.Error) // assert on codes, never on human messages
}
```

## 4. Anti-patterns

- **Passing `*gin.Context` below the handler.** Couples the domain to a router and hands pooled state to code that may outlive the request. Pass `c.Request.Context()`.
- **`go doWork(c)` in a handler.** The pool resets `c` on return; you are reading another request's data.
- **`QueryRow`/`Exec` without `Context`.** Client disconnects, query runs on. Under a retry storm one slow endpoint saturates the pool and takes down endpoints that merely share it.
- **Building a timeout context without `c.Request = c.Request.WithContext(ctx)`.** The deadline exists and nothing observes it.
- **`gin.Default()` in production.** Duplicate logging and a recovery that does not know your error format.
- **Inline `c.JSON(500, gin.H{"error": err.Error()})`.** Inconsistent shapes and a direct leak of SQL text and table names. One mapper, always.
- **Interfaces defined next to their single implementation.** A file you maintain for nothing. Declare them in the consumer.
- **A `models`/`types` package holding every struct.** Cycle magnet; tells you nothing about the domain.
- **`r.Run()` and no `Shutdown`.** A small, permanent 502 rate nobody can reproduce.
- **No `ReadHeaderTimeout`.** A handful of slow-header connections pin your goroutines indefinitely.
- **Logging `c.Request.URL.Path` instead of `c.FullPath()`.** Unbounded label cardinality; you can never group by route.
- **Validating in both the tags and the service.** Tags own shape (required, ranges, formats); the service owns rules needing state ("this SKU is discontinued"). Duplicated shape checks drift within a month.

## 5. Usage

1. Load this skill into your assistant (project skill in Claude Code, a rule file in Cursor, or paste it for ChatGPT).
2. Describe the service in domain terms: entities, endpoints, callers. Example: "Orders API. POST /v1/orders creates, GET /v1/orders/:id fetches, both need a bearer token. Postgres."
3. Ask for, in order: (a) layout and `router.go`, (b) domain types with sentinel errors, (c) handlers plus request structs with binding tags, (d) service and repo, (e) `main.go` with pool tuning and graceful shutdown, (f) httptest tests for happy path, validation failure, and not-found.
4. Review against section 4. Two questions catch most of it: does any function below `handler/` take a `*gin.Context`, and does every one of them take `ctx` first?

The assistant should refuse to pass `*gin.Context` into a service, refuse a `Query` without `Context`, and always produce `main.go` with `srv.Shutdown`.

## 6. Example Output

Prompt given with this skill loaded: *"Add an endpoint to cancel an order. Only the buyer can cancel, and only while status is 'pending'."*

Expected shape of the answer:

```go
// internal/order/service.go — the rules live here, reachable by a test without a router
var ErrNotCancellable = errors.New("order is not in a cancellable state")

func (s *Service) Cancel(ctx context.Context, orderID, actorID string) error {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return err // already wrapped with ErrNotFound by the repo
	}
	if o.BuyerID != actorID {
		return fmt.Errorf("cancel %s: %w", orderID, ErrNotAllowed)
	}
	if o.Status != StatusPending {
		return fmt.Errorf("cancel %s (status %s): %w", orderID, o.Status, ErrNotCancellable)
	}
	return s.repo.UpdateStatus(ctx, orderID, StatusCancelled)
}

// internal/http/handler/order.go
func CancelOrder(svc OrderService) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		if err := svc.Cancel(ctx, c.Param("id"), middleware.ActorIDFrom(ctx)); err != nil {
			httperr.Write(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	}
}
```

The mapper gains one line and every handler inherits it:

```go
case errors.Is(err, order.ErrNotCancellable):
	c.AbortWithStatusJSON(http.StatusConflict, Response{Error: "not_cancellable", Message: "order can no longer be cancelled", TraceID: tid})
```

Note what the output does *not* contain: no ownership check in the handler, no inline `c.JSON(403)`, no `*gin.Context` below the HTTP layer. The handler moved HTTP to domain and back — that is the whole job.
