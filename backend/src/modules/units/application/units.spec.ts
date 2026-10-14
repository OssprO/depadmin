import { beforeEach, describe, expect, it } from 'vitest';
import { FakeUnitOfWork, RecordingAuditTrail } from '../../../../test/support/audit-trail.js';
import { withCode } from '../../../../test/support/domain-error.js';
import { FakeMonthLedger } from '../../../../test/support/month-ledger.js';
import { type Actor, UnitNumber, YearMonth, YearMonthRange } from '../../../shared-kernel/index.js';
import { Unit } from '../domain/index.js';
import { ListUnits, UnitStatuses } from './list-units.js';
import { SetUnitStatus } from './set-unit-status.js';
import { InMemoryUnitRepository } from './testing.js';

const m = (text: string) => YearMonth.parse(text);
const u = (n: number) => UnitNumber.of(n);
const admin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };
const owner: Actor = { role: 'OWNER', userId: 'u-501', unit: u(501) };

describe('units', () => {
  let units: InMemoryUnitRepository;
  let audit: RecordingAuditTrail;
  let setStatus: SetUnitStatus;
  let ledger: FakeMonthLedger;

  beforeEach(() => {
    units = new InMemoryUnitRepository(UnitNumber.all().map((n) => Unit.create(n)));
    const unitOfWork = new FakeUnitOfWork();
    audit = new RecordingAuditTrail(unitOfWork);
    ledger = new FakeMonthLedger();
    setStatus = new SetUnitStatus(units, unitOfWork, audit, ledger);
  });

  describe('SetUnitStatus', () => {
    it('marks a depto inactive and active again, with an audit entry each time', async () => {
      await setStatus.execute(admin, { unit: u(302), active: false, from: m('2026-10') });
      await setStatus.execute(admin, { unit: u(302), active: true, from: m('2027-01') });

      const unit = (await units.findByNumber(u(302)))!;
      expect(unit.inactivePeriods.map(String)).toEqual(['2026-10..2026-12']);
      expect(
        audit.entries.map((e) => [e.change.action, e.change.entityLabel, e.change.changes]),
      ).toEqual([
        [
          'UNIT_DEACTIVATED',
          '302',
          [{ field: 'inactivePeriods', before: null, after: '2026-10..' }],
        ],
        [
          'UNIT_REACTIVATED',
          '302',
          [{ field: 'inactivePeriods', before: '2026-10..', after: '2026-10..2026-12' }],
        ],
      ]);
    });

    it('starts only in a month that has not been opened', async () => {
      ledger.set('2026-10', 'OPEN').set('2026-09', 'CLOSED');

      for (const from of ['2026-09', '2026-10']) {
        await expect(
          setStatus.execute(admin, { unit: u(302), active: false, from: m(from) }),
        ).rejects.toThrow(withCode('UNIT_STATUS_MONTH_OPENED'));
      }
      await setStatus.execute(admin, { unit: u(302), active: false, from: m('2026-11') });
    });

    it('is for the superadmin only', async () => {
      await expect(
        setStatus.execute(owner, { unit: u(302), active: false, from: m('2026-10') }),
      ).rejects.toThrow(withCode('SUPERADMIN_ONLY'));
    });

    it('reports domain conflicts and records nothing', async () => {
      await expect(
        setStatus.execute(admin, { unit: u(302), active: true, from: m('2026-10') }),
      ).rejects.toThrow(withCode('UNIT_NOT_INACTIVE'));
      expect(audit.entries).toEqual([]);
    });

    it('reports a depto missing from storage', async () => {
      const empty = new SetUnitStatus(
        new InMemoryUnitRepository(),
        new FakeUnitOfWork(),
        audit,
        ledger,
      );
      await expect(
        empty.execute(admin, { unit: u(302), active: false, from: m('2026-10') }),
      ).rejects.toThrow(withCode('UNIT_NOT_FOUND'));
    });
  });

  describe('UnitStatuses', () => {
    it('answers who is active in a month', async () => {
      await units.save(Unit.restore(u(101), [YearMonthRange.startingAt(m('2026-11'))]));
      const statuses = new UnitStatuses(await new ListUnits(units).execute());

      expect(statuses.isActive(u(101), m('2026-10'))).toBe(true);
      expect(statuses.isActive(u(101), m('2026-11'))).toBe(false);
      expect(statuses.activeIn(m('2026-11'))).toHaveLength(9);
      expect(new UnitStatuses([]).isActive(u(101), m('2026-10'))).toBe(false);
    });
  });
});
