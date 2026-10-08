import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@depadmin/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/platform/http/configure-app.js';

describe('GET /api/health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with a body that matches the shared contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
