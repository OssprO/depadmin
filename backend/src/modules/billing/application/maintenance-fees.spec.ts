import { describe, expect, it } from 'vitest';
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import {
  type Actor,
  LocalDate,
  Money,
  UnitNumber,
  YearMonth,
  YearMonthRange,
} from '../../../shared-kernel/index.js';
import { initialRates } from '../../settings/application/testing.js';
import { ListUnits } from '../../units/application/index.js';
import { buildingWith } from '../../units/application/testing.js';
import { Charge } from '../domain/index.js';
import { GetAccountStatements } from './account-statements.js';
import { ChargeMaintenanceFees } from './maintenance-fees.js';
import { InMemoryChargeRepository } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const admin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };

function setup() {
  const charges = new InMemoryChargeRepository();
  const unitOfWork = new FakeUnitOfWork();
  const audit = new RecordingAuditTrail(unitOfWork);
  const units = new ListUnits(buildingWith({ 302: YearMonthRange.startingAt(m('2026-10')) }));
  const fees = new ChargeMaintenanceFees(charges, unitOfWork, audit, initialRates(), units);
  return { charges, audit, fees };
}

describe('ChargeMaintenanceFees', () => {
  it('charges the fee to every active depto, once', async () => {
    const { charges, audit, fees } = setup();

    const charged = await fees.execute(admin, m('2026-10'));
    await fees.execute(admin, m('2026-10'));

    expect(charged.map((c) => c.unit.value)).toEqual([101, 102, 201, 202, 301, 401, 402, 501, 502]);
    expect(charges.summary()).toHaveLength(9);
    expect(charges.summary()[0]).toBe('101:2026-10:MAINTENANCE_FEE 70000');
    expect(audit.actions).toEqual(Array(9).fill('CHARGE_ADDED'));
  });

  it('skips deptos already charged, e.g. after a partial run', async () => {
    const { charges, fees } = setup();
    await charges.save([
      Charge.create(UnitNumber.of(101), m('2026-09'), 'MAINTENANCE_FEE', Money.ofPesos(700)),
    ]);

    expect(await fees.execute(admin, m('2026-09'))).toHaveLength(9);
    expect(charges.summary()).toHaveLength(10);
  });
});

describe('GetAccountStatements', () => {
  it('builds each depto’s statement from its charges and the payments given', async () => {
    const { charges, fees } = setup();
    await fees.execute(admin, m('2026-09'));
    await fees.execute(admin, m('2026-10'));
    const u501 = UnitNumber.of(501);
    const payment = {
      id: 'p1',
      unit: u501,
      date: LocalDate.of(2026, 10, 3),
      amount: Money.ofPesos(1000),
    };
    const statements = new GetAccountStatements(charges);

    const statement = await statements.of(u501, [payment]);
    expect(statement.outstandingBalance).toEqual(Money.ofPesos(400));
    expect(statement.coverageOf('p1').map((c) => [String(c.month), c.settles])).toEqual([
      ['2026-09', true],
      ['2026-10', false],
    ]);
    const all = await statements.ofAll([payment]);
    expect(all.map((s) => s.unit.value)).toEqual(UnitNumber.all().map((u) => u.value));
    expect(all.find((s) => s.unit === u501)?.outstandingBalance).toEqual(Money.ofPesos(400));
    // 302 is inactive from October: only September's fee.
    expect(all.find((s) => s.unit.value === 302)?.outstandingBalance).toEqual(Money.ofPesos(700));
  });

  it('reports the accounts as they stood when a month ended', async () => {
    const { charges, fees } = setup();
    await fees.execute(admin, m('2026-09'));
    await fees.execute(admin, m('2026-10'));
    const u501 = UnitNumber.of(501);
    const pay = (id: string, date: LocalDate, pesos: number) => ({
      id,
      unit: u501,
      date,
      amount: Money.ofPesos(pesos),
    });
    // $1,000 in September (a $300 adelanto then), and $400 more in October.
    const payments = [
      pay('p1', LocalDate.of(2026, 9, 30), 1000),
      pay('p2', LocalDate.of(2026, 10, 1), 400),
    ];
    const statements = new GetAccountStatements(charges);

    const september = (await statements.ofAll(payments, m('2026-09'))).find((s) => s.unit === u501);
    expect([september?.outstandingBalance, september?.creditBalance]).toEqual([
      Money.ZERO,
      Money.ofPesos(300),
    ]);
    expect(september?.lines.map((line) => String(line.charge.month))).toEqual(['2026-09']);
    const now = (await statements.ofAll(payments)).find((s) => s.unit === u501);
    expect([now?.outstandingBalance, now?.creditBalance]).toEqual([Money.ZERO, Money.ZERO]);
  });
});
