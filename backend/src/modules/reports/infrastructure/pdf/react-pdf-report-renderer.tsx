import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import type {
  ReceiptDocument,
  ReportDocument,
  ReportRenderer,
  StatementDocument,
} from '../../application/index.js';
import { ReceiptPdf, StatementPdf } from './account-pdf.js';
import { MonthlyReportPdf } from './monthly-report-pdf.js';

/**
 * Lays the report out with @react-pdf/renderer, in the API process: no headless browser,
 * so the server stays small (ADR-0007). It uses the standard PDF fonts, which every reader
 * has, so nothing is embedded. The receipts and statements share the report's style.
 */
@Injectable()
export class ReactPdfReportRenderer implements ReportRenderer {
  async render(documents: readonly ReportDocument[]): Promise<Uint8Array> {
    return new Uint8Array(await renderToBuffer(<MonthlyReportPdf reports={documents} />));
  }

  async renderReceipt(document: ReceiptDocument): Promise<Uint8Array> {
    return new Uint8Array(await renderToBuffer(<ReceiptPdf receipt={document} />));
  }

  async renderStatement(document: StatementDocument): Promise<Uint8Array> {
    return new Uint8Array(await renderToBuffer(<StatementPdf statement={document} />));
  }
}
