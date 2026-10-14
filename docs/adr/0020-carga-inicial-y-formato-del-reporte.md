# ADR-0020: Carga inicial y reporte con el formato del edificio

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

El usuario compartió los reportes reales («Balance Correspondencia 63», dic 2024 – ene 2025 y abr – ago 2026), el rol de administración 2026–2028 y el reglamento. De ahí salen dos cosas:

- **El formato del reporte.** Encabezado con «SALDO A INICIO DE MES». Tabla de ingresos DEPTO · PROPIETARIO · MES EN CURSO · ADEUDOS/ADELANTOS · OBSERVACIONES, en orden 101 → 502. Rojo si el mes se debe, verde si se pagó por adelantado. Egresos por concepto: basura por semana (las no pagadas en blanco), limpieza por semana con sus días y otros con fecha y descripción. Al final «TOTAL DE INGRESOS» (saldo inicial más ingresos) y «SALDO AL FIN DE MES».
- **Lo que trae cada depto al empezar los libros** (pregunta 7). Un ejemplo es 301 en agosto de 2026: «ADEUDA 10,000 | 600 DE AGO '25 + 8,400 DE SEP '25 A … + 1,000 POR NO LLEVAR ADMINISTRACIÓN». Otro es 202, que tenía adelantado septiembre.

El rol 2026–2028 confirma la rotación y la multa de $500 que la app ya usa.

## Decisión

- **Nombre del propietario en el depto** (`Unit.ownerName`): lo edita el superadmin, queda en la bitácora y no se precarga en la semilla para no guardar datos personales en el repositorio. Cuando cambia el dueño se cambia el nombre. Un PDF viejo muestra el nombre actual; es el único dato del reporte que no se congela.
- **Carga inicial sin conceptos nuevos en las cuentas:**
  - **Adeudos:** son cargos comunes fechados antes del primer mes. Un mes pagado a medias se captura como lo que faltaba (600 de agosto 2025), y la multa como `SHIFT_SKIP_PENALTY`.
  - **Adelanto:** se guarda en `opening_credit` y cuenta como un pago hecho el día anterior al inicio (`openingPayment`). Así la asignación del más antiguo primero lo aplica sola, sin casos especiales.
  - **No mueve el efectivo.** El saldo de caja ya viene del inicio de la contabilidad.
  - **Se reemplaza por depto completo** (`PUT /api/opening-balances/:unit`), con una entrada de bitácora `OPENING_BALANCE_SET` que muestra antes y después.
  - **Se puede editar hasta que cierra el primer mes.** Para corregirla después se reabre ese mes (`OPENING_BALANCE_LOCKED`). El primer mes ya no se puede mover mientras haya carga inicial (`OPENING_BALANCES_SET`), porque sus fechas dependen de él.
- **El PDF copia el formato de las hojas:**
  - **Datos que ya existían:** el documento agrega la división del pago del mes (cuánto fue a la cuota del mes y cuánto a adeudos o adelantos), cómo se pagó la cuota del mes (este mes, antes y en qué mes, o se debe), el adelanto nuevo y la cuota vigente.
  - **Observaciones generadas** con el mismo estilo, a partir de esos datos:
    - «LIQUIDA FEBRERO Y MARZO | PAGA ABRIL | ADELANTA MAYO» y «PAGÓ EN ABRIL».
    - «ADEUDA DE FEBRERO A ABRIL (3 MESES) TOTAL 2,100» cuando son meses completos y seguidos.
    - Desglose cuando no lo son: «ADEUDA 10,000 | 600 DE AGO '25 + … + 1,000 POR NO LLEVAR ADMINISTRACIÓN».
  - **Semanas de basura:** las de un mes de cierre que nadie pagó salen en blanco, igual que en las hojas. Una semana pagada en otro mes es egreso de ese otro mes.

## Consecuencias

- No hace falta capturar todo el historial: basta con el último reporte antes del corte (saldo de caja y carga inicial por depto). Los PDFs anteriores quedan como consulta.
- Si se quisiera ver en la app meses anteriores al corte, habría que capturarlos como meses normales. Eso solo se puede desde agosto de 2026, porque las tarifas empiezan ahí; antes habría que agregar las tarifas vigentes entonces.
- El texto de las observaciones vive en el adaptador del PDF (`infrastructure/pdf/format.ts`), con pruebas tomadas de los casos reales.
