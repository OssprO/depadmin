# ADR-0005: JWT de acceso + refresh token rotativo en cookie

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Un usuario por depto, uso principal desde el celular y una sesión que debe durar semanas (spec §5). La API y la SPA se sirven desde el mismo dominio.

## Decisión

- Access token JWT de 15 minutos, guardado solo en memoria del frontend.
- Refresh token opaco en una cookie `httpOnly`, `Secure` y `SameSite=Strict`, guardado hasheado en la BD, que rota en cada uso. Si se reutiliza un token ya rotado, se revoca toda la familia de tokens.
- Contraseñas con argon2id. Rate limiting en el login.

## Consecuencias

- JavaScript (y por tanto un ataque XSS) nunca puede leer el refresh token.
- El superadmin puede revocar sesiones.
- Al ser del mismo origen, no se necesita CORS y `SameSite=Strict` mitiga CSRF.
- Se implementa en la fase 3.
