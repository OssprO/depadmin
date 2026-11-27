import { z } from 'zod';
import { localDateSchema } from './units.js';

// Notices (phase 25, ADR-0034): what the shift administrator or the superadmin tells everyone,
// in the app and by email.

export const NOTICE_TITLE_MAX_LENGTH = 100;
export const NOTICE_BODY_MAX_LENGTH = 2000;

/** `POST /api/notices`. The text is plain; its line breaks are kept. */
export const publishNoticeRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Escribe un título')
    .max(NOTICE_TITLE_MAX_LENGTH, `Máximo ${NOTICE_TITLE_MAX_LENGTH} caracteres`),
  body: z
    .string()
    .trim()
    .min(1, 'Escribe el aviso')
    .max(NOTICE_BODY_MAX_LENGTH, `Máximo ${NOTICE_BODY_MAX_LENGTH} caracteres`),
  /** Its last day among the current ones; null for none. */
  expiresOn: localDateSchema.nullable(),
});
export type PublishNoticeRequest = z.infer<typeof publishNoticeRequestSchema>;

export const noticeSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  expiresOn: localDateSchema.nullable(),
  publishedAt: z.iso.datetime(),
  /** The shift administrator (an owner, by depto) or the superadmin. */
  author: z.discriminatedUnion('role', [
    z.object({ role: z.literal('OWNER'), unit: z.number().int() }),
    z.object({ role: z.literal('SUPERADMIN') }),
  ]),
  /** Not past its last day. */
  current: z.boolean(),
  /** By the account asking. */
  read: z.boolean(),
});
export type Notice = z.infer<typeof noticeSchema>;

/** `GET /api/notices`: every notice not withdrawn, newest first. */
export const noticesResponseSchema = z.object({
  /** Whether the caller can publish and withdraw now: the shift administrator or the superadmin. */
  canPublish: z.boolean(),
  notices: z.array(noticeSchema),
  /** Current notices the caller has not read. */
  unread: z.number().int().nonnegative(),
});
export type NoticesResponse = z.infer<typeof noticesResponseSchema>;

/** `POST /api/notices/read`: the notices the caller has seen. */
export const markNoticesReadRequestSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });
export type MarkNoticesReadRequest = z.infer<typeof markNoticesReadRequestSchema>;

/** `DELETE /api/notices/:id`. */
export const noticeParamsSchema = z.object({ id: z.uuid() });
export type NoticeParams = z.infer<typeof noticeParamsSchema>;
