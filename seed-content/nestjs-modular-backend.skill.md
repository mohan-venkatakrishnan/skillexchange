---
title: Modular Backends with NestJS Skill
category: Coding
description: Structure a NestJS backend around domain boundaries that survive year two, instead of a god-module and a folder called shared. Covers DI scopes, a strict global ValidationPipe, the exact guard/interceptor/filter execution order, config validation, exception mapping, and testing with overridden providers.
usage: Load this skill before asking your AI assistant to scaffold a NestJS module, endpoint, or test. Say "use the modular NestJS backend skill" and describe the feature; the assistant will produce module boundaries, DTOs, guards, and specs that follow these rules rather than the generator's defaults.
platforms: [Claude, Cursor, Copilot]
priceUsd: 6
timeSavedHours: 20
pocUrl: https://github.com/nestjs/nest
---

# Modular Backends with NestJS Skill

## 1. Philosophy

NestJS gives you Angular's dependency injection on the server, and the framework is genuinely good. The failure mode is not the framework — it is that `nest g resource` scaffolds structure faster than most teams decide what their structure means. Eighteen months later there is an `AppModule` importing thirty things, a `SharedModule` importing twenty, and a dependency graph held together by `forwardRef`.

**A module is a bounded context with a public API. Its providers are private unless it says otherwise, and `exports` is the entire contract.**

1. **Module boundaries mirror the domain, not the layer.** `BillingModule`, `ProjectsModule`, `IdentityModule` — not `ControllersModule`, `ServicesModule`, `RepositoriesModule`. If a new engineer cannot guess which module a feature lives in from the product's own vocabulary, the boundaries are wrong.
2. **Nothing untrusted crosses a controller boundary untyped.** A DTO with `class-validator` plus a strict global pipe is the only thing between a request body and your database. `any` at the edge is a decision to validate nowhere.
3. **Providers are singletons and you want that.** The container instantiates once and shares. Every deviation — `REQUEST` scope especially — has a cost that propagates upward through the graph, and almost every reason to reach for it has a better answer.

If two modules need each other, that is not a `forwardRef` problem. That is the domain telling you the boundary is in the wrong place.

## 2. Tech Stack

- **NestJS** — https://github.com/nestjs/nest — licensed **MIT**. Modular architecture, dependency injection, and the guard/interceptor/pipe/filter enhancer pipeline.
- **NestJS 10+ on Node 18+** — assumed throughout. Examples use the Express adapter; Fastify behaves identically for everything here except low-level `@Res()`, which §4 tells you not to do anyway.
- **class-validator** and **class-transformer** (MIT) — the DTO layer in §3.3. Not optional here; the global pipe depends on both.
- **@nestjs/config** with **Zod** (MIT) — environment validation in §3.7.
- **@nestjs/testing** — `Test.createTestingModule`, the whole point of §3.9.

This skill is an independent, original guide; it is not affiliated with or endorsed by the NestJS maintainers. All example code is original to this skill.

Recommended companion: `@nestjs/swagger` — with a strict `ValidationPipe`, your DTOs already are the API documentation.

## 3. Patterns

### 3.1 Modules that mirror the domain

```ts
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,       // public: exported below
    ProjectPolicy,         // private: authorization rules
    ProjectSlugGenerator,  // private: implementation detail
  ],
  exports: [ProjectsService], // the entire public API of this module
})
export class ProjectsModule {}
```

The `exports` array is the design. `ProjectPolicy` and `ProjectSlugGenerator` are invisible outside this module — nothing else can inject them, so they can be refactored freely. If `exports` lists every provider, you wrote a namespace, not a module.

The test that catches drift early: **can you delete this module and get a compile error list that reads like a feature removal?** If deleting `BillingModule` breaks `ProjectsController`'s request parsing, the boundary leaked.

### 3.2 REQUEST scope poisons the tree

Default scope is `DEFAULT` — one instance for the application lifetime, created at bootstrap. That is what you want, and it is why Nest starts fast and injects cheaply.

```ts
@Injectable({ scope: Scope.REQUEST }) // think very hard before doing this
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly req: Request) {}
}
```

Here is the part teams learn the hard way: **request scope is contagious upward.** If `TenantContext` is request-scoped and `ProjectsService` injects it, `ProjectsService` becomes request-scoped. If the controller injects that, the controller does too. Nest now rebuilds that entire chain on every request — new objects, new constructor work, per-request garbage — and the propagation is silent. No warning, no error. You find it in a flame graph.

Worse, a request-scoped provider cannot be injected into a `@Cron` handler or a queue consumer; there is no request in flight. Your "just for the tenant id" decision has infected your background jobs.

The alternatives, in order:

1. **Pass the value as an argument.** `projectsService.list(orgId, filters)` is not worse than reading `orgId` from ambient context — it is better: testable and honest.
2. **`AsyncLocalStorage`** in a middleware when you truly need ambient context (request id for logging) without threading it through twenty signatures. A singleton reads from the store — no scope propagation, and it works in jobs when you seed the store yourself.
3. **`Scope.REQUEST`** only when a library genuinely requires per-request construction, and then only on a leaf.

### 3.3 DTOs and a pipe that actually refuses things

```ts
export class CreateProjectDto {
  @IsString() @Length(1, 120) @Transform(({ value }) => value?.trim())
  name!: string

  @IsString() @Matches(/^[a-z0-9-]{3,40}$/, { message: 'slug: lowercase, dashes, 3-40' })
  slug!: string

  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TagDto)
  tags: TagDto[] = []
}
```

```ts
new ValidationPipe({
  whitelist: true,             // strip properties with no decorator
  forbidNonWhitelisted: true,  // 400 instead of silently stripping
  transform: true,             // plain object -> DTO class instance
  transformOptions: { enableImplicitConversion: false },
})
```

Every flag is load-bearing:

- **`whitelist`** — without it, a body containing `{ "role": "owner" }` reaches a service on a DTO that never declared `role`, and any `create({ ...dto })` mass-assigns it. This is the most common NestJS vulnerability and it is one boolean.
- **`forbidNonWhitelisted`** — upgrades silent stripping to a 400. A client sending fields you ignore is a bug in one of you; find out now.
- **`transform`** — without it your DTO parameter is a plain object at runtime. `instanceof` fails, defaults never apply, methods are gone. The decorators still validate; the type annotation is a comfortable lie.
- **`enableImplicitConversion: false`** — implicit conversion turns `"abc"` into `NaN` for an `@IsNumber()` field rather than rejecting it. Be explicit with `@Type(() => Number)` where you want coercion.

`@ValidateNested({ each: true })` **requires** the matching `@Type()`. Without it, nested objects are never validated and the array passes with arbitrary garbage inside. Nothing errors; validation just silently does nothing.

### 3.4 The execution order, exactly

Every "why did my guard not see the transformed body" question resolves here:

```
request
  → middleware            (Express-level: no DI context, no ExecutionContext)
  → guards                (global → controller → route)
  → interceptors (pre)    (global → controller → route)
  → pipes                 (validation/transformation of parameters)
  → ROUTE HANDLER
  → interceptors (post)   (route → controller → global — unwinds in reverse)
  → exception filters     (only if something threw)
response
```

The consequences that matter:

- **Guards run before pipes.** Your guard sees the raw, unvalidated, untransformed body. Never read `request.body.orgId` in a guard and trust its shape — take it from the authenticated principal or a route param.
- **Middleware has no `ExecutionContext`.** It cannot read `@SetMetadata`, cannot know the handler, cannot use the `Reflector`. Anything that needs to know *which route* it is on is a guard or an interceptor.
- **Interceptors unwind in reverse.** A global logging interceptor wraps a route caching interceptor, so the log records the cached-response time. Order deliberately.
- **Filters catch everything after guards** — which is why §3.6 works on a guard's `ForbiddenException` too.

One line each: **middleware** for framework concerns with no route awareness (raw body capture, helmet). **Guards** for "may this proceed" — the only enhancer that belongs in an authorization decision. **Interceptors** for wrapping the call — timing, caching, response envelopes, `timeout()`. **Filters** for turning a thrown thing into an HTTP response.

### 3.5 Guards plus a current-user decorator

```ts
export const CurrentUser = createParamDecorator(
  (field: keyof Principal | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ principal?: Principal }>()
    // Reaching a handler with no principal means the guard is missing. Fail at
    // the seam rather than passing undefined downstream.
    if (!req.principal) throw new InternalServerErrorException('CurrentUser without AuthGuard')
    return field ? req.principal[field] : req.principal
  }
)
```

```ts
@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly identity: IdentityService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<MemberRole[]>(ROLES_KEY, [
      ctx.getHandler(), // route-level wins over...
      ctx.getClass(),   // ...controller-level
    ])
    if (!required?.length) return true

    const req = ctx.switchToHttp().getRequest()
    const orgId: string = req.params.orgId // param, not body — pipes have not run
    if (!req.principal || !orgId) return false

    const role = await this.identity.roleInOrg(req.principal.userId, orgId)
    return role !== null && required.includes(role)
  }
}
```

`getAllAndOverride` gives you route-overrides-controller precedence in one call — the alternative is two `get` calls and a manual merge everyone gets backwards.

### 3.6 Domain errors in the service, HTTP in the filter

The moment `ProjectsService` throws `NotFoundException`, it cannot be reused by a queue consumer or a CLI without dragging HTTP semantics along.

```ts
// shared/domain-error.ts — no framework import.
export abstract class DomainError extends Error { abstract readonly code: string }
export class ProjectNotFound extends DomainError {
  readonly code = 'PROJECT_NOT_FOUND'
  constructor(readonly id: string) { super(`Project ${id} not found`) }
}
```

```ts
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  private static readonly STATUS: Record<string, number> = {
    PROJECT_NOT_FOUND: 404, SLUG_TAKEN: 409, NOT_AN_ORG_MEMBER: 403,
  }
  catch(err: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse()
    res.status(DomainErrorFilter.STATUS[err.code] ?? 500).json({ code: err.code, message: err.message })
  }
}
```

One mapping table, one place to audit what leaks to clients. Register via `APP_FILTER` so it participates in DI.

### 3.7 Config: validate at boot, inject typed

An app that starts with a missing `DATABASE_URL` and fails on the first request has traded a loud bootstrap failure for a quiet 3am page.

```ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
})
export type Env = z.infer<typeof envSchema>

ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: (raw) => envSchema.parse(raw), // throws at bootstrap, not at runtime
})
```

```ts
constructor(private readonly config: ConfigService<Env, true>) {}
// `true` = infer: get() is typed and non-nullable. No `!` on every call.
```

Never read `process.env` outside this schema. One file knows what the environment must contain, and it says so before the server binds a port.

### 3.8 `forwardRef` is a smell

When two modules import each other, Nest cannot resolve the graph and you reach for `forwardRef(() => BillingModule)`. It works — and it means your boundaries are wrong. The cost compounds: circular imports break tree-shaking, confuse the test module builder, and produce `undefined` injections whose stack traces point nowhere useful.

Three real fixes, in order:

1. **Extract the shared concept.** If both modules need seat counting, seat counting is its own module they both import. The cycle disappears because the dependency was never mutual — it was a third thing.
2. **Invert with events.** `ProjectsService` emits `project.created`; `BillingModule` listens. Projects no longer knows Billing exists. `@nestjs/event-emitter` in-process, a real queue when the handler can fail independently.
3. **Move the caller.** If `BillingService` calls one method on `ProjectsService`, maybe that method belongs to Billing, or to a module beneath both.

If you must ship the `forwardRef`, leave a comment naming which of the three you owe — and note that both sides need it, since a one-sided `forwardRef` fails at runtime, not compile time.

### 3.9 Testing: override the boundary, not the internals

```ts
const moduleRef = await Test.createTestingModule({
  providers: [
    ProjectsService,
    ProjectSlugGenerator,                        // real: it is a pure function
    { provide: ProjectRepository, useValue: repo },
    { provide: BillingService, useValue: billing },
  ],
}).compile()

const service = moduleRef.get(ProjectsService)
```

Build the testing module from **providers, not modules**. `imports: [ProjectsModule]` drags in the database, the config, and everything transitively imported — that is an integration test wearing a unit test's filename, and it will be the slowest thing in your suite.

For e2e, do the opposite: import the real `AppModule` and override only the leaves that cross the network.

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(StripeClient).useValue(fakeStripe)
  .overrideGuard(OrgRoleGuard).useValue({ canActivate: () => true })
  .compile()

const app = moduleRef.createNestApplication()
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
await app.init()
```

That `useGlobalPipes` line is not optional. Pipes registered in `main.ts` **do not exist in a testing module** — `main.ts` never runs. Teams ship validation bugs past a green e2e suite for exactly this reason. Register enhancers via `APP_PIPE` in a module instead and tests inherit them for free.

## 4. Anti-patterns

- **The god-module.** `AppModule` importing thirty things with providers of its own. It is where code goes when nobody decided where it belongs.
- **`SharedModule` as a junk drawer.** A module with no domain meaning accumulates until everything imports it and you have a cycle with extra steps. Shared *infrastructure* is fine; shared *domain logic* means a missing module.
- **Exporting every provider.** No encapsulation, no refactoring freedom.
- **`ValidationPipe` without `whitelist`.** Mass assignment. One boolean.
- **`@ValidateNested()` without `@Type()`.** Nested validation silently does nothing and reports success.
- **`Scope.REQUEST` for convenience.** Contagious upward, breaks cron and queue consumers, invisible in review.
- **Reading `request.body` in a guard.** Guards run before pipes. That body is unvalidated and untransformed.
- **Business logic in a controller.** Its job is HTTP-to-domain translation. If it has an `if`, ask why the service does not.
- **`HttpException` thrown from a service.** Now the service only works over HTTP. Throw a domain error; map it in a filter.
- **`process.env` sprinkled through the codebase.** A missing variable becomes a runtime 500 instead of a boot failure.
- **`forwardRef` treated as a solution.** It silences the symptom. The cycle is a boundary error.
- **`@Res() res` to send a response manually.** You opted out of interceptors, filters, and serialization for that route, and nothing warns you.
- **`imports: [SomeModule]` in a unit test.** Slow, brittle, no longer a unit test.
- **Global enhancers in `main.ts` only.** They vanish in tests. Use `APP_PIPE` / `APP_GUARD` / `APP_FILTER`.

## 5. Usage

1. Paste this skill into your assistant's context, or install it as a project skill (Claude Code) / rule (Cursor, Copilot).
2. Describe the feature in domain language and name the module it belongs to: "Projects module. Org admins can archive a project. Billing needs to know so it can release the seat."
3. Ask for, in order: (a) the module with an explicit `exports` contract, (b) the DTOs, (c) the guard and any decorator, (d) the service throwing domain errors, (e) the spec with mocked boundary providers.
4. Check the answer against §3.4 — anything reading a body in a guard, or a service importing `@nestjs/common` for an exception, is wrong regardless of whether it passes.
5. Run §4 as a pre-merge checklist. The cheap ones — `whitelist`, `@Type()`, no `HttpException` in services — catch most of it.

The assistant should refuse to generate a `ValidationPipe` without `whitelist` and `forbidNonWhitelisted`, should not reach for `Scope.REQUEST` without naming why the alternatives fail, and should treat any `forwardRef` it emits as a finding to report rather than a solution to ship.

## 6. Example Output

Prompt given with this skill loaded: *"Archive a project. Org admins only. Billing releases the seat."*

```ts
@Controller('orgs/:orgId/projects')
@UseGuards(AuthGuard, OrgRoleGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @Post(':projectId/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('userId') actorId: string,
  ): Promise<ProjectView> {
    return this.projects.archive(orgId, projectId, actorId)
  }
}
```

```ts
@Injectable()
export class ProjectsService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly events: EventEmitter2, // Billing listens; Projects does not import it.
  ) {}

  async archive(orgId: string, projectId: string, actorId: string): Promise<ProjectView> {
    const project = await this.repo.findInOrg(orgId, projectId)
    if (!project) throw new ProjectNotFound(projectId)
    if (project.archivedAt) return toView(project) // idempotent: re-archiving is not an error

    const archived = await this.repo.markArchived(projectId, new Date())
    this.events.emit('project.archived', { orgId, projectId, actorId })
    return toView(archived)
  }
}
```

Note what the output does *not* contain: no `BillingModule` import in `ProjectsModule` — the event breaks what would otherwise be a cycle, which is §3.8 fix #2 chosen over a `forwardRef`. No `NotFoundException` in the service, so the same method works from a queue consumer. No role check inside the handler, because that decision belongs to the guard. And the second archive returns 200 rather than throwing, because a retried request is not a client error.
