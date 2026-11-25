import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BUILDING_TIME_ZONE } from '../../../platform/clock/system-clock.js';
import { JobRunner } from '../../../platform/jobs/job-runner.js';
import { PurgeExpiredSessions } from '../application/index.js';

/** Every night, the expired refresh tokens and email links go. */
@Injectable()
export class PurgeExpiredSessionsJob {
  private readonly logger = new Logger(PurgeExpiredSessionsJob.name);

  constructor(
    private readonly purge: PurgeExpiredSessions,
    private readonly jobs: JobRunner,
  ) {}

  @Cron('30 3 * * *', { name: 'purge-expired-sessions', timeZone: BUILDING_TIME_ZONE })
  run(): Promise<void> {
    return this.jobs.run(
      'purge-expired-sessions',
      this.logger,
      'Could not purge expired sessions',
      async () => {
        const { refreshTokens, links } = await this.purge.execute();
        return refreshTokens + links > 0
          ? `Deleted ${refreshTokens} expired refresh tokens and ${links} expired email links`
          : null;
      },
    );
  }
}
