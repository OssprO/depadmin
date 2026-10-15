# ADR-0023: El historial del edificio, dentro de los libros

**Estado:** Aceptado · **Fecha:** 2026-10-15 · Reemplaza al [ADR-0022](0022-historial.md)

## Contexto

El ADR-0022 guardó el historial (mayo 2022 – julio 2026) aparte de los libros, con pantallas propias. Al probarlo, el superadmin pidió otra cosa:

- **Usar lo que ya existe.** Es como si la plataforma se hubiera usado desde abril de 2022, con los datos ya cargados: los mismos meses, la misma pantalla del Libro, los mismos formularios.
- **Todos los meses abiertos** para capturar el detalle que falte, como cualquier mes.
- **Que el PDF de cualquier mes coincida con la hoja física.** Una vez publicado, cualquier vecino lo descarga y lo compara, y eso le da confianza en la plataforma.

Se le explicó qué choca con los libros en vivo (cuentas, rotación de turnos, bitácora, el orden de cierre y la caja de agosto) y eligió esta opción («A») sobre la de guardarlo aparte con las mismas pantallas («B»).

Lo que se sabía al decidir:

- **Las cuentas por depto no se pueden reconstruir.** Al calcularlas desde 2022 salen $23,900 arriba del papel. Las razones son tres: faltan meses, en 2022 se pagaba administración fuera de la caja y la cuota cambió a mitad de febrero 2023. El PDF las mostraría distintas a la hoja.
- **La rotación de antes no es la que calcula la plataforma.** Algunas hojas dicen quién administró («Responsable: …») y la mayoría no.
- **La bitácora empieza en agosto 2026.** El superadmin no quiere ahí la captura del historial.

## Decisión

- **Un solo libro desde mayo 2022, con un mes de corte.**
  - `ReportingStart` guarda `month` (el primer mes), `openingBalance` y `cutover` (el primer mes en vivo, agosto 2026).
  - Los meses de `month` hasta antes de `cutover` son el historial (`ReportLedger.isHistory`). Son meses normales: sus renglones están en `cash_movement`, se abren, se cierran y se reabren como cualquiera.
  - Sin historial, `cutover` es el primer mes, y nada cambia para unos libros que empiezan sin él.
  - Agosto 2026 abre con el cierre de julio, así que el corte ya no queda fijo.
- **Antes del corte no hay cuotas, cuentas, turnos ni bitácora de renglones.**
  - **Cuotas:** abrir un mes del historial no cobra cuotas ni queda en la bitácora (`MonthOpening`).
  - **Cuentas:** cuentan los pagos desde el corte (`GetAccounts`). Lo que cada depto debía o tenía adelantado es la carga inicial, fechada antes del corte (`GetOpeningBalances` y `SetOpeningBalance` usan `cutover`). Un pago del historial ya saldó lo que dice su hoja.
  - **Turnos:** la rotación empieza en agosto 2026 (`ShiftRotation.firstMonth`). Antes, ningún depto responde por el mes (`beforeRotation`), solo el superadmin escribe, y no se delega.
  - **Bitácora:** capturar, corregir o borrar renglones de un mes del historial no se registra, y las hojas tampoco (`CashbookAccess.isHistory`). La revisión se registra al cerrar cada mes: cerrar y reabrir quedan en la bitácora como cualquier mes.
- **El historial se revisa cerrando sus meses.** Cerrar un mes del historial es darlo por revisado. Los meses se cierran en orden, así que agosto 2026 no se cierra hasta revisar julio. Si aparece una hoja después, el superadmin reabre el mes; eso queda en la bitácora y al cerrarlo de nuevo se reexpresan los meses siguientes.
- **La importación arranca los libros.**
  - `ImportHistory` funciona solo con los libros vacíos (`BOOKS_ALREADY_STARTED`) y hace todo en una transacción:
    - `StartBooksWithHistory` fija el inicio y el corte, y abre los meses del historial.
    - `RecordEarlierRates` agrega las tarifas de esos años antes de las vigentes, para prellenar los formularios.
    - `ImportMovements` carga los renglones en bloque.
    - Guarda las hojas.
    - Aplica los nombres del rol vigente (estos sí van a la bitácora, como en el ADR-0022).
  - No hay «Descartar»: para importar otra vez se vacía la base de desarrollo.
- **Lo que los renglones no guardan se queda en la hoja de papel** (`paper_sheet`, módulo `history`):
  - las cifras del papel;
  - las alertas de la transcripción;
  - la línea «Responsable» cuando la hoja la trae;
  - la línea de cada depto, como está escrita: propietario de entonces, MES EN CURSO, ADEUDOS/ADELANTOS y OBSERVACIONES;
  - los renglones que lista la hoja, porque un renglón del día de la entrega puede estar en cualquiera de las dos.

  Se corrigen mientras el mes está abierto, solo el superadmin, y sin bitácora.

- **El PDF de un mes del historial reproduce sus hojas** (puerto `PAPER_RECORD`, que responde `history` y pregunta `reports`):
  - **Un documento por hoja,** encadenados: «FEBRERO 2023, DEL 1 AL 10» y «DEL 11 AL 28».
  - **Cada renglón va en la hoja que lo lista;** los que no lista ninguna se reparten por fecha.
  - **Cada depto se imprime como su línea de papel.** Donde el papel no reparte un pago, la cuota va a MES EN CURSO y el resto a ADEUDOS/ADELANTOS.
  - **La basura lista solo las semanas pagadas,** como el papel.
  - **El pie dice el «Responsable» de la hoja,** o nada.
- **La revisión contra el papel sigue igual que en el ADR-0022** (`ownGap` y `carriedGap`). Ahora se ve en el Libro de cada mes, en la tarjeta «Hoja de papel», y en _Administración → Historial_ la lista enlaza al Libro.
- **Todos ven los meses del historial** como cualquier mes del Histórico, con el aviso de borrador mientras siguen abiertos. Al superadmin le dio igual («Irrelevante»), y así no hay que distinguirlos en cada lectura.

## Consecuencias

- **El orden de cierre ata la revisión a agosto:** agosto 2026 no se puede cerrar hasta cerrar los 51 meses anteriores. Antes de abrir la plataforma a los dueños conviene revisar el historial, o al menos cerrarlo hasta julio 2026.
- **Mientras falten hojas, los saldos no coinciden con el papel.** El cierre de julio (y la caja con que abre agosto) queda arriba del papel hasta capturar los meses que faltan (sección 4 del plan de la etapa 2). Cada mes muestra en su tarjeta cuánto arrastra.
- **Los dos módulos se cruzan por puertos.** `reports` pregunta el corte por `MonthLedger.cutover()` y las hojas por `PAPER_RECORD`. `history` usa `reports`, `cashbook`, `settings` y `units` por sus exportaciones de aplicación.
- **Sumar los meses abiertos cuesta una sola consulta** (`ReadCashbook.totalsOf`), aunque el historial deje decenas abiertos.
- **Las tablas del ADR-0022 se borran** en la migración `history_in_books` (`historical_books`, `historical_movement` y `historical_sheet`). Lo importado con la fase 12a se vuelve a importar con el archivo nuevo (formato 2).
