import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import {
  type CreateReaderRequest,
  createReaderRequestSchema,
  type CreateReaderResponse,
  type PasswordResetResponse,
  type UserAccessRequest,
  userAccessRequestSchema,
  type UserSummary,
} from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import {
  type Actor,
  CLOCK,
  type Clock,
  LocalDate,
  UnitNumber,
} from '../../../shared-kernel/index.js';
import {
  ChangeUserAccess,
  CreateReader,
  DisableUser,
  EnableUser,
  ListUsers,
  ResetPassword,
} from '../application/index.js';
import type { UserAccess } from '../domain/index.js';
import { toUserSummary } from './presenters.js';

const idParam = new ZodValidationPipe(z.uuid());

function toAccess(body: UserAccessRequest): UserAccess {
  return {
    unit: body.unit === null ? null : UnitNumber.of(body.unit),
    expiresOn: body.expiresOn === null ? null : LocalDate.parse(body.expiresOn),
  };
}

/** User management. Only the superadmin gets through; the use cases check it. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsers,
    private readonly resetPassword: ResetPassword,
    private readonly createReader: CreateReader,
    private readonly changeAccess: ChangeUserAccess,
    private readonly disableUser: DisableUser,
    private readonly enableUser: EnableUser,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<UserSummary[]> {
    const today = this.clock.today();
    return (await this.listUsers.execute(actor)).map((user) => toUserSummary(user, today));
  }

  /** A read-only user; the temporary password is shown once, to hand over. */
  @Post()
  @Header('Cache-Control', 'no-store')
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createReaderRequestSchema)) body: CreateReaderRequest,
  ): Promise<CreateReaderResponse> {
    const { user, temporaryPassword } = await this.createReader.execute(actor, {
      username: body.username,
      ...toAccess(body),
    });
    return { user: toUserSummary(user, this.clock.today()), temporaryPassword };
  }

  @Put(':id/access')
  async access(
    @CurrentActor() actor: Actor,
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(userAccessRequestSchema)) body: UserAccessRequest,
  ): Promise<UserSummary> {
    const user = await this.changeAccess.execute(actor, id, toAccess(body));
    return toUserSummary(user, this.clock.today());
  }

  @Post(':id/disable')
  @HttpCode(200)
  async disable(
    @CurrentActor() actor: Actor,
    @Param('id', idParam) id: string,
  ): Promise<UserSummary> {
    return toUserSummary(await this.disableUser.execute(actor, id), this.clock.today());
  }

  @Post(':id/enable')
  @HttpCode(200)
  async enable(
    @CurrentActor() actor: Actor,
    @Param('id', idParam) id: string,
  ): Promise<UserSummary> {
    return toUserSummary(await this.enableUser.execute(actor, id), this.clock.today());
  }

  @Post(':id/password-reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  reset(
    @CurrentActor() actor: Actor,
    @Param('id', idParam) id: string,
  ): Promise<PasswordResetResponse> {
    return this.resetPassword.execute(actor, id);
  }
}
