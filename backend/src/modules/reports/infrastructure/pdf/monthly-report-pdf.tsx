import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ComponentProps, ReactNode } from 'react';
import type { Money } from '../../../../shared-kernel/index.js';
import type { ReportDocument, UnitReportLine } from '../../application/index.js';
import {
  currentFeeTone,
  dayMonth,
  money,
  monthName,
  monthTitle,
  observations,
  timestamp,
  visitDays,
  weekLabel,
} from './format.js';

// The building's monthly report as it has been shared over WhatsApp ("Balance
// Correspondencia 63"): the opening balance, a row per depto with its payment and
// observations, the expenses grouped by concept, and the closing balance.

const NAVY = '#1f3355';
const OWED = '#ffc7ce';
const PAID_BEFORE = '#c6efce';
const SHADE = '#d9d9d9';
const LINE = '#7f7f7f';
const MUTED = '#595959';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
  },
  building: { fontFamily: 'Helvetica-Bold', fontSize: 13, textAlign: 'center' },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
  },
  draft: {
    marginTop: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: NAVY,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  head: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    color: 'white',
    fontFamily: 'Helvetica-Bold',
  },
  headCell: { paddingVertical: 4, paddingHorizontal: 3, textAlign: 'center' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, minHeight: 12 },
  cell: { paddingVertical: 2, paddingHorizontal: 3, borderLeftWidth: 0.5, borderLeftColor: LINE },
  lastCell: { borderRightWidth: 0.5, borderRightColor: LINE },
  amount: { textAlign: 'right' },
  center: { textAlign: 'center' },
  bold: { fontFamily: 'Helvetica-Bold' },
  totals: { flexDirection: 'row', marginTop: 4 },
  group: { flexDirection: 'row', marginTop: 8, borderTopWidth: 0.5, borderTopColor: LINE },
  concept: {
    justifyContent: 'center',
    borderLeftWidth: 0.5,
    borderLeftColor: LINE,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: MUTED,
  },
});

/** One style object, as react-pdf types it (its type lives in a package we do not import). */
type Style = Exclude<NonNullable<ComponentProps<typeof View>['style']>, readonly unknown[]>;

// Column widths (points). The page is 532 points wide inside the margins.
const INCOME = { depto: 36, owner: 146, current: 72, other: 96 } as const;
const EXPENSE = { concept: 70, date: 120, amount: 75 } as const;

function Cell({
  width,
  children,
  style,
  last,
}: {
  width?: number;
  children?: ReactNode;
  style?: Style;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.cell,
        width ? { width } : { flex: 1 },
        last ? styles.lastCell : {},
        style ?? {},
      ]}
    >
      <Text>{children}</Text>
    </View>
  );
}

/** A label and an amount under a table's amount column, e.g. "TOTAL BASURA $600.00". */
function Total({
  label,
  value,
  offset,
  width,
  shaded,
  strong,
}: {
  label: string;
  value: Money;
  offset: number;
  width: number;
  shaded?: boolean;
  strong?: boolean;
}) {
  const box: Style = shaded ? { backgroundColor: SHADE } : {};
  const text: Style = strong ? { ...styles.bold, fontSize: 10 } : {};
  return (
    <View style={styles.totals} wrap={false}>
      <View style={{ width: offset, alignItems: 'flex-end' }}>
        <Text style={[{ paddingHorizontal: 6, paddingVertical: 2 }, box, text]}>{label}</Text>
      </View>
      <View style={[{ width, marginLeft: 6, paddingHorizontal: 3, paddingVertical: 2 }, box]}>
        <Text style={[styles.amount, text]}>{money(value)}</Text>
      </View>
    </View>
  );
}

function UnitRow({ line, report }: { line: UnitReportLine; report: ReportDocument }) {
  const tone = currentFeeTone(line);
  // A month of the history reads as its paper did; a live one, from the account.
  const current = line.paper?.current ?? line.currentFee?.paidThisMonth;
  const other = line.paper?.other ?? (current ? line.paid.minus(current) : line.paid);
  const fill: Style =
    tone === 'owed'
      ? { backgroundColor: OWED }
      : tone === 'paidBefore'
        ? { backgroundColor: PAID_BEFORE }
        : {};
  return (
    <View style={styles.row} wrap={false}>
      <Cell width={INCOME.depto} style={{ ...styles.center, ...styles.bold }}>
        {line.unit.value}
      </Cell>
      <Cell width={INCOME.owner}>{line.ownerName?.toUpperCase() ?? ''}</Cell>
      <Cell width={INCOME.current} style={{ ...styles.amount, ...fill }}>
        {current?.isPositive() ? money(current) : ''}
      </Cell>
      <Cell width={INCOME.other} style={styles.amount}>
        {other.isPositive() ? money(other) : ''}
      </Cell>
      <Cell last style={{ ...styles.center, fontSize: 6.5 }}>
        {line.paper?.text ?? observations(line, report.month, report.maintenanceFee)}
      </Cell>
    </View>
  );
}

function Income({ report }: { report: ReportDocument }) {
  const owners = INCOME.depto + INCOME.owner;
  return (
    <>
      <Text style={styles.sectionTitle}>INGRESOS</Text>
      <View style={styles.head} fixed>
        <Text style={[styles.headCell, { width: INCOME.depto }]}>DEPTO</Text>
        <Text style={[styles.headCell, { width: INCOME.owner }]}>PROPIETARIO</Text>
        <Text style={[styles.headCell, { width: INCOME.current }]}>MES EN CURSO</Text>
        <Text style={[styles.headCell, { width: INCOME.other }]}>ADEUDOS/ADELANTOS</Text>
        <Text style={[styles.headCell, { flex: 1 }]}>OBSERVACIONES</Text>
      </View>
      {report.units.map((line) => (
        <UnitRow key={line.unit.value} line={line} report={report} />
      ))}
      {report.otherIncome.length > 0 && (
        <View style={styles.group} wrap={false}>
          <View style={[styles.concept, { width: owners }]}>
            <Text style={styles.center}>OTROS INGRESOS</Text>
          </View>
          <View style={{ flex: 1 }}>
            {report.otherIncome.map((entry, index) => (
              <View key={index} style={styles.row}>
                <Cell width={INCOME.current} style={styles.amount}>
                  {money(entry.amount)}
                </Cell>
                <Cell last style={styles.center}>
                  {`${dayMonth(entry.date)}  ${entry.description ?? ''}`}
                </Cell>
              </View>
            ))}
          </View>
        </View>
      )}
      <Total label="INGRESOS" value={report.income} offset={owners - 6} width={INCOME.current} />
      <Total
        label="TOTAL DE INGRESOS"
        value={report.openingBalance.plus(report.income)}
        offset={owners - 6}
        width={INCOME.current}
        shaded
      />
    </>
  );
}

interface ExpenseRow {
  readonly key: string;
  readonly date: string;
  readonly amount: Money | null;
  readonly note?: string;
}

/** A block of expenses with its concept on the left, e.g. BASURA and its weeks. */
function ExpenseGroup({
  concept,
  rows,
  total,
  totalLabel,
}: {
  concept: string;
  rows: readonly ExpenseRow[];
  total: Money;
  totalLabel: string;
}) {
  return (
    <>
      <View style={styles.group} wrap={false}>
        <View style={[styles.concept, { width: EXPENSE.concept }]}>
          <Text style={styles.center}>{concept}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {rows.length === 0 && (
            <View style={styles.row}>
              <Cell width={EXPENSE.date} />
              <Cell width={EXPENSE.amount} />
              <Cell last />
            </View>
          )}
          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <Cell width={EXPENSE.date} style={styles.center}>
                {row.date}
              </Cell>
              <Cell width={EXPENSE.amount} style={styles.amount}>
                {row.amount ? money(row.amount) : ''}
              </Cell>
              <Cell last style={styles.center}>
                {row.note ?? ''}
              </Cell>
            </View>
          ))}
        </View>
      </View>
      <Total
        label={totalLabel}
        value={total}
        offset={EXPENSE.concept + EXPENSE.date - 6}
        width={EXPENSE.amount}
      />
    </>
  );
}

function Expenses({ report }: { report: ReportDocument }) {
  const { byCategory } = report;
  const offset = EXPENSE.concept + EXPENSE.date - 6;
  return (
    <>
      <Text style={styles.sectionTitle}>EGRESOS</Text>
      <View style={styles.head} fixed>
        <Text style={[styles.headCell, { width: EXPENSE.concept }]}>CONCEPTO</Text>
        <Text style={[styles.headCell, { width: EXPENSE.date }]}>FECHA</Text>
        <Text style={[styles.headCell, { width: EXPENSE.amount }]}>IMPORTE</Text>
        <Text style={[styles.headCell, { flex: 1 }]}>OBSERVACIONES</Text>
      </View>
      <ExpenseGroup
        concept="BASURA"
        rows={report.garbage.map((line, index) => ({
          key: `${String(line.week)}-${index}`,
          date: weekLabel(line.week),
          amount: line.amount,
        }))}
        total={byCategory.GARBAGE}
        totalLabel="TOTAL BASURA"
      />
      <ExpenseGroup
        concept="LIMPIEZA"
        rows={report.cleaning.map((payout) => ({
          key: String(payout.weekStart),
          date: visitDays(payout.dates),
          amount: payout.total,
        }))}
        total={byCategory.CLEANING}
        totalLabel="TOTAL LIMPIEZA"
      />
      <ExpenseGroup
        concept="OTROS"
        rows={report.otherExpenses.map((entry, index) => ({
          key: String(index),
          date: dayMonth(entry.date),
          amount: entry.amount,
          note: entry.description ?? '',
        }))}
        total={byCategory.OTHER_EXPENSE}
        totalLabel="TOTAL OTROS"
      />
      <View style={{ marginTop: 8 }} />
      <Total
        label="TOTAL DE EGRESOS"
        value={report.expense}
        offset={offset}
        width={EXPENSE.amount}
        shaded
      />
      <View style={{ marginTop: 6 }} />
      <Total
        label={closingLabel(report)}
        value={report.closingBalance}
        offset={offset}
        width={EXPENSE.amount}
        shaded
        strong
      />
    </>
  );
}

function closingLabel({ status, days, month }: ReportDocument): string {
  if (days && days.to < month.daysInMonth) return `SALDO AL ${days.to} DE ${monthName(month)}`;
  return status === 'CLOSED' ? 'SALDO AL FIN DE MES' : 'SALDO AL DÍA';
}

/** Who administered the month, as far as the platform knows (not before the rotation). */
function administeredBy({ administration }: ReportDocument): string | null {
  if (!administration) return null;
  const { scheduledUnit, responsibleUnits } = administration;
  if (responsibleUnits.length === 0)
    return `Turno de Depto ${scheduledUnit.value}, sin responsable`;
  const covering = responsibleUnits.filter((unit) => unit !== scheduledUnit);
  if (covering.length === 0) return `Administró Depto ${scheduledUnit.value}`;
  return `Turno de Depto ${scheduledUnit.value}, cubrió Depto ${covering.map((u) => u.value).join(' y ')}`;
}

/** The month, and the days of its sheet when it had more than one ("FEBRERO 2023, DEL 11 AL 28"). */
function pageTitle({ month, days }: ReportDocument): string {
  const title = monthTitle(month);
  return days ? `${title}, DEL ${days.from} AL ${days.to}` : title;
}

function ReportPage({ report }: { report: ReportDocument }) {
  const footer = [
    administeredBy(report),
    `Generado el ${timestamp(report.generatedAt)} con DepAdmin`,
  ].filter(Boolean);
  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.building}>EDIFICIO CORRESPONDENCIA 63</Text>
      <View style={styles.topLine}>
        <Text>{pageTitle(report)}</Text>
        <Text>SALDO A INICIO DE MES {money(report.openingBalance)}</Text>
      </View>
      {report.status === 'OPEN' && (
        <Text style={styles.draft}>
          BORRADOR: EL MES SIGUE ABIERTO Y ESTAS CIFRAS TODAVÍA PUEDEN CAMBIAR
        </Text>
      )}
      <Income report={report} />
      <Expenses report={report} />
      <View style={styles.footer} fixed>
        <Text>{footer.join(' · ')}</Text>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>
  );
}

/** The month's report: one page set per document (two for a month of the history that changed hands). */
export function MonthlyReportPdf({ reports }: { reports: readonly ReportDocument[] }) {
  const first = reports[0];
  const title = first ? monthTitle(first.month) : '';
  return (
    <Document
      title={`Edificio Correspondencia 63, ${title}`}
      author="Edificio Correspondencia 63"
      creator="DepAdmin"
      producer="DepAdmin"
      language="es-MX"
    >
      {reports.map((report, index) => (
        <ReportPage key={index} report={report} />
      ))}
    </Document>
  );
}
