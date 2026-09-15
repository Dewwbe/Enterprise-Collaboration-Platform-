import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkspaceRole } from '../src/common/enums/workspace-role.enum';
import { NotificationType } from '@prisma/client';
import {
  createTestApp,
  registerUser,
  cleanupOrgAndUsers,
  TestUser,
} from './utils/test-app';

/**
 * Exercises the real event-driven pipeline end to end against the live
 * Redis/BullMQ from docker-compose: TaskAssignedEvent / CommentAddedEvent ->
 * NotificationEventsListener -> notification-delivery queue ->
 * NotificationDeliveryProcessor -> a row the recipient can read back over
 * GET /notifications. Nothing here is mocked - a broken queue wiring would
 * make this test time out rather than pass on a mock double.
 *
 * Requires a running Postgres/Redis (see docker-compose.yml) with migrations
 * applied. Run with: npm run test:e2e
 */
describe('Notifications & background queue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let assignee: TestUser;
  let organizationId: string;
  let workspaceId: string;

  const NOTIFICATION_POLL_TIMEOUT_MS = 10_000;
  const NOTIFICATION_POLL_INTERVAL_MS = 250;

  /** Polls GET /notifications until one matching `predicate` shows up, or times out. */
  async function waitForNotification(
    user: TestUser,
    predicate: (n: { type: string; payload: Record<string, unknown> }) => boolean,
  ): Promise<{ id: string; type: string; payload: Record<string, unknown> }> {
    const deadline = Date.now() + NOTIFICATION_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const match = res.body.data.items.find(predicate);
      if (match) {
        return match;
      }
      await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_POLL_INTERVAL_MS));
    }
    throw new Error(
      'Timed out waiting for the notification to be delivered by the queue.',
    );
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = await registerUser(app, 'queue-owner');
    assignee = await registerUser(app, 'queue-assignee');

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Queue Org', slug: `queue-org-${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.id;

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ organizationId, name: 'Queue WS', slug: `queue-ws-${Date.now()}` })
      .expect(201);
    workspaceId = ws.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: assignee.id, role: WorkspaceRole.MEMBER })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupOrgAndUsers(prisma, organizationId, [owner.id, assignee.id]);
    await app.close();
  });

  it('delivers a TASK_ASSIGNED notification via the real queue when a task is assigned', async () => {
    const project = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Queue Project' })
      .expect(201);

    const task = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.body.data.id}/tasks`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Queue Task', assigneeId: assignee.id })
      .expect(201);

    const notification = await waitForNotification(
      assignee,
      (n) =>
        n.type === NotificationType.TASK_ASSIGNED &&
        n.payload.taskId === task.body.data.id,
    );

    const markRead = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .expect(200);

    expect(markRead.body.data.readAt).not.toBeNull();
  });
});
