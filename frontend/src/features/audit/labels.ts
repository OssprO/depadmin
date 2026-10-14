import type { AuditLogEntry, AuditValue, FieldChange } from '@depadmin/shared';

// Spanish text for the audit log. Codes come from the backend's use cases; an unknown one
// is shown as is, so a newer API never breaks the screen.

const ACTIONS: Record<string, string> = {
  USER_PASSWORD_CHANGED: 'Contraseña cambiada',
  USER_PASSWORD_RESET: 'Contraseña temporal generada',
};

/** The kinds of entity, in the order the filter offers them. */
export const ENTITIES: Record<string, string> = {
  user: 'Usuario',
};

const FIELDS: Record<string, Record<string, string>> = {
  user: {
    username: 'Usuario',
    role: 'Rol',
    unit: 'Depto',
    password: 'Contraseña',
    mustChangePassword: 'Debe cambiar la contraseña',
  },
};

export interface ChangeLine {
  readonly field: string;
  readonly text: string;
}

export interface EntryText {
  /** What happened, e.g. "Contraseña temporal generada". */
  readonly title: string;
  /** Who did it, e.g. "Superadmin" or "Depto 501". */
  readonly actor: string;
  /** What it was done to, e.g. "Usuario 502". */
  readonly subject: string;
  readonly changes: readonly ChangeLine[];
}

export function describeEntry(entry: AuditLogEntry): EntryText {
  return {
    title: ACTIONS[entry.action] ?? entry.action,
    actor: entry.actor.unit === null ? 'Superadmin' : `Depto ${entry.actor.unit}`,
    subject: `${ENTITIES[entry.entity] ?? entry.entity} ${entry.entityLabel}`,
    changes: entry.changes.map((change) => describeChange(entry.entity, change)),
  };
}

function describeChange(entity: string, change: FieldChange): ChangeLine {
  const field = FIELDS[entity]?.[change.field] ?? change.field;
  const text =
    'redacted' in change
      ? 'cambiada'
      : `${formatValue(change.before)} → ${formatValue(change.after)}`;
  return { field, text };
}

function formatValue(value: AuditValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}
