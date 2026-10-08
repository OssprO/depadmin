# ADR-0008: Vitest + Testcontainers + Playwright

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Hay mucha lógica de fechas y de dinero donde un error es caro, y una UI móvil que debe funcionar de verdad.

## Decisión

- **Vitest** en los tres paquetes. Convención de nombres: `*.spec.ts(x)` para pruebas unitarias junto al código, `test/*.e2e-spec.ts` para pruebas e2e de la API y, desde la fase 2, `*.int-spec.ts` para integración.
- **Testcontainers** con Postgres real para los adaptadores (fase 2).
- **Playwright** en viewport móvil para los flujos completos (fase 3).
- Meta: ≥ 90 % de cobertura en `domain/` y `application/`.

## Consecuencias

- Un solo runner y una sola API de pruebas en todo el repo. Nest 12 ya trae Vitest por defecto.
- Las pruebas de integración requieren Docker, tanto en local como en CI.
