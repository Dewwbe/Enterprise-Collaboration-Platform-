import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkspaceRole } from '../src/common/enums/workspace-role.enum';
import { TaskStatus } from '../src/common/enums/task-status.enum';
import {
  createTestApp,
  registerUser,
  cleanupOrgAndUsers,
  TestUser,
} from './utils/test-app';

/**
 * Requires a running Postgres/Redis (see docker-compose.yml) with migrations
 * applied. Run with: npm run test:e2e
 */
describe('Projects, Tasks & Comments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let member: TestUser;
  let organizationId: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = await registerUser(app, 'ptc-owner');
    member = await registerUser(app, 'ptc-member');

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'PTC Org', slug: `ptc-org-${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.id;

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ organizationId, name: 'PTC WS', slug: `ptc-ws-${Date.now()}` })
      .expect(201);
    workspaceId = ws.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: member.id, role: WorkspaceRole.MEMBER })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupOrgAndUsers(prisma, organizationId, [owner.id, member.id]);
    await app.close();
  });

  describe('Projects', () => {
    it('creates a project as a MEMBER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Launch', description: 'Q3 launch' })
        .expect(201);

      projectId = res.body.data.id;
    });

    it('paginates the project list', async () => {
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/projects`)
          .set('Authorization', `Bearer ${member.accessToken}`)
          .send({ name: `Bulk ${i}` })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects?page=1&limit=2`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.limit).toBe(2);
      expect(res.body.data.total).toBeGreaterThanOrEqual(4);
    });

    it('rejects a project update from a MEMBER (requires ADMIN or above)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Renamed' })
        .expect(403);
    });

    it('allows the OWNER to update the project', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Renamed Launch' })
        .expect(200);

      expect(res.body.data.name).toBe('Renamed Launch');
    });
  });

  describe('Tasks & Comments', () => {
    let taskId: string;

    it('creates a task with the caller as reporter', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ title: 'Write copy', assigneeId: owner.id })
        .expect(201);

      taskId = res.body.data.id;
      expect(res.body.data.status).toBe(TaskStatus.TODO);
      expect(res.body.data.reporterId).toBe(member.id);
    });

    it('rejects an illegal status transition (TODO -> DONE)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ status: TaskStatus.DONE })
        .expect(400);
    });

    it('allows the next legal transition (TODO -> IN_PROGRESS)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ status: TaskStatus.IN_PROGRESS })
        .expect(200);

      expect(res.body.data.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('rejects an assignee who is not a workspace member', async () => {
      const stranger = await registerUser(app, 'ptc-stranger');

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ assigneeId: stranger.id })
        .expect(400);

      await prisma.user.delete({ where: { id: stranger.id } });
    });

    let commentId: string;

    it('adds a comment to the task', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ body: 'Looks good so far' })
        .expect(201);

      commentId = res.body.data.id;
    });

    it("rejects editing someone else's comment", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ body: 'Hijacked' })
        .expect(403);
    });

    it('allows the author to edit their own comment', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ body: 'Looks good, ship it' })
        .expect(200);

      expect(res.body.data.body).toBe('Looks good, ship it');
    });

    it("rejects deleting someone else's comment, even for the OWNER", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(403);
    });

    it('allows the author to delete their own comment', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(204);
    });
  });
});
