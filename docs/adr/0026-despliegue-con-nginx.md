# ADR-0026: Despliegue detrás del nginx del VPS

**Estado:** Aceptado · **Fecha:** 2026-10-20 · Reemplaza a [ADR-0009](0009-despliegue.md)

## Contexto

El ADR-0009 planeaba un VPS dedicado con Caddy como reverse proxy dentro de Docker Compose. La app se publica al final en un VPS Ubuntu del administrador, en `https://depadmin.osspro.site`. Ese VPS hospeda otros experimentos del mismo dominio, cada uno en su virtual host del **nginx del sistema**. Ese nginx ya ocupa los puertos 80 y 443, así que un Caddy en un contenedor chocaría con él.

## Decisión

- **El nginx del VPS solo termina TLS.** Un virtual host por subdominio, con certificados de Let's Encrypt (certbot), reenvía todo a un puerto de `127.0.0.1`. La app no sabe nada del dominio, y el VPS puede tener más apps junto a ella.
- **Cuatro servicios en Docker Compose** (`infra/docker-compose.yml`, en `/opt/depadmin` del VPS):
  - `db`: Postgres 18 con un volumen. No se publica en ningún puerto del host.
  - `migrate`: corre `prisma migrate deploy` con la imagen de la API y termina. La API arranca solo si las migraciones salieron bien.
  - `api`: NestJS. Tampoco se publica.
  - `web`: nginx (`nginx-unprivileged`, sin root) con la SPA compilada, que reenvía `/api` a la API. Es lo único publicado, y solo en `127.0.0.1:${WEB_PORT}`. Así Docker no abre nada a internet, aunque se salte las reglas de `ufw`.
- **Las cabeceras de la SPA viajan con la imagen** (`infra/web/`): la CSP, HSTS, `nosniff`, `Referrer-Policy`, `noindex`, la caché de `/assets` y que cualquier ruta caiga en `index.html`. El virtual host del VPS queda genérico, y lo que pide la app se versiona y se prueba con ella.
  - La CSP no permite `eval` ni scripts en línea.
  - Zod probaba `new Function` al construir cada esquema, así que `@depadmin/shared` lo configura `jitless` antes de definirlos.
  - Las fuentes admiten `data:`, porque Vite incrusta en el CSS las más pequeñas.
- **El nginx de `web` resuelve `api` en cada petición** (con el DNS de Docker). Un despliegue recrea la API con otra dirección, y un nombre resuelto una sola vez al arrancar seguiría apuntando a la vieja.
- **`TRUST_PROXY`** (variable nueva de la API) es la lista de `trust proxy` de Express. Los dos proxies llegan desde direcciones privadas (`loopback, uniquelocal`), así que la IP del cliente es la última pública de `X-Forwarded-For`, y esa es la que cuenta el límite de intentos de login. Si alguien falsifica la cabecera no le sirve: el nginx del VPS agrega la dirección que vio. Vacía (el valor por defecto) no confía en nadie.
- **Las imágenes se construyen en GitHub Actions.**
  - Un solo `Dockerfile` con dos destinos, `api` y `web`.
  - CI las construye en cada PR, sin publicarlas.
  - El workflow `Deploy` corre cuando CI pasa en `main`, o a mano. Las publica en GHCR con el commit como etiqueta, copia el compose y los scripts por SSH y ejecuta `infra/deploy.sh <commit>`. Ese script hace `pull`, migra, reemplaza los contenedores y espera a que estén sanos.
  - El VPS no compila nada ni necesita el repositorio.
- **`prisma` pasa a dependencia de producción**, porque las migraciones corren con la imagen de la API. Agrega unos 180 MB a la imagen; separar una imagen solo para migrar no compensa en un proyecto de este tamaño.
- **Respaldos:** `infra/backup.sh`, con cron cada noche, guarda un `pg_dump` en `/var/backups/depadmin` y conserva 14 días. Para que también queden fuera del VPS, se copian a otra máquina (`docs/DESPLIEGUE.md`).

## Consecuencias

- **Producción y local corren las mismas imágenes.** Antes de esta fase, el stack de producción se levantó en local y pasó todas las pruebas de navegador a través de su nginx. También se ensayaron un segundo despliegue y la restauración de un respaldo, y se comprobó que la bitácora sigue siendo de solo agregar después de restaurar.
- **Revertir una versión** es `./deploy.sh <commit anterior>`, salvo que esa versión haya agregado una migración: Prisma no deshace migraciones. Para eso está el respaldo de la noche anterior.
- **La primera vez hay que cargar los datos:** se restaura un `pg_dump` de la base de desarrollo, con el historial, la carga inicial y los usuarios.
- **El dominio y los secretos no van en el repositorio.** El `.env` del VPS (`infra/env.production.example`) tiene la contraseña de Postgres y el `JWT_SECRET`, y GitHub guarda la llave SSH de despliegue.
- Caddy queda fuera, y con él su renovación automática de certificados. Ahora la renueva el temporizador de certbot del VPS.
