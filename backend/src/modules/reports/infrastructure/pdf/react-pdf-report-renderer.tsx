import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReportDocument, ReportRenderer } from '../../application/index.js';
import { MonthlyReportPdf } from './monthly-report-pdf.js';

/**
 * Lays the report out with @react-pdf/renderer, in the API process: no headless browser,
 * so the server stays small (ADR-0007). It uses the standard PDF fonts, which every reader
 * has, so nothing is embedded.
 */
@Injectable()
export class ReactPdfReportRenderer implements ReportRenderer {
  async render(document: ReportDocument): Promise<Uint8Array> {
    return new Uint8Array(await renderToBuffer(<MonthlyReportPdf report={document} />));
  }
}
