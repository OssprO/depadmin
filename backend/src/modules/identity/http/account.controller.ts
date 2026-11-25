import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  type AccountEmail,
  type ChangeEmailRequest,
  changeEmailRequestSchema,
  type EmailLinkRequest,
  emailLinkRequestSchema,
} from '@depadmin/shared';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import type { Actor } from '../../../shared-kernel/index.js';
import { ChangeEmail, ConfirmEmail, GetCurrentUser } from '../application/index.js';
import { toAccountEmail } from './presenters.js';

/** The signed-in user's own email, in _Mi cuenta_ (ADR-0033). */
@Controller('account/email')
export class AccountController {
  constructor(
    private readonly currentUser: GetCurrentUser,
    private readonly changeEmail: ChangeEmail,
    private readonly confirmEmail: ConfirmEmail,
  ) {}

  @Get()
  async get(@CurrentActor() actor: Actor): Promise<AccountEmail> {
    return toAccountEmail(await this.currentUser.execute(actor));
  }

  /** A new address, or the one waiting again: a confirmation link goes to it. */
  @Put()
  async change(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(changeEmailRequestSchema)) body: ChangeEmailRequest,
  ): Promise<AccountEmail> {
    return toAccountEmail(await this.changeEmail.execute(actor, actor.userId, body.email));
  }

  @Delete()
  async remove(@CurrentActor() actor: Actor): Promise<AccountEmail> {
    return toAccountEmail(await this.changeEmail.execute(actor, actor.userId, null));
  }

  /** The link from the confirmation email; it needs a session of the same account. */
  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(emailLinkRequestSchema)) body: EmailLinkRequest,
  ): Promise<AccountEmail> {
    return toAccountEmail(await this.confirmEmail.execute(actor, body.token));
  }
}
