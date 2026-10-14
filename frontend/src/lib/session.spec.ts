import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { fakeApi, owner501, problem, sessionFor } from '@/test/fake-api';
import { SessionStore } from './session';

describe('SessionStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resumes the session from the refresh cookie, once per page load', async () => {
    const api = fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501, 'fresh-token') });
    const store = new SessionStore();

    expect(await store.restore()).toEqual(owner501);
    expect(await store.restore()).toEqual(owner501);
    expect(store.accessToken).toBe('fresh-token');
    expect(api.callsTo('POST /api/auth/refresh')).toHaveLength(1);
  });

  it('is anonymous when there is no valid refresh cookie', async () => {
    fakeApi({ 'POST /api/auth/refresh': () => problem(401, 'SESSION_INVALID') });
    const store = new SessionStore();

    expect(await store.restore()).toBeNull();
    expect(store.getSnapshot()).toEqual({ status: 'anonymous' });
  });

  it('shares one refresh among concurrent callers', async () => {
    const api = fakeApi({ 'POST /api/auth/refresh': sessionFor(owner501) });
    const store = new SessionStore();

    await Promise.all([store.refresh(), store.refresh(), store.refresh()]);

    expect(api.callsTo('POST /api/auth/refresh')).toHaveLength(1);
  });

  it('keeps the state and reports the error when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const store = new SessionStore();

    await expect(store.restore()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(store.getSnapshot()).toEqual({ status: 'unknown' });
  });

  it('signs in, notifying subscribers, and reports failures by code', async () => {
    fakeApi({
      'POST /api/auth/login': ({ body }) =>
        (body as { password: string }).password === 'right'
          ? sessionFor(owner501)()
          : problem(401, 'INVALID_CREDENTIALS'),
    });
    const store = new SessionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.login({ username: '501', password: 'wrong' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(await store.login({ username: '501', password: 'right' })).toEqual(owner501);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('signs out locally even when offline', async () => {
    fakeApi({ 'POST /api/auth/login': sessionFor(owner501) });
    const store = new SessionStore();
    await store.login({ username: '501', password: 'x' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await store.logout();

    expect(store.user).toBeNull();
    expect(store.getSnapshot()).toEqual({ status: 'anonymous' });
  });
});
