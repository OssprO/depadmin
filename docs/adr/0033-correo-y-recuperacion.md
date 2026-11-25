# ADR-0033: Correo propio, bandeja de salida y recuperación de contraseña

**Estado:** Aceptado · **Fecha:** 2026-11-25

## Contexto

Hasta ahora, quien olvida su contraseña depende del superadmin. El superadmin le genera una temporal y se la pasa en persona o por chat. Además, la app no tiene forma de avisarle nada a nadie fuera de ella. La fase 24 (`docs/PLAN-ETAPA-3.md`) agrega el correo, y la fase 25 lo usará para avisos.

Se decidió con el administrador, antes de implementar:

- **Remitente:** un subdominio propio, `depadmin.osspro.site`, autenticado con SPF, DKIM y DMARC.
  - **Por qué un subdominio:** el dominio de la web no se toca, y la reputación de envío queda separada de la de `osspro.site`.
  - **El proveedor es Resend,** por SMTP y en su plan gratuito: 100 correos al día y 3,000 al mes.
- **Todos pueden tener correo:** dueños, usuarios de solo lectura y el superadmin.
- **Límites:**
  - recuperación: 3 por hora por usuario y 5 por hora por IP;
  - confirmaciones: 3 por hora por usuario.
- **Cada departamento tiene su propio proveedor de internet:** los vecinos no comparten una IP. CLAUDE.md y el ADR-0030 suponían lo contrario.
- **Los correos se mandan sin `Reply-To`,** y piden no responder. Las dudas van con el administrador en turno, y el correo del superadmin no queda a la vista.

## Decisión

### El correo de cada usuario

- **Dos campos en `app_user`:**
  - `email`: el correo confirmado, el único que recibe correos de la app.
  - `pending_email`: el capturado que espera su confirmación.
- **Cambiar de correo no deja a nadie sin recuperación.** El correo anterior sigue funcionando hasta que se confirma el nuevo, así que un error al escribir no deja la cuenta sin forma de recuperarse.
- **Al confirmar el nuevo,** al anterior le llega el aviso «El correo de tu cuenta cambió».
- **Quién lo cambia:**
  - **Cada quien el suyo,** en _Mi cuenta_.
  - **El superadmin el de cualquiera,** en _Usuarios_, a partir de la lista física que ya tiene.
  - Capturar un correo es gestión de usuarios, no una decisión del edificio (ADR-0031).
- **Quitarlo** borra los dos campos.
- **La bitácora registra cada paso:** captura, confirmación y retiro. Las direcciones van como `Redacted`: la bitácora es para siempre y no debe guardar datos personales viejos, así que solo dice que el correo cambió.
- **Las direcciones se guardan en minúsculas y sin espacios.** Dos usuarios pueden compartir correo, porque la recuperación se pide por usuario.

### Enlaces de un solo uso

Una tabla, `user_token`, guarda los dos tipos de enlace. Guarda solo el SHA-256 del enlace, como los tokens de sesión (256 bits al azar).

| Enlace       | Dura    | Notas                                                                                                                                                                                             |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmación | 60 días | Atado a la dirección exacta: una nueva captura anula los anteriores. Dura mucho porque entrar a la app no es algo diario. Si se usa dos veces, la segunda dice «ya estaba confirmado», sin error. |
| Recuperación | 1 hora  | Pedir otro anula el anterior.                                                                                                                                                                     |

- **El enlace viaja después del `#`** (`/reset-password#…`). Esa parte de la dirección no se manda al servidor, así que no aparece en los logs de nginx ni en el encabezado `Referer`.
- **Confirmar el correo exige entrar con la cuenta.** El enlace abre la app, y si no hay sesión, pasa por el login y vuelve. Así, si el superadmin escribe mal un correo, el desconocido que lo recibe no puede confirmarlo: le falta la contraseña. Esta es la doble confirmación que pide el plan.
- **Si el enlace es de otra cuenta,** la app dice con cuál entrar. Es el caso de un teléfono con dos cuentas, como 501 y el superadmin.

### Recuperación de contraseña

1. En el login, «¿Olvidaste tu contraseña?» lleva a una pantalla que pide el usuario.
2. **La respuesta es siempre la misma,** exista o no el usuario, tenga o no correo, y aunque haya llegado a su límite. Solo cambia si se manda el correo.
3. **El correo sale si el usuario:**
   - existe;
   - puede entrar hoy (no está desactivado ni vencido);
   - tiene correo confirmado;
   - y no ha pedido 3 enlaces en la última hora.
4. **El límite de 3 por usuario se cuenta en la base** (los enlaces emitidos) y no da error. Así no revela qué usuarios existen y sobrevive a un despliegue.
5. **El de 5 por IP es de `@nestjs/throttler`** (429), igual para todos.
6. **El enlace abre «Nueva contraseña».**
   - La pantalla primero pregunta si el enlace sirve, y muestra la cuenta, para quien tiene dos.
   - La nueva contraseña sigue las reglas de _Mi cuenta_.
7. **Al guardarla:**
   - se usa el enlace;
   - se cierran todas las sesiones de la cuenta;
   - queda en la bitácora (`USER_PASSWORD_RECOVERED`, a nombre del propio usuario);
   - y ofrece entrar con la nueva. El formulario lleva el usuario escondido, así que el gestor de contraseñas la guarda en la cuenta correcta.
8. **Mientras no haya proveedor configurado,** el enlace «¿Olvidaste tu contraseña?» no aparece. En su lugar queda el texto de siempre: pedirle una temporal al superadmin.

### Aviso de seguridad

**Cada vez que cambia la contraseña de una cuenta con correo confirmado le llega «Tu contraseña de DepAdmin cambió».** Pasa cuando la cambia el usuario, cuando la recupera y cuando el superadmin le da una temporal. Si no fue el usuario, se entera de inmediato.

### Qué dicen los correos

Cuatro correos, todos con lo mínimo:

- **No llevan importes, nombres ni el nombre del edificio,** porque pasan por un tercero y un correo mal escrito puede llegarle a un desconocido.
- **Dicen la cuenta (el usuario),** porque hay quien tiene dos.
- **Firman como «DepAdmin, la app de tu edificio».**
- **Cada uno trae, en HTML y en texto, un botón y el enlace escrito,** y el pie «No respondas: nadie lee este buzón. Si tienes dudas, habla con el administrador en turno».

### Bandeja de salida (_outbox_)

- **Un solo puerto, `OUTBOX`,** en el kernel compartido, que el módulo global `mail` provee, como `AUDIT_TRAIL`.
  - Un caso de uso le entrega el correo como datos: destinatario, asunto, párrafos, un botón con su ruta dentro de la app, si es urgente y hasta cuándo sirve.
  - Lo guarda en `email_outbox` dentro de su unidad de trabajo, así que el correo existe solo si lo que lo causó se guardó.
- **El HTML y el texto se arman al enviarlo,** con `APP_URL` delante de la ruta. El módulo de identidad escribe las palabras y el de correo pone el formato.
- **Se envía en cuanto se confirma la transacción.** `UnitOfWork` gana `afterCommit()`, que despierta al mensajero (`EmailCourier`) sin esperarlo.
- **Un job, `deliver-emails`, corre cada 10 minutos** para los reintentos y lo que quedó pendiente al reiniciar la API. Avisa a healthchecks.io como los demás, y como falla cuando un correo no pudo salir o se alcanzó el límite del día.
- **Cada correo se reclama antes de enviarse** (`FOR UPDATE SKIP LOCKED` y un plazo de reclamo). Así, si durante un despliegue corren dos API, no se manda dos veces.
- **El límite diario** (`EMAIL_DAILY_LIMIT`, 90 por omisión) cuenta lo enviado en las últimas 24 horas. Es más estricto que el día de Resend, sin importar a qué hora reinicie su cuenta. Los urgentes (la recuperación) salen primero.
- **Reintentos:** a los 1, 2, 4… minutos, hasta 6 horas entre uno y otro y como máximo 8 intentos.
  - Un correo cuyo plazo venció se descarta (`EXPIRED`), porque la bandeja nunca manda un enlace vencido.
  - Un destinatario rechazado (`EENVELOPE`) es una falla definitiva (`FAILED`).
  - Una falla de autenticación con el proveedor no es definitiva: el correo espera a que se corrija la llave.
- **Lo enviado se vacía:** al salir, un correo pierde sus párrafos y su enlace, y queda solo el registro (tipo, destinatario, fechas). Así una copia de la base no trae enlaces vivos. A los 30 días se borra.
- **Mientras no haya proveedor** (`SMTP_HOST` vacío), los correos esperan en la bandeja hasta su plazo. Por eso un correo capturado hoy se confirma cuando Resend quede configurado, dentro de sus 60 días.

### Configuración

| Variable                     | Qué es                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| `SMTP_HOST`                  | Vacío apaga el envío. En producción, `smtp.resend.com`.        |
| `SMTP_PORT`                  | 465 (TLS directo, por omisión) o 587 (STARTTLS obligatorio).   |
| `SMTP_USER`, `SMTP_PASSWORD` | En Resend, `resend` y la llave de API (un secreto del `.env`). |
| `EMAIL_FROM`                 | `DepAdmin <avisos@depadmin.osspro.site>`.                      |
| `APP_URL`                    | El origen de los enlaces: `https://depadmin.osspro.site`.      |
| `EMAIL_DAILY_LIMIT`          | 90.                                                            |

- **El adaptador usa Nodemailer,** sin dependencias propias. Cambiar de proveedor (Brevo, por ejemplo) es cambiar estas variables.
- **En desarrollo, Mailpit** (`docker-compose.dev.yml`) recibe todo en `localhost:1025` y lo muestra en `http://localhost:8025`.
- **Las pruebas de navegador levantan su propio Mailpit** con Testcontainers y leen los correos de su API.

## Consecuencias

- **`UnitOfWork.afterCommit`** es nuevo en el puerto. Una transacción que se reintenta por un _deadlock_ descarta lo registrado en el intento fallido, así que el mensajero despierta una sola vez.
- **Se confirma el correo desde el teléfono donde se tiene la sesión.** Abrir el enlace en otro dispositivo pide entrar ahí.
- **La recuperación puede revelar, por el tiempo de respuesta,** si un usuario con correo existe: escribir un enlace tarda unos milisegundos. Con 5 intentos por hora por IP y usuarios que son números de depto (públicos de por sí), se acepta.
- **El límite de 5 por IP vive en memoria:** un despliegue lo reinicia. El de 3 por usuario no, porque se cuenta en la base.
- **La fase 25 reutiliza todo esto.** Sus avisos no serán urgentes y deberán dejarle un margen del límite diario a la recuperación.
- **El ADR-0030 queda corregido en un punto:** los vecinos no comparten IP. El límite de 30 errores del navegador por minuto sigue siendo razonable para una sola casa.
