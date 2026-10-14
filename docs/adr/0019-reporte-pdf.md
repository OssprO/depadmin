# ADR-0019: Reporte mensual en PDF

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

El reporte mensual se comparte por WhatsApp como PDF (spec §1 y §5). El ADR-0007 eligió @react-pdf/renderer en el backend. Esta fase decide qué muestra el PDF, cómo se mantiene idéntico con el tiempo y cómo llega al teléfono.

Aún no hay un PDF real del reporte actual (pregunta abierta 6). La plantilla sigue el modelo de datos de la spec (§7): saldo inicial y final, pagos por depto con adeudo y adelanto, y egresos por categoría. Se ajustará cuando haya un ejemplo.

## Decisión

- **El contenido se separa del diseño.**
  - `RenderMonthlyReport` arma un `ReportDocument`: valores simples con las cuatro cifras, una línea por depto, los renglones por categoría y quién administró el mes.
  - Le pasa ese documento al puerto `ReportRenderer`.
  - El adaptador `ReactPdfReportRenderer` (en `reports/infrastructure/pdf/`) solo lo acomoda en la página. Las pruebas del contenido usan un renderer falso; las del adaptador generan un PDF real.
- **Un mes cerrado siempre produce el mismo PDF:**
  - Las cifras salen de su foto y los renglones están congelados.
  - Las cuentas de cada depto se calculan como estaban al terminar el mes: cargos de ese mes y anteriores, y pagos fechados hasta su último día (`GetAccountStatements.ofAll(payments, through)`). Un pago de octubre no cambia el reporte de septiembre, y un pago adelantado se ve como adelanto, porque el cargo siguiente aún no existía.
  - Solo cambia si el superadmin reabre ese mes o uno anterior, que es justo cuando debe cambiar.
- **Un mes abierto también tiene PDF,** marcado como borrador, para compartir avances.
- **Base de caja también en el PDF:** la limpieza se agrupa por semana con solo las visitas del mes, para que la suma coincida con el egreso del mes.
- **Fuentes estándar del PDF (Helvetica):** no se incrusta nada y el archivo pesa unos pocos KB. Solo admiten caracteres WinAnsi, así que el texto usa «-» en lugar del signo menos «−». Los acentos, la «ñ» y el «¿» sí funcionan.
- **Endpoint:** `GET /api/months/:month/report.pdf`, para cualquier usuario autenticado (transparencia total, spec §3). Responde `Content-Disposition: attachment` y `Cache-Control: private, no-store`.
- **Compartir:**
  - El frontend descarga el archivo con el token (no hay cookie de acceso) y lo comparte con la Web Share API (`navigator.share({ files })`). En el celular abre WhatsApp directamente.
  - Si el navegador no comparte archivos, o perdió el permiso del toque mientras llegaba el PDF, se descarga.
- **El backend compila JSX** (`"jsx": "react-jsx"`) para las plantillas; React es una dependencia del backend solo para eso.

## Consecuencias

- Cambiar el diseño no toca la lógica, y viceversa. Con un PDF de ejemplo se ajusta solo `monthly-report-pdf.tsx`.
- Generar el PDF de un mes recorre los pagos de todos los meses; con 10 deptos es instantáneo.
- No se guardan PDFs: se generan al pedirlos. Si algún día se quisiera archivar el PDF exacto que se compartió, se guardaría al cerrar el mes.
