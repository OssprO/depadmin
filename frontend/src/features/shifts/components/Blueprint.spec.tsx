import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { shiftMonth, skip502 } from '@/test/shifts';
import { Blueprint } from './Blueprint';

const cells = () =>
  within(screen.getByRole('list', { name: 'Edificio' }))
    .getAllByRole('listitem')
    .map((cell) => cell.getAttribute('aria-label'));

describe('Blueprint', () => {
  it('draws the building top floor first and highlights who holds the shift', () => {
    render(<Blueprint month={shiftMonth('2026-10')} inactiveUnits={[301]} ownUnit={101} />);

    expect(cells()).toEqual([
      'Depto 501',
      'Depto 502, En turno',
      'Depto 401',
      'Depto 402',
      'Depto 301, Inactivo',
      'Depto 302',
      'Depto 201',
      'Depto 202',
      'Depto 101, tú',
      'Depto 102',
    ]);
  });

  it('tells the depto that delegated from the one that covers', () => {
    render(<Blueprint month={shiftMonth('2026-10', { delegation: skip502 })} inactiveUnits={[]} />);

    expect(cells().slice(0, 2)).toEqual(['Depto 501, Cubre', 'Depto 502, Delegó']);
  });

  it('flags an inactive depto whose shift nobody covers yet', () => {
    const month = shiftMonth('2026-10', { scheduledUnitActive: false, responsibleUnits: [] });
    render(<Blueprint month={month} inactiveUnits={[502]} />);

    expect(cells()[1]).toBe('Depto 502, Sin cubrir');
  });
});
