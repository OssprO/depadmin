import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ComponentProps, ReactNode } from 'react';
import type { Money } from '../../../../shared-kernel/index.js';
import type { ReportDocument, ReportEntry } from '../../application/index.js';
import { coverage, money, monthTitle, owed, shortDate, timestamp, week } from './format.js';

// The monthly report in the spirit of the one shared over WhatsApp: the four figures on top,
// each depto's payment and account, then the expenses by category. Black on white, so it
// reads well on a phone and prints well too.

const INK = '#111111';
const MUTED = '#666666';
const RULE = '#d4d4d4';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
  },
  building: { fontSize: 8, letterSpacing: 1.5, color: MUTED },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 18, marginTop: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerSide: { alignItems: 'flex-end', gap: 2 },
  draft: {
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: INK,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'center',
  },
  summary: {
    flexDirection: 'row',
    marginTop: 14,
    borderWidth: 1,
    borderColor: INK,
  },
  figure: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, gap: 3 },
  figureDivider: { borderLeftWidth: 1, borderLeftColor: RULE },
  figureLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8 },
  figureValue: { fontSize: 12 },
  figureStrong: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  section: { marginTop: 18 },
  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  head: { color: MUTED, fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  muted: { color: MUTED },
  bold: { fontFamily: 'Helvetica-Bold' },
  amount: { textAlign: 'right' },
  subtotal: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 4, gap: 12 },
  empty: { paddingVertical: 4, color: MUTED },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
});

/** One style object, as react-pdf types it (its type lives in a package we do not import). */
type Style = Exclude<NonNullable<ComponentProps<typeof View>['style']>, readonly unknown[]>;

/** A table cell: flexible by default, or fixed width; amounts align right. */
function Cell({
  width,
  flex,
  amount,
  children,
  style,
}: {
  width?: number;
  flex?: number;
  amount?: boolean;
  children?: ReactNode;
  style?: Style;
}) {
  return (
    <View style={width ? { width } : { flex: flex ?? 1 }}>
      <Text style={[amount ? styles.amount : {}, style ?? {}]}>{children}</Text>
    </View>
  );
}

function Section({
  title,
  total,
  children,
}: {
  title: string;
  total?: Money;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitle} wrap={false}>
        <Text>{title}</Text>
        {total && <Text>{money(total)}</Text>}
      </View>
      {children}
    </View>
  );
}

function Summary({ report }: { report: ReportDocument }) {
  const figures: [string, string, boolean][] = [
    ['Saldo inicial', money(report.openingBalance), false],
    ['Ingresos', `+ ${money(report.income)}`, false],
    ['Egresos', `- ${money(report.expense)}`, false],
    [
      report.status === 'CLOSED' ? 'Saldo final' : 'Saldo al día',
      money(report.closingBalance),
      true,
    ],
  ];
  return (
    <View style={styles.summary}>
      {figures.map(([label, value, strong], index) => (
        <View key={label} style={[styles.figure, index > 0 ? styles.figureDivider : {}]}>
          <Text style={styles.figureLabel}>{label}</Text>
          <Text style={strong ? styles.figureStrong : styles.figureValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function UnitsTable({ report }: { report: ReportDocument }) {
  const fees = report.byCategory.UNIT_PAYMENT;
  return (
    <Section title="Cuotas por depto" total={fees}>
      <View style={[styles.row, styles.head]} fixed>
        <Cell width={46}>Depto</Cell>
        <Cell width={70} amount>
          Pagó
        </Cell>
        <Cell flex={1.6} style={{ paddingLeft: 10 }}>
          Cubre
        </Cell>
        <Cell width={70} amount>
          Adeudo
        </Cell>
        <Cell flex={1.2} style={{ paddingLeft: 10 }}>
          Meses que debe
        </Cell>
        <Cell width={64} amount>
          Adelanto
        </Cell>
      </View>
      {report.units.map((line) => (
        <View key={line.unit.value} style={styles.row} wrap={false}>
          <Cell width={46} style={styles.bold}>
            {line.unit.value}
          </Cell>
          <Cell width={70} amount style={line.paid.isZero() ? styles.muted : {}}>
            {line.paid.isZero() ? '-' : money(line.paid)}
          </Cell>
          <Cell flex={1.6} style={{ paddingLeft: 10, ...styles.muted }}>
            {line.active ? coverage(line.covered) : 'inactivo este mes'}
          </Cell>
          <Cell width={70} amount style={line.outstanding.isZero() ? styles.muted : styles.bold}>
            {line.outstanding.isZero() ? 'al corriente' : money(line.outstanding)}
          </Cell>
          <Cell flex={1.2} style={{ paddingLeft: 10, ...styles.muted }}>
            {owed(line.owed)}
          </Cell>
          <Cell width={64} amount style={line.credit.isZero() ? styles.muted : {}}>
            {line.credit.isZero() ? '-' : money(line.credit)}
          </Cell>
        </View>
      ))}
      <Text style={[styles.muted, { marginTop: 4, fontSize: 7.5 }]}>
        {report.status === 'CLOSED'
          ? 'Adeudo y adelanto al cierre del mes.'
          : 'Adeudo y adelanto a la fecha.'}{' '}
        Cada pago cubre primero lo más antiguo.
      </Text>
    </Section>
  );
}

/** Rows with a date, a description and an amount (other income, other expenses). */
function EntriesTable({
  title,
  entries,
  total,
}: {
  title: string;
  entries: readonly ReportEntry[];
  total: Money;
}) {
  return (
    <Section title={title} total={total}>
      {entries.map((entry, index) => (
        <View key={index} style={styles.row} wrap={false}>
          <Cell width={110}>{shortDate(entry.date)}</Cell>
          <Cell>{entry.description ?? ''}</Cell>
          <Cell width={80} amount>
            {money(entry.amount)}
          </Cell>
        </View>
      ))}
    </Section>
  );
}

function Expenses({ report }: { report: ReportDocument }) {
  const { byCategory } = report;
  return (
    <>
      <Section title="Basura" total={byCategory.GARBAGE}>
        {report.garbage.length === 0 && <Text style={styles.empty}>Sin pagos este mes.</Text>}
        {report.garbage.map((entry, index) => (
          <View key={index} style={styles.row} wrap={false}>
            <Cell width={110}>{shortDate(entry.date)}</Cell>
            <Cell style={styles.muted}>{entry.week && `semana ${week(entry.week)}`}</Cell>
            <Cell width={80} amount>
              {money(entry.amount)}
            </Cell>
          </View>
        ))}
      </Section>
      <Section title="Limpieza" total={byCategory.CLEANING}>
        {report.cleaning.length === 0 && <Text style={styles.empty}>Sin visitas este mes.</Text>}
        {report.cleaning.map((payout) => (
          <View key={String(payout.weekStart)} style={styles.row} wrap={false}>
            <Cell width={110}>Semana {week(payout.weekStart)}</Cell>
            <Cell style={styles.muted}>
              {payout.dates.length === 1 ? '1 visita' : `${payout.dates.length} visitas`}:{' '}
              {payout.dates.map(shortDate).join(', ')}
            </Cell>
            <Cell width={80} amount>
              {money(payout.total)}
            </Cell>
          </View>
        ))}
      </Section>
      {report.otherExpenses.length > 0 && (
        <EntriesTable
          title="Otros egresos"
          entries={report.otherExpenses}
          total={byCategory.OTHER_EXPENSE}
        />
      )}
    </>
  );
}

function administeredBy({ scheduledUnit, responsibleUnits }: ReportDocument): string {
  if (responsibleUnits.length === 0)
    return `Turno de Depto ${scheduledUnit.value}, sin responsable`;
  const covering = responsibleUnits.filter((unit) => unit !== scheduledUnit);
  if (covering.length === 0) return `Administra Depto ${scheduledUnit.value}`;
  return `Turno de Depto ${scheduledUnit.value}, cubre Depto ${covering.map((u) => u.value).join(' y ')}`;
}

export function MonthlyReportPdf({ report }: { report: ReportDocument }) {
  const title = monthTitle(report.month);
  return (
    <Document
      title={`Reporte de mantenimiento, ${title}`}
      author="Edificio Correspondencia 63"
      creator="DepAdmin"
      producer="DepAdmin"
      language="es-MX"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.building}>EDIFICIO CORRESPONDENCIA 63</Text>
            <Text style={styles.title}>Reporte de mantenimiento</Text>
            <Text style={{ fontSize: 12, marginTop: 2 }}>{title}</Text>
          </View>
          <View style={styles.headerSide}>
            <Text>{administeredBy(report)}</Text>
            <Text style={styles.muted}>
              {report.status === 'CLOSED' ? 'Mes cerrado' : 'Mes abierto'}
            </Text>
          </View>
        </View>
        {report.status === 'OPEN' && (
          <Text style={styles.draft}>
            BORRADOR: el mes sigue abierto y estas cifras todavía pueden cambiar.
          </Text>
        )}
        <Summary report={report} />
        <UnitsTable report={report} />
        {report.otherIncome.length > 0 && (
          <EntriesTable
            title="Otros ingresos"
            entries={report.otherIncome}
            total={report.byCategory.OTHER_INCOME}
          />
        )}
        <Expenses report={report} />
        <View style={[styles.subtotal, { marginTop: 12 }]} wrap={false}>
          <Text style={styles.muted}>Total de egresos</Text>
          <Text style={styles.bold}>{money(report.expense)}</Text>
        </View>
        <View style={styles.footer} fixed>
          <Text>Generado el {timestamp(report.generatedAt)} con DepAdmin</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
