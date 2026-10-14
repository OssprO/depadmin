import { Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import type { PasswordResetResponse, UserSummary } from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import type { Actor } from '../../../shared-kernel/index.js';
import { ListUsers, ResetPassword } from '../application/index.js';
import { toUserSummary } from './presenters.js';

/** User management. Only the superadmin gets through; the use cases check it. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsers,
    private readonly resetPassword: ResetPassword,
  ) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<UserSummary[]> {
    return (await this.listUsers.execute(actor)).map(toUserSummary);
  }

  @Post(':id/password-reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  reset(
    @CurrentActor() actor: Actor,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<PasswordResetResponse> {
    return this.resetPassword.execute(actor, id);
  }
}
