import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@depadmin/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaDatabase } from '../prisma/prisma-database.js';
import { HealthController, READY_TIMEOUT_MS } from './health.controller.js';

async function controllerWith(queryRaw: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: ConfigService, useValue: { get: () => '1.0.0' } },
      { provide: PrismaDatabase, useValue: { client: { $queryRaw: queryRaw } } },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a response that satisfies the shared contract', async () => {
    const response = (await controllerWith(() => Promise.resolve([]))).check();

    expect(healthResponseSchema.parse(response)).toMatchObject({ status: 'ok', version: '1.0.0' });
  });

  it('is ready when the database answers', async () => {
    const health = await controllerWith(() => Promise.resolve([{ '?column?': 1 }]));

    expect(healthResponseSchema.parse(await health.ready())).toMatchObject({ status: 'ok' });
  });

  it('answers 503 when the database fails or takes too long', async () => {
    const failing = await controllerWith(() => Promise.reject(new Error('connection refused')));
    await expect(failing.ready()).rejects.toThrow(ServiceUnavailableException);

    vi.useFakeTimers();
    const hanging = await controllerWith(() => new Promise(() => undefined));
    const ready = expect(hanging.ready()).rejects.toThrow(ServiceUnavailableException);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    await ready;
  });
});
