import { type LocalDate, Money } from '../../../shared-kernel/index.js';
import { type RateChange, RateTimeline } from './rate-timeline.js';

export type RateName = 'maintenanceFee' | 'cleaningPerVisit' | 'garbageWeekly' | 'shiftSkipPenalty';

/** The rates in force on one date. */
export type Rates = Readonly<Record<RateName, Money>>;

/** Values observed in the current reports (spec 4.2 to 4.4). */
export const INITIAL_RATES: Rates = {
  maintenanceFee: Money.ofPesos(700),
  cleaningPerVisit: Money.ofPesos(270),
  garbageWeekly: Money.ofPesos(150),
  // The $1,200 of the spec is this fine plus the regular $700 fee, which is charged anyway.
  shiftSkipPenalty: Money.ofPesos(500),
};

/** The building's configurable rates, each with its own history. */
export class RateSettings {
  private constructor(private readonly timelines: Readonly<Record<RateName, RateTimeline>>) {}

  /** Starts every rate at `INITIAL_RATES` (or the given overrides) from `effectiveFrom`. */
  static startingOn(effectiveFrom: LocalDate, overrides: Partial<Rates> = {}): RateSettings {
    const initial = { ...INITIAL_RATES, ...overrides };
    const timeline = (name: RateName) =>
      RateTimeline.of([{ effectiveFrom, amount: initial[name] }]);
    return new RateSettings({
      maintenanceFee: timeline('maintenanceFee'),
      cleaningPerVisit: timeline('cleaningPerVisit'),
      garbageWeekly: timeline('garbageWeekly'),
      shiftSkipPenalty: timeline('shiftSkipPenalty'),
    });
  }

  static restore(history: Readonly<Record<RateName, readonly RateChange[]>>): RateSettings {
    return new RateSettings({
      maintenanceFee: RateTimeline.of(history.maintenanceFee),
      cleaningPerVisit: RateTimeline.of(history.cleaningPerVisit),
      garbageWeekly: RateTimeline.of(history.garbageWeekly),
      shiftSkipPenalty: RateTimeline.of(history.shiftSkipPenalty),
    });
  }

  ratesOn(date: LocalDate): Rates {
    return {
      maintenanceFee: this.timelines.maintenanceFee.amountOn(date),
      cleaningPerVisit: this.timelines.cleaningPerVisit.amountOn(date),
      garbageWeekly: this.timelines.garbageWeekly.amountOn(date),
      shiftSkipPenalty: this.timelines.shiftSkipPenalty.amountOn(date),
    };
  }

  historyOf(name: RateName): readonly RateChange[] {
    return this.timelines[name].history;
  }

  change(name: RateName, change: RateChange): RateSettings {
    return new RateSettings({ ...this.timelines, [name]: this.timelines[name].withChange(change) });
  }
}
