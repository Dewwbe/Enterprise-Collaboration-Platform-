import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';

/**
 * Requires a running Postgres + Redis reachable via .env (see docker-compose.yml).
 * Run with: npm run test:e2e
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports healthy without an access token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    // Wrapped by the global TransformInterceptor like every other route.
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.info.database.status).toBe('up');
    expect(res.body.data.info.redis.status).toBe('up');
  });
});
