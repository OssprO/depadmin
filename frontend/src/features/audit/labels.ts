import type { AuditLogEntry, AuditValue, DelegationReason, FieldChange } from '@depadmin/shared';
import { formatLocalDate, formatMoney, formatMonth, formatWeek } from '@/lib/format';
import { CATEGORIES } from '../book/labels';
import { REASONS } from '../shifts/labels';

// Spanish text for the audit log. Codes come from the backend's use cases; an unknown one
// is shown as is, so a newer API never breaks the screen.

const ACTIONS: Record<string, string> = {
  USER_PASSWORD_CHANGED: 'Contraseña cambiada',
  USER_PASSWORD_RESET: 'Contraseña temporal generada',
  UNIT_DEACTIVATED: 'Depto marcado inactivo',
  UNIT_REACTIVATED: 'Depto reactivado',
  SHIFT_DELEGATION_CREATED: 'Turno delegado',
  SHIFT_DELEGATION_CANCELLED: 'Delegación cancelada',
  CHARGE_ADDED: 'Cargo agregado',
  CHARGE_REMOVED: 'Cargo retirado',
  CASH_MOVEMENT_ADDED: 'Movimiento agregado',
  CASH_MOVEMENT_REVISED: 'Movimiento corregido',
  CASH_MOVEMENT_REMOVED: 'Movimiento borrado',
  MONTH_OPENED: 'Mes abierto',
  MONTH_CLOSED: 'Mes cerrado',
  MONTH_RESTATED: 'Saldos del mes recalculados',
  MONTH_REOPENED: 'Mes reabierto',
  REPORTING_START_SET: 'Inicio de la contabilidad',
};

/** The kinds of entity, in the order the filter offers them. */
export const ENTITIES: Record<string, string> = {
  cash_movement: 'Movimiento',
  monthly_report: 'Mes',
  shift_delegation: 'Delegación',
  charge: 'Cargo',
  unit: 'Depto',
  user: 'Usuario',
  reporting_start: 'Inicio',
};

const FIELDS: Record<string, Record<string, string>> = {
  user: {
    username: 'Usuario',
    role: 'Rol',
    unit: 'Depto',
    password: 'Contraseña',
    mustChangePassword: 'Debe cambiar la contraseña',
  },
  unit: { inactivePeriods: 'Inactivo' },
  shift_delegation: {
    months: 'Meses',
    originalUnit: 'Depto en turno',
    delegateUnit: 'Depto que cubre',
    reason: 'Motivo',
    active: 'Vigente',
  },
  charge: { unit: 'Depto', month: 'Mes', type: 'Tipo', amount: 'Importe' },
  cash_movement: {
    date: 'Fecha',
    category: 'Tipo',
    amount: 'Importe',
    unit: 'Depto',
    description: 'Descripción',
    week: 'Semana',
  },
  monthly_report: {
    status: 'Estado',
    openingBalance: 'Saldo inicial',
    income: 'Ingresos',
    expense: 'Egresos',
    closingBalance: 'Saldo final',
  },
  reporting_start: { month: 'Primer mes', openingBalance: 'Efectivo en caja' },
};

const MONTH_STATUS: Record<string, string> = { OPEN: 'Abierto', CLOSED: 'Cerrado' };

const CHARGE_TYPES: Record<string, string> = {
  MAINTENANCE_FEE: 'Cuota de mantenimiento',
  SHIFT_SKIP_PENALTY: 'Multa por no tomar turno',
};

/** "2026-10..2026-11" → "octubre 2026 a noviembre 2026"; an open range, "desde …". */
function formatMonths(value: string): string {
  return value
    .split(', ')
    .map((range) => {
      const [from = '', to = ''] = range.split('..');
      if (!to) return `desde ${formatMonth(from)}`;
      return from === to ? formatMonth(from) : `${formatMonth(from)} a ${formatMonth(to)}`;
    })
    .join('; ');
}

const money = (value: string | number) => (typeof value === 'number' ? formatMoney(value) : value);

/** Field values that read better than their stored form. */
const VALUES: Record<string, Record<string, (value: string | number) => string>> = {
  unit: { inactivePeriods: (v) => formatMonths(String(v)) },
  shift_delegation: {
    months: (v) => formatMonths(String(v)),
    reason: (v) => REASONS[v as DelegationReason] ?? String(v),
  },
  charge: {
    month: (v) => formatMonth(String(v)),
    type: (v) => CHARGE_TYPES[v] ?? String(v),
    amount: money,
  },
  cash_movement: {
    date: (v) => formatLocalDate(String(v)),
    category: (v) => CATEGORIES[v as keyof typeof CATEGORIES] ?? String(v),
    amount: money,
    week: (v) => formatWeek(String(v)),
  },
  monthly_report: {
    status: (v) => MONTH_STATUS[v] ?? String(v),
    openingBalance: money,
    income: money,
    expense: money,
    closingBalance: money,
  },
  reporting_start: { month: (v) => formatMonth(String(v)), openingBalance: money },
};

export interface ChangeLine {
  readonly field: string;
  readonly text: string;
}

export interface EntryText {
  /** What happened, e.g. "Contraseña temporal generada". */
  readonly title: string;
  /** Who did it, e.g. "Superadmin", "Depto 501" or "Sistema" (a scheduled job). */
  readonly actor: string;
  /** What it was done to, e.g. "Usuario 502". */
  readonly subject: string;
  readonly changes: readonly ChangeLine[];
}

const ACTORS: Partial<Record<AuditLogEntry['actor']['role'], string>> = {
  SUPERADMIN: 'Superadmin',
  SYSTEM: 'Sistema',
};

export function describeEntry(entry: AuditLogEntry): EntryText {
  return {
    title: ACTIONS[entry.action] ?? entry.action,
    actor: ACTORS[entry.actor.role] ?? `Depto ${entry.actor.unit}`,
    subject: `${ENTITIES[entry.entity] ?? entry.entity} ${entry.entityLabel}`,
    changes: entry.changes.map((change) => describeChange(entry.entity, change)),
  };
}

function describeChange(entity: string, change: FieldChange): ChangeLine {
  const field = FIELDS[entity]?.[change.field] ?? change.field;
  if ('redacted' in change) return { field, text: 'cambiada' };
  const format = (value: AuditValue) => formatValue(value, VALUES[entity]?.[change.field]);
  // A creation or removal has nothing on one side: show just the value.
  if (change.before === null) return { field, text: format(change.after) };
  if (change.after === null) return { field, text: `${format(change.before)} → —` };
  return { field, text: `${format(change.before)} → ${format(change.after)}` };
}

function formatValue(value: AuditValue, format?: (value: string | number) => string): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return format ? format(value) : String(value);
}
