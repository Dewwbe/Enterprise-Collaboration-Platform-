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
 * Requires a running Postgres/Redis (see docker-compose.yml) with migrations
 * applied. Run with: npm run test:e2e
 */
describe('Attachments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let viewer: TestUser;
  let organizationId: string;
  let taskId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = await registerUser(app, 'att-owner');
    viewer = await registerUser(app, 'att-viewer');

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Attachments Org', slug: `att-org-${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.id;

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ organizationId, name: 'Attachments WS', slug: `att-ws-${Date.now()}` })
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
      .send({ name: 'Attachments Project' })
      .expect(201);

    const task = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.body.data.id}/tasks`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Attachments Task' })
      .expect(201);
    taskId = task.body.data.id;
  });

  afterAll(async () => {
    await cleanupOrgAndUsers(prisma, organizationId, [owner.id, viewer.id]);
    await app.close();
  });

  it('rejects a disallowed MIME type with 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), {
        filename: 'script.sh',
        contentType: 'application/x-sh',
      })
      .expect(400);
  });

  it('rejects a VIEWER uploading a file (requires MEMBER or above)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .attach('file', Buffer.from('hello'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(403);
  });

  let attachmentId: string;

  it('uploads an allowed file type with a unique storage key', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('file', Buffer.from('hello world'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    attachmentId = res.body.data.id;
    expect(res.body.data.originalName).toBe('notes.txt');
    expect(res.body.data.storageKey).not.toBe('notes.txt');
    expect(res.body.data.storageKey).toContain('notes.txt');
  });

  it('lists the uploaded attachment', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(200);

    expect(res.body.data.map((a: { id: string }) => a.id)).toContain(attachmentId);
  });

  it('downloads the attachment content back unchanged', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(res.text).toBe('hello world');
  });

  it('lets a VIEWER delete their own upload', async () => {
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('file', Buffer.from('owner file'), {
        filename: 'owner.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}/attachments/${uploadRes.body.data.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
  });

  it("rejects a VIEWER deleting someone else's attachment", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(403);
  });

  it('lets the OWNER delete any attachment', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
  });
});
