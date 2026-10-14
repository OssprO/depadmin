import type { Logger } from '@nestjs/common';

/**
 * Runs one scheduled task: skipped when jobs are turned off (tests), logged when it did
 * something, and never thrown out of the scheduler, so a failure waits for the next run.
 */
export async function runJob(
  logger: Logger,
  enabled: boolean,
  failure: string,
  task: () => Promise<string | null>,
): Promise<void> {
  if (!enabled) return;
  try {
    const done = await task();
    if (done) logger.log(done);
  } catch (error) {
    logger.error(failure, error);
  }
}
