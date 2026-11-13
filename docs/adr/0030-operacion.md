# ADR-0030: Operación: respaldos cifrados fuera del VPS, avisos de fallas y errores del navegador

**Estado:** Aceptado · **Fecha:** 2026-11-13

## Contexto

La auditoría de la Etapa 3 (`docs/PLAN-ETAPA-3.md`, hallazgos H4, H5 y H7) encontró tres riesgos en la operación:

- **Si se pierde el VPS, se pierden los datos** desde la última copia que el superadmin bajó a mano. Además, en el VPS los respaldos no estaban cifrados.
- **Nadie se entera cuando algo falla.** Si el job no abre diciembre el día 1, o el respaldo deja de correr, solo queda en un log que nadie lee. Los errores del navegador solo los ve la consola del celular de cada vecino.
- **Todo depende de una sola persona,** y nada escrito dice qué hacer cuando algo pasa.

Es un proyecto personal sin presupuesto: cada servicio externo tiene que ser gratuito para este volumen.

## Decisión

- **Respaldos con `restic`:**
  - `restic` cifra cada copia antes de guardarla y solo guarda lo que cambió. Corre en un contenedor con versión fija (servicio `restic` de `infra/docker-compose.yml`, perfil `tools`). Así el VPS no instala nada, el usuario `deploy` lo usa sin `sudo` y Dependabot lo mantiene al día.
  - **Dos repositorios con la misma contraseña:** uno en el VPS (`/var/backups/depadmin/restic`) y su copia en **Backblaze B2** (`restic copy`). El de B2 se crea con los parámetros de fragmentación del otro, para que la copia no repita datos.
  - **`backup.sh`** saca la copia en el formato de `pg_dump` que ya se restauraba (`--format=custom`). Primero la escribe completa en un archivo, porque un `pg_dump` que falla a la mitad, conectado directo a `restic`, dejaría una copia incompleta. Ese archivo en claro existe solo mientras `restic` lo lee.
  - **Cada noche** guarda la copia, la manda a B2, conserva 14 copias diarias, 8 semanales y 12 mensuales en los dos repositorios, y revisa el de B2. **Antes de cada despliegue** (`./backup.sh local`) guarda solo en el VPS, para que un despliegue nunca espere a la nube.
  - **B2 y no Google Drive.** La llave de B2 es fija y no vence, y `restic` la usa directamente por su API compatible con S3, que es la que recomienda. Drive necesita `rclone` y una autorización con navegador que puede vencer a los 7 días.
  - **`restore-test.sh`** restaura la última copia **de B2** en una base aparte, cuenta sus filas y la borra. Prueba lo que importa: que lo que salió del VPS sirve.
  - **Sin `RESTIC_PASSWORD`,** `backup.sh` saca un respaldo sin cifrar como antes y avisa que falta configurarlo. Así un despliegue no falla antes de que `restic` esté configurado.
- **Avisos con healthchecks.io** (plan gratis):
  - **Un _dead man's switch_:** cada respaldo y cada job avisa cómo terminó. Si un aviso no llega a tiempo o llega como falla, healthchecks.io manda un correo. Así se nota un job que dejó de correr, no solo uno que falla.
  - **Una sola variable, `HEALTHCHECKS_PING_URL`,** con la llave del proyecto. Cada aviso usa el nombre del job (`open-current-month`, `purge-expired-sessions`, `backup`, `restore-test`), y `?create=1` crea la revisión con el primero.
  - **En la API, `JobRunner`** (`platform/jobs/`, global) reemplaza a `runJob`. Además de lo que hacía, avisa a healthchecks.io al terminar, o a `/fail` con el error. Un aviso que no llega se escribe en el log y nunca hace fallar el job. Sin la variable no avisa nada, como en desarrollo y en las pruebas.
  - **La prueba de restauración también avisa,** con un periodo de 90 días: si nadie la corre, healthchecks.io lo recuerda.
- **Monitoreo externo con UptimeRobot** (plan gratis): revisa `/api/health/ready` (ADR-0029) cada 5 minutos y avisa si la app deja de responder.
- **Errores del navegador:**
  - **`POST /api/client-errors`** es público, para que lleguen también los del login. Valida el reporte con un esquema compartido (`clientErrorSchema`): tipo, mensaje, stack, todo con tamaño máximo, y la ruta sin la parte después del `?`. No guarda el usuario. Solo escribe una línea `BrowserError` en el log, con el navegador que la mandó.
  - **Límite de 30 reportes por minuto por IP.** Es amplio porque los vecinos comparten la IP del Wi-Fi del edificio. Los límites de peticiones viven ahora en `ThrottlingModule` (`platform/http/`): el del login sigue igual, y este lo cambia con `@Throttle`.
  - **`ErrorReporter`** (`frontend/src/lib/error-reporter.ts`) escucha los errores que nadie atrapó y las promesas rechazadas, y `RouteError` reporta una pantalla que no cargó.
    - No reporta un `ApiError`, porque la API ya tiene ese error en su log.
    - No repite un mensaje, y manda como máximo 5 reportes por página.
    - Usa `keepalive`, para que el reporte llegue aunque el vecino recargue la página.
    - Nunca reporta sus propias fallas.
- **Continuidad:** `docs/OPERACION.md` dice qué hacer con cada aviso, cuando la app no abre y para restaurar, dónde vive cada secreto y qué necesitaría un suplente. **Por ahora el suplente queda documentado y sin acceso**, hasta que se elija a alguien.

## Consecuencias

- **La contraseña de `restic` es la llave de todo.** Vive en el `.env` del VPS y en el gestor de contraseñas del superadmin. Si se pierden las dos, los respaldos de B2 no se pueden abrir.
- **Configurar los respaldos son pasos manuales y de una sola vez** (`docs/DESPLIEGUE.md` §9): las cuentas de B2, healthchecks.io y UptimeRobot, los secretos en el `.env` y `./backup.sh init`. Hasta entonces los respaldos siguen sin cifrar, y cada noche healthchecks.io avisa que falta el paso.
- **B2 guarda las versiones viejas** de lo que `restic` borra, salvo que el bucket tenga la regla _Keep only the last version_. Sin ella, el espacio crece hasta los 10 GB gratis.
- **`restic` conserva la copia más vieja** mientras haya menos copias que las que pide la política (14, 8 y 12). Es normal ver dos copias del mismo día al principio.
- **Los servicios externos son reemplazables.** healthchecks.io recibe un `POST` a una URL, y otro servicio con _pings_ por URL entra cambiando la variable. B2 es un repositorio de `restic` más: otro destino se agrega con `restic copy`.
- **Las pruebas no llaman a internet.** El `JobRunner` se prueba con `fetch` simulado. `backup.sh` y `restore-test.sh` se probaron con `restic` y Postgres reales, con un directorio local en lugar de B2 y un servidor que hacía de healthchecks.io: respaldo, copia, retención, restauración (1,401 movimientos), y fallas con la base apagada y con B2 inalcanzable.
- **El log de la API recibe lo que manden los navegadores.** El límite y los tamaños máximos lo acotan, y `docker compose` ya limita los logs a 30 MB por servicio.
