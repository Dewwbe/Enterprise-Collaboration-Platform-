# Enterprise Collaboration Platform — Backend (Phase 4 Capstone)

A production-shaped NestJS backend for a multi-tenant collaboration platform
(Notion/ClickUp/Jira-style). Auth, Organizations, Workspaces, Projects,
Tasks, Comments, Attachments, Notifications, and Audit Logs are all
implemented, backed by Redis caching and BullMQ background jobs. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map and design
rationale, [`docs/ER_DIAGRAM.md`](docs/ER_DIAGRAM.md) for the data model,
[`docs/adr/`](docs/adr) for key design decisions, and
[`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) for branching conventions.

## Tech stack

| Concern         | Choice                               |
|------------------|----------------------------------------|
| Framework        | NestJS 10 (TypeScript)                |
| Database         | PostgreSQL + Prisma ORM               |
| Auth             | JWT (access + rotating refresh), password reset |
| Password hashing | bcrypt                                |
| Validation       | class-validator / class-transformer   |
| Queue            | BullMQ (Redis-backed)                 |
| Cache            | Redis                                 |
| Realtime         | WebSocket (Socket.IO gateway)         |
| Docs             | Swagger / OpenAPI (`/docs`)           |
| Testing          | Jest + Supertest                      |
| Containerization | Docker Compose                        |

## Architecture

Clean Architecture / SOLID, module-per-domain. Controllers contain no
business logic — they validate input (DTO + global `ValidationPipe`) and
delegate to services; services own all business rules and talk to Prisma
directly. Full breakdown, the RBAC resolution flow, and the event-driven
notification pipeline are diagrammed in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### AuthN / AuthZ

- **Authentication**: `JwtAuthGuard` is registered globally (`APP_GUARD`), so
  every route requires a valid access token unless explicitly marked
  `@Public()` (used by `register`, `login`, `refresh`, `password-reset/*`).
- **Authorization**: workspace-level RBAC (`OWNER > ADMIN > MEMBER > VIEWER`)
  is enforced by `RolesGuard` + `@Roles(...)` on every controller
  (workspaces, projects, tasks, comments, attachments, organizations). The
  guard resolves the caller's role from whichever route param identifies the
  resource, walking the join chain (`task -> project -> workspace`, etc.) via
  `WorkspaceAccessService` — see
  [`docs/adr/0001-rbac-strategy.md`](docs/adr/0001-rbac-strategy.md) for why.
- **Refresh tokens** are never stored raw — only a bcrypt hash — and rotate
  on every use (the presented token is revoked when a new pair is issued).
  **Password reset tokens** are single-use, hashed, and short-lived.

### Error & response shape

- Every error response is normalized by `GlobalExceptionFilter`:
  `{ success: false, statusCode, path, timestamp, message, error? }`
- Every success response is wrapped by `TransformInterceptor`:
  `{ success: true, statusCode, data }`
- Every mutating route decorated `@AuditLog(...)` is captured by the global
  `AuditLogInterceptor`.

## Getting started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### 1. Environment
```bash
cp .env.example .env
# fill in JWT_ACCESS_SECRET / JWT_REFRESH_SECRET with long random values
```

### 2. Start dependencies (Postgres + Redis)
```bash
docker compose up -d postgres redis
```

### 3. Install & migrate
```bash
npm install
npm run prisma:migrate      # creates tables from prisma/schema.prisma
npm run prisma:seed         # optional: creates demo org/workspace/users
```

### 4. Run the API
```bash
npm run start:dev
```
- API base: `http://localhost:3000/api/v1`
- Swagger:  `http://localhost:3000/docs`

Or run everything (API included) in containers:
```bash
docker compose up --build
```

### 5. Tests
```bash
npm run test          # unit tests
npm run test:cov      # unit tests + coverage report
npm run test:e2e      # e2e (requires DB + Redis reachable, see .env)
```

## Seeded demo accounts
| Email             | Password           | Role in "Demo Organization" |
|-------------------|---------------------|------------------------------|
| owner@ecp.dev     | Str0ngP@ssword!     | OWNER                        |
| member@ecp.dev    | Str0ngP@ssword!     | MEMBER                       |

## API surface

Full request/response schemas are in Swagger at `/docs` once the server is
running. Summary by resource:

**Auth** (`/api/v1/auth`)
- `POST /register` · `POST /login` · `POST /refresh` · `POST /logout`
- `POST /password-reset/request` · `POST /password-reset/confirm`

**Users** (`/api/v1/users`)
- `GET /me` — caller's profile · `GET /me/dashboard` — cached personal dashboard
- `GET /lookup?email=` — find a user to invite · `GET /:id` — profile by id

**Organizations** (`/api/v1/organizations`)
- `POST /` · `GET /` · `GET /:organizationId` · `PATCH /:organizationId` (ADMIN+)
- `POST /:organizationId/archive` (OWNER) · `DELETE /:organizationId` (OWNER)
- `POST /:organizationId/members` (ADMIN+)

**Workspaces** (`/api/v1/workspaces`)
- `POST /` · `GET /` · `GET /:workspaceId` · `GET /:workspaceId/stats` (cached)
- `PATCH /:workspaceId` (ADMIN+) · `POST /:workspaceId/archive` (OWNER) · `DELETE /:workspaceId` (OWNER)
- `POST /:workspaceId/members` (ADMIN+)

**Projects** (`/api/v1/workspaces/:workspaceId/projects`)
- `POST /` (MEMBER+) · `GET /?search=&includeArchived=&page=&limit=` · `GET /:projectId`
- `PATCH /:projectId` (ADMIN+) · `POST /:projectId/archive` (ADMIN+) · `POST /:projectId/restore` (ADMIN+)
- `DELETE /:projectId` (OWNER)

**Tasks** (`/api/v1/projects/:projectId/tasks`)
- `POST /` (MEMBER+) · `GET /?status=&priority=&assigneeId=&sort=&page=&limit=` · `GET /:taskId`
- `PATCH /:taskId` (MEMBER+) — status must follow `TODO -> IN_PROGRESS -> REVIEW -> DONE`
- `DELETE /:taskId` (ADMIN+)

**Comments** (`/api/v1/tasks/:taskId/comments`)
- `POST /` (MEMBER+) · `GET /` · `PATCH /:commentId` (own comment only) · `DELETE /:commentId` (own comment only)

**Attachments** (`/api/v1/tasks/:taskId/attachments`)
- `POST /` (MEMBER+, multipart) — size/MIME validated server-side · `GET /`
- `GET /:attachmentId/download` · `DELETE /:attachmentId` (uploader, or ADMIN+)

**Notifications** (`/api/v1/notifications`)
- `GET /` — paginated, own notifications · `PATCH /:id/read`
- Also pushed live over WebSocket (`NotificationsGateway`) as they're created.

**Health** (`/api/v1/health`)
- `GET /` — unauthenticated liveness/readiness check (Postgres, Redis, process
  memory); `200` when healthy, `503` otherwise. Used by Docker Compose's `api`
  healthcheck.

## Async architecture

Feature services emit domain events (`TaskAssignedEvent`, `TaskCompletedEvent`,
`CommentAddedEvent`, `UserInvitedEvent`) rather than calling the notification
stack directly. `NotificationEventsListener` turns each into a BullMQ job;
`NotificationDeliveryProcessor` persists the `Notification` row, pushes it
over WebSocket, and emails the two types where that matters
(`TASK_ASSIGNED`, `USER_INVITED`). Scheduled BullMQ repeat-cron jobs cover
daily due-date reminders, weekly summaries, and expired-token cleanup, all
retried on failure via BullMQ's backoff. Full sequence diagram:
[`docs/SEQUENCE_DIAGRAM.md`](docs/SEQUENCE_DIAGRAM.md).

## Caching

Redis-backed `CacheService` covers a user's personal dashboard, a user's
profile, and per-workspace stats — each explicitly invalidated by the write
paths that can change them (task/project mutations, membership changes)
rather than relying on TTL alone.

## Security checklist implemented

- [x] Passwords hashed with bcrypt (cost factor 12), never logged or returned
- [x] JWT access tokens short-lived (15m default); refresh tokens rotate and are hashed at rest
- [x] Password reset tokens are single-use, hashed, short-lived
- [x] Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` (rejects unexpected fields)
- [x] `helmet()` security headers, CORS configured
- [x] Global rate limiting via `@nestjs/throttler`
- [x] Generic "invalid email or password" message (no user-enumeration via login)
- [x] Organization/workspace/project/task lookups return 404 (not 403) to non-members, avoiding ID enumeration
- [x] RBAC enforced server-side on every mutating route via `RolesGuard`, never trusted from the client
- [x] File uploads validated by size and MIME type; stored under randomized keys, never the client-supplied filename

## Known gaps

- Attachment storage is local-disk only; the `StorageService` interface exists for a cloud backend but none is implemented yet.
- Soft-delete is partial: `Organization`/`Workspace`/`Project` support archive/restore; `Task`/`Comment`/`Attachment` are hard-deleted.
- No full-text search, project templates, or OpenTelemetry tracing yet (bonus scope, requirement §25).
