# ADR-0017: Egresos recurrentes asistidos (basura y limpieza)

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

La basura ($150 por semana, siempre) y la limpieza (una tarifa por visita, pagada cada semana) se repiten todo el mes. La fase 8 agrega atajos para capturarlas sin crear un camino aparte: todo sigue siendo un renglón del libro (`CashMovement`), en base de caja (la fecha decide el mes). Hay dos riesgos:

- Que una sugerencia se confunda con un hecho y mueva los totales.
- Que una semana de basura pagada tarde, o adelantada en otro mes, siga apareciendo como pendiente.

## Decisión

- **Cada renglón de basura guarda la semana que paga** (`week`, su lunes; columna `covers_week`). No se deduce de la fecha:
  - Si se paga el lunes siguiente, la fecha cae en otra semana, y deducirla haría ver pagada la semana equivocada.
  - La semana de un mes es la que tiene su domingo dentro del mes; el domingo es el día de pago sugerido (pregunta abierta 4). Así, la semana del 26 de octubre al 1 de noviembre es de noviembre, aunque se pague el sábado 31 en octubre.
  - Es una regla más de la tabla de categorías (`requiresWeek`): la basura la exige y ninguna otra categoría la acepta. Se valida en el dominio, en el contrato de Zod y con `CHECK` en la base.
- **Una semana se paga una sola vez:**
  - `assertWeekUnpaid` en el dominio, con los renglones de basura de esa semana de cualquier mes (`findGarbageForWeeks`). `CashbookAccess.assertConsistent` lo aplica al agregar y al corregir.
  - En la base, una restricción de exclusión sobre `covers_week` entre renglones vivos (`removed_at IS NULL`). Es de exclusión y no un índice único parcial, porque el diff de Prisma intentaría borrar el índice.
  - Borrar el renglón libera la semana.
- **Los pendientes son sugerencias calculadas, no renglones:**
  - `garbageSchedule` marca cada semana del mes como pagada (con el renglón que la paga, esté en el mes que esté), pendiente (ya empezó) o próxima.
  - Los pendientes no se guardan ni cuentan en los totales. Confirmar uno con un toque crea el renglón real con `POST /api/movements`, sin un endpoint aparte.
  - La fecha que se sugiere al confirmar es el domingo, o hoy si el domingo aún no llega. El usuario puede ajustarla en la hoja antes de guardar.
- **Limpieza: un atajo que crea un renglón por visita** (`RecordCleaningVisits`, `POST /api/movements/cleaning-visits`):
  - Se marcan varios días en un minicalendario y se guardan todos o ninguno, en una transacción, con una entrada de bitácora por renglón.
  - Si las fechas caen en dos meses, cada mes pasa por sus propias verificaciones (ventana y mes abierto).
  - No se registra dos veces la misma fecha (`CLEANING_VISIT_RECORDED`). Los días futuros no se pueden marcar.
- **Resumen semanal de limpieza:** `cleaningPayoutsOf` agrupa de lunes a domingo las semanas que tocan el mes. Una semana que cruza de mes muestra todas sus visitas, porque se le paga la semana completa, aunque cada visita cuente en el mes de su fecha (spec 4.3).
- **El mes los trae en su vista:** `GetMonthlyReport` agrega `garbageWeeks` y `cleaningPayouts`, que el backend calcula. El frontend solo los muestra.
- **Otros egresos:** siguen siendo captura libre. No hay comprobantes en esta versión (pregunta abierta 5).

## Consecuencias

- La migración `garbage_week` rellena la semana de los renglones de basura existentes con la semana de su fecha.
- Al cerrar un mes (fase 9), la vista ya sabe qué semanas quedan pendientes para advertirlo.
- El día de pago (domingo) es una constante del dominio. Si se quisiera configurar, sería una tarifa más con vigencia en `settings`.
- Dos confirmaciones simultáneas de la misma semana chocan en la restricción de exclusión y hoy responden 500. Se convierte en 409 junto con el caso de las delegaciones (fase 11).
