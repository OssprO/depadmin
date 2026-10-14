import { UNIT_NUMBERS } from '@depadmin/shared';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { type AuditLogFilters, withFilter } from '../filters';
import { ENTITIES } from '../labels';

interface AuditFiltersProps {
  readonly filters: AuditLogFilters;
  readonly onChange: (filters: AuditLogFilters) => void;
}

/** The option for "no filter". */
const ALL = '';

export function AuditFilters({ filters, onChange }: AuditFiltersProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field>
        <FieldLabel htmlFor="audit-entity">Qué</FieldLabel>
        <NativeSelect
          id="audit-entity"
          className="w-full"
          value={filters.entity ?? ALL}
          onChange={({ target: { value } }) => {
            onChange(withFilter(filters, 'entity', value === ALL ? undefined : value));
          }}
        >
          <NativeSelectOption value={ALL}>Todo</NativeSelectOption>
          {Object.entries(ENTITIES).map(([entity, label]) => (
            <NativeSelectOption key={entity} value={entity}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="audit-actor">Quién</FieldLabel>
        <NativeSelect
          id="audit-actor"
          className="w-full"
          value={filters.actor === undefined ? ALL : String(filters.actor)}
          onChange={({ target: { value } }) => {
            const actor =
              value === ALL ? undefined : value === 'superadmin' ? value : Number(value);
            onChange(withFilter(filters, 'actor', actor));
          }}
        >
          <NativeSelectOption value={ALL}>Todos</NativeSelectOption>
          <NativeSelectOption value="superadmin">Superadmin</NativeSelectOption>
          {UNIT_NUMBERS.map((unit) => (
            <NativeSelectOption key={unit} value={unit}>
              Depto {unit}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}
