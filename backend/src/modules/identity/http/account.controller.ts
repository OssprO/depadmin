import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type AccountEmail,
  type ChangeEmailRequest,
  changeEmailRequestSchema,
  type EmailLinkRequest,
  emailLinkRequestSchema,
  type EmailTopicParams,
  emailTopicParamsSchema,
  type EmailTopicRequest,
  emailTopicRequestSchema,
} from '@depadmin/shared';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import type { Actor } from '../../../shared-kernel/index.js';
import {
  ChangeEmail,
  ChangeEmailTopic,
  ConfirmEmail,
  GetCurrentUser,
} from '../application/index.js';
import { toAccountEmail } from './presenters.js';

/** The signed-in user's own email, in _Mi cuenta_ (ADR-0033), and what it gets (ADR-0034). */
@Controller('account/email')
export class AccountController {
  constructor(
    private readonly currentUser: GetCurrentUser,
    private readonly changeEmail: ChangeEmail,
    private readonly confirmEmail: ConfirmEmail,
    private readonly changeTopic: ChangeEmailTopic,
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

  /** Turns an optional email on or off; the security notices always go out. */
  @Put('topics/:topic')
  async topic(
    @CurrentActor() actor: Actor,
    @Param(new ZodValidationPipe(emailTopicParamsSchema)) params: EmailTopicParams,
    @Body(new ZodValidationPipe(emailTopicRequestSchema)) body: EmailTopicRequest,
  ): Promise<AccountEmail> {
    return toAccountEmail(await this.changeTopic.execute(actor, params.topic, body.receive));
  }
}
