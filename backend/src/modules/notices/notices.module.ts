import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import {
  ListNotices,
  MarkNoticesRead,
  PublishNotice,
  WithdrawNotice,
} from './application/index.js';
import { NOTICE_REPOSITORY } from './domain/index.js';
import { NoticesController } from './http/notices.controller.js';
import { PrismaNoticeRepository } from './infrastructure/prisma-notice.repository.js';

/** Who holds the shift comes from the global `SHIFT_ROSTER`; who gets the emails, from identity. */
@Module({
  imports: [IdentityModule],
  controllers: [NoticesController],
  providers: [
    { provide: NOTICE_REPOSITORY, useClass: PrismaNoticeRepository },
    PublishNotice,
    WithdrawNotice,
    ListNotices,
    MarkNoticesRead,
  ],
})
export class NoticesModule {}
