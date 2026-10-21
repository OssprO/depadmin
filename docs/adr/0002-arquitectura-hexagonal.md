# ADR-0002: Arquitectura hexagonal en el backend

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Las reglas de negocio (turnos calculados, permisos que dependen del mes, libro de cargos y abonos, cierres con recálculo en cascada) son la parte valiosa y delicada del sistema. Deben poder probarse sin base de datos ni HTTP y sobrevivir a cambios de framework o de ORM.

## Decisión

Puertos y adaptadores, organizados por módulo de negocio: `domain/`, `application/`, `infrastructure/`, `http/` y un `<módulo>.module.ts` de composición. `shared-kernel/` contiene los value objects comunes y `platform/` los temas transversales (configuración, logging, salud).

La regla de dependencias se verifica en CI con `eslint-plugin-boundaries` (ver `eslint.config.js`):

- `domain` y `shared-kernel` no importan paquetes externos ni APIs de Node; tiempo, aleatoriedad e IDs llegan por puertos.
- `application` usa solo su propio dominio; otros módulos se consumen a través de sus casos de uso.
- Los adaptadores (`infrastructure`, `http`) solo ven su propio módulo.
- `platform` no depende de ningún módulo de negocio.

## Consecuencias

- El dominio se prueba con pruebas unitarias rápidas y sin mocks de framework.
- Hay más archivos y mapeos explícitos (entidad de dominio ↔ modelo Prisma ↔ DTO). Es un costo deliberado.
- Los casos de uso pueden usar `@Injectable()` de Nest (la capa `application` sí permite paquetes externos, salvo Prisma).
