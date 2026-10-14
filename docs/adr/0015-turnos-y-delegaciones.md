# ADR-0015: Turnos, delegaciones y comunicación entre módulos

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

La fase 6 expone el dominio de turnos de la fase 1: calendario, delegaciones, entrega del turno, deptos inactivos y la multa por no tomar el turno. Es la primera funcionalidad que cruza módulos: turnos necesita saber qué deptos están activos (`units`), cobrar multas (`billing`) con la tarifa vigente (`settings`), y decidir permisos con `WriteAccessPolicy`, que vivía en el dominio de `identity`.

## Decisión

- **`WriteAccessPolicy` pasa al shared kernel**, junto a `Actor`. Depende solo de tipos del kernel y la van a usar los casos de uso de turnos, libro y reportes. Un módulo no puede importar el dominio de otro, así que dejarla en `identity` obligaba a duplicarla.
- **Los módulos se hablan por su capa de aplicación:**
  - `units` exporta `ListUnits`. `UnitStatuses` responde quién está activo en cada mes y cumple el puerto `UnitAvailability` del dominio de turnos.
  - `settings` exporta `GetRates` (tarifas vigentes el primer día de un mes).
  - `billing` exporta `ChargeShiftSkipPenalties` y `WithdrawShiftSkipPenalties`, casos de uso internos sin HTTP que se unen a la transacción de quien los llama.
  - `shifts` exporta `LoadShiftCalendar`. Su `ShiftCalendar` cumple `ShiftResponsibility`, el puerto que `WriteAccessPolicy` necesita, así que el libro (fase 7) y los reportes (fase 9) lo reusarán.
  - Cada Nest module importa los modules de los que depende (`ShiftsModule` → `UnitsModule`, `BillingModule` → `SettingsModule`). ESLint sigue impidiendo importar dominios o repositorios ajenos.
- **Delegar el turno es un solo caso de uso (`DelegateShift`)** con reglas según quién actúa:
  - El superadmin delega cualquier parte de un periodo, por cualquier motivo.
  - Un dueño solo registra la entrega: el periodo siguiente al suyo, desde su primer mes, con motivo «no toma el turno», mientras pueda actuar sobre su último mes (su turno más los 5 días de gracia). Primero se valida la forma de la entrega y luego el permiso, porque así el error explica mejor qué falló.
  - El depto original es siempre el programado, así que no viene en la petición.
  - Una delegación por omisión cobra la multa de cada mes, con la tarifa vigente ese mes, en la misma transacción. Cancelarla (solo el superadmin) retira esas multas.
- **Lo que el usuario puede hacer viene en el calendario:** cada mes trae `canDelegate`, calculado con las mismas reglas que el caso de uso. La pantalla ofrece la acción solo donde funcionaría, sin repetir reglas en el frontend.
- **Las multas se auditan como cargos** (`CHARGE_ADDED` y `CHARGE_REMOVED`), además de la delegación: la bitácora muestra cada peso que se cobra o se retira.
- **Estado de los deptos:** solo el superadmin lo cambia, por meses completos. No se impide cambiar meses pasados todavía: la regla real es «un mes cerrado está congelado», y llega con el cierre de meses (fase 9). El calendario tolera un delegado que después queda inactivo: deja de contar como responsable.

## Consecuencias

- Los casos de uso que dependen de la fecha se prueban con `FixedClock` (`backend/test/support/clock.ts`). Las pruebas HTTP pueden fijarlo con `useTestApp({ clock })`.
- Dos delegaciones simultáneas sobre los mismos meses las rechaza la restricción de exclusión de la base, que hoy llega como error 500. Con diez usuarios es improbable; se revisará en el endurecimiento (fase 11).
- En la fase 7, marcar un depto inactivo deberá considerar las cuotas ya generadas de ese mes.
