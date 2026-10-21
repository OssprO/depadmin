# Seguridad: revisión OWASP ASVS nivel 1

**Fecha:** 2026-10-14 · **Fase:** 11b, actualizada en la fase 5 · **Alcance:** API (NestJS), SPA (React), base de datos y despliegue.

## Lo que ya cumple

| Área (ASVS 4.0)                  | Cómo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Autenticación                 | Las contraseñas se guardan con Argon2id (19 MiB, 2 iteraciones; parámetros de OWASP). Miden de 10 a 128 caracteres y no tienen reglas de composición. El login se limita a 5 intentos por minuto por IP y usuario (`LOGIN_ATTEMPTS_PER_MINUTE`), así que un vecino en el mismo Wi-Fi no bloquea a los demás. El superadmin genera contraseñas temporales que se deben cambiar en el primer acceso. Al cambiar o restablecer una contraseña, se cierran todas las sesiones del usuario. |
| V3 Sesiones                      | El access token es un JWT HS256 que dura 15 minutos y vive en memoria. El refresh token es aleatorio, se guarda como hash, rota en cada uso y detecta la reutilización (revoca la sesión). Su cookie es `httpOnly`, `Secure`, `SameSite=Strict` y se limita a `/api/auth`. Cerrar sesión la invalida en el servidor, y un job nocturno borra los tokens vencidos.                                                                                                                      |
| V4 Control de acceso             | Todas las rutas exigen sesión salvo las marcadas `@Public()`. Los permisos (superadmin, ventana de escritura del turno) se revisan en los casos de uso con `WriteAccessPolicy`, no en la interfaz, y tienen pruebas.                                                                                                                                                                                                                                                                   |
| V5 Validación                    | Todo lo que entra pasa por esquemas Zod compartidos (400 si no cumple), y el dominio revisa sus propias reglas (422 o 409). Prisma usa consultas parametrizadas; la única consulta escrita a mano (el bloqueo de mes) también va parametrizada.                                                                                                                                                                                                                                        |
| V7 Errores y bitácora            | Los errores salen como RFC 9457 sin trazas; un 500 solo responde el código `INTERNAL_ERROR` y el detalle queda en los logs. Los logs ocultan `Authorization`, `Cookie` y `Set-Cookie`. La bitácora de auditoría es de solo agregar: un trigger rechaza UPDATE, DELETE y TRUNCATE, y se revocaron esos permisos.                                                                                                                                                                        |
| V8 Protección de datos           | Contraseñas y tokens nunca llegan a la bitácora (`Redacted`). Los nombres de propietarios no van en el repositorio: la semilla no los carga.                                                                                                                                                                                                                                                                                                                                           |
| V9 Comunicaciones                | Solo HTTPS en producción (cookie `Secure`). La API envía las cabeceras de `helmet` y quita `X-Powered-By`.                                                                                                                                                                                                                                                                                                                                                                             |
| V11 Lógica de negocio            | Las carreras entre peticiones las resuelve la base de datos: con restricciones (una semana de basura y una delegación por mes), que responden el mismo 409 que el dominio, y con un bloqueo de fila para que un renglón no quede fuera del cierre de un mes. Hay pruebas que lanzan peticiones simultáneas contra Postgres.                                                                                                                                                            |
| V14 Configuración y dependencias | Las variables de entorno se validan al arrancar (el `JWT_SECRET` debe tener al menos 32 caracteres). `pnpm audit --prod` se revisó en esta fase (ver abajo). No hay CORS, porque SPA y API comparten origen.                                                                                                                                                                                                                                                                           |

## Corregido en esta fase

- **Dependencias con avisos** (`pnpm audit --prod`, 31 al empezar):
  - `shadcn` pasó a `devDependencies`. Es la herramienta que genera componentes, y de ella solo se usa una hoja de estilos al compilar. Traía 24 de los avisos, que nunca llegaban al servidor.
  - Con `overrides` en `pnpm-workspace.yaml` se forzaron las versiones parchadas de `proxy-addr` (crítico: suplantación de IP detrás de un proxy), `qs`, `fast-uri` y `source-map-js`, dentro de los rangos que aceptan sus paquetes padre.
- **Peticiones simultáneas** que antes respondían 500 o dejaban un renglón fuera de la foto del mes (ADR-0021).
- **Contraste** de la etiqueta «Pendiente» (WCAG AA), detectado por axe.

## Riesgos aceptados

- **Quedan 3 avisos en `prisma` (la CLI): `deepmerge-ts` y `mysql2`.**
  - `deepmerge-ts` solo lee el archivo de configuración de Prisma.
  - `mysql2` es el controlador de MySQL, que no usamos (la app usa Postgres con `@prisma/adapter-pg`).
  - Ninguno recibe datos de los usuarios. Se revisan cuando salga una versión de Prisma que los actualice.
- **No se revisa si una contraseña ya se filtró** (ASVS 2.1.7). Requiere un servicio externo (Have I Been Pwned). Con 11 usuarios, contraseñas de 10 caracteres o más y el límite de intentos, se deja para después.
- **Un 401 aparece en la consola del navegador** al abrir la app sin sesión. Es la consulta de la cookie de sesión, que el JavaScript no puede leer (es `httpOnly`); no es un error.

## Resuelto en el despliegue (fase 5, ADR-0026)

- **`trust proxy`:** la API confía en los proxies de `TRUST_PROXY` (en producción, las direcciones privadas del nginx del VPS y del contenedor `web`). El límite de intentos de login cuenta la IP del cliente, y falsificar `X-Forwarded-For` no lo esquiva. Hay pruebas de ambos casos.
- **Cabeceras de la SPA** (`infra/web/security-headers.conf`):
  - `Content-Security-Policy`: `default-src 'self'`, sin scripts en línea ni `eval`.
  - `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` y `X-Robots-Tag`.

  Una prueba de navegador recorrió todas las pantallas detrás del nginx de producción sin violar la CSP. Para lograrlo, Zod corre `jitless` (no prueba `new Function`).

- **Solo lo necesario queda expuesto:** el nginx del VPS (80 y 443) es lo único abierto a internet. La app escucha en `127.0.0.1`, y la API y Postgres no se publican. Los contenedores de la API y de `web` no corren como root.
- **Secretos:** la contraseña de Postgres y el `JWT_SECRET` se generan al azar en el VPS, en un `.env` con permisos `600`. GitHub guarda solo una llave SSH dedicada a un usuario sin `sudo`.
- **Respaldos:** un `pg_dump` cada noche, con permisos solo para su dueño y 14 días de retención. `docs/DESPLIEGUE.md` documenta cómo copiarlos fuera del VPS (a una carpeta cifrada) y cómo probar una restauración.

## Pendiente

- **Auditar las dependencias de forma continua:** `pnpm audit --prod` en CI, o Dependabot.
- **Respaldos cifrados en el propio VPS:** hoy se cifran solo al copiarlos a otra máquina.

## Rendimiento y accesibilidad (Lighthouse 13.5, móvil simulado)

Medido en la pantalla de login, con la API compilada.

| Categoría        | Puntaje | Nota                                                                                        |
| ---------------- | ------- | ------------------------------------------------------------------------------------------- |
| Rendimiento      | 83      | LCP 2.5 s y TBT 470 ms con red y CPU de un móvil lento. El primer paquete pesa 118 kB gzip. |
| Accesibilidad    | 100     | Además, axe revisa todas las pantallas (claro y oscuro) en las pruebas de navegador.        |
| Buenas prácticas | 96      | Solo se descuenta el 401 de la consola.                                                     |
| SEO              | 63      | A propósito: `robots.txt` pide no indexar una app privada.                                  |
