# Plan de trabajo — Etapa 3

**Versión:** 1.0 (borrador para aprobar) · **Fecha:** 2026-11-12 · **Base:** `docs/PLAN-ETAPA-2.md` v1.1

La Etapa 2 dejó la plataforma en producción, con el historial del edificio, los usuarios de solo lectura, las pantallas anchas y la guía para los dueños. El 1 de diciembre de 2026 el turno pasa a 401 y la app empieza a usarse sin que el superadmin esté detrás de cada paso.

Esta etapa junta dos fuentes:

- **Las ideas del administrador después de usarla:** comprobantes adjuntos, el responsable en los PDF, el orden del libro, el reglamento con reformas y votaciones, avisos, reportes anuales, la vista de turnos y mejoras visuales.
- **Una auditoría del software (sección 3):** lo que hoy puede fallar sin que nadie se entere, o que obliga a tocar la base a mano.

El orden sigue una regla: **primero estable, luego útil**. Lo que protege los datos y la operación va antes que lo nuevo.

El modo de trabajo no cambia: una fase por PR, con el porqué de cada decisión, pruebas y aprobación antes de seguir. La numeración continúa la de `docs/PLAN-ETAPA-2.md`. La fase 16 conserva su número y pasa a esta etapa. La 17 (WhatsApp) se descartó por costo y mantenimiento, y el correo la reemplaza.

**Una restricción para toda la etapa:** es un proyecto personal sin presupuesto. Todo servicio externo tiene que ser gratuito para este volumen (11 usuarios) y poder cambiarse por otro sin tocar el dominio. Por eso cada uno entra detrás de un puerto.

---

## 1. Resumen y orden propuesto

| Fase | Qué                                                                | Origen        | Por qué en este lugar                                                                                                  |
| ---- | ------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 19   | Estabilidad: dependencias, sesión, salud y despliegue              | Auditoría     | **Antes del 1 de diciembre.** Corrige avisos de seguridad en la API y los cierres de sesión inesperados; es chica      |
| 20   | Operación: respaldos fuera del VPS, monitoreo y suplente           | Auditoría     | Si el VPS se pierde, hoy se pierde todo desde la última copia manual; y nadie se entera si un job o un respaldo fallan |
| 21   | Tarifas y parámetros del edificio desde la app                     | Auditoría     | Cambiar la cuota hoy requiere editar la base; deja listo el patrón de parámetros que usan las votaciones (fase 27)     |
| 22   | Libro: orden, estado con candado, búsqueda y responsable en el PDF | Administrador | Mejoras chicas y visibles sobre lo que ya existe; nada nuevo en el modelo                                              |
| 23   | Recibos de pago y estado de cuenta en PDF; exportar a CSV          | Auditoría     | Lo que más pediría un vecino: su recibo; reutiliza el `REPORT_RENDERER`                                                |
| 24   | Correo y recuperación de contraseña                                | Ambos         | Reemplaza a la 17; base de los avisos, las votaciones y las alertas                                                    |
| 25   | Avisos y recordatorios (en la app y por correo; push después)      | Administrador | Necesita el correo (24)                                                                                                |
| 16   | Comprobantes adjuntos y archivo de documentos                      | Administrador | Necesita los respaldos fuera del VPS (20), porque agrega archivos que el `pg_dump` no guarda                           |
| 26   | Reglamento y ley de acuerdos, con sus versiones                    | Administrador | La base de las reformas: primero el texto vigente                                                                      |
| 27   | Reformas y votaciones                                              | Administrador | Necesita el reglamento (26), los parámetros (21), los avisos (25) y la sección Pendientes                              |
| 28   | Reporte anual con gráficas                                         | Administrador | Independiente; va después de lo que cambia la operación diaria                                                         |
| 29   | Turnos: vista renovada y PDF del calendario                        | Administrador | Independiente                                                                                                          |
| 30   | Calendario del libro y paletas por fecha                           | Administrador | Mejoras visuales, al final                                                                                             |

Las fases 22 y 23 no dependen entre sí, y tampoco 28, 29 y 30: se pueden reordenar. La 25 depende de la 24; la 16, de la 20; la 27, de la 21, la 25 y la 26.

---

## 2. Fases

### Fase 19: Estabilidad

**Hecha (ADR-0029).** Además de lo planeado: un reintento que llega mientras la primera petición sigue rotando el token también se perdona, `deploy.sh` saca un respaldo antes de las migraciones, y Prisma 7.10.1 resolvió los avisos de su CLI, así que `pnpm audit --prod` no encuentra ninguno.

Hallazgos H2, H3 y H6 de la auditoría (sección 3), y la parte de H4 que es del código (`ready`). Es la única fase que debe estar en producción antes del 1 de diciembre.

- **Dependencias:**
  - Actualizar las que tienen avisos en la API: `zod` (≥ 4.6.6), `body-parser` (≥ 2.4.0) y `multer` (≥ 2.5.0), que permiten negar el servicio con un cuerpo de petición armado a propósito. También `vite` (≥ 8.2.4) y `seroval`. Donde el paquete padre aún no lo trae, con `overrides` en `pnpm-workspace.yaml`, como en la fase 11b.
  - Los de la CLI de `prisma` (`deepmerge-ts`, `mysql2`) siguen como riesgo aceptado si no hay versión que los corrija (`docs/SEGURIDAD.md`).
  - **CI:** un paso `pnpm audit --prod --audit-level high` que falla con un aviso alto nuevo, y Dependabot cada semana, con las actualizaciones agrupadas para no llenar de PR.
- **Sesión:**
  - **Margen al rotar el refresh token.** Hoy, si la respuesta de un refresh se pierde (red del celular, o un servidor lento), el siguiente intento presenta el token anterior y la API lo toma por robado: cierra la sesión (`REFRESH_TOKEN_REUSED`). Con un margen corto (unos 30 segundos), un token recién rotado se acepta una vez más: el sucesor que nadie recibió se da por usado y se emite otro de la misma familia, así que nunca hay dos tokens válidos a la vez. Fuera del margen, sigue siendo reuso.
  - En el cliente, un error de red al refrescar se reintenta una vez antes de rendirse; solo un 401 termina la sesión (ya es así).
- **Salud:** `/api/health` sigue respondiendo sin tocar la base (lo usa el _healthcheck_ de Docker). Uno nuevo, `/api/health/ready`, prueba la base con una consulta mínima; es el que vigila el monitoreo de la fase 20.
- **Despliegue (`infra/deploy.sh`):**
  - Descarga solo las imágenes de la app, con un tiempo límite.
  - Escribe la versión nueva en el `.env` solo si la descarga funcionó.
  - Si `up --wait` falla, regresa a la versión anterior y la levanta. El workflow falla igual, para que se note.
- **Pruebas:** la del margen del refresh (dentro y fuera de él), la del cliente que reintenta, y la de `ready` con la base caída.

**Conceptos:** cadena de suministro, rotación de tokens con margen, _liveness_ frente a _readiness_, despliegue con vuelta atrás.

### Fase 20: Operación

Hallazgos H4, H5 y H7. Casi todo es infraestructura y documentación, con poco código.

- **Respaldos fuera del VPS, en automático y cifrados:**
  - `restic` (cifra antes de enviar, guarda solo lo que cambió y verifica lo guardado) manda cada noche el `pg_dump` a un destino gratuito: Google Drive del superadmin (15 GB, con `rclone`) o Backblaze B2 (10 GB). El proveedor nunca ve los datos.
  - Se conservan 14 diarios, 8 semanales y 12 mensuales.
  - En el VPS, los respaldos quedan cifrados también (era un pendiente de `docs/SEGURIDAD.md`).
  - La llave de `restic` vive en el `.env` del VPS **y en un lugar fuera de él** (el gestor de contraseñas del superadmin): sin ella no hay restauración.
  - `docs/DESPLIEGUE.md` §9 cambia: la copia manual se va, y queda una **prueba de restauración** cada tres meses, con un comando.
- **Monitoreo gratuito:**
  - Un servicio externo (UptimeRobot o Better Stack, planes gratis) revisa `/api/health/ready` cada 5 minutos y avisa por correo si cae.
  - `healthchecks.io` (plan gratis) recibe una señal del respaldo de cada noche y de cada job (`runJob`): si una no llega a tiempo, avisa. Así, que el job no abra diciembre el día 1 deja de pasar en silencio.
- **Errores del navegador:** un endpoint `POST /api/client-errors`, con límite de peticiones y sin datos personales, que escribe en el log los errores que hoy solo ve la consola del celular de cada vecino.
- **Continuidad:**
  - Un documento de operación (`docs/OPERACION.md`): qué hacer si la app no abre, cómo restaurar un respaldo, cómo desplegar a mano, dónde están los secretos, a quién llamar.
  - Un **suplente del superadmin** (pregunta 25): alguien que pueda reabrir un mes y restablecer una contraseña si el superadmin no está.

**Conceptos:** respaldos 3-2-1, cifrado del lado del cliente, monitoreo sintético, _dead man's switch_, factor de autobús.

### Fase 21: Tarifas y parámetros del edificio

Hallazgo H1. El dominio ya lo permite (`RateSettings.change`, con fechas de vigencia que solo se agregan después de la última), pero no hay caso de uso, endpoint ni pantalla.

- **_Administración → Tarifas_** (solo el superadmin): la cuota, la limpieza por visita, la basura por semana y la multa por saltar el turno, cada una con su historia de cambios.
- **Un cambio** lleva su importe y el mes desde el que aplica, que tiene que ser uno que **todavía no se abre**: abrir un mes ya cobró sus cuotas, y los meses pasados no se reescriben. Como el job abre cada mes a las 00:05 del día 1, una cuota que la asamblea acuerda a mitad de mes aplica desde el mes siguiente.
- Caso de uso `ChangeRates` en `settings`, auditado, con su endpoint `PUT /api/rates`.
- **Parámetros del edificio:** la misma pantalla y el mismo patrón (valor con fecha de vigencia, auditado) guardan después la mayoría y el plazo de las votaciones (fase 27). Por eso la sección se llama _Parámetros_ y las tarifas son su primer grupo.
- **Pruebas:** no se puede cambiar un mes abierto ni uno anterior, el mes siguiente cobra la cuota nueva y la bitácora registra el cambio.

**Conceptos:** datos con vigencia (_bitemporalidad_ simple), configuración como dato del dominio.

### Fase 22: Libro: orden, estado, búsqueda y responsable en el PDF

Ideas del administrador más una de la auditoría (búsqueda).

- **Orden de los movimientos:** un botón cambia entre «más antiguos primero» (como hoy) y «más recientes primero». Se recuerda en cada celular (preferencia local, sin servidor).
- **Estado del mes:** un solo componente, `MonthStatusBadge`, con un candado para «Cerrado» y un color que contraste con «Abierto», en el Libro, el Histórico, la revisión del historial y Pendientes. El contraste lo revisa axe en claro y oscuro.
- **Búsqueda y filtros** en los movimientos del mes: por depto, por tipo y por texto (descripción u observaciones). Solo en la pantalla; la API ya entrega el mes completo.
- **Responsable en los PDF:**
  - Desde agosto 2026: el depto con el turno de ese mes y, si hubo, el que lo cubrió por delegación, según el calendario de turnos (`LoadShiftCalendar`).
  - Antes: el «Responsable» de la hoja de papel, que ya está guardado (`paper_sheet`).
  - Un mes cerrado imprime el responsable que tenía al cerrarse, igual que sus cuentas.
- **Pruebas:** el orden se recuerda, los filtros se combinan, y el PDF de un mes con delegación nombra a los dos deptos.

**Conceptos:** preferencias locales, componentes compartidos (DRY), consultas entre módulos por casos de uso.

### Fase 23: Recibos de pago y estado de cuenta en PDF

De la auditoría: hoy cada vecino ve su estado de cuenta, pero no tiene un papel que mostrar.

- **Recibo de un pago:** desde un pago de depto del libro o desde el estado de cuenta. Dice el depto, la fecha, el importe, qué cargos cubrió (con la misma asignación de `allocatePayments`), las observaciones, quién lo registró y el saldo del depto después del pago. Lleva un folio estable.
- **Estado de cuenta en PDF:** cargos, pagos, adeudo o adelanto, hasta el día en que se descarga o hasta el cierre de un mes.
- **Exportar a CSV:** los movimientos de un mes o de un rango de meses, para abrirlos en una hoja de cálculo.
- **Compartir** con el mismo botón del libro (abre WhatsApp en el celular).
- **Reutiliza** el puerto `REPORT_RENDERER` y el estilo del reporte mensual (fuentes estándar del PDF: solo caracteres WinAnsi).
- **Pruebas:** el recibo de un pago que cubre dos meses, el de un pago parcial y el de un adelanto.

**Conceptos:** documentos derivados, folios, exportación de datos.

### Fase 24: Correo y recuperación de contraseña

Reemplaza a la fase 17. La investigación está en la sección 4.

- **Proveedor:** Resend, en su plan gratuito, por SMTP. El código no depende de él: un puerto `EMAIL_SENDER` con un adaptador SMTP, así que cambiar a Brevo u otro es cambiar cuatro variables de entorno.
- **Dominio de envío:** un subdominio propio (por ejemplo, `avisos.osspro.site`), con SPF, DKIM y DMARC en Namecheap, para que los correos no caigan en spam y nadie pueda hacerse pasar por la app.
- **El correo de cada usuario:**
  - El superadmin lo captura (a partir de la lista física que ya tiene).
  - El usuario lo **confirma** con un enlace que le llega. Solo un correo confirmado recibe avisos o sirve para recuperar la contraseña, así que un error de captura no manda nada a un extraño.
  - Cada quien puede cambiar el suyo en _Mi cuenta_, y vuelve a confirmarse.
- **«¿Olvidaste tu contraseña?»** en el login:
  - Se escribe el usuario. Si tiene un correo confirmado, le llega un enlace de un solo uso que vence en 30 minutos.
  - La respuesta en pantalla es la misma exista o no el usuario, para no revelar quién tiene cuenta.
  - Tiene límite de intentos por IP y por usuario, como el login.
  - Al cambiarla, se cierran todas las sesiones, y queda en la bitácora.
  - La contraseña temporal del superadmin sigue como respaldo.
- **Bandeja de salida (_outbox_):** un correo se guarda en la base dentro de la misma transacción que lo origina, y un job lo envía con reintentos. Así, si el proveedor falla, el correo sale después y la operación no se pierde (el trabajo dentro de una unidad de trabajo solo toca la base). El job respeta el límite diario del plan gratuito.
- **Local:** Mailpit en `docker-compose.dev.yml` recibe los correos de desarrollo; las pruebas usan un `EMAIL_SENDER` falso.
- **Privacidad:** los correos dicen lo mínimo (un aviso y un enlace a la app); los importes y nombres se ven dentro de la app, con sesión.
- **Guía de usuario:** un tema nuevo, «Si olvidaste tu contraseña», con `pnpm guide`.

**Conceptos:** autenticación del dominio de correo, _outbox_ transaccional, tokens de un solo uso, enumeración de usuarios, doble confirmación.

### Fase 25: Avisos y recordatorios

Idea del administrador. En capas: la que siempre funciona primero.

- **Avisos dentro de la app:**
  - Una sección _Avisos_ y una tarjeta en Inicio. Los publican el administrador en turno y el superadmin (como pidió el administrador), con título, texto y, si se quiere, fecha de vencimiento.
  - Cada usuario ve cuáles no ha leído.
  - Quedan en la bitácora.
- **Por correo:** cada aviso le llega también a quien tiene un correo confirmado y no lo desactivó.
- **Recordatorios automáticos** (jobs, a nombre de `SYSTEM_ACTOR`):
  - A cada dueño: la cuota del mes y, si tiene, su adeudo.
  - Al administrador en turno: «cierra octubre antes del 5 de noviembre» y «decide la entrega del turno».
  - A los dueños: una reforma abierta que no han votado (fase 27).
- **Preferencias** en _Mi cuenta_: qué recordatorios recibir por correo. Cada correo trae un enlace para dejar de recibirlos.
- **Push, al final de la fase y opcional (25b):**
  - Notificaciones Web Push (estándar VAPID, sin proveedor ni costo).
  - Requieren un _service worker_, que la app hoy no tiene. El mismo permite abrir la app sin conexión con lo último que se vio, solo para leer.
  - En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más).
  - El _service worker_ respeta la CSP (`worker-src 'self'`).
- **Pruebas:** quién puede publicar un aviso, los recordatorios del día correcto, y que un correo no confirmado no recibe nada.

**Conceptos:** notificaciones en capas, jobs programados, preferencias de usuario, _service workers_.

### Fase 16: Comprobantes adjuntos y archivo de documentos

Viene de la Etapa 2, ampliada con los comprobantes del libro. **Va después de la fase 20:** agrega archivos que el `pg_dump` no guarda, así que los respaldos fuera del VPS tienen que existir antes.

- **Comprobantes en el libro:**
  - Uno o varios archivos por movimiento, sobre todo en otros egresos (facturas, tickets, notas).
  - Los agrega quien puede escribir ese mes; un mes cerrado congela también sus adjuntos.
  - En el celular se toma la foto directo con la cámara.
- **Archivo de documentos:** una sección _Documentos_ con los PDF y fotos originales de los balances (cada mes del historial enlaza a su hoja), el reglamento escaneado y el rol de administración. El superadmin sube, renombra y borra; todos ven y descargan.
- **Cómo se sirven los archivos.** No es una CDN pública: cada descarga pide sesión.
  - Se guardan en un volumen de Docker propio (`files-data`), fuera de la base y fuera de lo que el nginx publica. Solo la API escribe en él.
  - Para descargar, la API revisa la sesión y responde con `X-Accel-Redirect` a una ubicación `internal` del nginx de `web`, que tiene el volumen montado como solo lectura y envía el archivo. Así la API decide quién descarga, y el nginx hace el trabajo pesado.
  - En disco cada archivo se llama por un identificador al azar. El nombre original, su tipo, su tamaño y su huella SHA-256 van en la base.
- **Qué se acepta, y cómo se revisa:**
  - Solo JPG, PNG, WebP y PDF. El tipo se comprueba por los bytes del archivo, no por su extensión ni por lo que dice el navegador. Nada de SVG ni HTML, que pueden traer scripts.
  - **Las fotos se vuelven a codificar en el servidor** (`sharp`). Eso borra sus metadatos (la ubicación GPS de quien la tomó) y desactiva archivos disfrazados de imagen.
  - En el celular, las fotos se reducen antes de subirlas (unos 2,000 px), para gastar menos datos.
  - Límite por archivo (10 MB) y en total, en la API y en los dos nginx (`client_max_body_size`).
- **Cabeceras al descargar:**
  - `Content-Type` el guardado.
  - `X-Content-Type-Options: nosniff`.
  - `Content-Security-Policy: sandbox`, para que un PDF no ejecute nada.
  - `Cache-Control: private`, para que ningún proxy guarde una copia.
  - Los PDF se abren en el navegador, y las fotos se ven en la app.
- **Borrar:** un borrado se marca, y el archivo se elimina del disco días después. Así una restauración de la base no apunta a archivos que ya no existen.
- **Respaldos:** `restic` (fase 20) guarda el volumen junto con el `pg_dump`, en la misma corrida.
- **Puerto `FILE_STORE`,** con un adaptador de disco. Cada subida y cada borrado van a la bitácora.
- **Pruebas:** un archivo que dice ser JPG y no lo es se rechaza, la foto sale sin metadatos, sin sesión no se descarga, y en un mes cerrado no se adjunta.

**Conceptos:** almacenamiento de archivos, descargas autenticadas con `X-Accel-Redirect`, validación por contenido, metadatos EXIF, respaldos de archivos.

### Fase 26: Reglamento y ley de acuerdos

Primera mitad de la idea de gobernanza: el texto vigente, publicado y con su historia.

- **Dos documentos:** el **reglamento de convivencia** y la **ley de acuerdos** (las reglas de la administración que la app ya aplica: rotación, turnos de 2 meses, delegaciones, multas, días de entrega, cuotas).
- **Versiones:**
  - Cada documento es una serie de versiones que no se modifican, cada una con su fecha de vigencia y su motivo.
  - La vigente es la última aprobada. La primera la captura el superadmin (transcrita del papel), y queda como «versión inicial».
- **Lectura:**
  - Una sección _Reglamento_ con los artículos y un índice para saltar entre ellos.
  - Se puede ver cualquier versión anterior y **comparar dos versiones**, con lo agregado y lo quitado marcado, palabra por palabra.
  - Se descarga en PDF.
- **Los importes no se escriben a mano.** La ley de acuerdos cita los parámetros (`{{cuota}}`, `{{multa}}`…), que se llenan desde las tarifas vigentes (fase 21). Así, un cambio de cuota no deja el texto desactualizado.
- **Módulo nuevo `governance`,** con su dominio (`Document`, `DocumentVersion`) y sus pruebas. El formato del texto es Markdown sencillo: títulos, artículos y listas.
- **Pruebas:** la vigente es la última aprobada, la comparación marca los cambios y los parámetros se llenan con los valores del mes.

**Conceptos:** documentos versionados e inmutables, comparación de textos (_diff_), plantillas con datos del dominio.

### Fase 27: Reformas y votaciones

Segunda mitad, «tipo Git»: una reforma es una propuesta de versión nueva que se aprueba con votos.

- **Proponer:** el superadmin o el administrador en turno (pregunta 27).
  - Una reforma cambia un documento: el texto nuevo completo, su motivo y la versión de la que parte.
  - Mientras es borrador, quien la propuso la edita.
  - Al publicarla, se abre la votación, y los dueños reciben un aviso y un correo (fase 25).
- **Votar:**
  - **Un voto por depto,** del dueño: a favor o en contra. Los usuarios de solo lectura no votan (lo que ya garantiza `READ_ONLY`). El superadmin no vota como superadmin, solo con la cuenta de dueño de su depto, si la tiene (pregunta 26).
  - Cada voto queda con su fecha y en la bitácora: es la constancia de que el depto está de acuerdo.
  - **Es una constancia dentro de la app, no una firma legal.** Si la asamblea necesita acta, se imprime la reforma aprobada con la lista de votos.
  - Las reformas abiertas que el dueño no ha votado aparecen en _Pendientes_, en Inicio.
- **Cuándo se aprueba:**
  - **Mayoría: 6 de 10 deptos a favor.** Cuentan los 10, también los inactivos: legalmente cada depto siempre tiene dueño, así que un depto que no vota cuenta como que no aprobó.
  - **Plazo: 15 días** desde que se publica.
  - Se aprueba en cuanto llega al sexto voto a favor. Se rechaza en cuanto ya no puede llegar (5 en contra), o al vencer el plazo sin la mayoría.
  - La mayoría y el plazo son **parámetros** (fase 21), con fecha de vigencia y auditados. Una reforma usa los parámetros vigentes el día que se publicó.
- **Como Git:**
  - La vista de la reforma compara el texto propuesto con el vigente.
  - Si otra reforma del mismo documento se aprueba antes, la pendiente queda **desactualizada**, porque parte de una versión que ya no es la vigente. Quien la propuso la actualiza sobre la nueva versión, y **sus votos se reinician** (se votó otro texto).
  - Al aprobarse, la reforma se vuelve la versión vigente, con su fecha y el enlace a su votación.
- **Estados:** borrador → en votación → aprobada, rechazada, retirada (por quien la propuso, antes de que se apruebe) o desactualizada.
- **Pruebas** (dominio puro, como los turnos): la mayoría exacta, el rechazo anticipado, el plazo, el inactivo que no vota, el lector que no puede votar, la reforma desactualizada que reinicia sus votos, y dos votos del mismo depto a la vez (restricción en la base, como en ADR-0021).

**Conceptos:** máquina de estados, quórum y mayoría, concurrencia optimista sobre versiones (como un _merge_ en Git), parámetros con vigencia.

### Fase 28: Reporte anual con gráficas

- **Un año, o un rango de meses:** ingresos y egresos por mes y por tipo, el saldo al cierre de cada mes, y cuánto de las cuotas se cobró a tiempo.
- **En qué se gastó:** los egresos por tipo (basura, limpieza, otros) y los otros egresos más grandes. Para agruparlos mejor, los otros egresos pueden llevar una etiqueta opcional (pregunta 29).
- **Atrasos:** por depto, cuántos meses debió y cuánto, mes por mes.
- **En pantalla,** con gráficas: una librería que funcione con la CSP (sin `eval`), en su propio _chunk_ para no hacer más pesada la primera carga.
- **En PDF,** tablas y barras simples dibujadas con las primitivas `Svg` de react-pdf, sin librería de gráficas.
- **Caso de uso `GetYearlySummary`** en `reports`, sobre los meses cerrados (sus fotos) y los abiertos (en vivo).
- **Pruebas:** los totales del año cuadran con la suma de sus meses.

**Conceptos:** agregación de datos, visualización accesible, gráficas en PDF.

### Fase 29: Turnos: vista renovada y PDF

- **Vista:**
  - El ciclo de 20 meses como línea de tiempo, con el edificio (el _blueprint_) marcando a quién le toca.
  - Para cada dueño, **«tu próximo turno: octubre y noviembre 2027»**.
  - Las delegaciones y las multas, marcadas.
- **PDF del calendario** para el rango que se elija (desde y hasta), con delegaciones y multas, para compartir.
- **Pruebas:** el PDF de un rango con una delegación y un depto inactivo.

**Conceptos:** visualización de calendarios, documentos derivados del dominio.

### Fase 30: Calendario del libro y paletas por fecha

- **Vista calendario del libro:** el mes como cuadrícula de días, con una marca de ingreso o egreso los días que tuvieron movimientos. Al tocar un día se ven sus movimientos (con los filtros de la fase 22).
- **Paletas por fecha:**
  - El superadmin elige una paleta y un rango de fechas (por ejemplo, la navideña del 1 al 31 de diciembre).
  - Solo cambian los colores de acento, nunca los de ingreso y egreso ni el fondo.
  - Cada paleta trae su versión clara y oscura, y **se rechaza si no pasa el contraste WCAG AA**. Ese cálculo vive en `packages/shared`, así que lo usan el formulario y las pruebas.
  - El tema sigue al sistema operativo, como hasta ahora; la paleta solo cambia los acentos.
- **Pruebas:** axe revisa cada paleta incluida en claro y oscuro.

**Conceptos:** diseño por _tokens_, contraste calculado.

---

## 3. Auditoría del software (noviembre 2026)

Revisión del código, la infraestructura, las dependencias y la documentación al cerrar la Etapa 2.

**Lo que está sólido:**

- **Dominio:** la arquitectura hexagonal está bien separada y una regla de lint la vigila. Hay 529 pruebas unitarias, más las de integración, concurrencia (ADR-0021) y navegador con WCAG en tres tamaños y dos temas.
- **Seguridad:** cumple OWASP ASVS nivel 1. La CSP no permite `eval`, la bitácora no se puede modificar, el login tiene límite de intentos y las contraseñas usan Argon2id.
- **Despliegue:** los contenedores no corren como root, tienen _healthchecks_, cada despliegue lleva su versión y hay respaldo cada noche.

**Hallazgos:**

| #   | Hallazgo                                                      | Evidencia                                                                                                                                                                 | Riesgo                                                                       | Fase |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---- |
| H1  | La cuota y las tarifas no se pueden cambiar desde la app      | `settings` solo tiene `GetRates` y `RecordEarlierRates`. No hay endpoint ni pantalla.                                                                                     | Alto: un cambio de cuota acordado en asamblea requiere editar la base        | 21   |
| H2  | Los avisos de las dependencias crecieron: de 3 a 19 (6 altos) | `pnpm audit --prod`. En la API en producción: `zod` < 4.6.6, `body-parser` < 2.4.0 y `multer` < 2.5.0 (negación de servicio). Además `vite` y `seroval`. CI no lo revisa. | Medio                                                                        | 19   |
| H3  | Una sesión se puede cerrar sin razón                          | `refresh-session.ts` declara `REFRESH_TOKEN_REUSED` sin margen: si la respuesta de un refresh se pierde, el reintento con el token anterior revoca la sesión.             | Medio: probablemente parte de lo que se sintió inestable con el VPS limitado | 19   |
| H4  | Nadie se entera si algo falla                                 | `runJob` solo escribe en el log; `/api/health` no consulta la base; no hay monitoreo externo.                                                                             | Alto: si el job no abre diciembre el día 1, nadie lo sabe                    | 20   |
| H5  | Los respaldos solo salen del VPS a mano                       | `docs/DESPLIEGUE.md` §9: «Copia los respaldos fuera del VPS, por ejemplo cada semana». En el VPS no están cifrados.                                                       | Alto: si se pierde el VPS, se pierde todo desde la última copia              | 20   |
| H6  | El despliegue es frágil                                       | `infra/deploy.sh` escribe `DEPADMIN_TAG` antes de que la descarga funcione, la descarga no tiene tiempo límite y no vuelve a la versión anterior si falla.                | Medio: es lo que se vio con el despliegue colgado de noviembre               | 19   |
| H7  | Todo depende de una sola persona                              | Solo el superadmin reabre meses, restablece contraseñas y despliega.                                                                                                      | Alto a largo plazo: los turnos rotan cada 2 meses durante años               | 20   |

---

## 4. Investigación: el proveedor de correo

**Lo que se necesita:** gratis, seguro y confiable para unos 11 usuarios. Son pocos correos: confirmaciones, recuperaciones de contraseña, avisos y recordatorios, unos 100 al mes en los meses con votación.

**Opciones:**

| Opción                                     | Ventajas                                                        | Desventajas                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor de correo propio en el contenedor | Sin terceros                                                    | Desde la IP de un VPS compartido los correos caen en spam; hay que cuidar la reputación de la IP y SPF, DKIM y DMARC, y el puerto 25 suele estar bloqueado. **Descartado** |
| Resend (plan gratuito)                     | 3,000 correos al mes y 100 al día, un dominio, API y SMTP, DKIM | Al llegar al límite diario deja de enviar hasta el día siguiente; un dominio en el plan gratis                                                                             |
| Brevo (plan gratuito)                      | 300 correos al día, SMTP y API                                  | Hay que esperar a que aprueben la cuenta para enviar                                                                                                                       |
| SMTP de Gmail                              | Sin registro nuevo                                              | Sale desde una cuenta personal, con límites que Google puede cambiar; no autentica un dominio propio                                                                       |

**Recomendación:** Resend por SMTP, con Brevo como alternativa. El volumen queda muy por debajo del límite diario, y la bandeja de salida (fase 24) reparte el envío si alguna vez se acerca. Como la app habla SMTP detrás del puerto `EMAIL_SENDER`, cambiar de proveedor es cambiar las variables de entorno.

**Seguridad:**

- La llave del proveedor vive solo en el `.env` del VPS, como las demás.
- SPF, DKIM y DMARC autentican el subdominio de envío, así que nadie puede mandar correos a nombre de la app.
- Los correos llevan lo mínimo (sin importes ni nombres), porque pasan por un tercero.

Las condiciones de los planes gratuitos cambian. Hay que confirmarlas en la página de precios de cada proveedor al empezar la fase 24: una fuente de noviembre 2026 muestra 2,000 correos al mes para el plan gratis de Resend, y aun así sobraría.

Fuentes: [precios de Resend (WP Mail SMTP)](https://wpmailsmtp.com/resend-review/), [plan gratuito de Resend (Automation Atlas)](https://automationatlas.io/answers/resend-free-tier-explained-2026/), [precios de Resend (Activepieces)](https://www.activepieces.com/blog/resend-pricing-2026-free-tier-plans-and-limits), [correo transaccional de Brevo](https://www.brevo.com/pricing/transactional-email/see-all-features/), [guía técnica de Brevo (CaptainDNS)](https://www.captaindns.com/en/blog/brevo-transactional-email-technical-guide).

---

## 5. Antes del 1 de diciembre de 2026

No es una fase, pero hay que hacerlo antes del cambio de turno a 401:

- La **fase 19** en producción.
- **Septiembre y octubre cerrados** en producción. Así 502 puede cerrar noviembre del 1 al 5 de diciembre, en su entrega.
- La cuenta de 401 probada: entra, ve su estado de cuenta y su turno empieza el 1 de diciembre.
- 502 sabe que su entrega va del 1 al 5 de diciembre: cierra noviembre y registra la entrega del turno.
- La guía en PDF (`guia-depadmin.pdf`) compartida en el grupo de los vecinos.

---

## 6. Preguntas abiertas

Cada una tiene un valor por defecto para no bloquear el avance.

| #   | Pregunta                                                                                                                               | Valor por defecto                                                                                                                      | Fase |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 19  | ¿Qué proveedor de correo?                                                                                                              | **Respondida:** uno transaccional, seguro y gratuito: Resend, con Brevo como alternativa (sección 4)                                   | 24   |
| 20  | ¿Sigue la fase 17 (WhatsApp)?                                                                                                          | **Respondida:** no; se descarta por costo y mantenimiento, y el correo la reemplaza                                                    | 24   |
| 21  | ¿Entra la fase 16 a esta etapa?                                                                                                        | **Respondida:** sí, junto con los comprobantes del libro, con mucho cuidado en cómo el VPS sirve los archivos                          | 16   |
| 22  | ¿Las reformas incluyen votaciones? ¿Con qué mayoría y plazo?                                                                           | **Respondida:** sí; 6 de 10 deptos, cuentan los inactivos, 15 días de plazo, y todo como parámetro                                     | 27   |
| 23  | ¿Los correos de los dueños están al día?                                                                                               | El superadmin los corrobora con su lista física; cada dueño confirma el suyo con un enlace                                             | 24   |
| 24  | ¿A dónde van los respaldos fuera del VPS?                                                                                              | Google Drive del superadmin, cifrados con `restic` (Backblaze B2 como alternativa)                                                     | 20   |
| 25  | ¿Quién es el suplente del superadmin?                                                                                                  | Nadie hasta que se decida; mientras tanto, el documento de operación                                                                   | 20   |
| 26  | ¿El voto de una reforma es público (como una firma) o secreto? ¿El superadmin tiene también la cuenta de dueño de su depto para votar? | Público: cada depto ve cómo votó cada uno, como en una lista de firmas. El superadmin vota solo con la cuenta de dueño de su depto     | 27   |
| 27  | ¿Quién propone reformas: el administrador del mes en curso, o también el saliente en su entrega?                                       | Solo el depto con el turno del mes en curso y el superadmin                                                                            | 27   |
| 28  | ¿Se puede cambiar un voto antes de que cierre la votación?                                                                             | No: votar es firmar. Si el texto cambia (reforma desactualizada), se vota de nuevo                                                     | 27   |
| 29  | ¿Los otros egresos llevan una etiqueta para el reporte anual (mantenimiento, reparaciones…)?                                           | Sí, opcional y de una lista corta que administra el superadmin                                                                         | 28   |
| 30  | ¿Cambiar la mayoría o el plazo de las votaciones necesita una reforma?                                                                 | Por ahora no: lo cambia el superadmin, con fecha de vigencia y en la bitácora. Cuando el reglamento lo regule, se hará con una reforma | 27   |
| 31  | ¿El reglamento se puede leer sin sesión, como la guía?                                                                                 | No: es del edificio, se lee con sesión                                                                                                 | 26   |
