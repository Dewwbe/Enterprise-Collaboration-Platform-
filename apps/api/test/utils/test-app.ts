import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Boots a real Nest app against the live Postgres/Redis from docker-compose,
 * the same way every e2e spec needs to. Requires DATABASE_URL reachable and
 * migrations applied (see auth.e2e-spec.ts's header comment).
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  const prisma = moduleFixture.get<PrismaService>(PrismaService);
  return { app, prisma };
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

/** Registers a fresh user (unique per call) and returns their id + access token. */
export async function registerUser(
  app: INestApplication,
  emailPrefix: string,
): Promise<TestUser> {
  // A UUID alone is already unique; a Date.now() prefix too would push some
  // emailPrefix values past the 64-char local-part limit @IsEmail() enforces.
  const email = `${emailPrefix}-${randomUUID()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password: 'Str0ngP@ssword!', firstName: 'Test', lastName: 'User' })
    .expect(201);

  return {
    id: res.body.data.user.id,
    email,
    accessToken: res.body.data.accessToken,
  };
}

/**
 * Deletes an organization (cascades to workspaces/projects/tasks/comments/
 * attachments) and then the given users - in that order, since
 * tasks.reporter/comments.author/attachments.uploader are ON DELETE RESTRICT
 * and would otherwise block user deletion while their content still exists.
 */
export async function cleanupOrgAndUsers(
  prisma: PrismaService,
  organizationId: string | undefined,
  userIds: string[],
): Promise<void> {
  if (organizationId) {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
