import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BUILDING_TIME_ZONE } from '../../../platform/clock/system-clock.js';
import type { Env } from '../../../platform/config/env.js';
import { runJob } from '../../../platform/jobs/run-job.js';
import { OpenCurrentMonth } from '../application/index.js';

/**
 * A driving adapter, like a controller, but triggered by the clock: every day just after
 * midnight in the building, it opens the month if nobody did. It runs daily, not only on the
 * 1st, so a day the server was down is caught up the next one.
 */
@Injectable()
export class OpenCurrentMonthJob {
  private readonly logger = new Logger(OpenCurrentMonthJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly openCurrentMonth: OpenCurrentMonth,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true });
  }

  @Cron('5 0 * * *', { name: 'open-current-month', timeZone: BUILDING_TIME_ZONE })
  run(): Promise<void> {
    return runJob(this.logger, this.enabled, 'Could not open the current month', async () => {
      const opened = await this.openCurrentMonth.execute();
      return opened.length > 0
        ? `Opened ${opened.map((report) => String(report.month)).join(', ')}`
        : null;
    });
  }
}
