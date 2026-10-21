import { describe, expect, it } from 'vitest';
import {
  type CashCount,
  DENOMINATIONS,
  denominationLabel,
  piecesInput,
  subtotalOf,
  totalOf,
} from './cash-count';

const byId = (id: string) => DENOMINATIONS.find((denomination) => denomination.id === id)!;

describe('the cash count', () => {
  it('lists the bills and the coins in circulation, from the largest', () => {
    expect(DENOMINATIONS.map(denominationLabel)).toEqual([
      '$1,000',
      '$500',
      '$200',
      '$100',
      '$50',
      '$20',
      '$20',
      '$10',
      '$5',
      '$2',
      '$1',
      '50¢',
    ]);
    expect(DENOMINATIONS.filter((d) => d.kind === 'BILL')).toHaveLength(6);
  });

  it('keeps a field to whole pieces', () => {
    expect(piecesInput('12')).toBe('12');
    expect(piecesInput('1.5')).toBe('15');
    expect(piecesInput('-2 ')).toBe('2');
    expect(piecesInput('abc')).toBe('');
    expect(piecesInput('1234567')).toBe('12345');
  });

  it('adds up every piece in centavos, blank fields counting as none', () => {
    const count: CashCount = { 'bill-500': '3', 'coin-2000': '2', 'coin-50': '7', 'bill-20': '' };
    expect(subtotalOf(byId('bill-500'), count)).toBe(150000);
    expect(subtotalOf(byId('coin-50'), count)).toBe(350);
    expect(subtotalOf(byId('bill-20'), count)).toBe(0);
    expect(totalOf(count)).toBe(150000 + 4000 + 350);
    expect(totalOf(count, 'BILL')).toBe(150000);
    expect(totalOf(count, 'COIN')).toBe(4350);
    expect(totalOf({})).toBe(0);
  });

  it('stays exact with many coins of 50¢', () => {
    expect(totalOf({ 'coin-50': '99999' })).toBe(4999950);
  });
});
