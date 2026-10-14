import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { YearMonth, YearMonthRange } from '../../../shared-kernel/index.js';
import { admin, owner, shiftsFixture, u } from './testing.js';

const m = (text: string) => YearMonth.parse(text);

// The base calendar: 501 holds Aug–Sep 2026, 502 Oct–Nov, 401 Dec–Jan.

describe('GetShiftCalendar', () => {
  const summary = (
    months: Awaited<ReturnType<ReturnType<typeof shiftsFixture>['calendar']['execute']>>,
  ) =>
    months.map((a) => `${a.month} ${a.scheduledUnit.value} ${a.canDelegate ? 'delegable' : '-'}`);

  it('offers the outgoing owner the handover of the next period only', async () => {
    const fx = shiftsFixture('2026-09-15');

    expect(summary(await fx.calendar.execute(owner(501), m('2026-09'), m('2026-12')))).toEqual([
      '2026-09 501 -',
      '2026-10 502 delegable',
      '2026-11 502 -',
      '2026-12 401 -',
    ]);
    expect(summary(await fx.calendar.execute(owner(401), m('2026-10'), m('2026-10')))).toEqual([
      '2026-10 502 -',
    ]);
  });

  it('closes the handover after the grace days', async () => {
    const onTime = shiftsFixture('2026-10-05');
    const late = shiftsFixture('2026-10-06');

    const october = async (fx: ReturnType<typeof shiftsFixture>) =>
      (await fx.calendar.execute(owner(501), m('2026-10'), m('2026-10')))[0]?.canDelegate;
    expect(await october(onTime)).toBe(true);
    expect(await october(late)).toBe(false);
  });

  it('lets the superadmin delegate any month not delegated yet', async () => {
    const fx = shiftsFixture('2026-09-15');
    await fx.delegate.execute(owner(501), {
      from: m('2026-10'),
      to: m('2026-11'),
      delegateUnit: u(501),
      reason: 'SKIPPED_SHIFT',
    });

    const months = await fx.calendar.execute(admin, m('2026-09'), m('2026-12'));
    expect(months.map((a) => a.canDelegate)).toEqual([true, false, false, true]);
    expect(months[1]?.responsibleUnits.map((unit) => unit.value)).toEqual([502, 501]);
  });

  it('rejects reversed or very long ranges', async () => {
    const fx = shiftsFixture('2026-09-15');

    await expect(fx.calendar.execute(admin, m('2026-10'), m('2026-09'))).rejects.toThrow(
      withCode('CALENDAR_RANGE_INVALID'),
    );
    await expect(fx.calendar.execute(admin, m('2026-01'), m('2029-01'))).rejects.toThrow(
      withCode('CALENDAR_RANGE_INVALID'),
    );
    await expect(fx.calendar.execute(admin, m('2026-01'), m('2028-12'))).resolves.toHaveLength(36);
  });

  it('describes the current shift, the next one and who is inactive', async () => {
    const fx = shiftsFixture('2026-10-03', { 302: YearMonthRange.startingAt(m('2026-10')) });

    const current = await fx.calendar.current(owner(501));

    expect(String(current.today)).toBe('2026-10-03');
    expect([current.current.month, current.current.scheduledUnit].map(String)).toEqual([
      '2026-10',
      '502',
    ]);
    expect(current.current.canDelegate).toBe(true);
    expect([current.next.month, current.next.scheduledUnit].map(String)).toEqual([
      '2026-12',
      '401',
    ]);
    expect(current.inactiveUnits.map(String)).toEqual(['302']);
  });
});

describe('DelegateShift', () => {
  const skip = {
    from: m('2026-10'),
    to: m('2026-11'),
    delegateUnit: u(501),
    reason: 'SKIPPED_SHIFT',
  } as const;

  it('records the outgoing owner’s handover and charges the skipped depto', async () => {
    const fx = shiftsFixture('2026-10-02');

    const delegation = await fx.delegate.execute(owner(501), skip);

    expect([delegation.originalUnit, delegation.delegateUnit].map(String)).toEqual(['502', '501']);
    expect(fx.charges.summary()).toEqual([
      '502:2026-10:SHIFT_SKIP_PENALTY 50000',
      '502:2026-11:SHIFT_SKIP_PENALTY 50000',
    ]);
    expect(fx.audit.actions).toEqual(['SHIFT_DELEGATION_CREATED', 'CHARGE_ADDED', 'CHARGE_ADDED']);
    expect(fx.audit.entries[0]?.change).toMatchObject({
      entity: 'shift_delegation',
      entityLabel: '502 → 501',
      changes: [
        { field: 'months', before: null, after: '2026-10..2026-11' },
        { field: 'originalUnit', before: null, after: 502 },
        { field: 'delegateUnit', before: null, after: 501 },
        { field: 'reason', before: null, after: 'SKIPPED_SHIFT' },
        { field: 'active', before: null, after: true },
      ],
    });
  });

  it('lets the next owner skip only one month, covered by anyone active', async () => {
    const fx = shiftsFixture('2026-09-20');

    await fx.delegate.execute(owner(501), { ...skip, to: m('2026-10'), delegateUnit: u(101) });

    expect(fx.charges.summary()).toEqual(['502:2026-10:SHIFT_SKIP_PENALTY 50000']);
  });

  it('holds owners to the handover rules', async () => {
    const fx = shiftsFixture('2026-10-02');
    const attempt = (actor: ReturnType<typeof owner>, command: Partial<typeof skip> = {}) =>
      fx.delegate.execute(actor, { ...skip, ...command });

    await expect(attempt(owner(401))).rejects.toThrow(withCode('NOT_RESPONSIBLE'));
    await expect(attempt(owner(501), { from: m('2026-11') })).rejects.toThrow(
      withCode('HANDOVER_INVALID'),
    );
    await expect(attempt(owner(501), { reason: 'OTHER' } as never)).rejects.toThrow(
      withCode('HANDOVER_INVALID'),
    );
    await expect(shiftsFixture('2026-10-06').delegate.execute(owner(501), skip)).rejects.toThrow(
      withCode('OUTSIDE_WRITE_WINDOW'),
    );
    expect(fx.audit.entries).toEqual([]);
    expect(fx.delegations.rows.size).toBe(0);
  });

  it('lets the superadmin cover an inactive depto, with no penalty', async () => {
    const fx = shiftsFixture('2026-11-10', { 401: YearMonthRange.startingAt(m('2026-12')) });

    await fx.delegate.execute(admin, {
      from: m('2026-12'),
      to: m('2027-01'),
      delegateUnit: u(402),
      reason: 'INACTIVE_UNIT',
    });

    expect(fx.charges.summary()).toEqual([]);
    expect(fx.audit.actions).toEqual(['SHIFT_DELEGATION_CREATED']);
  });

  it('rejects overlaps and reversed ranges without recording anything', async () => {
    const fx = shiftsFixture('2026-10-02');
    await fx.delegate.execute(owner(501), skip);

    await expect(
      fx.delegate.execute(admin, {
        ...skip,
        from: m('2026-11'),
        delegateUnit: u(402),
        reason: 'OTHER',
      }),
    ).rejects.toThrow(withCode('DELEGATIONS_OVERLAP'));
    await expect(
      fx.delegate.execute(admin, { ...skip, from: m('2026-11'), to: m('2026-10') }),
    ).rejects.toThrow(withCode('DELEGATION_INVALID'));
    expect(fx.audit.actions).toHaveLength(3);
  });
});

describe('CancelDelegation', () => {
  it('cancels the delegation and takes the penalties back', async () => {
    const fx = shiftsFixture('2026-10-02');
    const { id } = await fx.delegate.execute(owner(501), {
      from: m('2026-10'),
      to: m('2026-11'),
      delegateUnit: u(501),
      reason: 'SKIPPED_SHIFT',
    });

    const cancelled = await fx.cancel.execute(admin, id);

    expect(cancelled.isActive).toBe(false);
    expect(fx.charges.summary()).toEqual([]);
    expect(fx.audit.actions.slice(3)).toEqual([
      'SHIFT_DELEGATION_CANCELLED',
      'CHARGE_REMOVED',
      'CHARGE_REMOVED',
    ]);
    expect(fx.audit.entries[3]?.change.changes).toEqual([
      { field: 'active', before: true, after: false },
    ]);
    const months = await fx.calendar.execute(admin, m('2026-10'), m('2026-10'));
    expect(months[0]?.delegation).toBeNull();
  });

  it('is for the superadmin, on an existing active delegation', async () => {
    const fx = shiftsFixture('2026-10-02');
    const { id } = await fx.delegate.execute(admin, {
      from: m('2026-11'),
      to: m('2026-11'),
      delegateUnit: u(402),
      reason: 'OTHER',
    });

    await expect(fx.cancel.execute(owner(501), id)).rejects.toThrow(withCode('SUPERADMIN_ONLY'));
    await expect(fx.cancel.execute(admin, 'nope')).rejects.toThrow(
      withCode('DELEGATION_NOT_FOUND'),
    );
    await fx.cancel.execute(admin, id);
    await expect(fx.cancel.execute(admin, id)).rejects.toThrow(
      withCode('DELEGATION_ALREADY_CANCELLED'),
    );
    expect(fx.charges.summary()).toEqual([]);
  });
});
