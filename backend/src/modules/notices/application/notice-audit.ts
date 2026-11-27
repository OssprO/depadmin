import type { AuditSubject } from '../../../shared-kernel/index.js';
import type { Notice } from '../domain/index.js';

export const NoticeAuditAction = {
  PUBLISHED: 'NOTICE_PUBLISHED',
  WITHDRAWN: 'NOTICE_WITHDRAWN',
} as const;

/** A notice in the audit log: what it said stays there after it is withdrawn. */
export const NOTICE_AUDIT: AuditSubject<Notice> = {
  entity: 'notice',
  id: (notice) => notice.id,
  label: (notice) => notice.title,
  snapshot: (notice) => ({
    title: notice.title,
    body: notice.body,
    expiresOn: notice.expiresOn && String(notice.expiresOn),
    withdrawn: notice.withdrawn !== null,
  }),
};
