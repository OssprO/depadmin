# ADR-0018: Cierre de mes, histórico, dashboard y apertura automática

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

Desde la fase 7 el dominio sabe cerrar y reabrir meses (`ReportLedger`), pero nadie podía hacerlo desde la app. La fase 9 completa el ciclo de vida del mes y lo muestra:

- El administrador saliente cierra sus meses durante la entrega; el superadmin reabre.
- El histórico y el dashboard leen esos cierres.
- Un job diario abre el mes si nadie lo hizo, para que las cuotas se carguen a tiempo (pregunta abierta 3).

## Decisión

- **Un mes se cierra cuando ya terminó** (desde el día 1 del mes siguiente), después del mes anterior y por quien puede cerrarlo: su administrador dentro de su ventana (`assertCanClose`) o el superadmin.
  - Las reglas viven en `ReportLedger.closingBlocker`: `MONTH_NOT_OPENED`, `MONTH_ALREADY_CLOSED`, `MONTH_IN_PROGRESS` y `PREVIOUS_MONTH_OPEN`.
  - El caso de uso (`CloseMonth`) y la vista (`canClose`, vía `mayClose`) hacen la misma pregunta, así que la pantalla nunca ofrece algo que el backend rechazaría.
- **Las semanas de basura pendientes no bloquean el cierre.** La pantalla las lista en el diálogo de confirmación: una semana pudo pagarse en otro mes, o el administrador pudo decidir no pagarla.
- **La bitácora guarda la foto completa.** `MONTH_AUDIT` registra el estado y los cuatro saldos: `MONTH_CLOSED` los muestra de nada a su valor y `MONTH_REOPENED` de su valor a nada. Volver a cerrar un mes reabierto reexpresa los meses cerrados siguientes y cada uno queda como `MONTH_RESTATED`, solo si sus saldos cambiaron.
- **Reabrir es solo del superadmin** (`ReopenMonth`). El dueño vuelve a escribir solo si aún está en su ventana; las reglas del libro no cambian.
- **Un mes cerrado congela sus delegaciones y sus multas.** `DelegateShift` y `CancelDelegation` preguntan por el puerto `MONTH_LEDGER` y responden `DELEGATION_MONTH_CLOSED`.
- **Histórico:** `GET /api/months` (`GetMonthHistory`) da cada mes abierto con sus cuatro cifras, del más nuevo al más viejo. Los cerrados leen su foto y los abiertos se calculan en vivo (`liveTotalsOf`, que lee solo los meses abiertos). El saldo final del mes más nuevo es el efectivo en caja.
- **Dashboard sin endpoint propio.** Inicio combina `GET /api/months`, el mes en curso, las cuentas y el turno actual, que ya existían. Así comparte caché con el libro y se refresca con cualquier cambio.
- **Apertura automática con un actor de sistema:**
  - `OpenCurrentMonth` abre el mes en curso (y los anteriores sin abrir) a las 00:05 de la Ciudad de México, todos los días, con `@nestjs/schedule`. Si el servidor estuvo apagado, el día siguiente lo recupera.
  - Comparte con `OpenMonth` la lógica de apertura (`MonthOpening`).
  - El autor en la bitácora es `SYSTEM_ACTOR`. El puerto `AuditTrail` recibe un `ChangeAuthor` (`Actor | SystemActor`), así que ningún caso de uso de usuario acepta al sistema como actor.
  - En la base, `audit_log.actor_role` usa un enum propio (`audit_actor_role`) con `SYSTEM`. Es separado del rol de los usuarios para que ningún usuario pueda ser el sistema. Un `CHECK` amarra el rol `SYSTEM` al id `system`.
  - La migración convierte la columna en su lugar; el diff de Prisma la habría borrado junto con la bitácora.
  - `JOBS_ENABLED=false` apaga los jobs en las pruebas.
- **Los jobs son una capa propia** (`<módulo>/jobs/`): adaptadores de entrada como los controladores, pero disparados por el reloj. La regla de límites de ESLint los trata igual que a `http/`.

## Consecuencias

- El día de pago de la basura pasa al sábado (pregunta 4, respondida en esta fase; ver ADR-0017).
- Si alguien agrega un renglón mientras otro cierra el mismo mes, la foto podría no incluirlo. Con un solo administrador por mes es improbable; se resolverá con un bloqueo de fila en la fase 11, junto con los 409 de concurrencia.
- El PDF (fase 10) se generará desde la foto de cada mes cerrado.
