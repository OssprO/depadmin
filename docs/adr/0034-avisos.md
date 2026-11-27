# ADR-0034: Avisos del edificio, en la app y por correo

**Estado:** Aceptado · **Fecha:** 2026-11-27

## Contexto

La fase 25 (`docs/PLAN-ETAPA-3.md`) trae los avisos. Se divide en tres PR:

- **25a,** este ADR: avisos en la app y por correo, y las preferencias de correo.
- **25b:** recordatorios automáticos de la cuota, el adeudo, el cierre del mes y la entrega del turno.
- **25c:** notificaciones push, opcionales.

La 25a reutiliza la bandeja de salida de la fase 24 (ADR-0033). Se decidió con el administrador, antes de implementar:

- **Publican el administrador en turno y el superadmin,** como pidió el administrador.
- **El correo lleva el texto completo del aviso.** Si solo dijera «hay un aviso nuevo», nadie lo leería sin entrar a la app.
- **También reciben avisos los usuarios de solo lectura,** como los inquilinos o el contador. Un aviso de corte de agua le sirve a quien vive ahí.

## Decisión

### Quién publica y quién retira

- **El administrador en turno** (`WriteAccessPolicy.governs`) **y el superadmin.** Un aviso informa y no decide nada, así que no choca con el ADR-0031: el auxiliar también puede escribir uno.
- **Ningún otro dueño publica** (`SHIFT_ADMIN_ONLY`), **ni un usuario de solo lectura** (`READ_ONLY`).
- **Los mismos dos lo retiran.** El administrador de un turno puede retirar uno publicado en el anterior.
- **Un aviso no se edita:** su correo ya salió. Para corregirlo, se retira y se publica otro.
- **Retirar lo esconde para todos,** pero no lo borra: la bitácora guarda qué decía (`NOTICE_PUBLISHED`, `NOTICE_WITHDRAWN`).

### Qué es un aviso

- **Un título** de 1 a 100 caracteres y **un texto** de 1 a 2,000, en texto simple. Los saltos de línea se respetan; no hay formato.
- **Un último día opcional,** que no puede ser una fecha pasada:
  - Hasta ese día es _vigente_.
  - Después pasa a «Anteriores» y deja de contar como no leído.
- **Las restricciones también están en la base,** con CHECK en `notice`:
  - los largos del título y del texto;
  - que el autor no sea de solo lectura y que un dueño traiga su depto;
  - que un aviso retirado diga quién lo retiró.
- **El autor se guarda como era al publicar:** su rol y su depto. Por eso se muestra como «Depto 401» o «Superadmin».

### Leídos

- **Cada cuenta lleva sus propios leídos,** en `notice_read`. Lo que lee 501 no cuenta para la cuenta de superadmin de la misma persona.
- **Al abrir _Avisos_, quedan leídos los que muestra la pantalla.** Siguen marcados «Nuevo» mientras la pantalla está abierta.
- **El autor ya leyó su aviso** al publicarlo.
- **Leer no queda en la bitácora.**
- **Dónde se ve lo nuevo:**
  - Inicio muestra una tarjeta con los avisos vigentes sin leer, hasta tres. Sin nada nuevo, no aparece.
  - _Más_ y el menú lateral muestran cuántos hay sin leer.
  - La barra de abajo del teléfono no lleva contador: así cada pantalla no tiene que pedir los avisos.

### Por correo

- **Recibe el correo quien:**
  - puede entrar hoy;
  - tiene correo confirmado;
  - y no apagó los avisos.
- **Sale un solo correo por dirección,** aunque varias cuentas la compartan, como la cuenta 501 y la de superadmin del administrador. El correo nombra las cuentas por las que llega.
- **No le llega al autor,** ni a las demás cuentas que comparten su dirección.
- **Lleva el título, el texto y, si tiene, su último día.** El formulario advierte que el aviso va por correo y que no lleve importes ni nombres. Los correos de seguridad siguen con lo mínimo (ADR-0033).
- **No es urgente.** Sale a lo más en 3 días; si tiene último día, a más tardar al día siguiente de ese día. Si no salió para entonces, se descarta: una noticia vieja no sirve. Por eso, mientras Resend no esté configurado, los avisos se ven en la app pero sus correos vencen.
- **Reserva para lo urgente:** la bandeja ya no deja que los correos no urgentes usen todo el límite diario. Los últimos 10 de los 90 quedan para los urgentes, como la recuperación de contraseña (`urgentReserve`). Un aviso para todos nunca deja a alguien sin poder entrar hasta el día siguiente.

### Preferencias y la salida de cada correo

- **Los correos opcionales tienen un tema** (`EmailTopic`; por ahora solo `NOTICES`; la 25b agregará los recordatorios).
- **`app_user.email_opt_outs` guarda los temas apagados.** Por omisión llegan todos.
- **Los correos de seguridad no tienen tema y no se pueden apagar.**
- **En _Mi cuenta_, «Correos que recibo»** muestra un interruptor por tema. Cada cambio queda en la bitácora (`USER_EMAIL_TOPICS_CHANGED`).
- **Cada correo opcional trae al pie «Dejar de recibir estos correos»:**
  - **Un enlace firmado,** sin sesión: quien lee ese buzón puede detener lo que le llega.
  - **Abre `/email/unsubscribe#…`,** una página que no cambia nada hasta que se oprime su botón. Así, los antivirus que abren los enlaces de los correos no dan de baja a nadie.
  - **El botón llama a `POST /api/email/unsubscribe/:enlace`.**
  - **Apaga el tema en todas las cuentas de esa dirección,** y queda en la bitácora (`USER_UNSUBSCRIBED`), a nombre de la cuenta del enlace.
- **El correo también lleva los encabezados `List-Unsubscribe` y `List-Unsubscribe-Post`** (RFC 8058), con la misma dirección de la API, para que Gmail y otros ofrezcan su propio botón.
- **El enlace es `<id de la cuenta>.<tema>.<firma>`.**
  - **La firma es HMAC-SHA256,** recortada a 128 bits.
  - **Cubre también la dirección a la que se envió.** Si la cuenta cambia de correo, el enlace viejo deja de servir y no puede apagar los avisos del correo nuevo.
  - **La llave se deriva de `JWT_SECRET`** con HKDF y una etiqueta propia. Producción no necesita otro secreto, y una firma de estos enlaces no sirve para nada más.
  - **No se guarda nada, y no vence:** la salida de un correo debe funcionar cuando sea que se lea.

### Módulo

- **Un módulo nuevo, `notices`.**
  - Pregunta quién tiene el turno con el puerto global `SHIFT_ROSTER`.
  - Pregunta a quién escribir con `EmailRecipients`, que exporta `identity`.
  - El grafo queda `notices` → `identity`.
- **Los temas, las preferencias y los enlaces de salida viven en `identity`,** porque son de la cuenta.
- **La bandeja guarda la salida del correo** en `email_outbox.unsubscribe_page` y `unsubscribe_post`, y la borra con lo demás al enviarlo (ADR-0033).

## Consecuencias

- **El límite diario pesa más:**
  - Un aviso a todos son hasta unos 15 correos.
  - Con la reserva quedan 80 al día para los no urgentes.
  - Los recordatorios de la 25b tendrán que caber ahí.
- **El texto de un aviso pasa por un tercero** (Resend). El formulario lo advierte. Lo delicado se dice en persona o en la app, no en un aviso.
- **Un enlace de salida reenviado** le permite a otro apagar los avisos de esa dirección. Es lo de menos: solo los apaga, y se vuelven a encender en _Mi cuenta_.
- **Cambiar `JWT_SECRET` invalida los enlaces de salida** de los correos ya enviados. La página lo explica y manda a _Mi cuenta_.
- **La fase 27 (votaciones) usará este canal:** al abrir una reforma se publicará un aviso.
