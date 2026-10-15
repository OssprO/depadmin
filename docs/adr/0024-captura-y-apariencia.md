# ADR-0024: Capturar como en el papel, y una apariencia que sigue al sistema

**Estado:** Aceptado · **Fecha:** 2026-10-15

## Contexto

Al probar la plataforma con el historial, el administrador dejó claro su propósito: debe sustituir por completo lo que hace el administrador en turno, que hoy anota los ingresos y egresos en algún lado y luego los pasa a un documento con las observaciones de cada depto. Pidió:

- Separar los tipos de movimiento en ingresos y egresos. Los ingresos llevan observaciones y los egresos una descripción.
- Que un depto que paga varias veces en el mes salga en un solo renglón del reporte, con los importes sumados y las observaciones unidas.
- Navegar dentro de la app, sin depender del «Atrás» del navegador.
- Un tema claro y otro oscuro según el sistema operativo.
- Algo de color: un borde verde para los ingresos y rojo para los egresos, sin cambiar el color del texto.

## Decisión

- **Las observaciones de un pago van en su descripción.** Se usa el campo `description` de siempre, y el formulario lo llama «Observaciones» en los ingresos y «Descripción» en los egresos. El límite sube a 500 caracteres, el mismo de los textos de una hoja de papel.
- **La columna OBSERVACIONES del reporte** (`observationsCell`) dice, en este orden:
  1. Lo que escribió el administrador en los pagos del depto en el mes, unido con « | » en el orden en que pagó.
  2. Sin eso, en un mes del historial, lo que dice su hoja de papel.
  3. Sin eso, en un mes en vivo, lo que sugiere la cuenta («ADEUDA OCTUBRE», «ADELANTA MAYO»…).

  Así lo eligió el administrador (opción b). Los importes ya salían sumados en un solo renglón por depto.

- **La importación del historial** escribe la observación de cada pago también en el pago, como la capturaría un administrador. La línea de la hoja la conserva tal como está en el papel.
- **«Atrás»** aparece en el encabezado de toda pantalla que no abre la barra inferior. Regresa a la pantalla anterior de la app (`useCanGoBack`); si la página se abrió directo, sube a la que la lista (`parentOf`).
- **El tema sigue al sistema operativo,** sin interruptor:
  - El variante `dark` de Tailwind usa `@media (prefers-color-scheme: dark)` y los colores oscuros viven en esa misma media query.
  - `<meta name="color-scheme" content="light dark">` hace que los controles nativos (fechas, listas, barras de desplazamiento) sigan el tema.
  - Hay un `theme-color` por tema para la barra del teléfono.

  Antes los colores oscuros existían, pero nada los activaba. Las pruebas de navegador ahora comprueban que el fondo cambia.

- **Los colores de ingresos y egresos son bordes:** los tokens `--income` (verde) y `--expense` (rojo), con un tono para cada tema. Van como borde derecho en la lista del libro y en el resumen del mes, y como borde inferior en los tipos del formulario. El texto no cambia de color, así que el contraste del texto sigue igual.

## Consecuencias

- **Un administrador que no escribe observaciones** obtiene las automáticas, igual que antes.
- **Sin interruptor de tema:** quien quiera el otro tema lo cambia en su teléfono.
- **Tableta y escritorio** son la fase 13b.
