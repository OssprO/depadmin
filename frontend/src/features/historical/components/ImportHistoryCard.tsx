import { type HistoryFile, historyFileSchema, type HistoryPreview } from '@depadmin/shared';
import { type ChangeEvent, useState } from 'react';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { ApiError } from '@/lib/http';
import { formatMoney, formatMonth } from '@/lib/format';
import { useImportHistory, usePreviewHistory } from '../api';

/** Reads the chosen file: JSON first, then the shared contract, so errors say what is wrong. */
async function readHistoryFile(file: File): Promise<HistoryFile> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Ese archivo no es JSON. Elige el historial.json que genera el script.');
  }
  const parsed = historyFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (en ${issue.path.join(' → ')})` : '';
    throw new Error(`El archivo no tiene el formato esperado${where}: ${issue?.message ?? ''}`);
  }
  return parsed.data;
}

function PreviewSummary({ preview }: { preview: HistoryPreview }) {
  const months = preview.months;
  const count = (pick: (month: HistoryPreview['months'][number]) => number) =>
    months.reduce((total, month) => total + pick(month), 0);
  const missing = months.filter((month) => month.sheets === 0);
  const off = months.filter((month) => month.ownGap !== null && month.ownGap !== 0);
  const line = (label: string, value: string) => (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className="flex flex-col gap-1">
      {line(
        'Meses',
        `${formatMonth(preview.firstMonth)} a ${formatMonth(preview.lastMonth)} (${months.length})`,
      )}
      {line('Hojas', String(count((month) => month.sheets)))}
      {line('Movimientos', String(count((month) => month.movements)))}
      {line('Caja al empezar', formatMoney(preview.openingBalance))}
      {line(`Cierre de ${formatMonth(preview.lastMonth)}`, formatMoney(preview.closing))}
      {line(
        'Meses sin hoja',
        missing.length ? missing.map((month) => formatMonth(month.month)).join(', ') : 'ninguno',
      )}
      {line('Meses que no cuadran con su hoja', String(off.length))}
      {line('Alertas de la transcripción', String(count((month) => month.alerts)))}
      {line('Nombres de propietarios', String(preview.owners.length))}
    </dl>
  );
}

/**
 * Brings the transcribed history in: the file is checked and added up first, without saving
 * anything, and only goes in once the superadmin confirms the summary.
 */
export function ImportHistoryCard() {
  const [file, setFile] = useState<HistoryFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = usePreviewHistory();
  const importHistory = useImportHistory();

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    setError(null);
    setFile(null);
    preview.reset();
    if (!chosen) return;
    try {
      const parsed = await readHistoryFile(chosen);
      await preview.mutateAsync(parsed);
      setFile(parsed);
    } catch (failure) {
      // The API's errors have their Spanish text; the file's own problems carry theirs.
      const ownProblem = failure instanceof Error && !(failure instanceof ApiError);
      setError(ownProblem ? failure.message : errorMessage(failure));
    }
  };

  const confirm = async () => {
    if (!file) return;
    setError(null);
    try {
      await importHistory.mutateAsync(file);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar el historial</CardTitle>
        <CardDescription>
          Elige el archivo historial.json de la transcripción. Antes de guardar verás un resumen.
          Los meses quedan en revisión: solo tú los ves y nada de esto va a la bitácora.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="history-file">Archivo</FieldLabel>
          <Input
            id="history-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void choose(event)}
          />
        </Field>
        {preview.isPending && <p className="text-muted-foreground">Revisando el archivo…</p>}
        {preview.data && file && (
          <>
            <PreviewSummary preview={preview.data} />
            <Button disabled={importHistory.isPending} onClick={() => void confirm()}>
              {importHistory.isPending ? 'Importando…' : 'Importar'}
            </Button>
          </>
        )}
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
