import type { UnitNumberValue } from '@depadmin/shared';

/** A depto select's value as a depto, or none. */
export const toUnit = (value: string): UnitNumberValue | null =>
  value === '' ? null : (Number(value) as UnitNumberValue);
