# ADR-0027: Versiones semánticas a partir de los commits

**Estado:** Aceptado · **Fecha:** 2026-10-21

## Contexto

Hasta ahora la versión de producción era el commit desplegado (40 caracteres hexadecimales). Sirve a una máquina, pero el administrador no puede leerla, recordarla ni comparar dos versiones a simple vista. Quiere ver algo como `1.0.3` en la app.

El repositorio ya escribe sus commits con Conventional Commits (commitlint lo exige), y cada cambio que llega a `main` se despliega solo (ADR-0026).

## Decisión

- **Cada despliegue es una versión** `MAYOR.MENOR.PARCHE`. Se calcula con los commits que llegaron a `main` desde la versión anterior:
  - un cambio incompatible (`feat!:`, `fix!:` o un pie `BREAKING CHANGE:`) sube la **mayor**;
  - una funcionalidad (`feat:`) sube la **menor**;
  - cualquier otro commit sube el **parche**. Como cada despliegue es una versión, también la sube un despliegue con solo correcciones, documentación o CI.
- **La primera es la `1.0.0`**, cuando todavía no hay ninguna etiquetada.
- **La etiqueta de Git es la fuente de verdad.** No se escribe la versión en ningún `package.json` ni se hace un commit de vuelta a `main`, así `develop` y `main` no se separan.
- **El cálculo** es una función pura con pruebas, en `packages/release` (`@depadmin/release`). El workflow la corre con Node directamente (sin compilar ni instalar nada).
- **El workflow Deploy**, sobre el commit que pasó CI:
  1. Calcula la versión. Un commit que ya tiene una (al repetir un despliegue) la conserva.
  2. Construye las imágenes con `APP_VERSION` igual a esa versión y las publica con tres etiquetas: la versión, el commit y `latest`.
  3. Despliega en el VPS con `deploy.sh <versión>`.
  4. Si el despliegue salió bien, crea la etiqueta `v1.2.3` y una entrada en **GitHub Releases**, con las notas que GitHub genera de los PR incluidos.
- **La app muestra la versión** en «Estado del sistema», al pie del menú lateral (en el teléfono, al pie de «Más»). La lee de `/api/health`, es decir, de la API que está corriendo.

## Consecuencias

- La versión de producción se lee en la app, en `/api/health`, en el `.env` del VPS (`DEPADMIN_TAG`) y en GitHub Releases, y es la misma en los cuatro lugares.
- **Volver atrás** es `./deploy.sh 1.0.2` en el VPS, con las mismas salvedades de las migraciones que en el ADR-0026.
- Una etiqueta solo existe si su versión llegó a producción. Si un despliegue falla, el siguiente intento recalcula la misma versión.
- Para que el número sea útil, los commits deben usar bien su tipo: `feat` para lo que el usuario nota como nuevo y `fix` para las correcciones.
- No hay versiones previas (`-rc.1`) ni un `CHANGELOG.md`: GitHub Releases cumple esa función.
