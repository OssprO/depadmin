import { beforeEach, describe, expect, it } from 'vitest';
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import {
  type Actor,
  LocalDate,
  Money,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { GetRates } from '../../settings/application/index.js';
import { InMemoryRateSettingsRepository } from '../../settings/application/testing.js';
import { RateSettings } from '../../settings/domain/index.js';
import { Charge } from '../domain/index.js';
import { ChargeShiftSkipPenalties, WithdrawShiftSkipPenalties } from './shift-skip-penalties.js';
import { InMemoryChargeRepository } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const u502 = UnitNumber.of(502);
const admin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };

describe('shift skip penalties', () => {
  let charges: InMemoryChargeRepository;
  let audit: RecordingAuditTrail;
  let charge: ChargeShiftSkipPenalties;
  let withdraw: WithdrawShiftSkipPenalties;

  beforeEach(() => {
    charges = new InMemoryChargeRepository();
    const unitOfWork = new FakeUnitOfWork();
    audit = new RecordingAuditTrail(unitOfWork);
    // The penalty goes up to $600 from November.
    const settings = RateSettings.startingOn(LocalDate.of(2026, 8, 1)).change('shiftSkipPenalty', {
      effectiveFrom: LocalDate.of(2026, 11, 1),
      amount: Money.ofPesos(600),
    });
    const rates = new GetRates(new InMemoryRateSettingsRepository(settings));
    charge = new ChargeShiftSkipPenalties(charges, unitOfWork, audit, rates);
    withdraw = new WithdrawShiftSkipPenalties(charges, unitOfWork, audit);
  });

  it('charges one penalty per skipped month, at that month’s rate, and audits each', async () => {
    await charge.execute(admin, u502, [m('2026-10'), m('2026-11')]);

    expect(charges.summary()).toEqual([
      '502:2026-10:SHIFT_SKIP_PENALTY 50000',
      '502:2026-11:SHIFT_SKIP_PENALTY 60000',
    ]);
    expect(audit.entries[0]?.change).toEqual({
      action: 'CHARGE_ADDED',
      entity: 'charge',
      entityId: '502:2026-10:SHIFT_SKIP_PENALTY',
      entityLabel: '502 · 2026-10',
      changes: [
        { field: 'unit', before: null, after: 502 },
        { field: 'month', before: null, after: '2026-10' },
        { field: 'type', before: null, after: 'SHIFT_SKIP_PENALTY' },
        { field: 'amount', before: null, after: 50000 },
      ],
    });
    expect(audit.actions).toEqual(['CHARGE_ADDED', 'CHARGE_ADDED']);
  });

  it('withdraws only the penalties of the given months', async () => {
    await charge.execute(admin, u502, [m('2026-10'), m('2026-11')]);
    await charges.save([Charge.create(u502, m('2026-10'), 'MAINTENANCE_FEE', Money.ofPesos(700))]);

    await withdraw.execute(admin, u502, [m('2026-10')]);

    expect(charges.summary()).toEqual([
      '502:2026-10:MAINTENANCE_FEE 70000',
      '502:2026-11:SHIFT_SKIP_PENALTY 60000',
    ]);
    expect(audit.entries.at(-1)?.change).toMatchObject({
      action: 'CHARGE_REMOVED',
      entityId: '502:2026-10:SHIFT_SKIP_PENALTY',
      changes: expect.arrayContaining([{ field: 'amount', before: 50000, after: null }]) as unknown,
    });
  });
});
