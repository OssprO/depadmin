import type { MonthlyReport } from '@depadmin/shared';
import { DownloadSimpleIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages';
import { formatMonth } from '@/lib/format';
import { fetchReportPdf } from '../api';

/** Saves the file through a temporary link, as a browser download. */
function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  // Give the browser a moment to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Whether this browser can hand a file to another app (WhatsApp on a phone). */
const canShareFiles = () => typeof navigator.share === 'function';

/**
 * The month's report as a PDF: download it, or share it straight to WhatsApp where the
 * phone allows it (Web Share API). A closed month's PDF always comes out the same; an open
 * month's is marked as a draft.
 */
export function ReportPdfActions({ report }: { report: MonthlyReport }) {
  const title = `Reporte de ${formatMonth(report.month)}`;
  const pdf = useMutation({
    mutationFn: async (how: 'download' | 'share') => {
      const file = await fetchReportPdf(report.month);
      if (how === 'download' || !navigator.canShare?.({ files: [file] })) {
        download(file);
        return;
      }
      try {
        await navigator.share({ files: [file], title });
      } catch (error) {
        // Closing the share sheet is not an error. If the browser refused (the tap was too
        // long ago by the time the file arrived), the download still gets the file out.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') download(file);
        else throw error;
      }
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pdf.isPending}
          onClick={() => pdf.mutate('download')}
        >
          <DownloadSimpleIcon /> Descargar PDF
        </Button>
        {canShareFiles() && (
          <Button
            variant="outline"
            size="sm"
            disabled={pdf.isPending}
            onClick={() => pdf.mutate('share')}
          >
            <ShareNetworkIcon /> Compartir
          </Button>
        )}
        {pdf.isPending && (
          <span className="self-center text-muted-foreground" role="status">
            Preparando el PDF…
          </span>
        )}
      </div>
      {report.status === 'OPEN' && (
        <p className="text-xs/relaxed text-muted-foreground">
          El mes sigue abierto: el PDF sale como borrador.
        </p>
      )}
      <FormError message={pdf.isError ? errorMessage(pdf.error) : null} />
    </div>
  );
}
