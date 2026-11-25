import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BUILDING_TIME_ZONE } from '../../../platform/clock/system-clock.js';
import { JobRunner } from '../../../platform/jobs/job-runner.js';
import { DeliverEmails, describeDelivery } from '../application/index.js';

/**
 * Every 10 minutes, what the courier could not send right away: retries, and what was left
 * when the API restarted. It reports to healthchecks.io as failed when an email could not
 * go out or the daily limit held some back, so the superadmin hears about it.
 */
@Injectable()
export class DeliverEmailsJob {
  private readonly logger = new Logger(DeliverEmailsJob.name);

  constructor(
    private readonly deliver: DeliverEmails,
    private readonly jobs: JobRunner,
  ) {}

  @Cron('*/10 * * * *', { name: 'deliver-emails', timeZone: BUILDING_TIME_ZONE })
  run(): Promise<void> {
    return this.jobs.run('deliver-emails', this.logger, 'Could not deliver emails', async () => {
      const report = await this.deliver.execute();
      const done = describeDelivery(report);
      if (report.retrying || report.failed || report.limited) throw new Error(done ?? 'Emails');
      return done;
    });
  }
}
