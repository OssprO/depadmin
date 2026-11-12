# ADR-0028: Guía de usuario dentro de la app, con capturas generadas

**Estado:** Aceptado · **Fecha:** 2026-11-12

## Contexto

El 1 de diciembre de 2026 el turno pasa de 502 a 401. Los dueños, varios de más de 60 años, necesitan una guía clara: entrar, ver los balances y su estado de cuenta, y qué hacer en su turno. Se comparte por WhatsApp y también debe estar en la app.

Una guía con capturas a mano se queda vieja en cuanto cambia una pantalla. El plan de la etapa 2 la dejaba al final por eso. Lo que de verdad se desactualiza son los nombres de los botones que cita el texto, más que las imágenes.

## Decisión

- **Un solo contenido.** La guía es un archivo de datos (`frontend/src/features/help/guide.ts`): tareas, pasos numerados, una captura opcional por paso con su texto alternativo, y consejos. De él salen las pantallas de _Ayuda_ y el PDF.
- **Es pública.** `/help` vive fuera del marco con sesión (con su propio marco y «Atrás»), sin llamar a la API ni mostrar datos del edificio. Se llega desde el login («Lee la guía paso a paso»), desde «Más» y desde el menú lateral. Así la lee también quien no logra entrar.
- **Las capturas las toma Playwright** (`pnpm guide`, en `e2e/guide/`), sobre el mismo stack desechable de las pruebas de navegador: un celular (Pixel 7, escala 2), tema claro, el mes pasado con movimientos de ejemplo y el depto 401. Los pasos que escriben (pago, basura, limpieza, cierre) los hace el superadmin, que puede escribir el mes pasado sea cual sea el día, y sus capturas se recortan a la tarjeta o al formulario, que los dueños ven igual. Lo que flota sobre la página (la barra inferior y «Agregar») se oculta en los recortes.
- **El guion recorre la guía con sus palabras.** Toca los botones por el nombre que cita el texto (entre «»), así un botón renombrado rompe `pnpm guide` en vez de dejar la guía equivocada.
- **El PDF** sale de `/help/print`, todas las tareas en una página, una por hoja carta, impreso por Chromium. Se guarda en `frontend/public/guia-depadmin.pdf` y se descarga desde _Ayuda_.
- **Las capturas y el PDF se versionan** en `frontend/public/` (unos 700 KB en total). `pnpm guide` no corre en CI, porque las capturas cambiarían cada mes. Un test de Vitest revisa que cada captura citada exista y que no sobre ninguna.
- **Recuperar la contraseña** sigue igual: el superadmin genera una temporal. La guía lo dice así hasta que exista un medio confiable (fase 17).

## Consecuencias

- Cuando cambia una pantalla que la guía muestra, se corre `pnpm build` y luego `pnpm guide`, se revisan las imágenes nuevas y se suben con el cambio. Cada vez se vuelven a subir los binarios, así que conviene hacerlo solo cuando una pantalla cambia de verdad.
- Las capturas muestran el mes en que se tomaron y datos de ejemplo, no los del edificio.
- La instalación en el celular no tiene capturas, porque es el menú del navegador: son pasos escritos para Android (Chrome) y iPhone (Safari).
- `screens-accessibility.spec` revisa _Ayuda_ sin sesión, y una tarea con capturas en los tres tamaños y en los dos temas.
