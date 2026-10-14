import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../platform/config/env.js';
import { YearMonth } from '../../../shared-kernel/index.js';
import type { OpenCurrentMonth } from '../application/index.js';
import { MonthlyReport } from '../domain/index.js';
import { OpenCurrentMonthJob } from './open-current-month.job.js';

function jobWith(enabled: boolean, execute: OpenCurrentMonth['execute']) {
  const config = { get: () => enabled } as unknown as ConfigService<Env, true>;
  const useCase = { execute: vi.fn(execute) };
  return { job: new OpenCurrentMonthJob(useCase as unknown as OpenCurrentMonth, config), useCase };
}

describe('OpenCurrentMonthJob', () => {
  it('opens the current month when enabled, and logs what it opened', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { job, useCase } = jobWith(true, () =>
      Promise.resolve([MonthlyReport.open(YearMonth.of(2026, 11))]),
    );

    await job.run();

    expect(useCase.execute).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('Opened 2026-11');
  });

  it('does nothing when the jobs are turned off', async () => {
    const { job, useCase } = jobWith(false, () => Promise.resolve([]));
    await job.run();
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('logs a failure instead of throwing, so the next day tries again', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { job } = jobWith(true, () => Promise.reject(new Error('database down')));

    await expect(job.run()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Could not open the current month', expect.any(Error));
  });
});
