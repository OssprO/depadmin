import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './support/app.js';
import { useTestDatabase } from './support/database.js';

// In production nginx stands in front of the API (docs/adr/0026-despliegue-con-nginx.md), so
// every request arrives from the proxy; supertest connects over loopback, like the proxy.
useTestDatabase();
const api = useTestApp({ env: { TRUST_PROXY: 'loopback' } });

describe('behind a trusted proxy', () => {
  const attempt = (forwardedFor: string) =>
    request(api.app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ username: '501', password: 'wrong password' });

  it('limits login attempts by the client IP the proxy forwards', async () => {
    for (let i = 0; i < 5; i++) expect((await attempt('203.0.113.7')).status).toBe(401);
    expect((await attempt('203.0.113.7')).status).toBe(429);

    // A neighbour on another network is unaffected.
    expect((await attempt('198.51.100.20')).status).toBe(401);
    // A forged header does not help: the proxy appends the address it saw, the one counted.
    expect((await attempt('198.51.100.99, 203.0.113.7')).status).toBe(429);
  });
});
