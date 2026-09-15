import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkspaceRole } from '../src/common/enums/workspace-role.enum';
import {
  createTestApp,
  registerUser,
  cleanupOrgAndUsers,
  TestUser,
} from './utils/test-app';

/**
 * Authorization tests for the nested task/comment routes, which resolve
 * membership by joining task -> project -> workspace via
 * WorkspaceAccessService instead of RolesGuard (there's no :workspaceId route
 * param to gate on). Complements the RolesGuard-driven checks already
 * covered in workspaces.e2e-spec.ts and projects-tasks-comments.e2e-spec.ts.
 *
 * Requires a running Postgres/Redis (see docker-compose.yml) with migrations
 * applied. Run with: npm run test:e2e
 */
describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let organizationId: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = await registerUser(app, 'rbac-owner');
    viewer = await registerUser(app, 'rbac-viewer');
    outsider = await registerUser(app, 'rbac-outsider');

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'RBAC Org', slug: `rbac-org-${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.id;

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ organizationId, name: 'RBAC WS', slug: `rbac-ws-${Date.now()}` })
      .expect(201);
    const workspaceId = ws.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: viewer.id, role: WorkspaceRole.VIEWER })
      .expect(201);

    const project = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'RBAC Project' })
      .expect(201);
    projectId = project.body.data.id;

    const task = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'RBAC Task' })
      .expect(201);
    taskId = task.body.data.id;
  });

  afterAll(async () => {
    await cleanupOrgAndUsers(prisma, organizationId, [owner.id, viewer.id, outsider.id]);
    await app.close();
  });

  describe('an outsider with no membership in the workspace', () => {
    it('gets 404 reading the task, not 403 - the project id must not leak', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('gets 404 creating a task in the project', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ title: 'Should not be created' })
        .expect(404);
    });

    it('gets 404 commenting on the task', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ body: 'Should not be created' })
        .expect(404);
    });
  });

  describe('a VIEWER (member, but below the MEMBER role floor)', () => {
    it('can read the task', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(200);
    });

    it('is rejected with 403 creating a task (requires MEMBER or above)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .send({ title: 'Should not be created' })
        .expect(403);
    });

    it('is rejected with 403 commenting on the task (requires MEMBER or above)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .send({ body: 'Should not be created' })
        .expect(403);
    });
  });
});
