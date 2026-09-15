# Sequence Diagram: Assigning a Task

Chosen because it exercises most of the architecture in one request: RBAC resolution through a join chain, an event emitted rather than a direct call, an async queue hop, cache invalidation, and two delivery channels (WebSocket + email).

```mermaid
sequenceDiagram
    actor Caller
    participant API as TasksController
    participant Guard as RolesGuard
    participant Access as WorkspaceAccessService
    participant Svc as TasksService
    participant DB as Postgres (Prisma)
    participant Cache as Redis (CacheService)
    participant Bus as EventEmitter2
    participant Listener as NotificationEventsListener
    participant Queue as BullMQ (notification-delivery)
    participant Proc as NotificationDeliveryProcessor
    participant WS as NotificationsGateway
    participant Mail as EmailService

    Caller->>API: PATCH /projects/:projectId/tasks/:taskId { assigneeId }
    API->>Guard: canActivate() [@Roles(MEMBER)]
    Guard->>Access: requireProjectMembership(projectId, userId)
    Access->>DB: find project -> workspace membership
    DB-->>Access: membership { role }
    Access-->>Guard: { project, membership }
    Guard-->>API: role >= MEMBER, allow

    API->>Svc: update(userId, projectId, taskId, dto)
    Svc->>Access: requireTaskMembership(taskId, userId)
    Access-->>Svc: { task, membership }
    Svc->>Access: requireWorkspaceMember(workspaceId, assigneeId)
    Note over Svc: assignee must belong to the same workspace
    Svc->>DB: task.update({ assigneeId, ... })
    DB-->>Svc: updated task
    Svc->>Bus: emit(TaskAssignedEvent)
    Svc->>Cache: del(dashboardCacheKey(assigneeId))
    Svc-->>API: updated task
    API-->>Caller: 200 { success, data: task }

    Note over Bus,Listener: async, decoupled from the HTTP response above
    Bus->>Listener: onTaskAssigned(event)
    Listener->>Queue: add('deliver', { userId: assigneeId, type: TASK_ASSIGNED, payload })
    Queue->>Proc: process(job)
    Proc->>DB: Notification.create(...)
    Proc->>WS: pushToUser(assigneeId, notification)
    WS-->>Caller: WebSocket push (if assignee has a tab open)
    Proc->>Mail: sendMail({ to: assignee.email, ... })
```

Key property: the HTTP response at step "200 { success, data: task }" does **not** wait on notification delivery — the event emission is synchronous but the queue job runs in a separate worker context, so a slow email provider or a Redis hiccup never adds latency to the task-update request itself.
