import { Injectable, type Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** How long a report to healthchecks.io may take before the job gives up on it. */
export const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_REPORT_LENGTH = 1000;

/**
 * Runs one scheduled task: skipped when jobs are turned off (tests), logged when it did
 * something, and never thrown out of the scheduler, so a failure waits for the next run.
 *
 * It also reports each run to healthchecks.io under the job's name (ADR-0030), which emails
 * the superadmin when a run fails or doesn't arrive in time: a job that stops running is as
 * loud as one that fails. Reporting is best effort and never fails the job.
 */
@Injectable()
export class JobRunner {
  private readonly enabled: boolean;
  private readonly pingUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true });
    this.pingUrl = config.get('HEALTHCHECKS_PING_URL', { infer: true });
  }

  async run(
    name: string,
    logger: Logger,
    failure: string,
    task: () => Promise<string | null>,
  ): Promise<void> {
    if (!this.enabled) return;
    let done: string | null;
    try {
      done = await task();
    } catch (error) {
      logger.error(failure, error);
      await this.report(name, logger, true, `${failure}: ${String(error)}`);
      return;
    }
    if (done) logger.log(done);
    await this.report(name, logger, false, done ?? '');
  }

  private async report(name: string, logger: Logger, failed: boolean, text: string) {
    if (!this.pingUrl) return;
    const url = `${this.pingUrl}/${name}${failed ? '/fail' : ''}?create=1`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: text.slice(0, MAX_REPORT_LENGTH),
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
      });
      if (!response.ok) logger.warn(`healthchecks.io answered ${response.status} for ${name}`);
    } catch (error) {
      logger.warn(`Could not report ${name} to healthchecks.io: ${String(error)}`);
    }
  }
}
