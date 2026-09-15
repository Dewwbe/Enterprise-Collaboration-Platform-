# ADR 0001: RBAC enforcement strategy

## Status
Accepted

## Context

The platform needs workspace-scoped RBAC (`OWNER > ADMIN > MEMBER > VIEWER`) enforced on every mutating route, across resources nested at different depths:

- `/workspaces/:workspaceId` — workspace is the route resource itself.
- `/workspaces/:workspaceId/projects/:projectId` — workspace id is still directly in the route.
- `/projects/:projectId/tasks/:taskId` — no `workspaceId` in the route at all; membership only exists once you join `task -> project -> workspace`.
- `/tasks/:taskId/comments/:commentId`, `/tasks/:taskId/attachments/:attachmentId` — same problem, one join deeper.
- `/organizations/:organizationId` — a different resource hierarchy entirely (organization membership, not workspace membership), though it reuses the same `WorkspaceRole` enum and hierarchy.

Some authorization rules aren't a simple "role >= X" check at all — e.g. an attachment can be deleted by its uploader *or* by an ADMIN/OWNER, and a comment can be edited/deleted by its author regardless of role (down to `MEMBER`, since only `MEMBER+` can create one in the first place).

## Decision

Two-layer enforcement, not one:

1. **`RolesGuard` + `@Roles(...)` at the controller** for every endpoint whose rule reduces to "caller's role must be at least X". The guard resolves the caller's membership generically by checking route params in priority order — `workspaceId` → `organizationId` → `projectId` → `taskId` — and walking the corresponding join via `WorkspaceAccessService` (`requireWorkspaceMembership` / `requireOrganizationMembership` / `requireProjectMembership` / `requireTaskMembership`). This means every controller (`workspaces`, `projects`, `tasks`, `comments`, `attachments`, `organizations`) uses the identical `@UseGuards(RolesGuard) @Roles(WorkspaceRole.X)` shape regardless of how deep the resource is nested — no controller has to know how to resolve its own workspace.

2. **Service-layer checks via `WorkspaceAccessService`** remain the enforcement point for rules a single minimum-role guard cannot express: comment/attachment ownership, and the attachment "uploader OR ADMIN+" OR-condition. These also remain the *source of the joined entity* (task/project) the business logic needs anyway, so the membership lookup isn't wasted even where a guard also runs first.

Both layers use the same 404-for-non-members rule (never a 403) so a non-member can never distinguish "wrong role" from "resource doesn't exist" via status code, and both share the one `WorkspaceAccessService` implementation of that rule instead of each duplicating it.

## Alternatives considered

- **Guard-only, with the guard doing arbitrary business-rule evaluation.** Rejected: "uploader or ADMIN+" and "comment author" are ownership checks that need the specific resource row, which the guard would have to fetch a second time (the service fetches it again anyway for the mutation itself) — that's either wasted queries or the guard reaching into service internals, both worse than just leaving ownership checks in the service.
- **Service-only** (the state this ADR replaces): correct, but meant `tasks`/`comments`/`attachments`/`organizations` controllers carried no `@Roles` at all while `workspaces`/`projects` did, making the API surface's authorization requirements invisible from the controller/Swagger layer and inconsistent across otherwise-identical resources.
- **Give every nested route a `:workspaceId` prefix** (e.g. `/workspaces/:workspaceId/projects/:projectId/tasks/:taskId`) so the original single-lookup guard just works everywhere. Rejected: churns every existing route and client, for a benefit (guard simplicity) fully achieved instead by teaching the guard to walk the join chain.

## Consequences

- Adding a new nested resource under `project`/`task` only needs its route param name added to `RolesGuard.resolveMembership`, not a new guard.
- Swagger now documents the minimum role for every guarded endpoint via `@Roles(...)`, matching what `workspaces`/`projects` already showed.
- Ownership-only rules stay explicit in the service where the resource row is already being fetched, rather than being forced into the guard.
