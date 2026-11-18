import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { ReceiptDocument, StatementDocument } from '../../application/index.js';
import {
  balanceText,
  chargeText,
  coverageText,
  folioText,
  longDate,
  recorderText,
  STATUS_TEXT,
} from './account-format.js';
import { amount, money, monthTitle, timestamp } from './format.js';

// A payment's receipt (half a letter sheet) and a depto's account statement (a letter
// sheet), in the monthly report's colors and standard fonts.

const NAVY = '#1f3355';
const LINE = '#7f7f7f';
const MUTED = '#595959';

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 8.5,
  },
  building: { fontFamily: 'Helvetica-Bold', fontSize: 12, textAlign: 'center' },
  title: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  big: { fontFamily: 'Helvetica-Bold', fontSize: 14, marginTop: 10 },
  notice: {
    marginTop: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: NAVY,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  section: { marginTop: 12 },
  head: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    color: 'white',
    fontFamily: 'Helvetica-Bold',
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  muted: { color: MUTED },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 7,
    color: MUTED,
  },
});

function Table({
  widths,
  head,
  rows,
}: {
  widths: readonly number[];
  head: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  // Every column but the first holds an amount or a short value, aligned right.
  const cell = (text: string, i: number, key: string) => (
    <Text key={key} style={[styles.cell, { width: widths[i] ?? 0 }, i > 0 ? styles.right : {}]}>
      {text}
    </Text>
  );
  return (
    <View style={styles.section}>
      <View style={styles.head}>{head.map((text, i) => cell(text, i, `h${i}`))}</View>
      {rows.map((row, r) => (
        <View key={r} style={styles.row} wrap={false}>
          {row.map((text, i) => cell(text, i, `${r}-${i}`))}
        </View>
      ))}
    </View>
  );
}

function Footer({ generatedAt }: { generatedAt: ReceiptDocument['generatedAt'] }) {
  return (
    <Text style={styles.footer} fixed>
      Generado el {timestamp(generatedAt)} con DepAdmin
    </Text>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.bold}>{children}</Text>
    </View>
  );
}

/** Half a letter sheet: it fits a phone screen and prints two to a page. */
const HALF_LETTER: [number, number] = [396, 612];

export function ReceiptPdf({ receipt }: { receipt: ReceiptDocument }) {
  const rows = receipt.covered.map((c) => [coverageText(c, c.charged), amount(c.amount)]);
  if (receipt.ahead.isPositive()) rows.push(['ADELANTO', amount(receipt.ahead)]);
  const recorder = recorderText(receipt.recordedBy);
  return (
    <Document title={`Recibo ${folioText(receipt.folio)}`} author="DepAdmin">
      <Page size={HALF_LETTER} style={styles.page}>
        <Text style={styles.building}>EDIFICIO CORRESPONDENCIA 63</Text>
        <View style={styles.title}>
          <Text>RECIBO DE PAGO</Text>
          <Text>{folioText(receipt.folio)}</Text>
        </View>
        {receipt.monthOpen && (
          <Text style={styles.notice}>
            MES ABIERTO: SI SE CORRIGE EL LIBRO, ESTE RECIBO PUEDE CAMBIAR
          </Text>
        )}
        <Text style={styles.big}>
          DEPTO {receipt.unit.value} · {money(receipt.amount)}
        </Text>
        <Labelled label="FECHA">{longDate(receipt.date)}</Labelled>
        <Table widths={[234, 90]} head={['CONCEPTO', 'IMPORTE']} rows={rows} />
        {receipt.description && (
          <View style={styles.section}>
            <Text style={styles.muted}>OBSERVACIONES</Text>
            <Text>{receipt.description}</Text>
          </View>
        )}
        <View style={styles.section}>
          <Labelled label="SALDO DESPUÉS DEL PAGO">{balanceText(receipt.balanceAfter)}</Labelled>
          {recorder && <Labelled label="REGISTRÓ">{recorder}</Labelled>}
        </View>
        <Footer generatedAt={receipt.generatedAt} />
      </Page>
    </Document>
  );
}

export function StatementPdf({ statement }: { statement: StatementDocument }) {
  const asOf = statement.through
    ? `AL CIERRE DE ${monthTitle(statement.through)}`
    : `AL ${longDate(statement.asOf)}`;
  return (
    <Document title={`Estado de cuenta Depto ${statement.unit.value}`} author="DepAdmin">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.building}>EDIFICIO CORRESPONDENCIA 63</Text>
        <View style={styles.title}>
          <Text>ESTADO DE CUENTA · DEPTO {statement.unit.value}</Text>
          <Text>{asOf}</Text>
        </View>
        <Text style={styles.big}>{balanceText(statement.balance)}</Text>
        <Table
          widths={[200, 80, 80, 80, 100]}
          head={['CARGO', 'IMPORTE', 'PAGADO', 'PENDIENTE', 'ESTADO']}
          rows={statement.lines.map(({ charge, paid, outstanding, status }) => [
            chargeText(charge.type, charge.month),
            amount(charge.amount),
            amount(paid),
            amount(outstanding),
            STATUS_TEXT[status],
          ])}
        />
        <Table
          widths={[200, 140, 200]}
          head={['PAGO', 'FOLIO', 'IMPORTE']}
          rows={statement.payments.map(({ date, folio, amount: paid }) => [
            longDate(date),
            folio === null ? '' : folioText(folio),
            amount(paid),
          ])}
        />
        <Footer generatedAt={statement.generatedAt} />
      </Page>
    </Document>
  );
}
