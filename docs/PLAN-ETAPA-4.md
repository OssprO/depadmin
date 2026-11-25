# Plan de trabajo — Etapa 4

**Versión:** 1.2 (aprobado, con las preguntas 6 a 15 respondidas) · **Fecha:** 2026-11-25 · **Base:** `PLAN-ETAPA-3.md` (empieza al terminar la fase 30)

La Etapa 3 deja estable la operación y el 1 de diciembre de 2026 el turno pasa a 401. Esta etapa recoge las mejoras y correcciones que el administrador ha detectado con el uso de la app. Sirve de guía para Claude Code: cada fase se implementa en su propio PR, con su porqué, sus pruebas y la aprobación del administrador antes de seguir.

El modo de trabajo no cambia: **una fase por PR**, con las decisiones registradas como ADR cuando cambian una regla del dominio. La numeración continúa la de la Etapa 3, que termina en la fase 30.

---

## 0. Cómo leer este plan

**Colores (prioridad):**

- 🔴 **Alta:** lo que el administrador necesita pronto o protege algo ya existente.
- 🟠 **Media:** mejora clara, sin urgencia.
- 🟢 **Baja:** deseable, puede esperar.

**Peso (esfuerzo estimado):** **S** pequeño (días), **M** medio (una o dos semanas), **L** grande (varias semanas o con dependencias).

**Origen:** en esta etapa todas las ideas vienen del **Administrador**, después de usar la app.

---

## 1. Resumen y orden propuesto

| Fase | Qué                                                                             | Origen        | Prioridad | Peso | Depende de                                                |
| ---- | ------------------------------------------------------------------------------- | ------------- | --------- | ---- | --------------------------------------------------------- |
| 36   | Aviso de basura desde el domingo siguiente al pago (hecha)                      | Administrador | 🔴 Alta   | S    | Ninguna (corrige algo que ya existe)                      |
| 31   | Recibos de pago con el diseño de los recibos reales                             | Administrador | 🔴 Alta   | M    | 23 (hecha), muestra del recibo real                       |
| 35   | Delegación temporal de la administración, que acepta otro dueño                 | Administrador | 🔴 Alta   | L    | 24 (correo); 25 (avisos), si ya está                      |
| 32   | Firma digital de los recibos (hash + firma del servidor + verificación)         | Administrador | 🔴 Alta   | L    | 31                                                        |
| 37   | Cuenta con sesión siempre a la vista (se adelanta)                              | Administrador | 🟠 Media  | S    | Ninguna                                                   |
| 33   | Sesiones activas: ver y cerrar las propias                                      | Administrador | 🟠 Media  | M    | Ninguna                                                   |
| 34   | Agenda de contactos por depto y servicios comunes                               | Administrador | 🟠 Media  | M    | Ninguna (incluye un cambio de lectura en la autorización) |
| 38   | Contador de efectivo: cuenta del administrador, total de caja y estado guardado | Administrador | 🟠 Media  | M    | Ninguna (el contador empieza a usar la API)               |
| 29*  | Turnos: ciclo completo de 20 meses y calendario de actividades                  | Administrador | 🟠 Media  | M    | Se implementa dentro de la fase 29 de la Etapa 3          |

\* La fase 29 ya está planeada en la Etapa 3. Estas dos ideas ya están escritas en ella (`PLAN-ETAPA-3.md`, fase 29) y no tienen número propio en esta etapa (ver la sección 3).

El orden va por color y, dentro de cada color, lo chico primero. Los números no son el orden de trabajo: las fases 35 a 38 llegaron después de escribir las primeras.

- **La 36 y la 37 se adelantan como arreglos,** antes de terminar la Etapa 3, cada una en su PR (pregunta 6). La 36 lleva también el arreglo de «Ver turnos anteriores» en _Turnos_, que falla al tercer toque.
- **La 31 espera la muestra del recibo real** (pregunta 1). Si no llega, la 35 puede ir antes.
- **La 32 necesita la 31.**
- **La 35 necesita el correo (fase 24)** para avisarle al otro dueño, y usa los avisos (fase 25) si ya existen. Cambia una regla del dominio, así que lleva un ADR.
- **Las fases 33, 34, 37 y 38 no dependen de nada** y pueden hacerse en cualquier orden.

---

## 2. Fases

### Fase 31: Recibos con el diseño de los recibos reales

🔴 **Alta · Peso M**

El recibo que genera la app (fase 23) tiene que verse como el que el administrador ya entrega en papel: mismo orden de campos, mismos encabezados y misma disposición del talón. Así el cambio al papel se siente natural para los vecinos.

- **Insumo:** una foto o escaneo de un recibo real, con su talón. Sin esto no se empieza; es la primera pregunta abierta (sección 5).
- **Contenido:** el talón y la parte que se entrega al inquilino. Los campos son los de la fase 23: depto, fecha, importe, cargos cubiertos, observaciones, quién lo registró y el saldo después del pago. Sin importar cómo esté impreso el papel, se muestra el folio.
- **Reutiliza** el `REPORT_RENDERER` y las fuentes estándar del PDF (solo caracteres WinAnsi).
- **Pruebas:** un recibo de pago que cubre dos meses, uno parcial y uno de adelanto, comparados contra el recibo real.

**Conceptos:** diseño de documentos derivados, fidelidad a un formato existente.

### Fase 32: Firma digital de los recibos

🔴 **Alta · Peso L**

Cada recibo se firma para que se pueda comprobar que es el original y que quien lo emitió fue el administrador en turno. Combina dos piezas:

1. **Hash del contenido (SHA-256).** Se calcula sobre los datos del recibo. Si alguien cambia un solo dato, la huella deja de coincidir.
2. **Firma del servidor con PAdES.** La app firma el PDF con su llave privada, con marca de tiempo. Así el PDF lleva una firma que cualquier lector de PDF puede revisar.

Además, el administrador en turno **confirma la emisión** con su sesión. Esa acción queda en la bitácora con quién, cuándo y con qué huella. La firma del servidor prueba la integridad del documento; la confirmación prueba quién lo emitió.

**Verificación para el inquilino:** el recibo lleva un código QR con el folio y la huella, que apunta a una página pública de verificación. Esa página confirma si el folio existe y si la huella coincide, sin mostrar datos personales. Tiene límite de peticiones.

**Decisiones:**

- **Sin e.firma del SAT.** Se descartó por el trámite que exige a cada administrador.
- **Llave y certificado de la app,** guardados como secretos del VPS (`.env`), como las demás llaves. Su rotación se documenta en `docs/OPERACION.md`.
- **Validez legal:** esta firma prueba integridad y autoría dentro de la app, no equivale a una firma autógrafa. Si el reglamento exige firma autógrafa, se decide en la asamblea (pregunta 2 de la sección 5).
- **Librería:** `@react-pdf/renderer` no firma PDF. Se necesita una librería de firma PAdES en el backend, que se elige y se registra en un ADR antes de implementar.

**Pruebas:** un PDF firmado se valida; un PDF alterado falla la verificación; el QR de un folio inexistente responde lo mismo que uno alterado; la confirmación queda en la bitácora; y el límite de peticiones de la página pública responde después del umbral.

**Conceptos:** firma digital (PAdES), hash criptográfico, infraestructura de llaves públicas, verificación por folio.

### Fase 33: Sesiones activas

🟠 **Media · Peso M**

Como en WhatsApp, cada usuario ve en _Mi cuenta_ los dispositivos donde tiene la sesión abierta y puede cerrar cualquiera de ellos.

- **Qué se muestra:** el dispositivo y el navegador (por ejemplo, «Chrome en Android»), cuándo se inició la sesión y su última actividad. La sesión actual aparece marcada como «Este dispositivo».
- **Qué no se muestra:** la dirección IP. Es un dato que no hace falta para este uso y que identifica a los vecinos.
- **Acciones:** cerrar una sesión, o cerrar todas las demás. Cerrar una sesión revoca su familia de tokens de refresco, con el mecanismo que ya existe.
- **Alcance:** cada quien ve y cierra solo las suyas. **El superadmin no puede ver ni cerrar las sesiones de otros.** Así lo decidió el administrador.
- **Bitácora:** cada cierre de sesión queda registrado.

**Cambio técnico:** hoy no hay una tabla de sesiones. Una sesión es el `session_id` que comparten sus tokens de refresco (`refresh_token`), y cada token guarda solo lo que necesita la rotación. La última actividad se puede deducir del token más reciente, con la precisión del token de acceso (15 minutos), pero el inicio no: el job que borra los tokens vencidos (a los 30 días) se lleva los primeros de una sesión larga. Por eso:

- Una tabla de sesiones con el usuario, la fecha de inicio, la de última actividad y el agente de usuario ya interpretado (dispositivo y navegador), sin guardar la IP.
- El token de acceso lleva el id de su sesión, para marcar «Este dispositivo». Hoy solo lleva el usuario, su rol y su depto.

**Pruebas:** un usuario ve solo sus sesiones; cerrar una sesión impide renovar con su token; «cerrar las demás» deja activa la actual; y la bitácora registra cada cierre.

**Conceptos:** gestión de sesiones, revocación por familia de tokens, minimización de datos.

### Fase 34: Agenda de contactos

🟠 **Media · Peso M**

Una sección **Agenda** con dos partes:

- **Contactos por depto:** el contacto que cada depto dio (nombre, teléfono y, si lo quiere, correo). Es un dato por depto, no por usuario.
- **Servicios comunes:** el encargado de limpieza, la recolección de basura, el proveedor de las cámaras de seguridad, pintura y mantenimiento de portones, y los que se agreguen (nombre del servicio, nombre de contacto, teléfono, notas).

**Reglas:**

- **Lectura: los dueños, y el superadmin para consultarla,** porque da soporte. Los usuarios de solo lectura (inquilinos y familiares) no ven la agenda. Esto exige un cambio en la autorización: hoy un lector lee lo mismo que un dueño (las únicas lecturas cerradas son las del superadmin, como la lista de usuarios), así que hay que agregar un permiso de lectura para la agenda.
- **Edición: solo el administrador en turno.** El superadmin es auxiliar y no edita la agenda. Cada cambio queda en la bitácora.
- **Acciones de contacto:** el teléfono abre la llamada o WhatsApp (`tel:` y `wa.me`), según el celular.
- **Privacidad:** los teléfonos y correos de los vecinos no salen de la app. No se incluyen en PDF ni en correos.

**Pruebas:** un lector no ve la agenda; un dueño que no está en turno no puede editarla; el administrador en turno sí; un cambio queda en la bitácora; y el superadmin la ve, pero recibe rechazo al editarla.

**Conceptos:** directorio de contactos, autorización por tipo de usuario, datos personales de terceros.

### Fase 35: Delegación temporal de la administración

🔴 **Alta · Peso L**

Para una emergencia: el administrador en turno tiene que dejar su puesto unos días y le pide a otro dueño que lo cubra. El otro dueño acepta en la app y, mientras dura, administra el edificio. No genera multa.

**Por qué no basta una delegación de hoy (`ShiftDelegation`):**

- Es por **meses completos**, y una emergencia dura días.
- **Cambia el calendario de turnos** (quién responde por el mes), y la base no deja que dos se encimen. Una emergencia puede caer en un mes que ya tiene una delegación, por ejemplo cuando 402 cubre el turno de 401, y no cambia de quién es el turno.
- **La registra una sola persona:** el saliente en su entrega o el superadmin. Aquí el otro dueño tiene que aceptar.

Por eso es una entidad nueva en `shifts`, con fechas (`LocalDate`) en lugar de meses.

**La solicitud:**

- **La envía el administrador en turno** (`WriteAccessPolicy.governs`), y nadie más: ni el saliente en sus días de entrega, ni un lector, ni el superadmin.
- **Va al dueño de otro depto,** activo en todas las fechas y con su cuenta habilitada (ni desactivada ni vencida). La pantalla solo ofrece esos.
- **Fechas:** desde hoy o un día posterior, y hasta un día que se elige o «hasta que la retome». Nunca pasa del último día del periodo del turno (pregunta 9).
- **Sin motivo:** es una emergencia, y la bitácora la leen todos los usuarios.
- **Una a la vez:** mientras haya una pendiente o activa, no se envía otra.

**Estados:**

- **Pendiente,** y de ahí: **aceptada** o **rechazada** por quien la recibe, **retirada** por quien la envió, o **vencida** si nadie responde a tiempo (pregunta 11).
- **Al aceptar** se revisa de nuevo que quien la pidió siga siendo el administrador en turno y que el depto que cubre siga activo.
- **Una aceptada rige** desde que se acepta o desde su primer día, lo que pase después. Nunca hacia atrás.
- **Una aceptada termina** en su último día, al terminar el periodo, cuando el administrador la retoma («Retomar la administración») o cuando quien cubre la devuelve.
- Vencer y terminar por fecha se calculan con el día de hoy en el edificio, como las semanas de basura pendientes: no hace falta un job.

**Mientras rige:**

- **Quien cubre puede lo mismo que el administrador en esos días:** escribir los meses que él puede escribir, abrir y cerrar meses, y gobernar (las tarifas, y después los avisos y la agenda). Salvo dos cosas: delegar a su vez, y registrar o cancelar la entrega del turno siguiente, que puede cobrarle multas a otro depto (pregunta 8).
- **El administrador sigue pudiendo escribir,** como en las delegaciones de hoy, donde escriben los dos. Así puede volver antes sin pedir nada (pregunta 7).
- **Sin multa:** no toca `billing`.
- **El turno no cambia de dueño:** el calendario, el PDF y la tarjeta «Resumen» del Libro siguen nombrando al administrador (fase 22). Inicio y _Turnos_ dicen «Lo cubre Depto 302 hasta el 20 de enero», y la bitácora dice quién escribió cada renglón.
- **Si quien cubre deja de poder** (su depto queda inactivo o su cuenta se desactiva), deja de contar, como el calendario ya tolera un delegado inactivo.

**El superadmin** es auxiliar (ADR-0031): no pide ni acepta delegaciones temporales. Solo termina una activa en un caso especial, por ejemplo si el administrador perdió el acceso y no puede retomarla (pregunta 10). Como siempre, puede escribir en cualquier mes.

**Cómo se entera el otro dueño:**

- **En la app:** la solicitud aparece en _Pendientes_, en Inicio, con «Aceptar» y «Rechazar».
- **Por correo (fase 24):** si tiene un correo confirmado, le llega un aviso con un enlace a la app, sin más datos.
- **Con los avisos (fase 25),** si ya existen: a quien la envió le llega que la aceptaron o la rechazaron, y con las notificaciones push (25b) llega al celular.
- **Por WhatsApp, a mano:** al enviarla, la app ofrece «Avisar por WhatsApp», un enlace con un texto corto, como el botón de compartir del libro. En una emergencia es lo más rápido. Con la agenda (fase 34) puede abrir directo el chat de ese depto.

**Bitácora:** enviar, aceptar, rechazar, retirar y terminar antes de tiempo, con quién lo hizo. Lo que escribe quien cubre queda a nombre de su depto, como siempre.

**Cambio técnico:**

- **Entidad `TemporaryDelegation` en `shifts`** (glosario: _delegación temporal_), con su tabla, sus casos de uso (enviar, aceptar, rechazar, retirar y terminar) y sus endpoints.
- **Una restricción en la base** impide dos pendientes o activas en el mismo periodo, y aceptar y retirar al mismo tiempo no ganan los dos: la fila se bloquea antes de cambiar su estado (ADR-0021).
- **`WriteAccessPolicy` aprende a contar por día.** Hoy el puerto `ShiftResponsibility` solo responde por mes (`isResponsible(unit, month)`). Suma una pregunta: a qué depto cubre un depto en una fecha. Con ella, `decide` deja escribir a quien cubre lo que el administrador podría escribir ese día, y `governs` lo cuenta como administrador en turno. Los casos de uso que ya preguntan a la política (libro, cierre, tarifas) lo reciben sin cambios, y `settings` lo recibe por `SHIFT_ROSTER`. `assertCanHandOver` y la solicitud nueva no cuentan esa cobertura.
- **Un ADR** registra la regla nueva: quién escribe y quién gobierna también se decide por día, no solo por mes.

**Pruebas:**

- **Dominio puro:** quien cubre escribe en sus días y no al día siguiente; el administrador sigue escribiendo; quien cubre no delega ni registra la entrega; no se puede pedir a un depto inactivo, a un lector, al superadmin ni a uno mismo; la solicitud vence; y una que termina antes de tiempo deja de contar en ese momento.
- **Casos de uso:** no se cobra ninguna multa; cada paso queda en la bitácora; el superadmin no puede enviarla ni aceptarla, y sí terminarla.
- **Concurrencia:** dos solicitudes a la vez, y aceptar y retirar a la vez (`concurrency.int-spec.ts`).
- **Navegador:** la solicitud llega a _Pendientes_ del otro dueño y, al aceptarla, puede agregar un renglón al libro.

**Conceptos:** máquina de estados, consentimiento de dos partes, autorización por fecha además de por mes, puertos del dominio.

### Fase 36: Aviso de basura desde el domingo

🔴 **Alta · Peso S** · Corrige algo que ya existe.

**Hecha.** Como se planeó. «Confirmar» no necesitó cambios: una semana pendiente ya pasó su sábado, así que la fecha que propone siempre es el sábado. En _Pendientes_, la semana del mes anterior dice de qué mes es («Confirmar 1 semana de basura de octubre 2026») y lleva a su Libro. La prueba de la medianoche usa el reloj real del edificio fijo en un instante: a las 23:59 del sábado 31 de octubre (ya domingo en UTC) la semana sigue próxima, y a las 00:00 del domingo queda pendiente. «Ver turnos anteriores» llega hasta 24 meses atrás, lo que deja el límite de 36 meses de la API menos los 12 que se ven hacia adelante.

Al recolector se le paga el sábado en la mañana. Hoy la app pide confirmar el pago desde el **lunes** de esa semana: `garbageSchedule` marca una semana como pendiente (`PENDING`) en cuanto empieza, y antes como próxima (`UPCOMING`). Así «Basura por confirmar», en el Libro, y «Confirmar 1 semana de basura», en _Pendientes_, aparecen cinco días antes del pago, y un «Confirmar» a media semana registra un pago que todavía no ocurre, con la fecha de ese día.

**El cambio:**

- **Una semana queda pendiente desde el domingo que sigue a su sábado de pago** (el último día de esa semana, que va de lunes a domingo), con el día del edificio (`Clock.today()`, en la zona de la Ciudad de México). Antes es «próxima».
- **La fecha que propone «Confirmar» es siempre el sábado.** «Hoy, si es antes del sábado» queda solo para el formulario.
- **El sábado mismo** se puede registrar con «Agregar» → Basura: el formulario propone la primera semana pendiente o, si no hay, la próxima, que es la de ese sábado. Es lo normal: el administrador registra el gasto en cuanto le paga al recolector, y el aviso del domingo queda como recordatorio para cuando se le olvidó, sin ruido antes del pago.

**El caso del fin de mes.** Una semana es del mes de su sábado. Cuando el sábado es el último día del mes, su domingo cae en el mes siguiente: la semana del 26 de octubre de 2026 es de octubre y queda pendiente hasta el domingo 1 de noviembre. Pasa una o dos veces al año (octubre de 2026, julio de 2027).

- **El Libro de octubre la muestra** en «Basura por confirmar» desde el 1 de noviembre, mientras octubre siga abierto. La confirma quien todavía puede escribir octubre: el saliente en su entrega, o el mismo administrador si su turno sigue.
- **_Pendientes_, en Inicio, hoy solo cuenta las semanas del mes en curso,** así que el 1 de noviembre no la mencionaría. La fase le agrega las del mes anterior mientras siga abierto y quien la ve pueda escribirlo. Hoy ya pasa con una semana del mes anterior que se quedó sin registrar; con el cambio sería lo normal en esos meses.
- **El cierre no cambia:** un mes se cierra desde el día 1 del siguiente, y para entonces todas sus semanas ya llegaron a su domingo, así que el aviso de «semanas de basura sin registrar» sigue completo.
- **El PDF no cambia:** lista las semanas sin pagar según su renglón, no según si están pendientes.

**Se adelanta** como arreglo en su propio PR, antes de terminar la Etapa 3 (pregunta 6). Es chica (una función del dominio con su prueba, la tarjeta de _Pendientes_ y una línea de la guía) y corrige algo que hoy invita a registrar un pago antes de hacerlo.

**Lleva también el arreglo de _Turnos_.** «Ver turnos anteriores» agrega 12 meses hacia atrás en cada toque: al tercero pide 48 meses, la API acepta hasta 36 (`MAX_CALENDAR_MONTHS`) y el calendario falla. El botón deja de ofrecer más de lo que la API acepta, y una prueba lo cubre. La vista completa del ciclo sigue en la fase 29.

**Guía:** el paso que dice «Cada semana de basura aparece en «Basura por confirmar»» pasa a decir que aparece el domingo, después del pago. Su captura es de un mes ya terminado, así que no cambia.

**Pruebas:** el sábado la semana es próxima y el domingo pendiente; el domingo empieza a la medianoche del edificio, no a la de UTC; la semana del 26 de octubre de 2026 aparece el 1 de noviembre en el Libro de octubre y en _Pendientes_ de quien puede escribir octubre; «Confirmar» registra el sábado; y «Ver turnos anteriores» tocado varias veces nunca pide más de lo que la API acepta.

**Conceptos:** reglas de calendario en el dominio, zona horaria del negocio, estados calculados (nada se guarda, así que corregir la regla no migra datos).

### Fase 37: Cuenta con sesión, siempre a la vista

🟠 **Media · Peso S** · Se adelanta como arreglo, en su propio PR (pregunta 6).

El administrador es el depto 501 y también tiene la cuenta del superadmin. Necesita saber en todo momento con cuál entró: lo que hace como superadmin queda en la bitácora a nombre del superadmin y no de 501, y algunas acciones solo funcionan con una de las dos (las tarifas, por ejemplo, solo las cambia el administrador en turno).

**Hoy:** la cuenta solo se ve en Inicio («Hola, Depto 501», o el nombre de usuario del superadmin) y en _Mi cuenta_, con su rol. Las demás pantallas no la dicen. Además, un navegador guarda una sola sesión (una cookie), así que tener las dos cuentas abiertas a la vez exige dos navegadores o una ventana privada.

**La propuesta:** un distintivo de la cuenta en el armazón de la app (`AppLayout`), en todas las pantallas (pregunta 15).

- **Dueño:** un círculo con el número del depto («501») y, donde cabe, «Depto 501 · Dueño».
- **Superadmin:** el círculo lleva el ícono de _Administración_ (la llave) en lugar de un número, con relleno de acento, y el texto «Superadmin». Se distingue por el ícono y el texto, no solo por el color (WCAG 1.4.1).
- **Lector:** la inicial de su usuario, con borde y sin relleno, y «Solo lectura».
- **En el celular:** en el encabezado de cada pantalla, a la derecha de «DepAdmin», solo el círculo. La barra de abajo no cambia.
- **En tableta y computadora:** en el menú lateral, bajo el nombre de la app, el círculo con su texto.
- **Tocarlo abre _Mi cuenta_.** Su nombre accesible dice la cuenta completa: «Cuenta: Depto 501, dueño».
- **El título de la pestaña** también la dice («DepAdmin · 501», «DepAdmin · Superadmin»): con las dos cuentas abiertas en dos navegadores de la computadora, se distinguen las ventanas.

**Pruebas:** el distintivo de cada rol; que en un celular angosto (360 px) no se encime con el nombre de la app; `layouts.spec` y `screens-accessibility.spec` en los tres tamaños y los dos temas; y las capturas de la guía otra vez (`pnpm guide`), porque cambia el encabezado.

**Conceptos:** identidad visible en todo momento, accesibilidad más allá del color, armazón compartido de la app.

### Fase 38: Contador de efectivo: cuenta del administrador, caja y estado guardado

🟠 **Media · Peso M**

A veces el administrador en turno presta su propia cuenta bancaria para recibir las cuotas por transferencia, y el dinero se queda ahí hasta que lo saca. Para cuadrar, necesita sumar el efectivo y lo que está en su cuenta, compararlo con la caja del libro y guardar lo que contó para seguirlo después.

**Hoy:** el contador (_Herramientas → Contador de efectivo_) suma billetes y monedas en centavos (`cash-count.ts`, funciones puras), no guarda nada y no llama a la API. Según `CLAUDE.md`, las herramientas nunca llaman a la API ni tocan los libros.

**Qué cambia:**

- **«En cuenta del administrador»:** una tercera sección, después de Billetes y Monedas, con un importe en pesos y centavos (pregunta 14). Entra al total: billetes, más monedas, más cuenta.
- **La caja, para comparar:** bajo el total, «Caja según el libro», el mismo saldo de la tarjeta «Caja» de Inicio (el saldo final del mes más reciente, en vivo mientras está abierto), y la diferencia: «Cuadra», «Sobran $120.00» o «Faltan $120.00», con texto y no solo con color.
  - **No hace falta un permiso nuevo:** todos los usuarios ya ven la caja en Inicio, incluidos los de solo lectura. Es la misma consulta de lectura.
  - **Cambia la regla de las herramientas:** el contador lee la caja y guarda su estado, pero sigue sin tocar los libros. `CLAUDE.md` se actualiza.
  - **Sin conexión, el contador sigue sumando.** Solo la comparación dice que no pudo cargar la caja.
- **Guardar el estado:** «Guardar» conserva las piezas, el importe en cuenta, la caja de ese momento y la fecha. Al volver, el contador abre con lo guardado: «Guardado el 12 de enero a las 18:40. La caja era $4,250.00; hoy es $4,400.00». Se guarda solo el último, sin historia, y «Borrar lo guardado» lo quita. «Limpiar» sigue limpiando solo la pantalla.

**Dónde se guarda:**

| Opción                                                      | A favor                                                                                            | En contra                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| En el dispositivo (`localStorage`, como el orden del libro) | Sin tabla ni endpoint; funciona sin conexión                                                       | Es del navegador, no del usuario: en un celular donde entran dos cuentas (501 y el superadmin) hay que separarlo por usuario. No pasa del celular a la computadora, se pierde al cambiar de celular o borrar los datos, y Safari en iPhone lo puede borrar si el sitio no se abre en siete días, salvo con la app instalada |
| En el servidor, uno por usuario                             | Sigue al usuario entre celular y computadora, y al cambiar de celular; es privado por construcción | Una tabla, un endpoint y una migración (solo agrega, ADR-0029); guardar necesita conexión                                                                                                                                                                                                                                   |

**Recomendación: en el servidor.** El administrador cuenta en el celular y revisa en la computadora, y el turno rota entre dueños que cambian de celular. Y la privacidad sale de la forma de la ruta: es la del usuario con sesión, sin id (por ejemplo, `/api/tools/cash-count`), así que nadie, ni el superadmin, puede pedir la de otro (pregunta 13).

**Reglas:**

- **Quién guarda: cualquier dueño,** no solo el de turno (pregunta 12). Todos administran por turno, el saliente cuadra la caja en su entrega, y lo guardado es de la persona, no del turno: al pasar el turno cada quien conserva el suyo. Los lectores y el superadmin cuentan y comparan, sin guardar.
- **No va a la bitácora.** La bitácora la leen todos los usuarios, así que anotarlo publicaría algo privado; y no es un dato del edificio, porque no cambia los libros ni las cuentas. Es una excepción a «cada escritura se audita», y se registra en un ADR.

**Cambio técnico:**

- **Las denominaciones y las sumas pasan a `packages/shared`,** para que la API valide las mismas piezas con un esquema Zod (hasta cinco dígitos por pieza, como hoy).
- **Un módulo pequeño (`tools`)** con su tabla (usuario, piezas, importe en cuenta, caja al guardar y fecha), y `GET`, `PUT` y `DELETE` sobre la ruta del usuario con sesión.
- **La caja** se lee con la consulta que ya usa la tarjeta «Caja» de Inicio.

**Pruebas:** la suma con la cuenta, en centavos ($1,234.56 más billetes y monedas); «Cuadra», «Sobran» y «Faltan»; un dueño no lee lo que guardó otro; un lector y el superadmin reciben rechazo al guardar; guardar no escribe en la bitácora; sin conexión el contador suma; y `layouts.spec` con la sección nueva en los tres tamaños.

**Conceptos:** conciliación de efectivo, datos privados por usuario, rutas «del usuario actual» frente al acceso por id ajeno (IDOR), excepciones a la auditoría.

---

## 3. Ajustes a la fase 29 (Turnos, Etapa 3)

Las dos ideas de esta sección ya están escritas en la fase 29 de `PLAN-ETAPA-3.md`, que todavía no se ha hecho, con su contenido, sus pruebas y su pregunta abierta (la 32 de ese plan):

- **El ciclo completo de turnos (20 meses)** en la pantalla de _Turnos_, que hoy muestra 12 meses desde el turno actual.
- **Un calendario de actividades** visible para todos los usuarios, incluidos los de solo lectura. No es el calendario del libro de la fase 30, que muestra los días con movimientos.

Al pasarlas se revisaron contra el código. La app no sabe qué días pasa la recolección ni qué días viene la limpieza, así que el calendario muestra los sábados de pago de la basura y las visitas ya registradas. Y los dos meses de un turno se cierran hasta 5 días después de que el turno termina: octubre y noviembre de 502, a más tardar el 5 de diciembre, no octubre antes del 5 de noviembre.

---

## 4. Decisiones tomadas

| Tema                                       | Decisión                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firma digital de recibos                   | Hash del contenido + firma del servidor PAdES + confirmación del administrador en turno en la bitácora. Sin e.firma del SAT.                                                                             |
| Agenda: quién la ve                        | Los dueños, y el superadmin para consultarla. Los usuarios de solo lectura no la ven.                                                                                                                    |
| Agenda: quién la edita                     | Solo el administrador en turno, registrado en la bitácora. El superadmin no edita.                                                                                                                       |
| Sesiones activas: alcance                  | Cada usuario ve y cierra solo las suyas. El superadmin no ve ni cierra las de otros.                                                                                                                     |
| Ciclo de turnos                            | Se incorpora a la fase 29 de la Etapa 3 (ya escrito en `PLAN-ETAPA-3.md`).                                                                                                                               |
| Calendario de actividades                  | Visible para todos los usuarios. Se incorpora a la fase 29 (ya escrito en `PLAN-ETAPA-3.md`).                                                                                                            |
| Inicio de la Etapa 4                       | Al terminar la fase 30.                                                                                                                                                                                  |
| Delegación temporal                        | La pide el administrador en turno, para una emergencia, a otro dueño, que la acepta en la app. No genera multa.                                                                                          |
| Aviso de basura                            | Aparece el domingo siguiente al sábado en que se le paga al recolector, no antes.                                                                                                                        |
| Cuenta con sesión                          | Siempre a la vista: el círculo con el número en el celular, y el círculo con «Depto 501 · Dueño» en el menú lateral.                                                                                     |
| Arreglos adelantados                       | La 36 (con el arreglo de «Ver turnos anteriores») y la 37 se hacen antes de terminar la Etapa 3, cada una en su PR.                                                                                      |
| Delegación temporal: quién escribe         | Los dos: el administrador sigue escribiendo mientras otro lo cubre.                                                                                                                                      |
| Delegación temporal: qué puede quien cubre | Todo lo del administrador, también gobernar, salvo delegar a su vez y registrar o cancelar la entrega del turno siguiente. Termina a más tardar el último día del turno, sin cubrir los días de entrega. |
| Delegación temporal: el superadmin         | No la pide ni la acepta. Solo termina una activa en un caso especial, y queda en la bitácora.                                                                                                            |
| Delegación temporal: sin respuesta         | La solicitud vence a las 48 horas; antes, quien la envió puede retirarla y pedírsela a otro dueño.                                                                                                       |
| Contador de efectivo                       | Suma también el dinero en la cuenta del administrador, muestra el total de caja para comparar y guarda su estado, privado para cada usuario.                                                             |
| Contador: de quién es                      | De uso personal: cada dueño guarda lo suyo en el servidor y nadie más lo ve, ni el superadmin. No pasa por la bitácora. La cuenta del administrador es un solo importe.                                  |

---

## 5. Preguntas abiertas

Cada una tiene un valor por defecto para no bloquear el avance. El administrador respondió las preguntas 6 a 15 el 25 de noviembre de 2026.

| #   | Pregunta                                                                                             | Valor por defecto                                                                                                                                    | Fase   |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | ¿Quién proporciona la foto o escaneo de un recibo real y su talón?                                   | El administrador en turno, antes de empezar la fase                                                                                                  | 31     |
| 2   | ¿El reglamento exige firma autógrafa en los recibos?                                                 | No: la firma del servidor es la constancia; si la asamblea exige otra, se decide allí                                                                | 32     |
| 3   | ¿La agenda incluye correo además de teléfono?                                                        | Sí, correo opcional por depto                                                                                                                        | 34     |
| 4   | ¿Qué servicios comunes faltan en la lista inicial?                                                   | La lista propuesta en la fase 34; se amplía desde la app                                                                                             | 34     |
| 5   | ¿El calendario de actividades muestra también las visitas de limpieza con su nombre o solo la fecha? | **Movida** a la pregunta 32 de `PLAN-ETAPA-3.md`, junto con la fase 29                                                                               | 29     |
| 6   | ¿Las fases 36 y 37 se adelantan como arreglos, antes de terminar la Etapa 3?                         | **Respondida:** sí, la 36 y la 37, cada una en su PR. La 36 lleva también el arreglo de «Ver turnos anteriores»                                      | 36, 37 |
| 7   | Mientras dura una delegación temporal, ¿el administrador sigue pudiendo escribir?                    | **Respondida:** sí, escriben los dos                                                                                                                 | 35     |
| 8   | ¿Qué puede hacer quien cubre?                                                                        | **Respondida:** todo lo del administrador esos días, también gobernar, salvo delegar a su vez y registrar o cancelar la entrega del turno siguiente  | 35     |
| 9   | ¿Una delegación temporal puede cubrir los días de entrega, después del periodo?                      | **Respondida:** no; termina a más tardar el último día del periodo. Si el saliente no puede cerrar sus meses, los cierra el superadmin como auxiliar | 35     |
| 10  | ¿Qué hace el superadmin con las delegaciones temporales?                                             | **Respondida:** no las pide ni las acepta. Solo termina una activa en un caso especial, y queda en la bitácora                                       | 35     |
| 11  | ¿Cuánto espera una solicitud sin respuesta?                                                          | **Respondida:** 48 horas; mientras tanto, el administrador puede retirarla y pedírsela a otro                                                        | 35     |
| 12  | El estado del contador, ¿lo guarda solo el administrador en turno o cualquier dueño?                 | **Respondida:** cualquier dueño, cada uno lo suyo. Los lectores y el superadmin cuentan sin guardar                                                  | 38     |
| 13  | ¿Dónde se guarda el estado del contador?                                                             | **Respondida:** en el servidor, uno por usuario. Es de uso personal: nadie más lo ve, ni el superadmin                                               | 38     |
| 14  | El dinero en la cuenta del administrador, ¿es un solo importe o una línea por transferencia?         | **Respondida:** un solo importe, para cuadrar las cuentas propias                                                                                    | 38     |
| 15  | ¿La cuenta con sesión se muestra como un círculo con el número o como texto?                         | **Respondida:** los dos: el círculo en el celular, y el círculo con «Depto 501 · Dueño» en el menú lateral                                           | 37     |
