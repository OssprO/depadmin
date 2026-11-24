import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { JobRunner } from './job-runner.js';

const PING_URL = 'https://hc-ping.com/key';

function runner(env: Partial<Env> = {}) {
  const values: Partial<Env> = { JOBS_ENABLED: true, HEALTHCHECKS_PING_URL: '', ...env };
  return new JobRunner({
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>);
}

describe('JobRunner', () => {
  const logger = new Logger('test');

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('logs what the task did, and nothing when it did nothing', async () => {
    const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    await runner().run('job', logger, 'failed', () => Promise.resolve('Deleted 3'));
    await runner().run('job', logger, 'failed', () => Promise.resolve(null));
    expect(log.mock.calls).toEqual([['Deleted 3']]);
  });

  it('skips the task when jobs are off, and never throws', async () => {
    const task = vi.fn(() => Promise.resolve(null));
    await runner({ JOBS_ENABLED: false }).run('job', logger, 'failed', task);
    expect(task).not.toHaveBeenCalled();

    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const boom = new Error('boom');
    await expect(
      runner().run('job', logger, 'failed', () => Promise.reject(boom)),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('failed', boom);
  });

  it('reports nothing without a ping URL', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await runner().run('job', logger, 'failed', () => Promise.resolve('done'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports each run under the job name, and a failure to /fail', async () => {
    vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);
    const jobs = runner({ HEALTHCHECKS_PING_URL: PING_URL });

    await jobs.run('open-current-month', logger, 'failed', () => Promise.resolve(null));
    await jobs.run('open-current-month', logger, 'failed', () => Promise.resolve('Opened 2026-12'));
    await jobs.run('open-current-month', logger, 'Could not open', () =>
      Promise.reject(new Error('boom')),
    );

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.body])).toEqual([
      [`${PING_URL}/open-current-month?create=1`, ''],
      [`${PING_URL}/open-current-month?create=1`, 'Opened 2026-12'],
      [`${PING_URL}/open-current-month/fail?create=1`, 'Could not open: Error: boom'],
    ]);
  });

  it('warns, and goes on, when healthchecks.io cannot be reached or refuses', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const jobs = runner({ HEALTHCHECKS_PING_URL: PING_URL });

    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    await expect(
      jobs.run('job', logger, 'failed', () => Promise.resolve(null)),
    ).resolves.toBeUndefined();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    await jobs.run('job', logger, 'failed', () => Promise.resolve(null));

    expect(warn.mock.calls).toEqual([
      ['Could not report job to healthchecks.io: TypeError: fetch failed'],
      ['healthchecks.io answered 404 for job'],
    ]);
  });
});
