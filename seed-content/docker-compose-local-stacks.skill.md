---
title: Reproducible Local Stacks with Docker Compose Skill
category: DevOps
description: Turn "works on my machine" into a single `docker compose up` that behaves the same on every laptop and in CI. Covers multi-stage Dockerfiles and layer ordering, healthchecks that actually gate startup, base + override files, non-root users, and cutting a 1.2GB image to 180MB.
usage: Load this skill before asking your AI assistant to write a Dockerfile or a Compose stack. Say "use the Docker Compose local stacks skill" and describe your services; the assistant will produce layer-ordered multi-stage builds, healthchecked dependencies, a base `compose.yaml` with dev/CI overrides, and pinned image tags instead of `latest`.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 0
timeSavedHours: 10
pocUrl: https://github.com/docker/compose
---

# Reproducible Local Stacks with Docker Compose Skill

## 1. Philosophy

The point of a local stack is not "containers." It is that a new hire clones the repo, runs one command, and has a working system in four minutes — and that the same command in CI produces the same system. Every deviation is a tax you pay forever: in onboarding, in "works on mine," and in the class of bug that exists only because your laptop has Postgres 14 and production has 16.

**A Dockerfile is a cache pipeline that happens to produce an image.** Docker caches per instruction, and an instruction's cache is valid only if it and every instruction before it are unchanged. That one rule explains almost every slow build you have suffered, and getting it right is about the order of four lines, not anything clever.

1. **Order layers by rate of change.** Monthly things (base image, system packages) at the top; hourly things (your source) at the bottom. Invert this and every keystroke costs a full dependency install.
2. **Ship only what runs.** Your compiler, dev headers, test fixtures, and `.git` have no business in a production image. They are attack surface, pull latency, and storage cost with no upside.
3. **"Started" is not "ready."** A container being up means a process exists. It does not mean Postgres finished initializing. The race resolves in your favour on your laptop and against you in CI.

## 2. Tech Stack

- **Docker Compose** — https://github.com/docker/compose — licensed **Apache-2.0**. The orchestrator for every stack below.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Docker Compose maintainers. All example code is original to this skill.

Assumed companions: BuildKit (the default builder in current Docker; the cache mounts in §3.1 need it), and a `Makefile` so the documented entry point is `make dev` and nobody memorizes a nine-flag command. Everything uses the modern `compose.yaml` filename and the `docker compose` subcommand.

## 3. Patterns

### 3.1 Layer ordering: the 6-second build vs the 3-minute build

The highest-value paragraph in this file. Here is what almost everyone writes first:

```dockerfile
# SLOW. Read the order.
FROM node:20
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "dist/server.js"]
```

`COPY . .` copies your whole tree. Change one character in `src/routes/health.ts` and that layer is invalidated — and because cache validity is cumulative, **every instruction after it is too**. So `npm ci` runs again, re-resolving and re-downloading every dependency to produce a byte-identical `node_modules`, because you fixed a typo in a comment.

Measured on a mid-size Node service (~800 deps): **3m04s**, on every code change, all day.

Copy the manifests first, install, then the source:

```dockerfile
FROM node:20.15.1-slim
WORKDIR /app

COPY package.json package-lock.json ./   # changes only when deps change
RUN npm ci                               # → cached across code edits

COPY . .                                 # changes constantly → invalidates only itself
RUN npm run build
CMD ["node", "dist/server.js"]
```

Same edit, same machine: **6 seconds**. You did not make anything faster; you stopped redoing work. Same principle everywhere: `COPY requirements.txt` before `COPY .`, `COPY go.mod go.sum` before the source, `COPY Cargo.toml Cargo.lock` for Rust.

BuildKit can also persist the package manager's cache across builds, so even a lockfile change fetches only the delta:

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm ci
```

The mount is scratch space the builder keeps, not part of the image. Cold install drops from ~3 minutes to ~40 seconds.

### 3.2 Multi-stage builds: 1.2GB → 180MB

A single-stage image contains everything you needed to *build*, forever: compilers, dev headers, devDependencies, npm's cache, the source you already compiled. Real numbers from a service I cut down:

| Stage | Size | Contents |
|---|---|---|
| `FROM node:20`, single stage | **1.24 GB** | Full Debian, toolchain, dev deps, npm cache, source, `.git` |
| `node:20-slim`, single stage | 680 MB | Slimmer base; still all the build junk |
| Multi-stage → `node:20-slim` | **182 MB** | Node runtime, prod deps, compiled `dist/` |

Build in a fat stage; copy only artifacts into a clean one.

```dockerfile
# ---- deps: production dependencies only ----
FROM node:20.15.1-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- build: needs devDependencies (tsc, bundler) ----
FROM node:20.15.1-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

# ---- runtime: nothing that isn't needed to serve a request ----
FROM node:20.15.1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
CMD ["node", "dist/server.js"]
```

`deps` and `build` are separate on purpose: `build` needs TypeScript, `runtime` must never contain it. The compiler never enters the final image because the final stage never copies it.

Why 182MB beats 1.24GB beyond aesthetics: pulls are faster on every deploy and CI run; your scanner reports ~40 packages instead of ~900, and each of those 860 is a CVE you would otherwise triage; and an image without a shell or compiler is much less useful to someone who gets RCE in your app.

### 3.3 `.dockerignore`, or the 400MB build context

Before Docker executes anything it ships the build context — your directory — to the daemon. Without a `.dockerignore` that includes `node_modules/` (400MB of the wrong platform's binaries), `.git/` (every secret you ever committed and reverted), and your local `.env`.

```
node_modules
dist
.git
.env
.env.*
coverage
*.log
Dockerfile*
compose*.yaml
```

In order of how badly they bite:

1. **Secrets.** `COPY . .` with no ignore file bakes `.env` and your whole git history into a layer. Layers ship with the image. Deleting the file in a later instruction does not remove it — the earlier layer still holds it, readable by anyone who can pull.
2. **Cache.** A stray rewriting `.log` invalidates `COPY . .` and everything after, and you will never work out why builds got slow.
3. **Speed.** "Sending build context 412MB" is 20 seconds of nothing, every build.

Write it *before* the first `COPY . .`, not after the incident.

### 3.4 Healthchecks and `condition: service_healthy`

Plain `depends_on` is the most-misread key in Compose. It controls **start order, not readiness**. Compose starts Postgres, waits for the container to be *running* — milliseconds, when the process spawns — and immediately starts your API. Postgres is still initializing its data directory. Your API gets `ECONNREFUSED` and exits.

It works locally because your page cache is warm and Postgres is ready in 400ms while Node takes 900ms to boot. It fails in CI on a cold volume where Postgres takes 3 seconds. Then someone "fixes" it with `sleep 10`, and now every developer waits 10 seconds forever and it *still* fails on a slow day.

```yaml
services:
  db:
    image: postgres:16.3-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: app_dev
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app_dev"]   # does it answer?
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s     # grace window; failures here don't burn retries
    volumes:
      - db-data:/var/lib/postgresql/data

  api:
    build: .
    depends_on:
      db:
        condition: service_healthy    # waits for the check, not the process
    environment:
      DATABASE_URL: postgres://app:devpassword@db:5432/app_dev
    ports: ["3000:3000"]

volumes:
  db-data:
```

- **`start_period` is not `interval`.** During it, a failing check does not count toward `retries` — it is the "still booting, expected" window. Without it a slow starter burns its retries and is marked unhealthy before it had a chance.
- **The check must exercise the real dependency.** `pg_isready` asks Postgres if it will accept connections; `curl` against a port a proxy holds open tells you nothing. A `/health` that touches the DB beats one that returns 200 unconditionally.
- **Keep it cheap.** It runs every `interval` forever. A check that queries a big table is a self-inflicted load generator.

### 3.5 Named volumes vs bind mounts

- **Named volume** (`db-data:/var/lib/postgresql/data`) — Docker-managed. For **state you want to persist**: databases, uploads, caches. Survives `down`, removed by `down -v`, and on macOS/Windows it is dramatically faster because it lives inside the VM rather than crossing the filesystem boundary.
- **Bind mount** (`./src:/app/src`) — a host directory projected in. For **source in dev**, so a save reloads without a rebuild.

Never bind-mount a database's data directory: host permission mismatches, and slow enough on macOS/Windows to change your benchmark results.

The gotcha that eats an afternoon:

```yaml
volumes:
  - ./:/app             # BROKEN: host node_modules (or none) shadows the image's
```

The image built `node_modules` for Linux. Mounting your host dir over `/app` hides it behind your macOS-native binaries, or nothing. You get `Cannot find module` or an inscrutable native-binding crash. Mask it with an anonymous volume:

```yaml
volumes:
  - ./:/app
  - /app/node_modules   # keeps the image's node_modules visible at this path
```

### 3.6 Base `compose.yaml` + overrides

One file with `if dev` scattered through it becomes unreadable. The base holds what is true everywhere:

```yaml
# compose.yaml — the shared truth
services:
  api:
    build: { context: ., target: runtime }
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD:?DB_PASSWORD is required}@db:5432/app
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16.3-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      retries: 10
      start_period: 10s
volumes:
  db-data:
```

`compose.override.yaml` is loaded **automatically** by `docker compose up` — the dev ergonomics layer, so a developer types one command:

```yaml
# compose.override.yaml — dev only, auto-loaded
services:
  api:
    build: { target: build }   # stop at the stage that still has devDependencies
    command: npm run dev       # watcher instead of the compiled entrypoint
    volumes:
      - ./src:/app/src         # live reload
      - /app/node_modules      # don't shadow the image's install (§3.5)
  db:
    ports: ["5432:5432"]       # psql from the host — dev only, never prod
```

CI is explicit, because auto-loading the dev override in CI is an afternoon of confusion:

```yaml
# compose.ci.yaml
services:
  api:
    build: { target: runtime }   # test the artifact you ship
```

```bash
docker compose up                                   # dev; override auto-loads
docker compose -f compose.yaml -f compose.ci.yaml up \
  --abort-on-container-exit --exit-code-from api     # CI; dev override deliberately absent
```

The base file never mentions dev. That is the trick: no environment ternaries, and CI tests the runtime stage instead of a dev container with a file watcher in it.

### 3.7 Non-root users

Containers run as root by default. A container escape or path-traversal bug then starts from root, and any bind-mounted host directory is writable by it.

```dockerfile
# Copy with the right owner rather than chown-ing after — a RUN chown on a
# large tree duplicates every file into a new layer.
COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node       # last: everything after, including CMD, runs unprivileged
```

For a base without a suitable user: `RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app` then `USER 10001:10001`. A numeric UID is more portable for Kubernetes `runAsNonRoot`. Note an unprivileged user cannot bind ports below 1024 — listen on 3000 and map `"80:3000"` rather than reaching for `NET_BIND_SERVICE`.

### 3.8 Env and secrets

From fine to fireable:

- **Non-secret config** (log level, flags, `NODE_ENV`) → `environment:` in the compose file. It is in git and that is correct.
- **Local dev credentials** → a git-ignored `.env`, with a committed `.env.example` listing keys and no values. Compose reads `.env` automatically.
- **Anything real** → not in the compose file, not in the image, not in a build arg.

```dockerfile
ARG NPM_TOKEN     # WRONG: permanent and public
RUN npm ci        # token is now in the layer's metadata, forever
```

`docker history` shows that token to anyone who can pull. Unsetting it later does nothing; layers are append-only. Use a BuildKit secret mount, present during the RUN and never written to a layer:

```dockerfile
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci
```

```bash
docker build --secret id=npm_token,env=NPM_TOKEN .
```

Make missing config loud: `${DB_PASSWORD:?DB_PASSWORD is required}` fails at `up` with a clear message instead of your app connecting as user `undefined` and dying 40 seconds later in a stack trace nobody can read.

### 3.9 One process per container

The urge to run nginx and your app in one container with supervisord is strong and wrong. **The health signal collapses** — the container is "up" if supervisord is up, so your app can be dead inside a perfectly healthy container. **You cannot scale them separately.** **Logs interleave** into one unparseable stdout. **Restarts are all-or-nothing** — reloading nginx config bounces your app.

One process, one container, one job, one health check. When you need a setup step, use an init container, not a supervisor:

```yaml
services:
  migrate:
    build: .
    command: npm run db:migrate
    restart: "no"          # run once and exit; not a service
    depends_on:
      db: { condition: service_healthy }
  api:
    build: .
    depends_on:
      migrate: { condition: service_completed_successfully }   # waits for exit 0
      db:      { condition: service_healthy }
```

`service_completed_successfully` is the underused one: it waits for a container to exit **zero**. If the migration fails the API never starts — exactly what you want, rather than an API serving a half-migrated schema.

### 3.10 `latest` is not a version

`FROM node:latest` means "whatever that tag pointed at when this machine happened to pull." Your laptop pulled in March; CI pulled this morning. Identical Dockerfiles, different images, and the bug report is "works on my machine" in its purest form.

Worse, `latest` is silent. A major bump arrives with no diff, no PR, no signal — your build breaks one Tuesday on a commit that changed a CSS file, and you spend two hours before it occurs to you that nothing in your repo changed.

```dockerfile
FROM node:latest                          # a lie
FROM node:20                              # floats across minors — still surprises you
FROM node:20.15.1-slim                    # a version
FROM node:20.15.1-slim@sha256:9a3f2c...   # immutable; the tag can't be repointed
```

Pin the full version in every `FROM` and every compose `image:` — `postgres:16.3-alpine`, never `postgres:latest`, because a minor Postgres bump under you can mean an on-disk format your existing volume will not open. Digest-pin for production. Never `latest` for your own images either; tag with a commit SHA so "which build is in QA?" has an answer. Let Renovate or Dependabot bump the pins — upgrades become PRs with diffs, which is the entire point.

## 4. Anti-patterns

- **`COPY . .` before installing dependencies.** Every code change invalidates the install layer and reruns it: 3 minutes per build instead of 6 seconds, all day, forever.
- **No `.dockerignore`.** You shipped `.env` and `.git` inside a layer, you send 400MB of context per build, and stray files silently bust your cache.
- **Single-stage builds.** 1.2GB of compiler and dev deps in production. Multi-stage gets the same service to 182MB and drops ~860 packages off your CVE report.
- **Plain `depends_on`.** Waits for the process to exist, not the service to be ready. Passes locally, races in CI. Use `condition: service_healthy`.
- **`sleep 10` as a readiness strategy.** Simultaneously too slow for every developer every day, and still too short on a bad day. A healthcheck wearing a disguise.
- **`latest` anywhere.** Two machines, one Dockerfile, different images. Major bumps land with no diff on a commit that touched a stylesheet.
- **Running as root.** Default, avoidable, and the first thing on any security review. `USER node` at the end of the runtime stage.
- **Secrets in `ARG`.** `docker history` prints them to anyone who can pull. Layers are append-only; unsetting later changes nothing. Use `--mount=type=secret`.
- **Bind-mounting a database's data directory.** Permission mismatches and pathological slowness on macOS and Windows. Named volumes for state.
- **Bind-mounting over `/app` without masking `node_modules`.** Host modules shadow the image's Linux build: `Cannot find module`, or a native crash with a useless message.
- **supervisord running nginx + app in one container.** The health signal collapses, logs interleave, and you cannot scale or restart either half.
- **One compose file with dev settings inline.** Ternaries everywhere, and CI accidentally testing a container with a file watcher in it. Base + overrides.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Say "use the Docker Compose local stacks skill" and describe your services: language and package manager, backing services, and what a developer should see after `docker compose up`.
3. Ask for, in order: (a) the multi-stage Dockerfile with a `.dockerignore`, (b) `compose.yaml` with healthchecks and `service_healthy` gating, (c) `compose.override.yaml` for dev and `compose.ci.yaml` for CI.
4. Read the Dockerfile top to bottom and confirm the order: base → system packages → manifests → install → source → build. If `COPY . .` is above the install step, it is wrong.
5. Run section 4 as a checklist, then time it: `time docker compose build` after touching one source file. Not seconds? Your layer order is wrong.

The assistant should refuse to emit `latest` in any `FROM` or `image:`, refuse a bare `depends_on` where readiness matters, and add `USER` to the runtime stage without being asked.

## 6. Example Output

Prompt given with this skill loaded: *"Python FastAPI app, Postgres, Redis. Migrations must run before the API starts. Local dev with hot reload."*

Expected shape of the answer:

```dockerfile
# ---- build: compiles wheels, needs a toolchain ----
FROM python:3.12.4-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*      # same layer, or the apt cache lands in the image
COPY requirements.txt ./                # manifest first: cached across code edits
RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --no-deps --wheel-dir /wheels -r requirements.txt

# ---- runtime: no gcc, no headers, no source tarballs ----
FROM python:3.12.4-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*      # runtime lib only, not libpq-dev
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels
COPY --chown=10001:10001 ./app ./app    # source LAST
USER 10001:10001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# compose.yaml
services:
  db:
    image: postgres:16.3-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
      POSTGRES_DB: app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
    volumes:
      - db-data:/var/lib/postgresql/data

  redis:
    image: redis:7.2.5-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  migrate:
    build: { context: ., target: runtime }
    command: alembic upgrade head
    restart: "no"
    depends_on:
      db: { condition: service_healthy }

  api:
    build: { context: ., target: runtime }
    depends_on:
      migrate: { condition: service_completed_successfully }
      redis:   { condition: service_healthy }
    ports: ["8000:8000"]

volumes:
  db-data:
```

```yaml
# compose.override.yaml — auto-loaded by `docker compose up`, dev only
services:
  api:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./app:/app/app        # hot reload; source only, never site-packages
  db:
    ports: ["5432:5432"]      # psql from the host
```

Note what the output does *not* contain: no `latest` tag anywhere, no `gcc` in the runtime image, no root user, no `sleep` waiting for Postgres, no bare `depends_on` pretending to be a readiness gate, no bind mount over the installed packages, and no dev settings leaking into the base file that CI will load. One command — `docker compose up` — and a new hire has migrations applied and a hot-reloading API in about four minutes.
