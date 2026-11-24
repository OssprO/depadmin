import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// The worker is one of the app's own files, so the CSP's `script-src 'self'` covers it.
GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * The most pixels a page is drawn across: twice the screen's, for pinching in, up to this
 * (a letter page then takes some 17 MB, so a report of several pages still fits a phone).
 */
const MAX_PAGE_PIXELS = 1800;

/**
 * Draws every page of a PDF on its own canvas, for a page `width` CSS pixels wide. A phone's
 * browser does not show a PDF itself (Chrome on Android downloads it), so pdf.js draws it.
 * It is loaded only when someone previews a file, in its own chunk.
 */
export async function drawPdfPages(
  data: ArrayBuffer,
  width: number,
  signal: AbortSignal,
): Promise<HTMLCanvasElement[]> {
  // Our PDFs use the standard fonts and no images: no WebAssembly (the CSP forbids it), and
  // the phone's own fonts stand in for the standard ones, with their widths from pdf.js.
  const task = getDocument({ data, useWasm: false, useSystemFonts: true });
  const cancel = () => void task.destroy();
  signal.addEventListener('abort', cancel);
  try {
    const pdf = await task.promise;
    const canvases: HTMLCanvasElement[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const natural = page.getViewport({ scale: 1 });
      const pixels = Math.min(MAX_PAGE_PIXELS, width * (window.devicePixelRatio || 1) * 2);
      const viewport = page.getViewport({ scale: pixels / natural.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  } finally {
    signal.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
