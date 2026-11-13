import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BUILDING_TIME_ZONE } from '../../../platform/clock/system-clock.js';
import { JobRunner } from '../../../platform/jobs/job-runner.js';
import { OpenCurrentMonth } from '../application/index.js';

/**
 * A driving adapter, like a controller, but triggered by the clock: every day just after
 * midnight in the building, it opens the month if nobody did. It runs daily, not only on the
 * 1st, so a day the server was down is caught up the next one.
 */
@Injectable()
export class OpenCurrentMonthJob {
  private readonly logger = new Logger(OpenCurrentMonthJob.name);

  constructor(
    private readonly openCurrentMonth: OpenCurrentMonth,
    private readonly jobs: JobRunner,
  ) {}

  @Cron('5 0 * * *', { name: 'open-current-month', timeZone: BUILDING_TIME_ZONE })
  run(): Promise<void> {
    return this.jobs.run(
      'open-current-month',
      this.logger,
      'Could not open the current month',
      async () => {
        const opened = await this.openCurrentMonth.execute();
        return opened.length > 0
          ? `Opened ${opened.map((report) => String(report.month)).join(', ')}`
          : null;
      },
    );
  }
}
