import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@depadmin/shared';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns a response that satisfies the shared contract', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ConfigService, useValue: { get: () => '1.0.0' } }],
    }).compile();

    const response = moduleRef.get(HealthController).check();

    expect(healthResponseSchema.parse(response)).toMatchObject({ status: 'ok', version: '1.0.0' });
  });
});
