import { DownloadSimpleIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages';

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

interface FileActionsProps {
  /** Asks the API for the file when a button is tapped. */
  readonly fetchFile: () => Promise<File>;
  /** What the share sheet calls it, e.g. "Recibo folio 0042". */
  readonly title: string;
  /** The download button's text. */
  readonly label?: string;
  /** Spreadsheets are not for WhatsApp: a CSV only downloads. */
  readonly shareable?: boolean;
  /** What the buttons are about, for screen readers when several sit on one screen. */
  readonly subject?: string;
  /** A note under the buttons (e.g. that an open month's PDF is a draft). */
  readonly children?: ReactNode;
}

/**
 * A document from the API: download it, or share it straight to WhatsApp where the phone
 * allows it (Web Share API). The monthly report, receipts and statements use it.
 */
export function FileActions({
  fetchFile,
  title,
  label = 'Descargar PDF',
  shareable = true,
  subject,
  children,
}: FileActionsProps) {
  const file = useMutation({
    mutationFn: async (how: 'download' | 'share') => {
      const fetched = await fetchFile();
      if (how === 'download' || !navigator.canShare?.({ files: [fetched] })) {
        download(fetched);
        return;
      }
      try {
        await navigator.share({ files: [fetched], title });
      } catch (error) {
        // Closing the share sheet is not an error. If the browser refused (the tap was too
        // long ago by the time the file arrived), the download still gets the file out.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') download(fetched);
        else throw error;
      }
    },
  });
  // The space goes outside: an accessible name trims the text of each element it joins.
  const about = subject && (
    <>
      {' '}
      <span className="sr-only">{subject}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={file.isPending}
          onClick={() => file.mutate('download')}
        >
          <DownloadSimpleIcon /> {label}
          {about}
        </Button>
        {shareable && canShareFiles() && (
          <Button
            variant="outline"
            size="sm"
            disabled={file.isPending}
            onClick={() => file.mutate('share')}
          >
            <ShareNetworkIcon /> Compartir
            {about}
          </Button>
        )}
        {file.isPending && (
          <span className="self-center text-muted-foreground" role="status">
            Preparando el archivo…
          </span>
        )}
      </div>
      {children}
      <FormError message={file.isError ? errorMessage(file.error) : null} />
    </div>
  );
}
