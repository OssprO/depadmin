import type { MonthlyReport } from '@depadmin/shared';
import { FileActions } from '@/components/FileActions';
import { formatMonth } from '@/lib/format';
import { fetchReportPdf } from '../api';

/**
 * The month's report as a PDF, to download or share. A closed month's PDF always comes
 * out the same; an open month's is marked as a draft.
 */
export function ReportPdfActions({ report }: { report: MonthlyReport }) {
  return (
    <FileActions
      fetchFile={() => fetchReportPdf(report.month)}
      title={`Reporte de ${formatMonth(report.month)}`}
    >
      {report.status === 'OPEN' && (
        <p className="text-xs/relaxed text-muted-foreground">
          El mes sigue abierto: el PDF sale como borrador.
        </p>
      )}
    </FileActions>
  );
}
