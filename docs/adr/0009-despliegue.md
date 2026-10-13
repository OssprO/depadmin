# ADR-0009: Docker Compose + Caddy en VPS

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

La app se hospeda en un VPS propio con dominio propio, y el HTTPS es obligatorio (spec §8 y §9).

## Decisión

Docker Compose con los servicios `api`, `web` (estáticos), `db` (Postgres) y Caddy como reverse proxy con certificados automáticos. Las imágenes se publican en GHCR y se despliegan por SSH desde GitHub Actions. Backups diarios con `pg_dump`.

## Consecuencias

- El entorno local (`infra/docker-compose.dev.yml`) usa la misma imagen de Postgres que producción.
- El Postgres de desarrollo publica en `127.0.0.1:5433` para no chocar con un Postgres del sistema.
- Se implementa en la fase 5, con el despliegue temprano del esqueleto.
