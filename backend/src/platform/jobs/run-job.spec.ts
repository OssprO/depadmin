import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { runJob } from './run-job.js';

describe('runJob', () => {
  const logger = new Logger('test');

  it('logs what the task did, and nothing when it did nothing', async () => {
    const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    await runJob(logger, true, 'failed', () => Promise.resolve('Deleted 3'));
    await runJob(logger, true, 'failed', () => Promise.resolve(null));
    expect(log.mock.calls).toEqual([['Deleted 3']]);
  });

  it('skips the task when jobs are off, and never throws', async () => {
    const task = vi.fn(() => Promise.resolve(null));
    await runJob(logger, false, 'failed', task);
    expect(task).not.toHaveBeenCalled();

    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const boom = new Error('boom');
    await expect(
      runJob(logger, true, 'failed', () => Promise.reject(boom)),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('failed', boom);
  });
});
