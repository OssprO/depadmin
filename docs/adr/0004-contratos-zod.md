# ADR-0004: Contratos compartidos con Zod

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Backend y frontend deben coincidir en la forma de cada petición y respuesta. Duplicar tipos y validaciones en ambos lados es una fuente clásica de errores.

## Decisión

`packages/shared` define los esquemas Zod de la API. El backend los usa para validar entradas (pipe) y tipar respuestas. El frontend los usa para validar las respuestas en su cliente HTTP (`getJson`) y para validar formularios con react-hook-form.

## Consecuencias

- Una sola fuente de verdad (DRY); si el contrato cambia, ambos lados fallan en typecheck o en pruebas.
- `shared` contiene solo contratos y constantes. Nunca contiene lógica de negocio, que vive en el dominio del backend.
- Las variables de entorno del backend también se validan con Zod (`platform/config/env.ts`), aunque no viven en `shared` porque solo el backend las usa.
