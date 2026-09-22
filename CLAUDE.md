# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Turborepo + npm workspaces monorepo: a NestJS backend (`apps/api`), a React/Vite
frontend (`apps/web`), and a shared types package (`packages/shared-types`) used
by both. `apps/api` implements the full feature set (Auth, Organizations,
Workspaces, Projects, Tasks, Comments, Attachments, Notifications, Audit Logs,
Redis caching, BullMQ background jobs); `apps/web` is a thin client
(login/register/dashboard) against it.

```
apps/
  api/                 # NestJS backend — see apps/api/README.md, apps/api/docs/ARCHITECTURE.md
  web/                 # React + Vite frontend
packages/
  shared-types/         # TypeScript contracts (@ecp/shared-types) shared between api and web
```

`npm install` only ever runs at the repo root — never inside `apps/*` — since
this is an npm workspaces monorepo.

## Commands

All commands below run from the repo root via Turborepo unless noted.

```bash
npm install                  # once, root only

# Infra
docker compose up -d postgres redis     # Postgres on :5433, Redis on :6379
docker compose up --build               # whole stack (infra + api + web) in containers

# Database (apps/api)
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed          # optional demo org/workspace/users, see apps/api/README.md

# Dev servers
npm run dev                  # both apps together, correct dependency order
npm run dev:api              # apps/api only — http://localhost:3000/api/v1, Swagger at /docs
npm run dev:web              # apps/web only — http://localhost:5173

# Quality gates (fan out to every workspace via turbo)
npm run lint
npm run test
npm run test:cov
npm run test:e2e             # apps/api only; requires Postgres + Redis reachable
```

Single test / one workspace at a time (apps/api uses Jest, apps/web has no unit
tests yet):
```bash
cd apps/api
npm test -- tasks.service.spec.ts        # single file
npm test -- -t "should throw on invalid status transition"   # single test name
npm run test:e2e                          # e2e suite (test/jest-e2e.json config)
```

Prisma-specific (from `apps/api`): `npm run prisma:studio`, `npm run prisma:deploy`
(applies migrations without prompting, used in prod/CI), `npm run prisma:seed`.

## Adding a shared type

Edit `packages/shared-types/src/index.ts`, export the interface/enum, import as
`@ecp/shared-types` from either app — no build step needed in dev (both Vite and
ts-node resolve it as TS source via the workspace link). `class-validator`
decorators can't live here (would pull Nest into the frontend bundle), so the
NestJS DTOs in `apps/api` remain the actual request-validation layer;
`shared-types` exists purely so `apps/web` never hand-guesses a field name or
enum value the backend actually uses.

## Backend architecture (apps/api)

Clean Architecture, module-per-domain, one folder per feature under `src/`
(`auth`, `users`, `organizations`, `workspaces`, `projects`, `tasks`,
`comments`, `attachments`, `notifications`, `storage`, `queue`, `email`,
`redis`, `prisma`, `common`, `config`). **Controllers hold no business logic**
— they validate input (DTO + global `ValidationPipe`, `whitelist` +
`forbidNonWhitelisted`) and delegate to a service; services own all business
rules and talk to Prisma directly.

### AuthN / AuthZ

- `JwtAuthGuard` is registered globally (`APP_GUARD` in `app.module.ts`) — every
  route requires a valid access token unless marked `@Public()` (register,
  login, refresh, password-reset/*).
- Workspace-level RBAC (`OWNER > ADMIN > MEMBER > VIEWER`) is enforced by
  `RolesGuard` + `@Roles(...)` on every controller that needs a minimum role.
  The guard resolves the caller's role from whichever route param identifies
  the resource, walking the join chain (`task -> project -> workspace`, etc.)
  via `WorkspaceAccessService` (`src/common/access/workspace-access.service.ts`)
  — the single source of truth for membership resolution. Rationale in
  `apps/api/docs/adr/0001-rbac-strategy.md`.
- Endpoints that only need *membership* (not a minimum role) — most `GET`s,
  "edit/delete your own comment" — skip `@Roles` and call
  `WorkspaceAccessService` directly in the service layer instead. Mixed rules
  that aren't a single minimum role (e.g. attachment delete: uploader OR
  ADMIN+) stay as explicit service-layer checks by design.
- Non-members get 404, not 403, on organization/workspace/project/task lookups
  — never leak resource existence via status code.
- Refresh tokens are hashed at rest and rotate on every use (old token revoked
  when a new pair is issued); password reset tokens are single-use, hashed,
  short-lived.

### Cross-cutting request pipeline

- Provider registration order in `app.module.ts` matters: `ThrottlerGuard`
  before `JwtAuthGuard` (so unauthenticated clients still get rate-limited),
  and `AuditLogInterceptor` registered after `TransformInterceptor` (so it
  sees the raw handler return value before it's wrapped).
- Errors are normalized by `GlobalExceptionFilter`:
  `{ success: false, statusCode, path, timestamp, message, error? }`.
- Success responses are wrapped by `TransformInterceptor`:
  `{ success: true, statusCode, data }`.
- Mutating routes decorated `@AuditLog(...)` are captured by the global
  `AuditLogInterceptor`, writing `{ userId, action, entityType, entityId,
  previousValue, newValue }` to `AuditLog`.

### Event-driven notifications

Feature services never call the notification stack directly — they emit a
domain event (`TaskAssignedEvent`, `TaskCompletedEvent`, `CommentAddedEvent`,
`UserInvitedEvent` from `src/common/events`) via `EventEmitter2` and move on.
`NotificationEventsListener` turns each event into a BullMQ job on the
`notification-delivery` queue; `NotificationDeliveryProcessor` is the single
place that persists the `Notification` row, pushes it over WebSocket
(`NotificationsGateway`), and — only for `TASK_ASSIGNED` / `USER_INVITED`, to
avoid spamming email on every comment — sends an email via `EmailService`.
Scheduled BullMQ repeat-cron jobs (`DAILY_REMINDER_CRON`, `WEEKLY_SUMMARY_CRON`
env vars) drive daily due-date reminders, weekly summaries, and expired-token
cleanup; failures retry via BullMQ's built-in backoff. Full diagram in
`apps/api/docs/SEQUENCE_DIAGRAM.md` and `apps/api/docs/ARCHITECTURE.md`.

### Caching

Redis-backed `CacheService` (`src/redis`) wraps three read paths: a user's
personal dashboard, a user's profile, and per-workspace stats. Each write path
that can invalidate one of these (task/project mutations, membership changes)
explicitly calls `cache.del(...)` — no blanket TTL-only strategy, since a stale
task-assignment count is a worse bug than an occasional cache miss.

### Task status workflow

Tasks move strictly `TODO -> IN_PROGRESS -> REVIEW -> DONE`; `PATCH
/tasks/:taskId` rejects out-of-order transitions.

## Frontend (apps/web)

Minimal React + Vite + react-router client: `AuthContext` holds the JWT pair
and current user, `ProtectedRoute` gates authenticated pages, `src/api/client.ts`
is the single fetch wrapper talking to the API. Pages so far: Login, Register,
Dashboard. No unit tests yet (`npm test` in `apps/web` is a no-op placeholder).

## Data model

Prisma schema (`apps/api/prisma/schema.prisma`) models: `User`, `RefreshToken`,
`PasswordResetToken`, `Organization`, `OrganizationMember`, `Workspace`,
`WorkspaceMember`, `Project`, `Task`, `Comment`, `Attachment`, `Notification`,
`AuditLog`. Full ER diagram in `apps/api/docs/ER_DIAGRAM.md`. Soft-delete
(archive/restore) exists for `Organization`/`Workspace`/`Project` only —
`Task`/`Comment`/`Attachment` are hard-deleted.

## Git workflow

Conventional Commits: `<type>(<scope>): <summary>` where type is one of
`feat|fix|chore|docs|test|refactor|perf|ci` and scope is the touched area
(`auth|organizations|workspaces|users|db|common|docs|...`). Branch model is
`main` (protected, deploy-ready) / `develop` (integration) / `feature/<slug>`
and `bugfix/<slug>` cut from `develop` (hotfixes to `main` branch from `main`
and merge back to both). Full conventions, including the PR description
template, in `apps/api/docs/GIT_WORKFLOW.md` — applies repo-wide, not just to
the API.

## Known gaps (don't assume these exist)

- Attachment storage is local-disk only; `StorageService` is an interface with
  only a local-disk implementation — no cloud backend yet.
- No CI pipeline, health endpoint, full-text search, or OpenTelemetry tracing.
