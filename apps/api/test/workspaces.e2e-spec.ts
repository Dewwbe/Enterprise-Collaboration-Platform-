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
 * Requires a running Postgres/Redis reachable via DATABASE_URL/REDIS_HOST
 * (see docker-compose.yml) and migrations applied.
 * Run with: npm run test:e2e
 */
describe('Organizations & Workspaces (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let viewer: TestUser | undefined;
  let organizationId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = await registerUser(app, 'ws-owner');
  });

  afterAll(async () => {
    const userIds = [owner.id, ...(viewer ? [viewer.id] : [])];
    await cleanupOrgAndUsers(prisma, organizationId, userIds);
    await app.close();
  });

  it('creates an organization with the caller as OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Inc', slug: `acme-${Date.now()}` })
      .expect(201);

    organizationId = res.body.data.id;
    expect(res.body.data.members).toHaveLength(1);
    expect(res.body.data.members[0].role).toBe(WorkspaceRole.OWNER);
  });

  let workspaceId: string;

  it('creates a workspace inside the organization', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        organizationId,
        name: 'Engineering',
        slug: `engineering-${Date.now()}`,
      })
      .expect(201);

    workspaceId = res.body.data.id;
    expect(res.body.data.members[0].role).toBe(WorkspaceRole.OWNER);
  });

  it('rejects workspace creation from someone outside the organization', async () => {
    const outsider = await registerUser(app, 'ws-outsider');

    await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ organizationId, name: 'Rogue', slug: `rogue-${Date.now()}` })
      .expect(403);

    await prisma.user.delete({ where: { id: outsider.id } });
  });

  it('invites a member into the workspace', async () => {
    viewer = await registerUser(app, 'ws-viewer');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: viewer.id, role: WorkspaceRole.VIEWER })
      .expect(201);

    expect(res.body.data.role).toBe(WorkspaceRole.VIEWER);
  });

  it('lets the invited member read the workspace', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${viewer!.accessToken}`)
      .expect(200);

    expect(res.body.data.id).toBe(workspaceId);
  });

  it('returns 404 (not 403) for a non-member reading the workspace, so ids never leak', async () => {
    const outsider = await registerUser(app, 'ws-outsider2');

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    await prisma.user.delete({ where: { id: outsider.id } });
  });

  it('rejects a VIEWER from archiving the workspace', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/archive`)
      .set('Authorization', `Bearer ${viewer!.accessToken}`)
      .expect(403);
  });

  it('rejects a non-member from archiving the workspace with 404, not 403', async () => {
    const outsider = await registerUser(app, 'ws-outsider3');

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/archive`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    await prisma.user.delete({ where: { id: outsider.id } });
  });
});
