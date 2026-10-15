# ADR-0022: El historial del edificio, aparte de los libros

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

El edificio llevó sus cuentas en hojas «Balance Correspondencia 63» desde mayo de 2022. Se transcribieron 51 meses (fuera del repositorio, porque nombran a los vecinos) y hay que subirlos a la plataforma. Lo que se sabía al decidir:

- **Las cuentas por depto no se pueden reconstruir.** Al calcular el adeudo de cada depto desde 2022 (cuotas y multas contra pagos), la suma sale $23,900 arriba del papel de julio 2026 y ningún depto coincide. Faltan tres meses completos, en 2022 los $100 de administración se pagaban fuera de la caja y la cuota cambió a mitad de febrero de 2023.
- **El rol de administración de antes no es el que calcula la plataforma.** Por ejemplo, 202 llevó abril–mayo 2024 y el cálculo hacia atrás diría 201.
- **El superadmin quiere revisar cada mes contra su papel antes de darlo por bueno.** Mientras tanto, la revisión no debe llenar la bitácora, que empieza con los libros en agosto 2026.
- **Los libros en vivo empiezan en agosto 2026,** y el superadmin captura a mano su efectivo y su carga inicial. El historial no debe moverlos.
- **Los meses sin papel entran vacíos;** el superadmin los captura cuando aparezcan las hojas.

## Decisión

- **Módulo `history`, con tablas propias** (`historical_books`, `historical_sheet`, `historical_movement`). Nunca escribe en los libros en vivo ni en las cuentas, y los libros no leen el historial. El efectivo de agosto 2026 es el que captura el superadmin: el corte queda fijo.
- **Un renglón del historial sigue las mismas reglas que uno en vivo.**
  - El vocabulario de un renglón (`MovementCategory`, `CATEGORY_RULES`, `MovementDetails`, `validateMovement`) pasó del módulo `cashbook` al shared kernel (`movement.ts`), para que los dos validen con la misma tabla.
  - Cada semana de basura se paga una vez, con su restricción de exclusión en la base.
  - Lo que no aplica: la ventana de escritura y las cuotas. Borrar un renglón lo elimina, porque es una transcripción en corrección y no un registro contable.
- **La hoja de papel es una entidad aparte** (`PaperSheet`), una por día de inicio del mes, porque hubo entregas a mitad de mes (10 o 11). Guarda:
  - las cifras del papel, nulas donde falta la hoja o no se lee;
  - las alertas de la transcripción;
  - la columna OBSERVACIONES, una por depto.
- **La revisión compara cada mes con su papel en dos números** (`reviewHistory`):
  - **Diferencia propia:** lo que suman los renglones del mes menos lo que movió su hoja (cierre menos apertura). Dice si ese mes está bien transcrito, sin depender de los anteriores.
  - **Diferencia que arrastra:** el saldo con que llega menos lo que abre el papel. Un mes sin capturar se nota aquí en todos los siguientes, hasta que se completa.
- **Al importar, primero se ve y después se guarda.**
  - `POST /api/history/preview` revisa el archivo con el contrato compartido (`historyFileSchema`) y con el dominio, y devuelve el resumen sin guardar.
  - `POST /api/history` guarda todo en una transacción.
  - Para corregir el archivo e importarlo otra vez está `DELETE /api/history`, solo mientras está en revisión.
- **Sin bitácora mientras está en revisión.** La importación y las correcciones no generan entradas. Solo el superadmin ve el historial y lo cambia (`HistoryAccess`). Los nombres de los propietarios sí van a la bitácora, porque son datos vigentes y no historia: la importación los aplica con `RenameUnitOwner` del módulo `units`.
- **Los libros empiezan después del historial.** El puerto `HISTORY_BOUNDARY` del shared kernel responde dónde termina; lo usan `SetReportingStart` y la importación. Va por puerto porque `history` lee `reports` (el inicio de los libros, para mostrar cómo se unen) y no puede ser al revés. Si el primer mes de los libros sigue justo al último del historial, la pantalla muestra la diferencia entre su efectivo y el cierre del historial.
- **La semana de basura que empezó antes de los libros ya no se sugiere.** Agosto 2026 lista la semana del 27 de julio, porque su sábado es el 1 de agosto. Esa semana se pagó en el papel de julio, así que `weeksWithinBooks` la quita de las sugerencias y del PDF.
- **El cuerpo JSON admite hasta 1 MB** (`configureApp`), porque el archivo pesa unos 200 KB. Un cuerpo más grande responde 413 `PAYLOAD_TOO_LARGE`. Antes de esta fase respondía 500: el filtro no reconocía los errores de Express que no son excepciones de Nest.

## Consecuencias

- **Cuentas antes del corte:** el estado de cuenta de cada depto no cubre los meses anteriores. Para esos meses están las observaciones del papel, tal como se escribieron.
- **Ajustes explícitos:** los errores del propio papel (una suma de $270 en febrero 2024, una resta de $50 en julio 2023 y redondeos) entran como renglones «AJUSTE», para que cada mes coincida con la hoja que ya circuló. Se pueden borrar al revisar.
- **Pendiente para la fase 12b:**
  - Verificar el historial, una acción que sí va a la bitácora y que lo congela.
  - Publicarlo para todos en el Histórico.
  - Generar su PDF con las observaciones del papel.
