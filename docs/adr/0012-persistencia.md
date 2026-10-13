# ADR-0012: Convenciones de persistencia

**Estado:** Aceptado · **Fecha:** 2026-10-12

## Contexto

La fase 2 traduce el dominio a PostgreSQL con Prisma 7, que es ESM, requiere un adaptador de driver (`@prisma/adapter-pg`), toma la URL de `prisma.config.ts` y genera el cliente en una ruta explícita. Hay que decidir cómo se guardan los valores del dominio, cómo se comparten las transacciones y qué reglas se repiten en la base.

## Decisión

- **Tipos de columna:**
  - El dinero se guarda como `INTEGER` en centavos. El máximo, unos $21 millones, sobra para el edificio.
  - Las fechas son `DATE`.
  - Los meses (`YearMonth`) son un `DATE` con el día 1, garantizado por un `CHECK`.
  - Las conversiones viven en `platform/prisma/db-values.ts` y usan solo los campos UTC de la fecha que entrega Prisma.
- **El cliente generado** vive en `backend/src/platform/prisma/generated/`. No se versiona: se genera en cada `pnpm install`. Los repositorios lo importan desde `platform`; el dominio nunca.
- **Transacciones:**
  - `PrismaDatabase` implementa el puerto `UnitOfWork`.
  - Dentro de `run()` guarda el cliente de la transacción en un `AsyncLocalStorage`, así los repositorios se unen a la transacción en curso sin recibirla como parámetro.
  - Las llamadas anidadas se suman a la transacción exterior.
- **Reglas duplicadas en la base:** la migración repite los invariantes del dominio que se pueden expresar en SQL:
  - `CHECK` de montos positivos, de categoría ↔ depto, de descripción obligatoria y de snapshot consistente.
  - Restricciones de exclusión (`btree_gist`) para que no se traslapen periodos de inactividad ni delegaciones activas.
  - Así ni un error de programación ni un script manual pueden guardar un estado imposible.
- **Bitácora de solo inserción:**
  - Triggers que rechazan `UPDATE`, `DELETE` y `TRUNCATE`, incluso al dueño de la tabla.
  - `REVOKE` de esos permisos a `PUBLIC`. El rol de la aplicación con solo `SELECT, INSERT` se crea al desplegar (fase 5).
- **Lo derivado no se guarda:** la asignación de pagos a cargos (`allocatePayments`) se recalcula al leer, en lugar de mantenerse en una tabla `payment_allocation`. Con 10 deptos el cálculo es instantáneo y no hay copia que se pueda desincronizar.
- **Marcas de tiempo:** `removed_at`, `cancelled_at` y `closed_at` se escriben una sola vez, y volver a guardar conserva la original.
- **Pruebas de integración:** cada adaptador se prueba contra PostgreSQL 18 real (Testcontainers) con las migraciones reales, en `*.int-spec.ts` junto al adaptador.

## Consecuencias

- `prisma migrate dev` no detecta los `CHECK`, las exclusiones ni los triggers, así que no los marca como diferencias. Cualquier regla nueva de ese tipo se agrega a mano en el SQL de la migración.
- Prisma bloquea `migrate reset` cuando lo invoca un agente de IA. Esa acción la confirma una persona.
- `pnpm test:int` necesita Docker.
- La tabla de usuarios llega en la fase 3, junto con la autenticación.
