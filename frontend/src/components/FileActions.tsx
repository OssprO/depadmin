import { DownloadSimpleIcon, EyeIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { FormError } from '@/components/FormError';
import { FormSheetContent } from '@/components/FormSheetContent';
import { PdfPreview } from '@/components/PdfPreview';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

/** Shares the file where the phone allows it, and downloads it otherwise. */
async function share(file: File, title: string): Promise<void> {
  if (!navigator.canShare?.({ files: [file] })) {
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
}

type Use = 'download' | 'share' | 'preview';

interface FileActionsProps {
  /** Asks the API for the file when a button is tapped. */
  readonly fetchFile: () => Promise<File>;
  /** What the share sheet calls it, e.g. "Recibo folio 0042"; the preview's title too. */
  readonly title: string;
  /** The download button's text. */
  readonly label?: string;
  /** Spreadsheets are not for WhatsApp: a CSV only downloads. */
  readonly shareable?: boolean;
  /** A PDF can be looked at before downloading it; a CSV cannot. */
  readonly previewable?: boolean;
  /** What the buttons are about, for screen readers when several sit on one screen. */
  readonly subject?: string;
  /** A note under the buttons (e.g. that an open month's PDF is a draft). */
  readonly children?: ReactNode;
}

/**
 * A document from the API: look at it first, download it, or share it straight to WhatsApp
 * where the phone allows it (Web Share API). The monthly report, receipts and statements
 * use it, and the CSV export (download only).
 */
export function FileActions({
  fetchFile,
  title,
  label = 'Descargar PDF',
  shareable = true,
  previewable = true,
  subject,
  children,
}: FileActionsProps) {
  // The file being previewed: its buttons use it, rather than asking the API again.
  const [previewed, setPreviewed] = useState<File | null>(null);
  const file = useMutation({
    mutationFn: async ({ use, ready }: { use: Use; ready?: File }) => {
      const fetched = ready ?? (await fetchFile());
      if (use === 'preview') setPreviewed(fetched);
      else if (use === 'download') download(fetched);
      else await share(fetched, title);
    },
  });
  // The space goes outside: an accessible name trims the text of each element it joins.
  const about = subject && (
    <>
      {' '}
      <span className="sr-only">{subject}</span>
    </>
  );
  const buttons = (ready?: File) => (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={file.isPending}
        onClick={() => file.mutate({ use: 'download', ...(ready && { ready }) })}
      >
        {/* Only a PDF is previewed, and the preview is about one file. */}
        <DownloadSimpleIcon /> {ready ? 'Descargar PDF' : label}
        {ready ? null : about}
      </Button>
      {shareable && canShareFiles() && (
        <Button
          variant="outline"
          size="sm"
          disabled={file.isPending}
          onClick={() => file.mutate({ use: 'share', ...(ready && { ready }) })}
        >
          <ShareNetworkIcon /> Compartir
          {ready ? null : about}
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {previewable && (
          <Button
            variant="outline"
            size="sm"
            disabled={file.isPending}
            onClick={() => file.mutate({ use: 'preview' })}
          >
            <EyeIcon /> Vista previa
            {about}
          </Button>
        )}
        {buttons()}
        {file.isPending && !previewed && (
          <span className="self-center text-muted-foreground" role="status">
            Preparando el archivo…
          </span>
        )}
      </div>
      {children}
      <FormError message={file.isError && !previewed ? errorMessage(file.error) : null} />
      {previewed && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setPreviewed(null);
              file.reset();
            }
          }}
        >
          {/* Its height is fixed and only the pages scroll, so the buttons stay in view. */}
          <FormSheetContent className="overflow-hidden data-[side=bottom]:h-[90svh] sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>Vista previa</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted px-4 py-3">
              <PdfPreview file={previewed} />
            </div>
            <SheetFooter className="mt-0 flex-row flex-wrap border-t">
              {buttons(previewed)}
              <FormError message={file.isError ? errorMessage(file.error) : null} />
            </SheetFooter>
          </FormSheetContent>
        </Sheet>
      )}
    </div>
  );
}
