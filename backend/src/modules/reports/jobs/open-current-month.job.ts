import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BUILDING_TIME_ZONE } from '../../../platform/clock/system-clock.js';
import type { Env } from '../../../platform/config/env.js';
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
  async run(): Promise<void> {
    if (!this.enabled) return;
    try {
      const opened = await this.openCurrentMonth.execute();
      if (opened.length > 0) {
        this.logger.log(`Opened ${opened.map((report) => String(report.month)).join(', ')}`);
      }
    } catch (error) {
      // A failed run must not take the server down; the next day tries again.
      this.logger.error('Could not open the current month', error);
    }
  }
}
