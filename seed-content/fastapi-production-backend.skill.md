---
title: Production FastAPI Backend Skill
category: Coding
description: Structure a FastAPI service that survives contact with production — not a 300-line main.py. Covers layered project layout, Pydantic v2 schemas as contracts, dependency injection, async SQLAlchemy without connection leaks, JWT auth, and a lean Docker deploy.
usage: Load this skill before asking your AI assistant to scaffold or extend a FastAPI service. Describe your resources and auth requirements; the assistant will generate the layered layout, typed schemas, and async session handling from this skill instead of tutorial-grade single-file apps.
platforms: [Claude, ChatGPT, Cursor, Gemini]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/fastapi/fastapi
---

# Production FastAPI Backend Skill

## 1. Philosophy

FastAPI's demo ergonomics are a trap: because everything *can* live in one file with globals, most codebases start that way and calcify. This skill's stance:

1. **Routers are translators, not workers.** A route function parses input, calls a service, shapes output. If a route contains a `for` loop over ORM objects or a business rule, the layering has already failed.
2. **Schemas are the contract; models are the storage.** Pydantic models define what the API accepts and returns. SQLAlchemy models define what the database stores. They are never the same class, even when the fields match today — because they won't match in six months, and the day they diverge is the day you're glad they were separate.
3. **Dependencies are the composition root.** `Depends()` is where sessions, settings, and the current user come from. Nothing reaches for a global; everything is injected, which is also why everything is testable with `dependency_overrides`.
4. **Async is a contract you keep everywhere or nowhere on a path.** One synchronous database call inside an `async def` route blocks the entire event loop for every concurrent request. Async SQLAlchemy, async HTTP clients, or move the work to a threadpool — pick per path, never mix silently.
5. **The app must boot with zero config surprises.** Settings validate at import time via `pydantic-settings`. A missing env var should kill the container at startup, not throw at first request during peak traffic.

## 2. Tech Stack

- **FastAPI** — https://github.com/fastapi/fastapi — licensed **MIT**. ASGI web framework with type-driven validation and OpenAPI generation.
- **Pydantic v2** (MIT) — schema validation and settings.
- **SQLAlchemy 2.x** (MIT) — async ORM with the 2.0-style `select()` API.
- **Alembic** (MIT) — migrations. **Uvicorn** (BSD-3-Clause) — ASGI server.

This skill is an independent, original guide; it is not affiliated with or endorsed by the FastAPI maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Layout: package by feature, layer within

```
app/
├── main.py              # app factory, lifespan, router mounting only
├── core/
│   ├── config.py        # pydantic-settings Settings
│   ├── db.py            # engine, sessionmaker, get_db dependency
│   └── security.py      # password hashing, JWT encode/decode
├── users/
│   ├── router.py        # HTTP layer
│   ├── schemas.py       # Pydantic (UserCreate, UserOut, ...)
│   ├── models.py        # SQLAlchemy
│   └── service.py       # business logic; the only layer that touches models
├── projects/
│   └── ... same shape ...
└── tests/
```

Feature folders scale horizontally; a `models.py`/`routes.py`/`schemas.py` split at the top level turns every feature change into a four-file scavenger hunt.

### 3.2 Settings that fail fast

```python
# app/core/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="forbid")

    database_url: str                      # no default: missing == crash at boot
    jwt_secret: str
    jwt_ttl_minutes: int = 30
    environment: str = "dev"

    @property
    def is_prod(self) -> bool:
        return self.environment == "prod"

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`extra="forbid"` catches typo'd env vars (`DATABSE_URL`) instead of silently ignoring them.

### 3.3 Async database plumbing — the part everyone leaks

```python
# app/core/db.py
from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import get_settings

engine = create_async_engine(
    get_settings().database_url,          # postgresql+asyncpg://...
    pool_size=10, max_overflow=5, pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()        # commit-per-request; routes never commit
        except Exception:
            await session.rollback()
            raise
```

Decisions encoded here: `expire_on_commit=False` (otherwise every attribute access after commit re-queries — or explodes, since the request is over), `pool_pre_ping=True` (survives database restarts), and commit/rollback owned by the dependency so services stay transaction-agnostic.

### 3.4 Schemas in, schemas out

```python
# app/users/schemas.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # build straight from ORM objects
    id: int
    email: EmailStr
    display_name: str
    created_at: datetime
    # note: no password_hash — output schemas are allowlists, which is the point
```

Every route declares `response_model` (or a return annotation), so even if a service accidentally returns an ORM object with secrets on it, FastAPI serializes only the declared fields.

### 3.5 Service layer + router

```python
# app/users/service.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password
from app.users import models, schemas

class EmailTakenError(Exception): ...

async def create_user(db: AsyncSession, data: schemas.UserCreate) -> models.User:
    exists = await db.scalar(select(models.User.id).where(models.User.email == data.email))
    if exists:
        raise EmailTakenError
    user = models.User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    await db.flush()      # get the id; the dependency commits
    return user
```

```python
# app/users/router.py
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.users import schemas, service

router = APIRouter(prefix="/users", tags=["users"])
DB = Annotated[AsyncSession, Depends(get_db)]

@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: schemas.UserCreate, db: DB):
    try:
        return await service.create_user(db, data)
    except service.EmailTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
```

Services raise domain exceptions; routers translate them to HTTP. Services never import `fastapi`.

### 3.6 Auth: one dependency to rule the routes

```python
# app/core/security.py (excerpt)
from datetime import datetime, timedelta, timezone
from typing import Annotated
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import get_settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def make_token(user_id: int) -> str:
    s = get_settings()
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=s.jwt_ttl_minutes),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")

async def get_current_user_id(token: Annotated[str, Depends(oauth2_scheme)]) -> int:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})

CurrentUserId = Annotated[int, Depends(get_current_user_id)]
```

Protected routes just take `user_id: CurrentUserId`. Password hashing: argon2 or bcrypt via a maintained library — never roll your own, never store reversible anything.

### 3.7 Lifespan + Docker

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.db import engine
from app.users.router import router as users_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()   # drain the pool on shutdown

app = FastAPI(lifespan=lifespan, title="API")
app.include_router(users_router)

@app.get("/healthz", include_in_schema=False)
async def healthz():
    return {"ok": True}
```

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY app/ app/
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

One worker per container; scale by adding containers, not by tuning `--workers` (your orchestrator is better at this than uvicorn is). Migrations run as a separate job/step (`alembic upgrade head`), never in the app's startup path — two containers racing the same migration is a lock party.

## 4. Anti-patterns

- **Sync work inside `async def`.** `requests.get()` or sync SQLAlchemy in an async route blocks the event loop for *all* requests. Use `httpx.AsyncClient` / async sessions, or declare the route plain `def` so FastAPI threadpools it.
- **Returning ORM models without a `response_model`.** Today it leaks `password_hash`; tomorrow it leaks whatever column got added on Friday. Output schemas are allowlists.
- **One shared schema for create/update/output.** `UserCreate` requires a password; `UserOut` must never contain one; `UserUpdate` makes everything optional. Three shapes, three classes.
- **Committing inside services.** Kills composability — two service calls that should be one transaction become two. The `get_db` dependency owns the transaction.
- **Module-level engine created from raw `os.environ`.** Bypasses settings validation and makes tests import production config. Settings → engine, and `lru_cache` the settings.
- **`except Exception: raise HTTPException(500)`.** FastAPI already returns 500 on unhandled exceptions, *with* a traceback in your logs. The blanket catch just deletes the traceback.
- **Business logic keyed off `Request` objects deep in services.** Services take typed arguments. If a service needs a header value, the router extracts and passes it.
- **N+1 via lazy loading in async.** Lazy loads don't even work under asyncio (MissingGreenlet). Load relationships explicitly: `select(User).options(selectinload(User.projects))`.
- **Startup-time table creation (`Base.metadata.create_all`) in production.** That's what Alembic is for; `create_all` can't handle any schema *change*.

## 5. Usage

1. Load this skill into your assistant (project skill / rules file / pasted context).
2. Name your resources and their relationships, plus auth needs: "projects and tasks; users own projects; JWT auth; Postgres."
3. Ask for artifacts in this order: settings + db core → models + Alembic migration → schemas → service → router → tests with `dependency_overrides`. Reviewing layer by layer beats reviewing a 900-line dump.
4. Hold the line on the contracts: any generated route that touches the ORM directly, or any `async def` calling sync IO, gets sent back with a pointer to sections 3.5 and 4.
5. For an existing codebase, ask the assistant to audit against section 4 and produce a migration plan ordered by risk (event-loop blocking first, schema leaks second, layering last).

## 6. Example Output

Prompt with this skill loaded: *"Add an endpoint listing the current user's projects, newest first, paginated."*

```python
# app/projects/schemas.py (additions)
class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime

class Page(BaseModel):
    items: list[ProjectOut]
    total: int
    limit: int
    offset: int
```

```python
# app/projects/service.py (addition)
async def list_for_owner(
    db: AsyncSession, owner_id: int, *, limit: int, offset: int
) -> tuple[list[models.Project], int]:
    base = select(models.Project).where(models.Project.owner_id == owner_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = await db.scalars(
        base.order_by(models.Project.created_at.desc()).limit(limit).offset(offset)
    )
    return list(rows), total or 0
```

```python
# app/projects/router.py (addition)
@router.get("", response_model=schemas.Page)
async def my_projects(
    db: DB,
    user_id: CurrentUserId,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = await service.list_for_owner(db, user_id, limit=limit, offset=offset)
    return schemas.Page(items=items, total=total, limit=limit, offset=offset)
```

Markers of skill-compliant output: ownership filtered in the service by the injected `user_id` (not a query param a client could spoof), bounded pagination validated at the edge, a typed page envelope instead of a bare list, and the router doing nothing but translation.
