import {
  type Actor,
  ConflictError,
  type Instant,
  type LocalDate,
  type ShiftResponsibility,
  type UnitNumber,
  ValidationError,
  WriteAccessPolicy,
} from '../../../shared-kernel/index.js';

export const NOTICE_TITLE_MAX_LENGTH = 100;
export const NOTICE_BODY_MAX_LENGTH = 2000;

/**
 * Who published a notice, as they were then: the shift administrator, by depto, or the
 * superadmin. A reader never publishes.
 */
export type NoticeAuthor =
  | { readonly role: 'OWNER'; readonly userId: string; readonly unit: UnitNumber }
  | { readonly role: 'SUPERADMIN'; readonly userId: string };

export interface NoticeContent {
  readonly title: string;
  /** Plain text; its line breaks are kept. */
  readonly body: string;
  /** Its last day among the current ones; null for none. */
  readonly expiresOn: LocalDate | null;
}

export interface NoticeProps extends NoticeContent {
  readonly id: string;
  readonly author: NoticeAuthor;
  readonly publishedAt: Instant;
  readonly withdrawn: { readonly at: Instant; readonly by: string } | null;
}

const policy = new WriteAccessPolicy();

/**
 * Who speaks for the building in a notice (ADR-0034): the shift administrator, whose the
 * building's decisions are (ADR-0031), and the superadmin, as the administrator asked. A
 * notice tells; it decides nothing, so the auxiliary may write one too.
 */
export function speaksForBuilding(
  actor: Actor,
  today: LocalDate,
  responsibility: ShiftResponsibility,
): boolean {
  return actor.role === 'SUPERADMIN' || policy.governs({ actor, today, responsibility });
}

/** `READ_ONLY` for a reader, `SHIFT_ADMIN_ONLY` for an owner without the shift. */
export function assertSpeaksForBuilding(
  actor: Actor,
  today: LocalDate,
  responsibility: ShiftResponsibility,
): NoticeAuthor {
  if (actor.role === 'SUPERADMIN') return actor;
  policy.assertGoverns({ actor, today, responsibility });
  // assertGoverns lets only an owner through.
  return actor as Extract<Actor, { role: 'OWNER' }>;
}

/**
 * A notice for everyone (phase 25, ADR-0034). It is never edited, because its email already
 * went out: a mistake is withdrawn and published again. It is current until its last day,
 * and withdrawing it hides it from everyone; the audit log keeps both.
 */
export class Notice {
  private constructor(private props: NoticeProps) {}

  static publish(
    id: string,
    content: NoticeContent,
    author: NoticeAuthor,
    today: LocalDate,
    now: Instant,
  ): Notice {
    const title = content.title.trim();
    const body = content.body.replace(/\r\n?/g, '\n').trim();
    if (title.length === 0 || title.length > NOTICE_TITLE_MAX_LENGTH) {
      throw new ValidationError('NOTICE_TITLE_INVALID', `A title has 1 to 100 characters`);
    }
    if (body.length === 0 || body.length > NOTICE_BODY_MAX_LENGTH) {
      throw new ValidationError('NOTICE_BODY_INVALID', `A notice has 1 to 2000 characters`);
    }
    if (content.expiresOn?.isBefore(today)) {
      throw new ValidationError('NOTICE_EXPIRY_PAST', `${content.expiresOn} is before ${today}`);
    }
    return new Notice({
      id,
      title,
      body,
      expiresOn: content.expiresOn,
      author,
      publishedAt: now,
      withdrawn: null,
    });
  }

  static restore(props: NoticeProps): Notice {
    return new Notice(props);
  }

  get id(): string {
    return this.props.id;
  }

  get title(): string {
    return this.props.title;
  }

  get body(): string {
    return this.props.body;
  }

  /** Its lines with something written, as an email's paragraphs. */
  get lines(): string[] {
    return this.props.body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  get expiresOn(): LocalDate | null {
    return this.props.expiresOn;
  }

  get author(): NoticeAuthor {
    return this.props.author;
  }

  get publishedAt(): Instant {
    return this.props.publishedAt;
  }

  get withdrawn(): NoticeProps['withdrawn'] {
    return this.props.withdrawn;
  }

  /** Published, not withdrawn and not past its last day. */
  isCurrentOn(today: LocalDate): boolean {
    return !this.props.withdrawn && !(this.props.expiresOn && today.isAfter(this.props.expiresOn));
  }

  withdraw(by: string, now: Instant): void {
    if (this.props.withdrawn) {
      throw new ConflictError('NOTICE_WITHDRAWN', `Notice ${this.id} was withdrawn already`);
    }
    this.props = { ...this.props, withdrawn: { at: now, by } };
  }
}
