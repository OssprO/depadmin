# ADR-0006: React + TanStack Router/Query + shadcn (Base UI)

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Una SPA mobile-first servida como archivos estáticos, con muchas pantallas que leen y escriben datos del servidor.

## Decisión

React 19 + Vite, TanStack Router (rutas tipadas), TanStack Query (caché del servidor), react-hook-form + esquemas de `shared`, shadcn/ui en el estilo `base-lyra` sobre Base UI, Tailwind v4 e íconos Phosphor. El código se organiza por funcionalidad en `src/features/<feature>/`.

## Consecuencias

- Los componentes no contienen reglas de negocio: muestran lo que calcula el backend.
- TanStack Query ya se usa desde la fase 0 (`features/system-status`); el router llega en la fase 3.
- shadcn lee los alias de `frontend/tsconfig.json`, por eso `@/*` está declarado ahí y también en `tsconfig.app.json`. Sin eso, el CLI crea una carpeta literal `frontend/@/`.
