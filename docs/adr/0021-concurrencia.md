# ADR-0021: Peticiones simultáneas: la base de datos tiene la última palabra

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

Cada caso de uso revisa sus reglas en el dominio antes de escribir: una semana de basura no se paga dos veces, una delegación no se encima con otra, y en un mes cerrado no se escribe. Si dos peticiones llegan a la vez, las dos pasan esa revisión, porque ninguna ve todavía lo que la otra va a guardar. Había tres casos pendientes desde las fases 6, 8 y 9:

- Dos confirmaciones de la misma semana de basura: la restricción de la base rechazaba la segunda, pero respondía 500.
- Lo mismo con dos delegaciones sobre los mismos meses.
- Un renglón guardado mientras otro cerraba ese mes podía quedar fuera de la foto del cierre. El cierre ya había sumado los totales; el renglón entraba después en un mes que quedaba cerrado.

## Decisión

- **Las restricciones de la base traducen su error al del dominio.** Los repositorios envuelven la escritura con `translateViolations` (`platform/prisma/db-errors.ts`), que reconoce la restricción violada por su nombre y lanza el mismo `ConflictError` que habría lanzado el dominio:
  - `cash_movement_one_garbage_per_week` → `GARBAGE_WEEK_PAID`.
  - `shift_delegation_no_overlap` → `DELEGATIONS_OVERLAP`.

  Quien pierde la carrera recibe el mismo 409 que si hubiera llegado después. La regla queda escrita una vez en el dominio, y la base solo cubre el caso simultáneo.

- **El mes se bloquea con un candado de fila sobre `monthly_report`, no a nivel de aplicación:**
  - Quien escribe renglones (y quien delega meses) toma el candado compartido (`FOR SHARE`) mediante el puerto `MonthLedger.holdOpen`, dentro de su transacción y antes de revisar que el mes esté abierto.
  - `CloseMonth` toma el exclusivo (`FOR UPDATE`) antes de leer los totales.
  - Las escrituras en curso terminan antes del cierre, y las que llegan durante el cierre esperan y luego encuentran el mes cerrado.
  - Varias escrituras a la vez no se estorban entre sí, porque el candado compartido lo pueden tener muchas.
- **Pruebas de integración con carreras reales** (`test/concurrency.int-spec.ts`): tres confirmaciones simultáneas dan 201, 409 y 409. La prueba del cierre falla si se quita el candado: la foto de septiembre queda en $5,000 en lugar de $5,700.

## Consecuencias

- Un error de restricción que no esté en la lista sigue siendo un 500. Es lo correcto: indica un error de programación, no una carrera.
- El candado dura lo que la transacción, que en estos casos de uso son milisegundos.
- Los fakes en memoria no bloquean nada, porque las pruebas unitarias no corren transacciones simultáneas. El comportamiento se prueba contra Postgres.
