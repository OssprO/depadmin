import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type UnsubscribeParams,
  unsubscribeParamsSchema,
  type UnsubscribeResponse,
} from '@depadmin/shared';
import { Public } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { Unsubscribe } from '../application/index.js';

/** Plenty for a person; a signature cannot be guessed at any rate anyway. */
const UNSUBSCRIBES_PER_MINUTE = 10;

/**
 * `POST /api/email/unsubscribe/:token` (ADR-0034): the link at the foot of an optional email,
 * without a session. The app's page posts here when its button is pressed, and so do mail
 * apps for their own button (RFC 8058, `List-Unsubscribe=One-Click` in the body, which is
 * not needed). Only a POST stops anything: the scanners that open links in emails do not.
 */
@Public()
@Controller('email/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly unsubscribe: Unsubscribe) {}

  @Post(':token')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: UNSUBSCRIBES_PER_MINUTE, ttl: 60_000 } })
  async stop(
    @Param(new ZodValidationPipe(unsubscribeParamsSchema)) params: UnsubscribeParams,
  ): Promise<UnsubscribeResponse> {
    const { topic, accounts } = await this.unsubscribe.execute(params.token);
    return { topic, accounts: [...accounts] };
  }
}
