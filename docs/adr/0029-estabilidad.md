# ADR-0029: Estabilidad: sesiones que aguantan una red mala, salud real y despliegue con vuelta atrás

**Estado:** Aceptado · **Fecha:** 2026-11-12

## Contexto

En noviembre de 2026 el VPS estuvo limitado de CPU por otra app. La app se sintió inestable: a veces el refresh fallaba y la sesión se cerraba sola, y un despliegue se quedó colgado 15 minutos descargando imágenes. Al quitar el límite todo volvió a funcionar, pero la auditoría de la Etapa 3 (`docs/PLAN-ETAPA-3.md`, hallazgos H2, H3 y H6) encontró por qué una lentitud se volvía un error:

- **El refresh token rota en cada uso, y presentar uno ya rotado se toma como robo:** se revoca la sesión (ADR-0013). Si la respuesta del refresh se pierde (el proxy se cansa de esperar, el celular pierde la señal), el token ya rotó en el servidor y la cookie no cambió: el siguiente intento presenta el token viejo y la API cierra la sesión. Con el servidor lento, el reintento incluso llega mientras la primera petición sigue rotando, pierde la carrera y también se toma como robo.
- **`/api/health` no consulta la base:** responde aunque la app no pueda servir nada.
- **`deploy.sh` escribía la versión nueva antes de descargarla,** descargaba también Postgres, no tenía tiempo límite y, si la versión nueva no arrancaba, dejaba la app caída.
- **Los avisos de las dependencias en producción pasaron de 3 a 19,** y nada en CI lo revisaba.

## Decisión

- **Un margen al rotar el refresh token** (`REFRESH_REUSE_GRACE_SECONDS`, 30 segundos):
  - Cada token guarda cuál lo reemplazó (`replaced_by_id`).
  - Presentar un token rotado hace menos de 30 segundos, cuyo sucesor nadie ha usado, cuenta como usar el sucesor: el sucesor se rota en su lugar y se emite uno nuevo de la misma sesión.
  - La cadena sigue teniendo un solo token activo. El sucesor que nunca llegó queda gastado, y presentarlo después es un robo como cualquier otro.
  - Fuera del margen, o si el sucesor ya se usó, todo sigue igual: se revoca la sesión.
  - **Si un reintento pierde la carrera** contra la petición que repite, vuelve a leer el token una vez. Si para entonces ya rotó dentro del margen, se perdona igual.
- **El cliente reintenta el refresh una vez,** un segundo después, si no hubo respuesta: un error de red o un 502, 503 o 504 de los proxies. Un 401 sigue cerrando la sesión. Las pestañas siguen turnándose con Web Locks.
- **Dos endpoints de salud:**
  - `/api/health`: el proceso vive. Lo usa el _healthcheck_ de Docker, porque reiniciar la API no arregla una base caída.
  - `/api/health/ready`: además, la base responde `SELECT 1` en menos de 3 segundos; si no, 503. Es el que vigila el monitoreo externo (fase 20).
- **`deploy.sh`:**
  - Descarga solo las imágenes de la app, con 10 minutos como máximo. Postgres se actualiza a propósito, no en cada despliegue.
  - La versión nueva va primero en el entorno del comando. El `.env` cambia solo cuando la descarga funcionó.
  - Antes de aplicar las migraciones, saca un respaldo de la base.
  - Si la versión nueva no queda sana en 5 minutos, imprime los logs, regresa a la versión anterior y falla. El workflow queda en rojo.
- **Las dependencias se revisan siempre:**
  - Un job `audit` en CI corre `pnpm audit --prod --audit-level high`.
  - Dependabot abre el día 1 de cada mes, contra `develop`, PRs agrupados de npm, GitHub Actions y las imágenes de Docker. Nunca propone un cambio mayor de Node ni de Postgres.

## Consecuencias

- Durante 30 segundos tras una rotación, quien tenga una copia del token anterior puede usarlo una vez, si el usuario aún no usó el nuevo. Si lo hace, el usuario legítimo presenta después un token gastado y la sesión se revoca para los dos. El margen solo aplaza la detección de un robo, nunca la evita.
- Un usuario con mala señal ya no pierde la sesión por un refresh sin respuesta, siempre que su celular reintente dentro del margen (el cliente lo hace al segundo).
- **Volver atrás regresa las imágenes, no la base.** Una migración tiene que ser compatible con la versión anterior (agregar columnas o tablas, no quitar ni renombrar en el mismo despliegue). Las migraciones de la versión anterior no estorban: `prisma migrate deploy` ve la base adelantada y no hace nada (se probó con la migración de esta fase). Si una versión se regresa después de una migración que no es compatible, se restaura el respaldo que `deploy.sh` sacó justo antes.
- Un aviso alto nuevo en una dependencia de producción pone CI en rojo, aunque el código no haya cambiado. Se corrige con una actualización o un `override`. Si no hay arreglo y el riesgo no aplica, se acepta en `auditConfig.ignoreGhsas` de `pnpm-workspace.yaml` y en `docs/SEGURIDAD.md`.
- Dependabot necesita que el repositorio tenga activadas las alertas y las actualizaciones de seguridad (_Settings → Code security_). Los PR de seguridad no siguen `target-branch`: van a la rama por defecto del repositorio, que es `develop`, y llegan a producción con el siguiente `develop → main`, como cualquier cambio.
