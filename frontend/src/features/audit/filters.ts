import { UNIT_NUMBERS } from '@depadmin/shared';
import { ENTITIES } from './labels';

export interface AuditLogFilters {
  readonly entity?: string;
  readonly actor?: 'superadmin' | 'system' | number;
}

const isUnit = (value: unknown): value is number =>
  (UNIT_NUMBERS as readonly unknown[]).includes(value);

/** The filters from the URL; anything unknown is dropped rather than sent to the API. */
export function auditFiltersFrom(search: Record<string, unknown>): AuditLogFilters {
  const { entity, actor } = search;
  return {
    ...(typeof entity === 'string' && Object.hasOwn(ENTITIES, entity) && { entity }),
    ...((actor === 'superadmin' || actor === 'system' || isUnit(actor)) && { actor }),
  };
}

/** The API's query string for these filters and page. */
export function auditLogSearchParams(filters: AuditLogFilters, before?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.entity) params.set('entity', filters.entity);
  if (filters.actor !== undefined) params.set('actor', String(filters.actor));
  if (before) params.set('before', before);
  return params;
}

/** The filters with one of them set, or cleared when `value` is undefined. */
export function withFilter<K extends keyof AuditLogFilters>(
  filters: AuditLogFilters,
  key: K,
  value: AuditLogFilters[K] | undefined,
): AuditLogFilters {
  const next: { -readonly [P in keyof AuditLogFilters]: AuditLogFilters[P] } = { ...filters };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}
