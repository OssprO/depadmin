# ADR-0032: Recibos con folio, estado de cuenta en PDF y exportación a CSV

**Estado:** Aceptado · **Fecha:** 2026-11-18

## Contexto

Cada vecino ve su estado de cuenta en la app, pero no tiene un papel que mostrar: un recibo de lo que pagó, o su estado de cuenta para un trámite. Y quien lleva las cuentas en una hoja de cálculo tiene que copiar los movimientos a mano (`docs/PLAN-ETAPA-3.md`, fase 23).

## Decisión

- **Un folio consecutivo del edificio** para cada pago de depto en vivo (`cash_movement.receipt_number`):
  - **Lo pone la base de datos**, con una secuencia y un trigger; la app nunca escribe la columna. Así dos pagos que se registran a la vez nunca comparten folio.
  - **Nunca se reutiliza:** un pago borrado conserva su folio, anulado.
  - **El trigger numera `AFTER INSERT`, no `BEFORE`:** la app guarda con `INSERT … ON CONFLICT DO UPDATE`, y los triggers `BEFORE INSERT` se disparan aunque la fila ya exista. Numerar ahí gastaría un folio en cada corrección y dejaría huecos. Un renglón que una corrección vuelve pago recibe el suyo en `BEFORE UPDATE`.
  - **Los pagos del historial no llevan folio:** sus cuentas viven en el papel (ADR-0023). La migración numeró los pagos ya registrados desde el corte, en orden de fecha.
- **El recibo de un pago** (PDF de media carta, desde el pago en el Libro o en el estado de cuenta):
  - Dice el depto, la fecha, el importe, qué cubrió y el adelanto que dejó, con la misma asignación de `allocatePayments`.
  - Lleva las observaciones, **quién lo registró** (de la bitácora, el alta del renglón) y **el saldo del depto justo después del pago**.
  - **Se lee como estaba la cuenta al pagar:** los cargos hasta el mes del pago contra los pagos hasta ese, en el orden en que se aplican. Por eso no cambia cuando se abren meses después, ni cuando el depto paga otra vez.
  - Mientras su mes sigue abierto, una corrección del libro sí puede cambiarlo, y el recibo lo dice: «MES ABIERTO: SI SE CORRIGE EL LIBRO, ESTE RECIBO PUEDE CAMBIAR».
- **El estado de cuenta en PDF:** hoy, o como quedó al cierre de un mes cerrado (el mismo cálculo que el reporte mensual). Lleva los cargos, lo pagado de cada uno y los pagos con su folio.
- **Exportar a CSV** los movimientos de un rango de meses, desde el Histórico: UTF-8 con BOM, comas y punto decimal, como los abren Excel y Google Sheets en México.
- **Todos pueden descargarlos:** cualquiera ve todas las cuentas y el libro (SPEC, sección 3).
- **Un solo componente para descargar o compartir** (`FileActions`): el reporte, los recibos y los estados de cuenta abren WhatsApp en el celular, y el CSV solo se descarga.
- **Vista previa antes de descargar** (agregada después de la fase): los PDF se ven primero en un panel, que trae sus propios «Descargar PDF» y «Compartir» con el mismo archivo, sin volver a pedirlo.
  - **Los dibuja pdf.js** (`pdfjs-dist`) en canvas. Chrome en Android no muestra un PDF: lo descarga, así que abrirlo en otra pestaña no evitaría la descarga.
  - Se carga solo con la primera vista previa, en su propio chunk (unos 130 KB con gzip, más su worker), así que la app no pesa más al abrir.
  - Cabe en la CSP sin cambiarla: pdf.js 6 no usa `eval`, su worker es un archivo propio y se le apaga WebAssembly, que solo necesita para imágenes que nuestros PDF no tienen.
  - **El worker es un `.mjs`,** que el nginx de la imagen `web` no conocía y servía como `octet-stream`; con `nosniff` el navegador lo rechaza. `infra/web/default.conf` ahora lo sirve como JavaScript (y, de paso, el manifiesto de la PWA con su tipo).
- **El puerto `REPORT_RENDERER` dibuja también el recibo y el estado de cuenta,** en el estilo del reporte y con las fuentes estándar del PDF (solo WinAnsi).

## Consecuencias

- **El folio es de la base de datos:** un pago que se guarda sin pasar por ella (las pruebas en memoria) lo recibe de un doble que imita al trigger.
- **`reports` lee la bitácora** (`ListAuditLog`, que `audit` ahora exporta) para decir quién registró un pago. No se guarda en el renglón.
- **Un pago corregido de depto a otro tipo conserva su folio,** anulado, como uno borrado.
