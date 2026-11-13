import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { problemDetailsSchema } from '@depadmin/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLIENT_ERRORS_PER_MINUTE } from '../src/platform/client-errors/client-errors.controller.js';
import { configureApp } from '../src/platform/http/configure-app.js';

describe('POST /api/client-errors (e2e)', () => {
  let app: NestExpressApplication;
  const report = { kind: 'error', message: 'TypeError: x is undefined', path: '/book/2026-10' };

  // A fresh app for each test, so each starts with the whole limit.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
    await app.init();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  const send = (body: object) =>
    request(app.getHttpServer())
      .post('/api/client-errors')
      .set('User-Agent', 'Mozilla/5.0 (Android 14)')
      .send(body);

  it('logs a report without a session, with the browser it came from', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await send(report).expect(204);
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      ...report,
      userAgent: 'Mozilla/5.0 (Android 14)',
    });
  });

  it('rejects a report that does not match the contract', async () => {
    const response = await send({ ...report, path: '/login?user=401' });
    expect(response.status).toBe(400);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it(`takes ${CLIENT_ERRORS_PER_MINUTE} reports a minute from one IP`, async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    for (let sent = 0; sent < CLIENT_ERRORS_PER_MINUTE; sent++) {
      await send(report).expect(204);
    }
    const response = await send(report);
    expect(response.status).toBe(429);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});
