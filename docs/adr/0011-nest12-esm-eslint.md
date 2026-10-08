# ADR-0011: NestJS 12 en ESM, ESLint como único linter

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

El backend se generó con Nest 11 (CommonJS + Jest). Nest 12 salió en agosto de 2026: es ESM por defecto, trae Vitest y su plantilla usa oxlint.

## Decisión

- Migrar a **Nest 12 en ESM** (`"type": "module"`) desde el inicio, antes de escribir código de negocio, para no tener que migrar después.
- Usar **ESLint** (flat config en la raíz) para todo el repo en lugar de oxlint, porque `eslint-plugin-boundaries` es la herramienta madura para verificar la regla hexagonal y así un solo linter cubre backend y frontend.
- **TypeScript 6.0** en todo el repo. TypeScript 7 ya existe, pero `typescript-eslint` todavía no lo soporta.

## Consecuencias

- Los imports relativos del backend llevan extensión `.js` (requisito de ESM en Node).
- No se usa `verbatimModuleSyntax` ni `consistent-type-imports` en el backend: convertir un import usado en un constructor a `import type` rompería la inyección de dependencias de Nest, que depende de `emitDecoratorMetadata`.
- Revisar la migración a TypeScript 7 cuando `typescript-eslint` lo soporte.
