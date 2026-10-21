# ADR-0013: Identidad, sesión y autorización

**Estado:** Aceptado · **Fecha:** 2026-10-13

## Contexto

La fase 3 implementa el ADR-0005: login, sesión de semanas en el celular y una primera pantalla protegida. Faltaba decidir cómo se dan de alta los dueños, cómo se reparte la autorización entre HTTP y el dominio, y cómo evitar que el refresh rotativo cierre sesiones legítimas.

## Decisión

- **Cuentas:**
  - Una por depto, con el número del depto como usuario (`501`). El seed crea las diez sin contraseña, así que no pueden entrar.
  - El superadmin se crea en el seed a partir de `SUPERADMIN_USERNAME` y `SUPERADMIN_PASSWORD`, solo si todavía no existe.
- **Alta y recuperación sin email:**
  - El superadmin genera una contraseña temporal aleatoria (`xxxx-xxxx-xxxx-xxxx`, unos 79 bits) que se muestra una sola vez para pasársela al dueño.
  - El dueño debe cambiarla al entrar. Eso mismo sirve para recuperar una contraseña olvidada.
- **Contraseñas:**
  - argon2id con los parámetros mínimos de OWASP, usando `@node-rs/argon2`, que trae binarios precompilados sin scripts de instalación.
  - Mínimo de 10 caracteres y sin reglas de composición (NIST SP 800-63B).
  - El usuario se normaliza a minúsculas.
- **Tokens:**
  - **Access token:** JWT HS256 de 15 minutos, firmado con `jose` y la variable `JWT_SECRET`.
  - **Refresh token:** 256 bits aleatorios, guardados como SHA-256. Un hash lento no aporta nada con esa entropía.
  - **Sesión:** los tokens de un mismo login forman una cadena (`session_id`).
  - **Vigencia:** el refresh token dura 30 días sin uso y la cuenta se reinicia con cada refresco.
- **Rotación y reuso:**
  - Usar un refresh token lo marca como rotado mediante un `UPDATE … WHERE rotated_at IS NULL`, de modo que de dos peticiones simultáneas solo gana una.
  - Presentar un token ya rotado revoca toda la sesión.
  - El caso de uso devuelve el resultado y lanza el error después de confirmar la transacción. Si lo lanzara dentro, el rollback desharía la revocación; una prueba de integración lo vigila.
- **Cookie:** `depadmin_refresh`, `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/api/auth`, para que solo viaje a los endpoints de autenticación. No se usa CORS: la SPA y la API comparten origen.
- **Autorización en dos niveles:**
  - **Autenticación:** un guard global (`APP_GUARD`) exige el access token en todas las rutas, salvo las marcadas `@Public()`. Es seguro por defecto: una ruta nueva nace protegida.
  - **Permisos:** solo superadmin, ventanas de escritura y demás los deciden los casos de uso con las políticas del dominio (`WriteAccessPolicy`), no los guards. Así la regla vale para cualquier adaptador que los llame.
  - **Frontend:** los guards de ruta solo deciden la navegación.
- **Errores:** todas las respuestas de error usan Problem Details (RFC 9457) con un `code` estable que el frontend traduce. Se agregó el tipo `UnauthenticatedError` (401).
- **Límite de intentos:** 5 logins por minuto por IP y usuario. Si se limitara solo por IP, como los vecinos comparten la del Wi-Fi del edificio, uno podría bloquear a todos.
- **Tiempo:** el kernel agrega `Instant` (un punto en el tiempo, sin `Date`) y `Clock.now()`. `SystemClock` calcula «hoy» en `America/Mexico_City`.
- **Frontend:**
  - El access token vive solo en memoria y, al recargar, la sesión se recupera desde la cookie.
  - El cliente HTTP refresca una vez ante un 401 y reintenta.
  - Los refrescos se agrupan en una sola petición por pestaña y se turnan entre pestañas con la Web Locks API. Sin eso, dos pestañas presentarían el mismo token y la API lo trataría como robo.
  - El árbol de rutas se declara en código (`app/router.tsx`) y cada pantalla vive en su feature.

## Consecuencias

- Al resetear la contraseña de un usuario o cerrar su sesión, su access token sigue siendo válido hasta 15 minutos. Es el precio de no consultar la base en cada petición.
- Si el superadmin olvida su contraseña, no hay recuperación desde la app; se resuelve desde el servidor.
- Detrás de Caddy, Express debe confiar en el proxy (`trust proxy`) para que el límite use la IP real del cliente. Se configuró en la fase 5 (`TRUST_PROXY`, ADR-0026).
- Los tokens vencidos se acumulan en `refresh_token`: unas filas por día. La limpieza periódica queda para la fase 11.
- Las pruebas de navegador (Playwright, en `e2e/`) levantan todo el sistema construido: Postgres, la API compilada y la SPA con `vite preview`.
