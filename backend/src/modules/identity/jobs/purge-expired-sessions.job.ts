import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BUILDING_TIME_ZONE } from '../../../platform/clock/system-clock.js';
import type { Env } from '../../../platform/config/env.js';
import { runJob } from '../../../platform/jobs/run-job.js';
import { PurgeExpiredSessions } from '../application/index.js';

/** Every night, the expired refresh tokens go. */
@Injectable()
export class PurgeExpiredSessionsJob {
  private readonly logger = new Logger(PurgeExpiredSessionsJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly purge: PurgeExpiredSessions,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true });
  }

  @Cron('30 3 * * *', { name: 'purge-expired-sessions', timeZone: BUILDING_TIME_ZONE })
  run(): Promise<void> {
    return runJob(this.logger, this.enabled, 'Could not purge expired sessions', async () => {
      const deleted = await this.purge.execute();
      return deleted > 0 ? `Deleted ${deleted} expired refresh tokens` : null;
    });
  }
}
