import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type MarkNoticesReadRequest,
  markNoticesReadRequestSchema,
  type Notice as NoticeValue,
  type NoticeParams,
  noticeParamsSchema,
  type NoticesResponse,
  type PublishNoticeRequest,
  publishNoticeRequestSchema,
} from '@depadmin/shared';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, LocalDate } from '../../../shared-kernel/index.js';
import {
  ListNotices,
  MarkNoticesRead,
  type NoticeEntry,
  PublishNotice,
  WithdrawNotice,
} from '../application/index.js';

const toNotice = ({ notice, current, read }: NoticeEntry): NoticeValue => ({
  id: notice.id,
  title: notice.title,
  body: notice.body,
  expiresOn: notice.expiresOn && String(notice.expiresOn),
  publishedAt: String(notice.publishedAt),
  author:
    notice.author.role === 'OWNER'
      ? { role: 'OWNER', unit: notice.author.unit.value }
      : { role: 'SUPERADMIN' },
  current,
  read,
});

/** The building's notices (phase 25, ADR-0034). */
@Controller('notices')
export class NoticesController {
  constructor(
    private readonly listNotices: ListNotices,
    private readonly publishNotice: PublishNotice,
    private readonly withdrawNotice: WithdrawNotice,
    private readonly markNoticesRead: MarkNoticesRead,
  ) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<NoticesResponse> {
    const { canPublish, notices, unread } = await this.listNotices.execute(actor);
    return { canPublish, notices: notices.map(toNotice), unread };
  }

  @Post()
  async publish(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(publishNoticeRequestSchema)) body: PublishNoticeRequest,
  ): Promise<NoticeValue> {
    const notice = await this.publishNotice.execute(actor, {
      title: body.title,
      body: body.body,
      expiresOn: body.expiresOn === null ? null : LocalDate.parse(body.expiresOn),
    });
    return toNotice({ notice, current: true, read: true });
  }

  /** The notices the caller saw. */
  @Post('read')
  @HttpCode(204)
  async read(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(markNoticesReadRequestSchema)) body: MarkNoticesReadRequest,
  ): Promise<void> {
    await this.markNoticesRead.execute(actor, body.ids);
  }

  @Delete(':id')
  @HttpCode(204)
  async withdraw(
    @CurrentActor() actor: Actor,
    @Param(new ZodValidationPipe(noticeParamsSchema)) params: NoticeParams,
  ): Promise<void> {
    await this.withdrawNotice.execute(actor, params.id);
  }
}
