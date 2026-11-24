import { Body, Controller, Headers, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type ClientError, clientErrorSchema } from '@depadmin/shared';
import { Public } from '../http/auth.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';

/**
 * Reports from one IP a minute. Generous because the neighbours on the building's Wi-Fi
 * share one public IP: a phone stuck in a loop must not silence everybody else's errors.
 */
export const CLIENT_ERRORS_PER_MINUTE = 30;
const MAX_USER_AGENT_LENGTH = 200;

/**
 * `POST /api/client-errors`: the errors that happen in the neighbours' browsers, which
 * otherwise only their phone's console sees, go to the API's log (ADR-0030). Public, so an
 * error on the login screen arrives too.
 */
@Public()
@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger('BrowserError');

  @Post()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: CLIENT_ERRORS_PER_MINUTE, ttl: 60_000 } })
  report(
    @Body(new ZodValidationPipe(clientErrorSchema)) error: ClientError,
    @Headers('user-agent') userAgent: string | undefined,
  ): void {
    this.logger.warn(
      JSON.stringify({ ...error, userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH) }),
    );
  }
}
