import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { problemDetailsSchema } from '@depadmin/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/platform/http/configure-app.js';

// Cross-cutting HTTP behaviour that needs no database: errors, authentication, headers.
describe('HTTP platform (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectProblem = (response: request.Response, status: number, code: string) => {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({ status, code });
  };

  it('requires an access token on every route that is not public', async () => {
    expectProblem(await request(app.getHttpServer()).get('/api/auth/me'), 401, 'UNAUTHENTICATED');
    expectProblem(
      await request(app.getHttpServer()).get('/api/users').set('Authorization', 'Bearer forged'),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('answers unknown routes with a problem', async () => {
    expectProblem(await request(app.getHttpServer()).get('/api/nope'), 404, 'NOT_FOUND');
  });

  it('validates request bodies against the shared contracts', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: '', password: 'x' });

    expectProblem(response, 400, 'VALIDATION_FAILED');
    expect(response.body).toMatchObject({ errors: [{ path: 'username' }] });
  });

  it('rejects malformed JSON as a problem', async () => {
    expectProblem(
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username":'),
      400,
      'BAD_REQUEST',
    );
  });

  it('treats a refresh without a cookie as an invalid session', async () => {
    expectProblem(
      await request(app.getHttpServer()).post('/api/auth/refresh'),
      401,
      'SESSION_INVALID',
    );
  });

  it('sends security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
