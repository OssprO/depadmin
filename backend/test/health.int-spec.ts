import { healthResponseSchema } from '@depadmin/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './support/app.js';
import { useTestDatabase } from './support/database.js';

useTestDatabase();
const api = useTestApp();

describe('GET /api/health/ready', () => {
  it('answers 200 without a session when the database is up', async () => {
    const response = await request(api.app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });
});
