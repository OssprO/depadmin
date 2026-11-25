import { useEffect, useRef, useState } from 'react';
import { errorReporter } from '@/lib/error-reporter';

/**
 * A PDF drawn page by page, as wide as the space it is given. pdf.js loads only now, with
 * the first preview. The pages go in a box React leaves alone; the status sits outside it.
 */
export function PdfPreview({ file }: { file: File }) {
  const pages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'drawing' | 'drawn' | 'failed'>('drawing');

  useEffect(() => {
    const box = pages.current;
    if (!box) return;
    const controller = new AbortController();
    setState('drawing');
    void (async () => {
      try {
        const { drawPdfPages } = await import('@/lib/pdf-pages');
        const canvases = await drawPdfPages(
          await file.arrayBuffer(),
          box.clientWidth,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        canvases.forEach((canvas, index) => {
          canvas.className = 'h-auto w-full bg-white shadow-sm';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Página ${index + 1} de ${canvases.length}`);
        });
        box.replaceChildren(...canvases);
        setState('drawn');
      } catch (error) {
        if (controller.signal.aborted) return;
        // The download still works; the log learns why this browser could not draw it.
        errorReporter.report('error', error);
        setState('failed');
      }
    })();
    return () => {
      controller.abort();
      box.replaceChildren();
    };
  }, [file]);

  return (
    <div className="flex flex-col gap-3">
      {state === 'drawing' && (
        <p className="text-muted-foreground" role="status">
          Dibujando la vista previa…
        </p>
      )}
      {state === 'failed' && (
        <p className="text-muted-foreground" role="alert">
          No se pudo mostrar la vista previa aquí. Descárgalo para verlo.
        </p>
      )}
      <div ref={pages} className="flex flex-col gap-3" />
    </div>
  );
}
