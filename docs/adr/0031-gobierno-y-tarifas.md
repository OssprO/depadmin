# ADR-0031: Quién gobierna: el administrador en turno decide, el superadmin es auxiliar; tarifas desde la app

**Estado:** Aceptado · **Fecha:** 2026-11-17

## Contexto

El SPEC decía que el superadmin escribe «siempre, sin restricción de turno», y el código creció sobre eso: todo lo que no era el día a día del turno se lo dimos al superadmin. Pero la intención del edificio es otra, y nunca quedó escrita:

- **El administrador en turno gobierna.** Cada depto administra el edificio cuando le toca, con todos los permisos, salvo lo que requiere votación.
- **Las decisiones del edificio se votan.** Una cuota nueva, una reforma, las reglas de las votaciones: las propone el administrador en turno y las deciden los deptos.
- **El superadmin es un auxiliar.** Tiene acceso total para soporte técnico y casos particulares, y por eso todo queda en la bitácora. No propone ni cambia nada del edificio por su cuenta.

Al mismo tiempo, la auditoría de la Etapa 3 (hallazgo H1) encontró que cambiar la cuota requería editar la base: el dominio ya guardaba las tarifas con fecha de vigencia (`RateSettings`), pero no había caso de uso, endpoint ni pantalla.

## Decisión

- **El principio queda en el SPEC** (sección 3) y en una regla del dominio: `WriteAccessPolicy.governs` dice si el actor es el administrador en turno, es decir, el dueño de un depto responsable del mes en curso, por su turno o por una delegación. `assertGoverns` responde `SHIFT_ADMIN_ONLY` al superadmin y a los demás deptos, y `READ_ONLY` a un usuario de solo lectura. En los días de entrega el saliente cierra sus meses, pero ya no gobierna: gobierna el depto del mes en curso.
- **Tarifas (fase 21):**
  - **Las cambia el administrador en turno, registrando lo que votó la asamblea** (`ChangeRate`). El acuerdo es obligatorio: fecha de la asamblea (no futura) y qué se acordó, en hasta 300 caracteres. Se guarda junto al cambio (`rate_change.agreed_on`, `agreement`) y en la bitácora. El superadmin no puede.
  - **Desde un mes que todavía no se abre.** Abrir un mes cobra sus cuotas con las tarifas vigentes y el pasado no se reescribe, así que el cambio aplica desde el mes en curso si aún no se abre, o desde el siguiente. Los cambios son por mes completo.
  - **Un cambio programado se puede quitar** (`WithdrawRateChange`) mientras su mes no se abra, por ejemplo uno capturado con un error. El primer valor de una tarifa no se quita.
  - **Un cambio que coincide con la apertura del mes:** un candado de Postgres (`pg_advisory_xact_lock`) los ordena. El cambio toma el candado exclusivo antes de revisar el mes, y leer las tarifas dentro de una transacción toma su lado compartido. Si gana la apertura, el cambio ve el mes abierto y se rechaza; si gana el cambio, la apertura cobra la tarifa nueva. Lo prueba `concurrency.int-spec.ts`.
  - **La multa de una delegación ya registrada conserva su importe:** se cobra al registrar la delegación, no al abrir el mes. Para aplicar una multa nueva se cancela la delegación y se registra otra vez.
  - **Todos leen las tarifas** (`GET /api/rates`), con su historia y lo programado, en _Más → Parámetros_. Solo el administrador en turno ve «Programar cambio» y «Quitar».
  - **`settings` pregunta quién tiene el turno por un puerto, `SHIFT_ROSTER`,** que `shifts` provee de forma global: `settings` está debajo de `shifts` en el grafo de módulos y no puede importarlo (el mismo patrón que `MONTH_LEDGER`).
  - **La pantalla se llama _Parámetros_** porque en la fase 27 ahí irán la mayoría y el plazo de las votaciones. El modelo no se generaliza hasta entonces.
- **Delegaciones:** dos permisos pasan del superadmin al administrador saliente, dentro de su entrega (los mismos días en que ya registra que el siguiente no toma el turno):
  - **Asignar quién cubre el turno de un depto inactivo,** sin multa.
  - **Cancelar su propia entrega,** si se equivocó.
  - El superadmin conserva ambos como auxiliar, y una delegación con otro motivo (`OTHER`) sigue siendo solo suya.
- **El superadmin conserva** sus tareas de auxiliar: reabrir un mes, escribir en cualquier mes (periodos sin responsable, correcciones), las cuentas de usuario, el estado de los deptos y el arranque de los libros.

## Consecuencias

- **Hasta la fase 27 la votación ocurre fuera de la app**, en asamblea, y la app confía en que el administrador en turno registra lo que se acordó. El acuerdo queda escrito junto al cambio y en la bitácora, y cualquiera puede leerlo en _Parámetros_.
- **En la fase 27 la votación entra a la app:** el administrador en turno propone el cambio, los deptos votan con la mayoría y el plazo vigentes, y al aprobarse la app llama al mismo `ChangeRate`, con la votación como acuerdo. Las preguntas 27 y 30 del plan cambian con este ADR: solo el administrador en turno propone, y la mayoría y el plazo también se votan.
- **Si un periodo no tiene responsable** (un depto inactivo que nadie cubrió), nadie puede cambiar las tarifas hasta que alguien lo cubra.
- **Lo que hoy es del superadmin se revisa contra este principio** en cada fase nueva: si es una decisión del edificio, es del administrador en turno y, si cambia lo acordado, se vota.
