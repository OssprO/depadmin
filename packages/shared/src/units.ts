/** The building's deptos, by door number: floors 1–5, two doors each. */
export const UNIT_NUMBERS = [101, 102, 201, 202, 301, 302, 401, 402, 501, 502] as const;
export type UnitNumberValue = (typeof UNIT_NUMBERS)[number];
