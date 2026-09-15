# Project Plan — Enterprise Collaboration Platform (Phase 4 Capstone)

Scope: full requirement doc, including all optional bonus features (treated
as in-scope per your request). Duration: 8 weeks @ 2–5 hrs/day, matching the
timeline in the assignment brief.

## How to read this plan
Each week lists: goals, feature branches to cut (see `GIT_WORKFLOW.md` for the
exact commands), concrete deliverables, and the requirement-doc sections it
satisfies. Bonus features are slotted where they naturally attach to the
underlying feature, not all crammed at the end, so they're actually buildable
rather than bolted on in Week 8.

## Current status (as of 2026-09-15)

Weeks 1–6 are delivered, including Attachments (originally slotted for Week
7–8) and the RBAC hardening this plan called for in Week 3–4 (implemented as
a generic `resolveMembership` method directly on `RolesGuard` rather than a
separate `WorkspaceScopeResolver` provider — same effect, fewer moving
parts; see [`adr/0001-rbac-strategy.md`](adr/0001-rbac-strategy.md)).
Documentation finalization (ER/architecture/sequence diagrams, ADRs, this
status update) is also done.

Still open from Week 3–4 / 7–8:
- Soft delete and restore for `Task`/`Comment`/`Attachment` (bonus)
- GitHub Actions CI pipeline
- Health/metrics endpoints (`@nestjs/terminus`)
- Full-text search, project templates, user activity dashboard, per-route throttle overrides, OpenTelemetry, Docker production profile (all bonus)
- Coverage-gap fill toward the 80% target and an authorization-matrix test pass

---

## Week 1–2 — Authentication, Workspace, Organization, Database ✅ delivered
**Branches:** `feature/project-scaffold-and-tooling`, `feature/database-schema-prisma`,
`feature/common-http-layer`, `feature/auth-module`, `feature/users-module`,
`feature/organizations-module`, `feature/workspaces-module`, `feature/testing-and-docs`

- Project scaffold: NestJS, TypeScript, ESLint/Prettier, Jest, Docker Compose
- Full Prisma ER schema (all entities) + seed script
- Global HTTP layer: exception filter, response envelope, logging interceptor, Helmet, rate limiting
- Auth: register/login/refresh-rotation/logout, bcrypt, JWT access+refresh
- Organizations: CRUD, membership, org-level RBAC
- Workspaces: CRUD, membership, `RolesGuard` demonstrating workspace RBAC
- Unit tests for auth + organizations services; e2e auth flow
- Swagger at `/docs`
- **Satisfies:** Sections 4 (Auth, Workspace partially), 6, 7, 8, 9, 17 (partial), 18

**Milestone tag:** `v0.2.0`

---

## Week 3–4 — Projects, Tasks, Comments, RBAC hardening ✅ delivered (soft delete bonus still open)
**Branches:** `feature/projects-module`, `feature/tasks-module`, `feature/comments-module`,
`feature/rbac-workspace-scoping-audit`

- **Projects module**: CRUD under a workspace, archive/restore, search-by-name (`?search=`)
- **Tasks module**: CRUD, status workflow enforcement (`TODO → IN_PROGRESS → REVIEW → DONE`,
  reject illegal transitions in the service layer, not just the DB enum), assignee/reporter,
  labels, due dates, pagination + filtering + sorting (`?status=&priority=&assigneeId=&sort=&page=&limit=`)
- **Comments module**: create / edit-own / delete-own, ownership check in service layer
- **RBAC hardening**: extend `RolesGuard` to also resolve workspace id indirectly via
  `projectId`/`taskId` route params (a `WorkspaceScopeResolver` provider so guards
  aren't duplicated per resource type)
- Bonus feature landed this phase: **Soft delete and restore** — add `deletedAt` to
  Project/Task/Comment, global Prisma middleware to auto-filter soft-deleted rows,
  `POST /:id/restore` endpoints
- Unit + integration tests for status-transition rules and RBAC edge cases
- **Satisfies:** Sections 4 (Projects, Tasks, Comments), 15 (workspace data leakage
  protection extended to nested resources), 22 (Soft delete and restore)

**Milestone tag:** `v0.4.0`

---

## Week 5–6 — Notifications, Redis, BullMQ, Audit Logs ✅ delivered
**Branches:** `feature/event-bus`, `feature/notifications-module`, `feature/bullmq-workers`,
`feature/redis-caching`, `feature/audit-log-interceptor`

- **Event-driven core**: introduce a lightweight domain event bus (`@nestjs/event-emitter`
  or Nest's built-in `EventEmitter2`) — `TaskCreatedEvent`, `TaskAssignedEvent`,
  `CommentAddedEvent`, `UserInvitedEvent` — emitted from services instead of services
  calling notification logic directly (Section 11 flow)
- **BullMQ workers**: `notification-delivery`, `daily-reminder`, `weekly-summary`,
  `cleanup-expired-tokens` queues; retry policy (exponential backoff, 3 attempts);
  a `BullBoard`-style admin view is optional, not required
- **Notifications module**: persisted notifications (`GET /notifications`,
  `PATCH /:id/read`), populated asynchronously by the queue consumer
- **Redis caching**: cache dashboard summary, user profile, workspace statistics;
  cache-aside pattern with explicit invalidation on the relevant mutation
  (e.g. workspace stats invalidated on task status change)
- **Audit logging**: a `@AuditLog(action, entityType)` decorator + interceptor that
  writes before/after values to the `AuditLog` table for every mutating request
- Bonus features landed this phase:
  - **Real-time notifications via WebSockets** — a `NotificationsGateway`
    (`@nestjs/websockets`) pushing new notifications to connected clients,
    authenticated via the same JWT (handshake auth)
  - **Email integration** — an `EmailModule` wrapping a provider (e.g. Nodemailer +
    SMTP or Resend/SendGrid), triggered from the notification worker for
    `task_assigned` and `user_invited`
- **Satisfies:** Sections 10 (Notifications, Audit Logs), 11, 12, 13 (caching), 22
  (Real-time notifications, Email integration)

**Milestone tag:** `v0.6.0`

---

## Week 7–8 — Testing, Documentation, Refactoring, Docker, Performance, remaining bonus features
**Branches:** `feature/attachments-module`, `feature/full-text-search`,
`feature/rate-limiting-per-route`, `feature/health-metrics`, `feature/otel-tracing`,
`feature/ci-pipeline`, `feature/docker-production`, `feature/test-coverage-hardening`,
`feature/docs-finalization`

- **Attachments module** (if not pulled earlier): file upload with size/MIME
  validation, unique storage keys, a `StorageService` abstraction (local disk
  adapter now, swappable for S3-compatible later — Section 4/13 storage abstraction requirement)
- Bonus features landed this phase:
  - **Full-text search** — Postgres `tsvector`/`GIN` index on Task title+description
    (or a dedicated search module if Elasticsearch is preferred later), `GET /search?q=`
  - **Project templates** — a `ProjectTemplate` model + `POST /projects/from-template/:id`
  - **User activity dashboard** — aggregated endpoint combining recent audit logs,
    task counts, and notification counts per user
  - **Metrics and health endpoints** — `GET /health` (Terminus: DB + Redis checks),
    `GET /metrics` (Prometheus format via `prom-client`)
  - **API rate limiting and throttling per route** — override the global
    `ThrottlerGuard` defaults on sensitive routes (`/auth/login`, `/auth/register`)
    with stricter per-route limits via `@Throttle()`
  - **OpenTelemetry tracing** — `@opentelemetry/sdk-node` auto-instrumentation for
    HTTP + Prisma, exported to an OTLP collector (console exporter acceptable for
    the capstone submission)
  - **GitHub Actions CI pipeline** — `.github/workflows/ci.yml`: install → lint →
    unit tests → e2e tests (against a Postgres service container) → build; required
    to pass before `develop`/`main` merges (retroactively enables the branch
    protection described in `GIT_WORKFLOW.md`)
  - **Docker production profile** — `docker-compose.prod.yml` (multi-stage build,
    no bind mounts, restart policies, resource limits)
- **Testing hardening**: fill coverage gaps to hit the required 80% minimum
  (`npm run test:cov`), add authorization-matrix tests (every role × every
  mutating endpoint) and queue/worker tests (BullMQ test utilities with a
  mocked/in-memory Redis)
- **Documentation finalization**: ER diagram (generated via `prisma-erd-generator`
  or drawn manually), architecture diagram, sequence diagrams for the
  event-driven notification flow and the auth refresh-rotation flow, ADRs for
  the key decisions made along the way (why Prisma, why BullMQ, why
  workspace-scoped RBAC instead of a permissions table, etc.)
- **Deliverables assembly**: Postman collection exported from the finished
  Swagger doc, final README pass, test report (`test:cov` output committed as
  `docs/test-report.md` or attached to the PR), 10–15 min walkthrough outline
- **Satisfies:** Sections 16, 17, 19 (Week 7-8), 20, 21, 22 (remaining bonus items)

**Milestone tag:** `v1.0.0` → merge to `main`

---

## Evaluation-criteria self-check (Section 21 weights)

| Category | Weight | Where it's addressed |
|---|---|---|
| Architecture | 20% | Module-per-domain, Clean Architecture, event-driven core (Wk 5-6) |
| Code Quality | 20% | ESLint/Prettier enforced, service-layer business logic, DTO validation |
| Security | 15% | bcrypt, JWT rotation, RBAC, Helmet, rate limiting, no-enumeration responses |
| Testing | 15% | Unit + e2e + authorization-matrix tests, 80% coverage target (Wk 7-8) |
| Documentation | 10% | README, Swagger, ER/architecture/sequence diagrams, ADRs (Wk 7-8) |
| Database Design | 10% | Full ER model delivered Week 1-2, indexes added as query patterns emerge |
| Git History | 5% | Conventional Commits + `GIT_WORKFLOW.md` branch discipline |
| Communication & Ownership | 5% | PR descriptions per template, this plan itself as a standing artifact |

## Risk notes / things to flag to Satheez before/while building
- **Storage abstraction** (Section 4, Attachments) is scoped to local disk for
  the capstone; swapping to S3 is a config change, not a rewrite, but worth
  confirming whether cloud storage is expected for the final submission.
- **OpenTelemetry export target**: console exporter is sufficient to
  demonstrate instrumentation; a real OTLP collector (Jaeger/Tempo) is out of
  scope unless infrastructure for it is provided.
- **Search**: Postgres full-text search is proposed instead of Elasticsearch
  to avoid adding another infrastructure dependency — flag if Elasticsearch is
  specifically expected.
