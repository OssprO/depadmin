import type { MovementRequest } from '@depadmin/shared';
import { LocalDate, Money, type MovementDetails, UnitNumber } from '../../shared-kernel/index.js';

/** A cash row as the API receives it (live or historical), as the domain reads it. */
export function toMovementDetails(body: MovementRequest): MovementDetails {
  return {
    date: LocalDate.parse(body.date),
    category: body.category,
    amount: Money.ofCentavos(body.amount),
    unit: body.unit === null ? null : UnitNumber.of(body.unit),
    description: body.description,
    week: body.week === null ? null : LocalDate.parse(body.week),
  };
}
