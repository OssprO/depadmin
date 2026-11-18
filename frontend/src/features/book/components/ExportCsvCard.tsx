import type { MonthHistory } from '@depadmin/shared';
import { useState } from 'react';
import { FileActions } from '@/components/FileActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { fetchMovementsCsv } from '../api';

/**
 * The rows of a range of months as a CSV, to open in a spreadsheet. By default, every month
 * the books have (the history lists them newest first).
 */
export function ExportCsvCard({ months }: { months: MonthHistory['months'] }) {
  const [range, setRange] = useState({
    from: months.at(-1)?.month ?? '',
    to: months[0]?.month ?? '',
  });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Exportar movimientos</CardTitle>
        <CardDescription>Un archivo CSV para abrir en Excel o Google Sheets.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['from', 'to'] as const).map((name) => (
            <Field key={name}>
              <FieldLabel htmlFor={`export-${name}`}>
                {name === 'from' ? 'Desde' : 'Hasta'}
              </FieldLabel>
              <Input
                id={`export-${name}`}
                type="month"
                value={range[name]}
                onChange={(event) => setRange({ ...range, [name]: event.target.value })}
              />
            </Field>
          ))}
        </div>
        <FileActions
          fetchFile={() => fetchMovementsCsv(range.from, range.to)}
          title="Movimientos"
          label="Descargar CSV"
          shareable={false}
        />
      </CardContent>
    </Card>
  );
}
