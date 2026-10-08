# ADR-0001: Monorepo con pnpm workspaces

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Backend y frontend evolucionan juntos y comparten contratos. Es un proyecto personal de tamaño pequeño, mantenido por una sola persona.

## Decisión

Un solo repositorio con pnpm workspaces: `backend/`, `frontend/` y `packages/shared/`. Scripts orquestados desde la raíz con `pnpm --recursive`. Sin Nx ni Turborepo. Versiones fijadas con `packageManager` (pnpm) y `.nvmrc` (Node 24 LTS).

## Consecuencias

- Un cambio de contrato y sus dos consumidores van en el mismo commit y el mismo PR.
- `@depadmin/shared` se compila a `dist/` en el `postinstall` de la raíz; en desarrollo, `pnpm dev` lo recompila en modo watch.
- pnpm 11 bloquea los scripts de instalación de dependencias salvo que se declaren en `allowBuilds` (`pnpm-workspace.yaml`), lo que protege contra ataques a la cadena de suministro.
- Si el proyecto creciera mucho, se podría añadir caché de tareas; hoy no compensa la complejidad.
