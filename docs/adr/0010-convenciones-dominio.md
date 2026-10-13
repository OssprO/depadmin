# ADR-0010: Dinero en centavos, código en inglés, base de caja

**Estado:** Aceptado · **Fecha:** 2026-10-07

## Contexto

Se maneja dinero, y el negocio se expresa en español mientras que el ecosistema técnico está en inglés.

## Decisión

- **Dinero:** enteros en centavos dentro del value object `Money`. Nunca `number` con decimales.
- **Idioma:** identificadores, tablas y commits en inglés; UI y documentación en español. Los términos se traducen con el glosario de `docs/PLAN.md` §3.
- **Contabilidad:** base de caja; cada movimiento cuenta en el mes de su fecha (spec §4.4).
- **Tarifas con vigencia:** un cambio de cuota o de tarifa nunca reescribe los meses anteriores.

## Consecuencias

- Cero errores de redondeo de punto flotante.
- El formateo a pesos (`$1,200.00`) ocurre solo en la capa de presentación.
