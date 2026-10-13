# ADR-0003: Prisma como capa de persistencia

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

PostgreSQL es la base de datos (spec §8). Se necesitan migraciones versionadas y acceso tipado. Las alternativas evaluadas fueron Prisma, Drizzle, TypeORM y Kysely.

## Decisión

Prisma, usado **solo** dentro de los adaptadores `infrastructure/` de cada módulo. Los repositorios devuelven entidades de dominio, nunca modelos Prisma.

## Consecuencias

- Migraciones declarativas y un cliente tipado sin escribir SQL repetitivo.
- TypeORM se descartó porque sus entidades con decoradores invitan a mezclar persistencia y dominio.
- Lo que Prisma no expresa (el trigger de solo inserción de la bitácora, checks específicos) va como SQL dentro de las migraciones.
- La regla de ESLint impide importar `@prisma/*` fuera de `infrastructure/`.
