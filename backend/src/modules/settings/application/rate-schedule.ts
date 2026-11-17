import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  CLOCK,
  type Clock,
  type Money,
  MONTH_LEDGER,
  type MonthLedger,
  SHIFT_ROSTER,
  type ShiftRoster,
  WriteAccessPolicy,
  type YearMonth,
} from '../../../shared-kernel/index.js';
import {
  RATE_NAMES,
  RATE_SETTINGS_REPOSITORY,
  type RateChange,
  type RateName,
  type RateSettingsRepository,
} from '../domain/index.js';
import { firstChangeableMonth, requireSettings } from './change-rates.js';

export interface ScheduledChange extends RateChange {
  /** Not in force yet. */
  readonly upcoming: boolean;
  /** Whether the actor can take it back now: its month has not opened. */
  readonly withdrawable: boolean;
}

export interface RateSchedule {
  readonly rate: RateName;
  /** In force today; null before its first value. */
  readonly current: Money | null;
  /** Every value, oldest first, including those scheduled ahead. */
  readonly history: readonly ScheduledChange[];
  /** The first month a new change of this rate can apply from. */
  readonly earliestMonth: YearMonth;
}

export interface RateScheduleView {
  /** Whether the actor can change the rates now: the shift administrator. */
  readonly canChange: boolean;
  readonly rates: readonly RateSchedule[];
}

/** The rates, their history and what is scheduled. Everyone may read them. */
@Injectable()
export class GetRateSchedule {
  private readonly policy = new WriteAccessPolicy();

  constructor(
    @Inject(RATE_SETTINGS_REPOSITORY) private readonly settings: RateSettingsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MONTH_LEDGER) private readonly ledger: MonthLedger,
    @Inject(SHIFT_ROSTER) private readonly roster: ShiftRoster,
  ) {}

  async execute(actor: Actor): Promise<RateScheduleView> {
    const today = this.clock.today();
    const [settings, first, responsibility] = await Promise.all([
      this.settings.load().then(requireSettings),
      firstChangeableMonth(this.ledger, today.yearMonth),
      this.roster.responsibilityFor(today.yearMonth),
    ]);
    const canChange = this.policy.governs({ actor, today, responsibility });
    return {
      canChange,
      rates: RATE_NAMES.map((rate) => {
        const history = settings.historyOf(rate);
        const latest = history.at(-1)!.effectiveFrom.yearMonth;
        const current = history.findLast((c) => !c.effectiveFrom.isAfter(today));
        return {
          rate,
          current: current?.amount ?? null,
          // Mirrors WithdrawRateChange: never the first value, nor one whose month opened.
          history: history.map((change, i) => ({
            ...change,
            upcoming: change.effectiveFrom.isAfter(today),
            withdrawable: canChange && i > 0 && !change.effectiveFrom.yearMonth.isBefore(first),
          })),
          earliestMonth: latest.isBefore(first) ? first : latest.next(),
        };
      }),
    };
  }
}
