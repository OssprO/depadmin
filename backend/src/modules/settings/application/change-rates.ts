import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  AUDIT_TRAIL,
  type AuditTrail,
  CLOCK,
  type Clock,
  ConflictError,
  creationOf,
  LocalDate,
  type Money,
  MONTH_LEDGER,
  type MonthLedger,
  removalOf,
  SHIFT_ROSTER,
  type ShiftRoster,
  UNIT_OF_WORK,
  type UnitOfWork,
  ValidationError,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  RATE_SETTINGS_REPOSITORY,
  rateAgreement,
  type RateName,
  type RateSettings,
  type RateSettingsRepository,
} from '../domain/index.js';
import { RATE_CHANGE_AUDIT, RateAuditAction, type RateChangeEntry } from './rate-audit.js';

/**
 * The first month a change can apply from: the current one if it has not opened yet, else
 * the next. Opening a month charges its fees with the rates in force, and the past is never
 * rewritten. Months open in order and never ahead of time, so one step is enough.
 */
export async function firstChangeableMonth(
  ledger: MonthLedger,
  today: YearMonth,
): Promise<YearMonth> {
  return (await ledger.statusOf(today)) === 'NOT_OPENED' ? today : today.next();
}

export function requireSettings(settings: RateSettings | null): RateSettings {
  if (!settings) {
    throw new ConflictError('RATES_NOT_CONFIGURED', 'The rates have not been configured');
  }
  return settings;
}

export interface ChangeRateCommand {
  readonly rate: RateName;
  /** The first month charged with the new amount. */
  readonly from: YearMonth;
  readonly amount: Money;
  /** The assembly that agreed it: when, and what was agreed. */
  readonly agreedOn: LocalDate;
  readonly agreement: string;
}

/**
 * Who changes the rates, and from when (ADR-0031). The building decides its rates by vote;
 * the shift administrator records what was agreed, and the superadmin, an auxiliary, does
 * not. From phase 27 the vote happens in the app and applies the change itself.
 */
abstract class RateDecision {
  protected readonly policy = new WriteAccessPolicy();

  constructor(
    protected readonly settings: RateSettingsRepository,
    protected readonly unitOfWork: UnitOfWork,
    protected readonly audit: AuditTrail,
    protected readonly clock: Clock,
    protected readonly ledger: MonthLedger,
    private readonly roster: ShiftRoster,
  ) {}

  /** Checks the actor holds the shift; returns today. */
  protected async governing(actor: Actor): Promise<LocalDate> {
    const today = this.clock.today();
    const responsibility = await this.roster.responsibilityFor(today.yearMonth);
    this.policy.assertGoverns({ actor, today, responsibility });
    return today;
  }

  /** Inside the unit of work, after `lock`: the month has not opened and will not meanwhile. */
  protected async assertNotOpened(month: YearMonth, today: LocalDate): Promise<void> {
    const first = await firstChangeableMonth(this.ledger, today.yearMonth);
    if (month.isBefore(first)) {
      throw new ConflictError(
        'RATE_CHANGE_TOO_EARLY',
        `${month} has opened or is past; a change applies from ${first} on`,
      );
    }
  }
}

/** A new value of one rate, from a month that has not opened yet, audited. */
@Injectable()
export class ChangeRate extends RateDecision {
  constructor(
    @Inject(RATE_SETTINGS_REPOSITORY) settings: RateSettingsRepository,
    @Inject(UNIT_OF_WORK) unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) audit: AuditTrail,
    @Inject(CLOCK) clock: Clock,
    @Inject(MONTH_LEDGER) ledger: MonthLedger,
    @Inject(SHIFT_ROSTER) roster: ShiftRoster,
  ) {
    super(settings, unitOfWork, audit, clock, ledger, roster);
  }

  async execute(actor: Actor, command: ChangeRateCommand): Promise<RateChangeEntry> {
    const today = await this.governing(actor);
    if (command.agreedOn.isAfter(today)) {
      throw new ValidationError('RATE_AGREEMENT_INVALID', 'The agreement cannot be in the future');
    }
    const entry: RateChangeEntry = {
      rate: command.rate,
      effectiveFrom: LocalDate.firstOf(command.from),
      amount: command.amount,
      agreement: rateAgreement(command.agreedOn, command.agreement),
    };
    return this.unitOfWork.run(async () => {
      await this.settings.lock();
      await this.assertNotOpened(command.from, today);
      const settings = requireSettings(await this.settings.load());
      await this.settings.save(settings.change(entry.rate, entry));
      await this.audit.record(
        actor,
        creationOf(RATE_CHANGE_AUDIT, RateAuditAction.SCHEDULED, entry),
      );
      return entry;
    });
  }
}

/** Takes back a change whose month has not opened yet, e.g. one captured by mistake. */
@Injectable()
export class WithdrawRateChange extends RateDecision {
  constructor(
    @Inject(RATE_SETTINGS_REPOSITORY) settings: RateSettingsRepository,
    @Inject(UNIT_OF_WORK) unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) audit: AuditTrail,
    @Inject(CLOCK) clock: Clock,
    @Inject(MONTH_LEDGER) ledger: MonthLedger,
    @Inject(SHIFT_ROSTER) roster: ShiftRoster,
  ) {
    super(settings, unitOfWork, audit, clock, ledger, roster);
  }

  async execute(actor: Actor, rate: RateName, from: YearMonth): Promise<void> {
    const today = await this.governing(actor);
    const effectiveFrom = LocalDate.firstOf(from);
    await this.unitOfWork.run(async () => {
      await this.settings.lock();
      const settings = requireSettings(await this.settings.load());
      const withdrawn = settings.withdraw(rate, effectiveFrom);
      await this.assertNotOpened(from, today);
      const change = settings.historyOf(rate).find((c) => c.effectiveFrom.equals(effectiveFrom))!;
      await this.settings.save(withdrawn);
      await this.audit.record(
        actor,
        removalOf(RATE_CHANGE_AUDIT, RateAuditAction.WITHDRAWN, { rate, ...change }),
      );
    });
  }
}
