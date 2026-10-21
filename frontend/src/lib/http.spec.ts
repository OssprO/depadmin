import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, owner501, problem, sessionFor } from '@/test/fake-api';
import { connectSession, getJson } from './http';
import { SessionStore } from './session';

const dataSchema = z.object({ ok: z.boolean() });

describe('API client', () => {
  let store: SessionStore;

  beforeEach(async () => {
    fakeApi({ 'POST /api/auth/login': sessionFor(owner501, 'old-token') });
    store = new SessionStore();
    await store.login({ username: '501', password: 'x' });
    connectSession(store);
  });

  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('sends the access token', async () => {
    const api = fakeApi({ 'GET /api/data': () => Response.json({ ok: true }) });

    expect(await getJson('/data', dataSchema)).toEqual({ ok: true });
    expect(api.calls[0]?.headers.get('Authorization')).toBe('Bearer old-token');
  });

  it('refreshes an expired access token once and retries', async () => {
    const api = fakeApi({
      'GET /api/data': ({ headers }) =>
        headers.get('Authorization') === 'Bearer new-token'
          ? Response.json({ ok: true })
          : problem(401, 'UNAUTHENTICATED'),
      'POST /api/auth/refresh': sessionFor(owner501, 'new-token'),
    });

    expect(await getJson('/data', dataSchema)).toEqual({ ok: true });
    expect(api.calls.map((c) => c.route)).toEqual([
      'GET /api/data',
      'POST /api/auth/refresh',
      'GET /api/data',
    ]);
  });

  it('ends the session when the refresh fails too', async () => {
    fakeApi({
      'GET /api/data': () => problem(401, 'UNAUTHENTICATED'),
      'POST /api/auth/refresh': () => problem(401, 'REFRESH_TOKEN_REUSED'),
    });

    await expect(getJson('/data', dataSchema)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(store.getSnapshot()).toEqual({ status: 'anonymous' });
  });

  it('passes other errors through with their code', async () => {
    fakeApi({ 'GET /api/data': () => problem(403, 'SUPERADMIN_ONLY') });

    await expect(getJson('/data', dataSchema)).rejects.toMatchObject({ code: 'SUPERADMIN_ONLY' });
  });

  it('reports a body that breaks the contract', async () => {
    fakeApi({ 'GET /api/data': () => Response.json({ ok: 'yes' }) });

    await expect(getJson('/data', dataSchema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
