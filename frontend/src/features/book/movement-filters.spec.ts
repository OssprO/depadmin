import type { Movement } from '@depadmin/shared';
import { describe, expect, it } from 'vitest';
import { cleaningRow, garbageRow, paymentRow } from '@/test/books';
import { filterMovements, hasFilters, inOrder, movementFiltersFrom } from './movement-filters';

const water: Movement = {
  ...cleaningRow,
  id: 'water',
  category: 'OTHER_EXPENSE',
  description: 'Recibo del AGUA, bimestre',
};
const note: Movement = {
  ...paymentRow,
  id: 'note',
  unit: 302,
  description: 'Pagó con transferéncia',
};
const rows = [paymentRow, note, water, garbageRow, cleaningRow];

describe('movement filters', () => {
  it('reads only well-formed filters from the address', () => {
    expect(movementFiltersFrom({ q: 'agua', depto: '301', tipo: 'GARBAGE' })).toEqual({
      q: 'agua',
      depto: 301,
      tipo: 'GARBAGE',
    });
    expect(movementFiltersFrom({ q: '  ', depto: '303', tipo: 'RENT' })).toEqual({});
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ depto: 301 })).toBe(true);
  });

  it('combines depto, type and text, ignoring case and accents', () => {
    expect(filterMovements(rows, { q: 'agua' }).map((r) => r.id)).toEqual(['water']);
    expect(filterMovements(rows, { q: 'TRANSFERENCIA' }).map((r) => r.id)).toEqual(['note']);
    expect(filterMovements(rows, { tipo: 'UNIT_PAYMENT' })).toHaveLength(2);
    expect(filterMovements(rows, { tipo: 'UNIT_PAYMENT', depto: 302 }).map((r) => r.id)).toEqual([
      'note',
    ]);
    expect(filterMovements(rows, { tipo: 'GARBAGE', q: 'agua' })).toEqual([]);
    expect(filterMovements(rows, {})).toHaveLength(rows.length);
  });

  it('turns the rows around for newest first', () => {
    expect(inOrder(rows, 'newest').map((r) => r.id)).toEqual(rows.map((r) => r.id).reverse());
    expect(inOrder(rows, 'oldest')).toEqual(rows);
  });
});
