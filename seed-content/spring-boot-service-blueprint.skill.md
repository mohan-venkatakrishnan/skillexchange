---
title: Spring Boot Service Blueprint Skill
category: Coding
description: Build a Spring Boot service that is testable, observable, and free of the proxy and lazy-loading traps that cost teams entire sprints. Covers constructor injection, typed configuration records, @Transactional self-invocation, @EntityGraph, DTO projections, a single error contract, and Testcontainers.
usage: Load this skill before asking your AI assistant to create a controller, service, repository, or configuration class in a Spring Boot project. Say "use the Spring Boot blueprint skill" and describe the endpoint; the assistant will produce constructor-injected beans, DTO projections, and integration tests instead of field-injected entity-returning boilerplate.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 24
pocUrl: https://github.com/spring-projects/spring-boot
---

# Spring Boot Service Blueprint Skill

## 1. Philosophy

Spring's power is that it does an enormous amount for you invisibly. Spring's danger is identical. Nearly every Spring bug that eats a full day is the same bug wearing a different hat: **you thought you were calling your object, and you were calling a proxy** — or you thought you had your data, and you had a lazy handle to a closed session.

The mental model that fixes it: **Spring hands you a stunt double.** When a class is annotated `@Transactional` or `@Cacheable` or `@Async`, the bean in the container is not your class. It is a generated subclass wrapping your class. Everything confusing about Spring follows from that one fact — self-invocation silently doing nothing, `final` methods not being advised, `this` not being the bean.

Three rules govern everything below:

1. **Constructor injection only.** Not fashion. A field-injected class cannot be instantiated in a plain unit test, hides that it has eleven dependencies, and cannot be `final`.
2. **Never return an entity from a controller.** An entity is a managed, mutable, lazily-connected database handle. A response body is a flat, immutable, versioned contract. Conflating them gives you `LazyInitializationException` inside the serializer and an unannounced API change on every schema change.
3. **Your test must talk to the real database.** H2 is not Postgres — not the same types, locking, JSON, or upsert. A suite green against H2 and red against production is worse than no suite.

## 2. Tech Stack

- **Spring Boot** — https://github.com/spring-projects/spring-boot — licensed **Apache-2.0**. Auto-configuration, embedded server, Actuator, test slices.
- **Java 21** — records, sealed interfaces, pattern matching, used throughout.
- **Spring Data JPA / Hibernate 6** and **PostgreSQL 15+**.
- **Testcontainers** (MIT) for integration tests against a real database.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Spring Boot maintainers. All example code is original to this skill.

Recommended companions: MapStruct for entity→DTO mapping, Flyway for migrations (never `ddl-auto: update` outside a scratch branch), Micrometer with a Prometheus registry, and `datasource-proxy` in tests to assert query counts.

## 3. Patterns

### 3.1 Constructor injection, `final` fields, no `@Autowired`

Since Spring 4.3 a single-constructor bean needs no annotation at all.

```java
@Service
public class EnrollmentService {

    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final Clock clock;

    // No @Autowired needed. Single constructor = implicit injection.
    public EnrollmentService(CourseRepository courses, EnrollmentRepository enrollments, Clock clock) {
        this.courses = courses;
        this.enrollments = enrollments;
        this.clock = clock;
    }
}
```

What field injection actually costs:

- **Untestable without a container.** `new EnrollmentService(mockA, mockB, clock)` is a plain constructor call. With `@Autowired` fields you need reflection or a full Spring context to build the object at all.
- **Hidden bloat.** Ten `@Autowired` fields look tidy stacked vertically. A ten-argument constructor looks like what it is. That pain is a feature — it is the only thing that makes anyone split the class.
- **No `final`.** Reflection-injected fields cannot be final, so your service is mutable and not safely publishable across threads.
- **Circular dependencies boot successfully.** Constructor injection fails loudly at startup, which is the correct time to find out.

Inject `Clock` rather than calling `Instant.now()`. One bean definition makes every time-dependent test deterministic without mocking statics.

### 3.2 Configuration as typed, validated records

Stop scattering `@Value("${...}")` across the codebase. Bind once, validate at startup, let a typo fail the boot rather than the 3am request.

```java
@ConfigurationProperties(prefix = "billing")
@Validated
public record BillingProperties(
    @NotBlank String apiKey,
    @NotNull URI endpoint,
    @Positive int maxRetries,
    @NotNull @DurationMin(seconds = 1) Duration timeout,
    @Valid Webhook webhook
) {
    public record Webhook(@NotBlank String secret, @Positive int toleranceSeconds) {}

    public BillingProperties {
        if (maxRetries > 10) throw new IllegalArgumentException("billing.max-retries max is 10");
    }
}
```

```yaml
billing:
  api-key: ${BILLING_API_KEY}      # relaxed binding: api-key -> apiKey
  endpoint: https://api.example.test
  max-retries: 3
  timeout: 5s
```

`@Validated` means a missing `BILLING_API_KEY` **fails the context on startup**, with the property path in the message. Without it, `apiKey` is `null`, the app starts green, passes the health check, and every charge 401s. Fail at boot; boot failures get noticed.

### 3.3 Profiles and externalized config, without a `prod` branch

```yaml
# application.yml — shared defaults only
spring:
  jpa:
    open-in-view: false          # see 3.10. Set this on day one.
    hibernate.ddl-auto: validate
management.endpoints.web.exposure.include: health,info,prometheus

---
spring.config.activate.on-profile: prod
spring.datasource.hikari.maximum-pool-size: 20
management.endpoint.health.show-details: never
```

- **Secrets never live in a profile file.** They arrive as environment variables, referenced with `${...}`. A committed `application-prod.yml` with a password is a resume-generating event.
- **`ddl-auto: validate` everywhere except a throwaway local.** `update` adds a column, never drops one, and never tells you what it did. Flyway owns schema; Hibernate verifies it matches.
- **`@Profile("!prod")` on dev conveniences** is fine. `@Profile` on core domain beans is a smell — you now have two applications and test one.

### 3.4 `@Transactional` and the self-invocation trap

This is the bug. Read it twice.

```java
@Service
public class BadEnrollmentService {

    public void enrollAll(List<Long> studentIds) {
        for (Long id : studentIds) {
            enrollOne(id);   // BUG: internal call. The proxy is bypassed entirely.
        }
    }

    @Transactional
    public void enrollOne(Long studentId) { /* ... */ }
}
```

`enrollOne` runs with **no transaction at all**. The advice lives on a proxy wrapping the bean. An external caller hits the proxy — but inside `enrollAll`, `enrollOne(id)` is `this.enrollOne(id)`, a plain call on the raw object. The proxy is not in that path. No error, no warning, no transaction. You find out when a partial failure leaves half-written data that "cannot happen."

The same trap silently disables `@Async`, `@Cacheable`, `@Retryable`, and `@PreAuthorize`. It also means **`private`, `final`, and `static` methods are never advised** — CGLIB works by subclassing, and it cannot override what it cannot see.

The fix is to move the boundary to a different bean, which is better design anyway:

```java
@Service
public class EnrollmentBatch {
    private final EnrollmentService service;   // injected: this IS the proxy

    public EnrollmentBatch(EnrollmentService service) { this.service = service; }

    public BatchResult enrollAll(List<Long> ids) {
        var failures = new ArrayList<Long>();
        for (Long id : ids) {
            try {
                service.enrollOne(id);   // through the proxy: REQUIRES_NEW per student
            } catch (EnrollmentFailed e) {
                failures.add(id);        // one bad student does not roll back the other 499
            }
        }
        return new BatchResult(ids.size() - failures.size(), failures);
    }
}
```

Other semantics that bite:

- **Only unchecked exceptions roll back by default.** A checked exception commits the transaction on its way out. Say `@Transactional(rollbackFor = Exception.class)` if you throw them.
- **Catching an exception inside a transaction does not un-mark it.** Once an inner `REQUIRED` participant marks the transaction rollback-only, the outer commit throws `UnexpectedRollbackException`. Catching and carrying on does not save you.
- **`readOnly = true`** on query paths sets Hibernate's flush mode to MANUAL — a real performance win and a real safety net.
- **Never do network I/O inside a transaction.** A five-second HTTP call is a five-second row lock and a connection held out of a pool of 20.

### 3.5 Lazy loading, `LazyInitializationException`, and `@EntityGraph`

Default fetch types are a trap: `@ManyToOne` and `@OneToOne` are **EAGER** by default. That is the wrong default — loading one entity silently drags its whole ancestry across the wire, forever.

```java
@Entity
public class Enrollment {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)   // override the EAGER default. Always.
    @JoinColumn(name = "course_id")
    private Course course;

    @Enumerated(EnumType.STRING)   // never ORDINAL — reordering the enum rewrites history
    private EnrollmentStatus status;
}
```

Now `enrollment.getCourse().getTitle()` outside a session throws `LazyInitializationException`. That is correct and useful: it says the query did not ask for the data. Fix the query, not the session.

```java
public interface EnrollmentRepository extends JpaRepository<Enrollment, Long> {

    @EntityGraph(attributePaths = {"course", "student"})     // one query, no N+1
    List<Enrollment> findByCourseId(Long courseId);

    @Query("""
        select e from Enrollment e
        join fetch e.course c
        join fetch e.student s
        where c.id = :courseId and e.status = :status
        """)
    List<Enrollment> findActiveByCourse(Long courseId, EnrollmentStatus status);
}
```

The pagination trap: **`join fetch` on a collection plus `Pageable` makes Hibernate paginate in memory.** It fetches every matching row, logs `HHH90003004`, then slices — an OOM waiting for enough data. Two collection `join fetch`es in one query is worse: `MultipleBagFetchException` at startup for `List`s, or a silent cartesian product for `Set`s. Fix: page the ids first, then fetch the graph `where id in (:ids)`.

Do not "fix" the exception by opening the session in the view (3.10) or making the field EAGER. Both trade a loud local error for a diffuse permanent performance problem.

### 3.6 DTO projections: query for the shape you render

The fastest way to load an entity is not to. If a screen shows five columns, select five columns.

```java
public record EnrollmentRow(Long id, String studentName, String courseTitle,
                            EnrollmentStatus status, Instant enrolledAt) {}
```

```java
@Query("""
    select new com.example.app.enrollment.EnrollmentRow(
        e.id, s.name, c.title, e.status, e.enrolledAt)
    from Enrollment e join e.student s join e.course c
    where c.id = :courseId
    order by e.enrolledAt desc
    """)
List<EnrollmentRow> findRowsByCourse(Long courseId, Pageable page);
```

Why this beats "load the entity and map it": a hydrated entity joins the persistence context, which snapshots every field for dirty checking, holds a reference until the transaction closes, and pulls every column including the `TEXT` blob nobody rendered. A read endpoint that never intends to write should never create a managed entity. **Entities for writes, projections for reads.** That one rule removes most JPA performance work before it starts.

### 3.7 One error contract, in one place

```java
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    ProblemDetail onNotFound(EntityNotFoundException e) {
        var pd = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        pd.setTitle("Resource not found");
        pd.setDetail(e.getMessage());
        return pd;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail onValidation(MethodArgumentNotValidException e) {
        var pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setTitle("Validation failed");
        pd.setProperty("errors", e.getBindingResult().getFieldErrors().stream()
            .collect(Collectors.toMap(FieldError::getField, FieldError::getDefaultMessage, (a, b) -> a)));
        return pd;
    }

    @ExceptionHandler(CourseFullException.class)
    ProblemDetail onCourseFull(CourseFullException e) {
        var pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setTitle("Course is full");
        pd.setProperty("courseId", e.courseId());
        return pd;
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail onUnexpected(Exception e) {
        log.error("Unhandled exception", e);   // log the stack trace...
        var pd = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        pd.setTitle("Internal error");         // ...and never ship it to the client
        return pd;
    }
}
```

`ProblemDetail` (RFC 7807) is built into Spring 6 — use it rather than inventing a house error envelope. Controllers throw domain exceptions and know nothing about status codes; the advice is the only file mapping domain failures to HTTP. Never let a raw stack trace reach a client; it is an inventory of your dependencies and versions, gift-wrapped.

### 3.8 Bean Validation at the edge

```java
public record CreateEnrollmentRequest(
    @NotNull Long studentId,
    @Size(max = 500) String note
) {}

@PostMapping
@ResponseStatus(HttpStatus.CREATED)
EnrollmentRow create(@PathVariable Long courseId, @Valid @RequestBody CreateEnrollmentRequest req) {
    return service.enroll(courseId, req.studentId(), req.note());
}
```

`@Valid` on the body is what triggers validation — the annotations do nothing without it, and forgetting it is silent. For `@RequestParam` and `@PathVariable` constraints you need `@Validated` on the class, which throws `ConstraintViolationException` instead of `MethodArgumentNotValidException`. Two exception types for one concept; just know it and map both.

Validation is for input shape, not domain rules. "Is this course full?" needs a database read under a lock and belongs in the service.

### 3.9 Actuator and Micrometer: measure the domain, not just the JVM

```java
public EnrollmentRow enroll(Long courseId, Long studentId, String note) {
    return Timer.builder("enrollments.duration")
        .publishPercentiles(0.5, 0.95, 0.99)
        .tag("course.type", courseType(courseId))   // bounded cardinality only
        .register(meters)
        .record(() -> { enrolled.increment(); return doEnroll(courseId, studentId, note); });
}
```

The tag discipline that matters: **never tag a metric with anything unbounded.** `userId`, `email`, a raw URL path with ids in it — each distinct value creates a new time series. That is a cardinality explosion, and it takes down your Prometheus, not your app. Tag with course *type*, not course id.

Expose `/actuator/health` to the load balancer and nothing else publicly. Use liveness and readiness groups so the orchestrator stops routing to a pod whose pool is exhausted instead of restarting a healthy JVM.

### 3.10 Testcontainers, slice costs, and turning off open-session-in-view

```java
@Testcontainers
@SpringBootTest(webEnvironment = RANDOM_PORT)
@AutoConfigureMockMvc
class EnrollmentApiTest {

    @Container
    @ServiceConnection   // Boot 3.1+: wires the datasource. No @DynamicPropertySource.
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");

    @Autowired MockMvc mvc;
    @Autowired CourseRepository courses;

    @Test
    void rejects_enrollment_when_course_is_full() throws Exception {
        var course = courses.save(Course.withSeats(0));

        mvc.perform(post("/api/courses/{id}/enrollments", course.getId())
                .contentType(APPLICATION_JSON)
                .content("""{"studentId": 1}"""))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.title").value("Course is full"));
    }
}
```

Mark the container `static`. A non-static `@Container` starts a fresh Postgres **per test method** — the difference between a 40-second suite and a 20-minute one.

Choosing a slice, by cost:

- **Plain JUnit + Mockito, no Spring.** Milliseconds. Domain logic belongs here. If a service needs a context to test, it has too many framework dependencies.
- **`@DataJpaTest`.** Repositories and the entity manager only. Fast, but **transactional and rolled back per test** — which hides bugs, because a lazy load that works inside the test's open transaction throws in production.
- **`@WebMvcTest`.** Controllers, the advice, serialization, security filters. The right tool for status codes and JSON shape.
- **`@SpringBootTest`.** The whole context, cached per unique configuration — so every distinct `@MockitoBean` combination spawns another full context. Fifteen slightly-different `@SpringBootTest` classes spend the suite's runtime starting Spring, not testing.

And the one-line fix that matters most:

```yaml
spring.jpa.open-in-view: false
```

Boot defaults this to `true` and logs a warning everyone has learned to ignore. It keeps the Hibernate session open for the whole request, through JSON serialization. It **holds a database connection while you write bytes to a slow client** — so a Hikari pool of 20 is exhausted by 20 concurrent mobile clients, and every other request queues on connection acquisition while the database sits idle. It also **hides N+1s until production**, because Jackson fires queries from inside the serializer. Set it `false` on day one; everything that breaks was already broken.

## 4. Anti-patterns

- **`@Autowired` on fields.** Untestable without reflection, cannot be `final`, hides dependency count, lets circular dependencies boot.
- **Calling a `@Transactional` method from inside the same bean.** The proxy is bypassed. No transaction. No warning. Same for `@Async`, `@Cacheable`, `@Retryable`.
- **Returning entities from controllers.** Lazy proxies explode inside Jackson, bidirectional relations recurse infinitely, every new column is an unannounced API change.
- **`spring.jpa.open-in-view: true`.** The default. Holds a connection for the whole request and hides N+1s until you are in production.
- **`ddl-auto: update` anywhere real.** Adds and never removes, never tells you what it did, cannot be code-reviewed.
- **H2 for tests, Postgres in production.** You are testing a database you do not ship.
- **`@ManyToOne` left at the EAGER default.** Every query drags the object graph.
- **`join fetch` a collection with `Pageable`.** Silently paginates in memory. Works on 100 rows; OOMs on a million.
- **`EnumType.ORDINAL`.** Someone reorders the enum and every historical row now means something else.
- **Network I/O inside `@Transactional`.** A remote timeout becomes a held row lock and an exhausted pool.
- **Returning the exception message to the client.** You just published your internals.
- **High-cardinality metric tags.** `userId` as a tag is a Prometheus outage with your name on it.
- **`@SpringBootTest` for everything.** Each unique mock combination is another full context start.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the endpoint in domain sentences: "Courses have seats and enrollments. A student enrolls only if seats remain and they are not already enrolled. Enrolling decrements seats and publishes an event. The list endpoint shows student name, course title, and status."
3. Ask for, in order: (a) the Flyway migration with the indexes the queries need, (b) entities with every association `LAZY`, (c) the projection record and the repository query that constructs it, (d) the service with a single explicit `@Transactional` boundary, (e) the controller and request record with `@Valid`, (f) the `@RestControllerAdvice` mapping, (g) a Testcontainers test.
4. For every read endpoint, make the assistant state the query count and whether it returns entities or a projection. "Entity" is the wrong answer on a read path.
5. Run section 4 as a pre-merge checklist. Check `open-in-view` is `false` and that no `@Transactional` method is called via `this`.

The assistant should refuse to use field injection, should never return a JPA entity from a controller, and should flag any `@Transactional` method invoked from within its own class.

## 6. Example Output

Prompt given with this skill loaded: *"Add waitlisting. When a course is full, enrolling adds a waitlist entry instead. Return the position in the queue."*

Expected shape of the answer:

```java
public record WaitlistResult(Long entryId, int position, Instant queuedAt) {}
```

```java
public interface WaitlistRepository extends JpaRepository<WaitlistEntry, Long> {
    @Query("""
        select count(w) from WaitlistEntry w
        where w.course.id = :courseId and w.promotedAt is null and w.queuedAt <= :queuedAt
        """)
    int positionOf(Long courseId, Instant queuedAt);
}
```

```java
@Service
public class WaitlistService {

    private final CourseRepository courses;
    private final WaitlistRepository waitlist;
    private final Clock clock;

    public WaitlistService(CourseRepository courses, WaitlistRepository waitlist, Clock clock) {
        this.courses = courses;
        this.waitlist = waitlist;
        this.clock = clock;
    }

    @Transactional
    public WaitlistResult join(Long courseId, Long studentId) {
        // Pessimistic lock: two concurrent joins must not both read the same seat count.
        Course course = courses.findByIdForUpdate(courseId)
            .orElseThrow(() -> new EntityNotFoundException("Course %d".formatted(courseId)));

        if (course.hasSeats()) throw new SeatsAvailableException(courseId);

        var entry = waitlist.save(WaitlistEntry.queued(course, studentId, clock.instant()));
        return new WaitlistResult(entry.getId(),
                                  waitlist.positionOf(courseId, entry.getQueuedAt()),
                                  entry.getQueuedAt());
    }
}
```

Note what the output does *not* contain: no `@Autowired` field, no entity crossing the controller boundary, no `Instant.now()` a test cannot control, no seat check outside a lock (the race that double-books the last seat), and a count query that never hydrates a single waitlist entity. The transaction ends before anything talks to the network.
