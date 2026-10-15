import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { useTestDatabase } from '../../../../test/support/database.js';
import { Instant, UnitNumber } from '../../../shared-kernel/index.js';
import { HistoricalBooks, HistoricalMovement } from '../domain/index.js';
import { d, garbage, m, paid, pesos, row, sheet, spent } from '../domain/testing.js';
import { PrismaHistoryRepository } from './prisma-history.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaHistoryRepository(ctx.database);

describe('PrismaHistoryRepository', () => {
  it('round-trips the books, in review and verified', async () => {
    expect(await repository().loadBooks()).toBeNull();
    await repository().saveBooks(HistoricalBooks.start(m('2022-05'), m('2026-07'), pesos(712.25)));
    const loaded = (await repository().loadBooks())!;
    expect(loaded).toMatchObject({ status: 'IN_REVIEW', openingBalance: pesos(712.25) });
    expect([String(loaded.firstMonth), String(loaded.lastMonth)]).toEqual(['2022-05', '2026-07']);

    await repository().saveBooks(
      HistoricalBooks.restore(m('2022-05'), m('2026-07'), pesos(712.25), Instant.ofEpochMillis(5)),
    );
    expect((await repository().loadBooks())!.verifiedAt).toEqual(Instant.ofEpochMillis(5));
  });

  it('round-trips sheets with their figures, remarks and observations', async () => {
    const may = sheet('2022-05', 712.25, null, {
      alerts: ['Cuota de $600'],
      notes: [{ unit: UnitNumber.of(202), text: 'ADELANTÓ JUNIO 2022' }],
    });
    const second = sheet('2023-02', 8259.05, 1617.05, { fromDay: 11 });
    await repository().saveSheets([second, may, sheet('2023-02', 6022.05, 8259.05)]);

    expect((await repository().findSheet(may.id))!.details).toEqual(may.details);
    expect((await repository().findSheets(m('2023-02'))).map((s) => s.details.fromDay)).toEqual([
      1, 11,
    ]);
    expect(await repository().findSheets()).toHaveLength(3);

    may.revise({ ...may.details, source: 'foto 55' });
    await repository().saveSheets([may]);
    expect((await repository().findSheet(may.id))!.details.source).toBe('foto 55');
    await repository().removeSheet(may.id);
    expect(await repository().findSheet(may.id)).toBeNull();
  });

  it('allows one sheet per starting day in the database itself', async () => {
    await repository().saveSheets([sheet('2023-02', null, null)]);
    await expect(repository().saveSheets([sheet('2023-02', null, null)])).rejects.toThrow(
      withCode('SHEET_DUPLICATED'),
    );
  });

  it('round-trips rows, keeping the order they came in within a day', async () => {
    const rows = [
      row(paid('2022-05-01', 502, 600)),
      row(paid('2022-05-01', 101, 600)),
      row(garbage('2022-05-14')),
      row(spent('2022-06-13', 511)),
    ];
    await repository().saveMovements(rows);

    const may = await repository().findMovements(m('2022-05'));
    expect(may.map((movement) => movement.id)).toEqual(rows.slice(0, 3).map((r) => r.id));
    expect(may[2]!.details).toEqual(rows[2]!.details);
    expect(await repository().findMovements()).toHaveLength(4);
    expect((await repository().findGarbageFor(d('2022-05-09')))!.id).toBe(rows[2]!.id);
    expect(await repository().findGarbageFor(d('2022-05-16'))).toBeNull();

    const light = rows[3]!;
    light.revise(spent('2022-06-14', 512, 'PAGO DE LUZ'));
    await repository().saveMovements([light]);
    expect((await repository().findMovement(light.id))!.details).toEqual(light.details);
    await repository().removeMovement(light.id);
    expect(await repository().findMovement(light.id)).toBeNull();
  });

  it('pays each week of garbage once in the database itself', async () => {
    await repository().saveMovements([row(garbage('2022-05-14'))]);
    await expect(repository().saveMovements([row(garbage('2022-05-13'))])).rejects.toThrow(
      withCode('GARBAGE_WEEK_PAID'),
    );
  });

  it('discards the whole history', async () => {
    await repository().saveBooks(HistoricalBooks.start(m('2022-05'), m('2022-06'), pesos(0)));
    await repository().saveSheets([sheet('2022-05', null, null)]);
    await repository().saveMovements([
      HistoricalMovement.record(crypto.randomUUID(), spent('2022-05-02', 5)),
    ]);
    await repository().discard();
    expect(await repository().loadBooks()).toBeNull();
    expect(await repository().findSheets()).toEqual([]);
    expect(await repository().findMovements()).toEqual([]);
  });
});
