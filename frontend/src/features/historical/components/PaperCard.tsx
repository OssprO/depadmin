import type { PaperMonth, PaperSheet } from '@depadmin/shared';
import { PencilSimpleIcon, PlusIcon, WarningIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { paperMonthQueryOptions } from '../api';
import { GapBadge } from './GapBadge';
import { PaperSheetSheet } from './PaperSheetSheet';

const money = (centavos: number | null) => (centavos === null ? '—' : formatMoney(centavos));
const signed = (sign: string, centavos: number | null) =>
  centavos === null ? '—' : `${sign} ${formatMoney(centavos)}`;

/** The month's rows added up, next to what its paper says. */
function Figures({ month }: { month: PaperMonth }) {
  const row = (label: string, rows: string, paper: string, strong = false) => (
    <tr className={strong ? 'font-medium' : undefined}>
      <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
        {label}
      </th>
      <td className="py-1 text-right tabular-nums">{rows}</td>
      <td className="py-1 text-right tabular-nums">{paper}</td>
    </tr>
  );
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="sr-only">
              Concepto
            </th>
            <th scope="col" className="text-right font-normal">
              Libro
            </th>
            <th scope="col" className="text-right font-normal">
              Papel
            </th>
          </tr>
        </thead>
        <tbody>
          {row('Saldo inicial', formatMoney(month.opening), money(month.paperOpening))}
          {row('Ingresos', `+ ${formatMoney(month.income)}`, signed('+', month.paperIncome))}
          {row('Egresos', `− ${formatMoney(month.expense)}`, signed('−', month.paperExpense))}
          {row('Saldo final', formatMoney(month.closing), money(month.paperClosing), true)}
        </tbody>
      </table>
      {month.ownGap !== null && month.ownGap !== 0 && (
        <p>
          Los movimientos del mes dan {formatMoney(Math.abs(month.ownGap))}{' '}
          {month.ownGap > 0 ? 'más' : 'menos'} de lo que movió la hoja: falta, sobra o está mal un
          renglón.
        </p>
      )}
      {month.carriedGap !== null && month.carriedGap !== 0 && (
        <p className="text-muted-foreground">
          Llega con {formatMoney(Math.abs(month.carriedGap))}{' '}
          {month.carriedGap > 0 ? 'más' : 'menos'} de lo que abre el papel, por meses anteriores (un
          mes sin capturar o con diferencia).
        </p>
      )}
    </div>
  );
}

/** A depto's line on the sheet, as the PDF prints it. */
function lineText(line: PaperSheet['lines'][number]): string {
  const parts = [
    line.ownerName,
    line.current !== null ? `mes en curso ${formatMoney(line.current)}` : null,
    line.other !== null ? `adeudos/adelantos ${formatMoney(line.other)}` : null,
    line.text,
  ];
  return parts.filter(Boolean).join(' · ');
}

function SheetDetails({ sheet, onEdit }: { sheet: PaperSheet; onEdit: (() => void) | undefined }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">
            {sheet.fromDay === 1 ? 'Hoja' : `Hoja desde el día ${sheet.fromDay}`}
          </h3>
          <p className="text-muted-foreground">{sheet.source}</p>
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilSimpleIcon /> Corregir
          </Button>
        )}
      </div>
      <p className="text-muted-foreground tabular-nums">
        Abre {money(sheet.opening)} · + {money(sheet.income)} · − {money(sheet.expense)} · cierra{' '}
        {money(sheet.closing)}
      </p>
      {sheet.alerts.map((alert) => (
        <Alert key={alert}>
          <WarningIcon />
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      ))}
      {sheet.lines.length > 0 && (
        <dl className="flex flex-col gap-1">
          {sheet.lines.map((line) => (
            <div key={line.unit} className="grid grid-cols-[4rem_1fr] gap-2">
              <dt className="font-medium">Depto {line.unit}</dt>
              <dd>{lineText(line)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

type Editing = { sheet: PaperSheet | null };

/**
 * A month of the history next to its paper (ADR-0023): its figures against the sheets', and
 * each sheet with its remarks and its line per depto, which its PDF prints as written.
 */
export function PaperCard({ month }: { month: string }) {
  const query = useQuery(paperMonthQueryOptions(month));
  const [editing, setEditing] = useState<Editing | null>(null);
  const data = query.data;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2>Hoja de papel</h2>
        </CardTitle>
        {data && (
          <CardAction>
            <GapBadge gap={data.ownGap} sheets={data.sheets.length} />
          </CardAction>
        )}
        <CardDescription>
          Un mes anterior a la plataforma: se capturó de su hoja y su PDF la reproduce.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {query.isPending && <p className="text-muted-foreground">Cargando…</p>}
        {query.isError && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground">No se pudo cargar la hoja.</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {data && (
          <>
            <Figures month={data} />
            {data.sheets.length === 0 && (
              <p className="text-muted-foreground">
                No hay papel de este mes. Cuando aparezca, agrega la hoja con sus cifras y captura
                sus movimientos.
              </p>
            )}
            {data.sheets.map((sheet) => (
              <SheetDetails
                key={sheet.id}
                sheet={sheet}
                onEdit={data.canEdit ? () => setEditing({ sheet }) : undefined}
              />
            ))}
            {data.canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setEditing({ sheet: null })}
              >
                <PlusIcon /> Agregar hoja
              </Button>
            )}
          </>
        )}
      </CardContent>
      {editing && (
        <PaperSheetSheet
          key={editing.sheet?.id ?? 'new'}
          month={month}
          sheet={editing.sheet}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
