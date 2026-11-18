import type { AccountStatement } from '@depadmin/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FileActions } from '@/components/FileActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { historyQueryOptions } from '@/features/book/api';
import { formatLocalDate, formatMoney, formatMonth } from '@/lib/format';
import { fetchReceipt, fetchStatement, folioLabel } from '../api';

const TODAY = '';

/** The depto's statement as a PDF: today, or as one of the closed months ended. */
export function StatementCard({ unit }: { unit: number }) {
  const history = useQuery(historyQueryOptions);
  const [through, setThrough] = useState(TODAY);
  const closed = (history.data?.months ?? []).filter(
    (month) => month.status === 'CLOSED' && !month.historical,
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Estado de cuenta en PDF</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="statement-through">Hasta</FieldLabel>
          <NativeSelect
            id="statement-through"
            className="w-full"
            value={through}
            onChange={(event) => setThrough(event.target.value)}
          >
            <NativeSelectOption value={TODAY}>El día de hoy</NativeSelectOption>
            {closed.map(({ month }) => (
              <NativeSelectOption key={month} value={month}>
                El cierre de {formatMonth(month)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <FileActions
          fetchFile={() => fetchStatement(unit, through || null)}
          title={`Estado de cuenta Depto ${unit}`}
        />
      </CardContent>
    </Card>
  );
}

/** The depto's payments, newest first, each with its receipt. */
export function PaymentsCard({ payments }: { payments: AccountStatement['payments'] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Pagos</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-muted-foreground">Sin pagos todavía.</p>
        ) : (
          <ul className="divide-y">
            {[...payments].reverse().map((payment) => (
              <li key={payment.id} className="flex flex-col gap-2 py-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-medium first-letter:uppercase">
                      {formatLocalDate(payment.date)}
                    </span>
                    {payment.receiptNumber !== null && (
                      <span className="text-muted-foreground">
                        Folio {folioLabel(payment.receiptNumber)}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatMoney(payment.amount)}</span>
                </span>
                {payment.receiptNumber !== null && (
                  <ReceiptActions id={payment.id} folio={payment.receiptNumber} />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A payment's receipt, to download or share. */
export function ReceiptActions({ id, folio }: { id: string; folio: number }) {
  return (
    <FileActions
      fetchFile={() => fetchReceipt(id, folio)}
      title={`Recibo folio ${folioLabel(folio)}`}
      label="Recibo"
      subject={`del folio ${folioLabel(folio)}`}
    />
  );
}
