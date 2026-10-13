import { ValidationError } from './domain-error.js';

const FLOORS = 5;
const UNITS_PER_FLOOR = 2;

/**
 * A depto of the building, identified by its door number: floors 1–5, doors 1–2 (101 … 502).
 * Instances are interned, so the same number is always the same object and `===` works.
 */
export class UnitNumber {
  private static readonly instances = new Map<number, UnitNumber>();

  private constructor(readonly value: number) {}

  static of(value: number): UnitNumber {
    const existing = UnitNumber.instances.get(value);
    if (existing) return existing;

    const floor = Math.floor(value / 100);
    const door = value % 100;
    if (
      !Number.isInteger(value) ||
      floor < 1 ||
      floor > FLOORS ||
      door < 1 ||
      door > UNITS_PER_FLOOR
    ) {
      throw new ValidationError('UNIT_NUMBER_INVALID', `There is no depto ${value}`);
    }
    const created = new UnitNumber(value);
    UnitNumber.instances.set(value, created);
    return created;
  }

  /** All deptos in ascending order (101, 102, 201 … 502). */
  static all(): UnitNumber[] {
    const units: UnitNumber[] = [];
    for (let floor = 1; floor <= FLOORS; floor++) {
      for (let door = 1; door <= UNITS_PER_FLOOR; door++)
        units.push(UnitNumber.of(floor * 100 + door));
    }
    return units;
  }

  get floor(): number {
    return Math.floor(this.value / 100);
  }

  equals(other: UnitNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }

  toJSON(): number {
    return this.value;
  }
}
