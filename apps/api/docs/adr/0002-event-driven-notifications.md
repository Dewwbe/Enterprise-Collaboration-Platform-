# ADR 0002: Event-driven notification pipeline

## Status
Accepted

## Context

Requirement §10/§11 asks for notifications on task-assigned, task-completed, comment-added, and user-invited, delivered asynchronously, plus background jobs for reminders/summaries/cleanup with retry on failure. The naive approach — `TasksService.create()` directly calling `NotificationsService.notify(...)`, which directly calls an email provider — couples every feature service to the entire notification stack and makes delivery synchronous with the request.

## Decision

Feature services only emit a domain event (`TaskAssignedEvent`, `TaskCompletedEvent`, `CommentAddedEvent`, `UserInvitedEvent`) via `EventEmitter2` and return immediately. A single `NotificationEventsListener` subscribes to all four event types and is the only code that knows how to turn a domain event into a BullMQ job on the `notification-delivery` queue. A single `NotificationDeliveryProcessor` worker is the only code that knows how to turn a job into a persisted `Notification` row, a WebSocket push (`NotificationsGateway`), and — for the two types where it matters (`TASK_ASSIGNED`, `USER_INVITED`) — an email.

Scheduled jobs (`DailyReminderProcessor`, `WeeklySummaryProcessor`, `CleanupExpiredTokensProcessor`) run on BullMQ repeat-cron and feed into the same `notification-delivery` queue rather than having their own delivery path, so there is exactly one place that writes a `Notification` row and pushes to a socket.

## Alternatives considered

- **Direct service calls** (`TasksService` calls `NotificationsService`): rejected — couples every event-producing service to the full notification stack, makes delivery synchronous with the mutating request, and means a new delivery channel requires touching every producer.
- **One BullMQ queue per event type**: rejected — the processing logic (persist + push + maybe-email) is identical regardless of which event produced the job; splitting queues would just split identical worker code four ways for no isolation benefit at this scale (no event type needs different concurrency/priority than another).

## Consequences

- A feature service change (e.g. adding a new trigger for `TASK_ASSIGNED`) never needs to touch `queue/` or `notifications/`.
- A new delivery channel (e.g. Slack) only touches `NotificationDeliveryProcessor`, not every producer.
- BullMQ's built-in retry/backoff covers "retry failed jobs" (§11) for every notification type and every scheduled job uniformly, since they all funnel through the same processor.
- Failure mode to watch: if `NotificationEventsListener` throws (e.g. Redis briefly unreachable when enqueueing), the event is lost — `EventEmitter2` does not persist or retry the emit itself, only the BullMQ job once it's enqueued. Acceptable for this phase; a future hardening pass could add an outbox table if that gap matters in practice.
