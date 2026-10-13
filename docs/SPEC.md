# Especificación de Producto — App de Administración

## Edificio Correspondencia 63

**Versión:** 0.4
**Estado:** reglas de negocio confirmadas y stack definido. El plan de trabajo detallado vive en `docs/PLAN.md` y reemplaza a la sección 11.

---

## 1. Resumen / Objetivo

Aplicación web mobile-first para digitalizar y centralizar la administración de las cuotas de mantenimiento del edificio (10 departamentos). Reemplaza el reporte mensual en PDF compartido por WhatsApp, permitiendo:

- Capturar ingresos y egresos mensuales de forma estructurada.
- Generar automáticamente el reporte mensual en PDF (mismo formato/espíritu del que ya se comparte).
- Consultar el histórico completo desde cualquier lugar, todo el año.
- Automatizar el calendario de turnos de administración ("gobiernos").
- Dar transparencia total a los 10 dueños sobre las finanzas del edificio.

## 2. Glosario

| Término                | Significado                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Depto                  | Cada una de las 10 unidades: 101, 102, 201, 202, 301, 302, 401, 402, 501, 502       |
| Dueño                  | Propietario responsable del pago de mantenimiento de su depto                       |
| Cuota de mantenimiento | $700 MXN mensuales por depto                                                        |
| Turno / Gobierno       | Periodo de 2 meses en que un depto es responsable de administrar los fondos comunes |
| Superadmin             | Rol con permisos de escritura permanentes (el usuario que solicita este proyecto)   |
| Adeudo                 | Meses de cuota no pagados, acumulables                                              |
| Adelanto               | Pago de uno o más meses futuros por anticipado                                      |

## 3. Roles y permisos

| Rol        | Lectura                                                                                            | Escritura                                                |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Dueño      | Todos los reportes, histórico completo, estado de cuenta de todos los deptos (transparencia total) | Solo en los meses de su turno (ver ventana de escritura) |
| Superadmin | Todo                                                                                               | Siempre, sin restricción de turno                        |

- **Ventana de escritura y entrega:** un dueño escribe en los meses de su turno (o de una delegación que recibe) desde el día 1 de cada mes y mientras conserve el turno, más un **periodo de gracia de 5 días naturales** al terminar. Ejemplo: si agosto y septiembre son del 501, el 501 puede corregir agosto durante septiembre, y ambos meses hasta el 5 de octubre. A partir del 6 de octubre solo el superadmin puede hacerlo. El depto que recibe el turno (502) no tiene acceso a los meses anteriores.
- La gracia existe porque en esos días se hace la **entrega** al siguiente administrador (llaves, talonario y carpeta de recibos). En ese plazo, el administrador saliente revisa que todo cuadre, **cierra él mismo sus meses** y decide el siguiente turno: se lo entrega al depto que sigue, o ese depto no lo toma y lo cubre el saliente u otro depto que él asigne. En ese caso, el depto que no tomó el turno paga la multa por cada mes. El superadmin puede hacer cualquiera de estas acciones en cualquier momento, y solo él puede reabrir un mes cerrado.
- Todo cambio a un registro (pago, gasto, ajuste manual, traspaso de turno) queda registrado en una **bitácora de auditoría** inmutable: usuario, fecha/hora, tabla/campo afectado, valor anterior, valor nuevo.
- El traspaso de turno/delegación es **manual**: lo registra el administrador saliente durante la entrega, o el superadmin en cualquier momento. Durante el periodo delegado, **tanto el depto original como el depto delegado** tienen permiso de escritura (además del superadmin, que siempre lo tiene). Todo traspaso queda registrado en la bitácora.

## 4. Modelo de negocio / reglas

### 4.1 Cuota de mantenimiento

- $700 MXN mensuales por depto, 10 deptos → $7,000 MXN de ingreso base esperado por mes si todos están al corriente.

### 4.2 Turnos de administración ("gobiernos")

- Cada turno dura 2 meses.
- Orden de rotación: **fijo, descendente según posición física de los deptos**: 501→502→401→402→301→302→201→202→101→102→(repite).
- Un depto puede optar por no tomar su turno, pagando una penalización **por cada mes** que no toma: **$500 (multa fija) + $700 (cuota mensual regular, que se sigue debiendo de todas formas) = $1,200 por mes**, es decir $2,400 si omite los dos meses del turno. En la app la multa se registra como un cargo de $500 por mes y la cuota sigue su curso normal. _Nota: en el reporte de ejemplo aparece $1,000 para el depto 301 — confirmado que fue un error de captura del dueño anterior; el valor correcto de referencia es $1,200._
- Cuando un depto no toma su turno, delega en otro (comúnmente el depto adyacente) mediante acuerdo verbal; en la app esto se resuelve con un traspaso que registra el administrador saliente durante la entrega, o el superadmin. Durante el periodo delegado, tanto el depto que delega como el depto que recibe la delegación tienen permiso de escritura, además del superadmin.

### 4.3 Estados de pago por depto y mes

Cada depto, cada mes, puede estar en una combinación de estos estados (no son excluyentes):

- **Al corriente**: pagó el mes en curso.
- **Adeudo**: debe uno o más meses anteriores (se registra el detalle: qué meses y monto total).
- **Adelanto**: pagó por anticipado uno o más meses futuros.
- **Pago parcial**: sí aplica. Se registra como un abono que reduce el saldo del adeudo sin marcarlo como liquidado — el sistema debe permitir montos que no cubran el adeudo completo. _(Valor por defecto, ajustable si en la práctica se necesita otro comportamiento.)_
- **Depto inactivo**: si un depto llegara a quedarse sin dueño/responsable activo (ej. en disputa, en venta), el superadmin puede marcarlo como **inactivo** temporalmente. Un depto inactivo no genera cobros mientras dure ese estado. **El calendario de turnos no se recorre:** si a un depto inactivo le toca turno, el superadmin asigna qué depto lo cubre mediante una delegación (sin multa, porque no es una omisión). Mientras no la asigne, el periodo queda "sin responsable" y solo el superadmin puede escribir en él. _(Confirmado.)_

### 4.4 Egresos recurrentes

- **BASURA**: $150 por semana calendario, **siempre fijo, sin excepción**.
- **LIMPIEZA**: **tarifa fija por visita** (configurable, ej. $270 MXN/visita observado en el histórico). El usuario en turno marca las fechas en que hubo limpieza; el sistema calcula el total automáticamente **agrupando las visitas por semana**, ya que el pago se realiza semanalmente (igual dinámica que basura, pero con monto variable según el número de visitas de esa semana).
- **OTROS**: gastos variables (cámaras, insumos de limpieza, jardinería, mantenimiento, luz, etc.) — registro libre con fecha, descripción e importe, sin categorías predefinidas rígidas.
- **Regla de imputación (base de caja)**: todo egreso se carga al reporte del **mes en que se pagó**. La basura es un pago único semanal, así que cae en el mes de su fecha de pago. La limpieza se paga por día trabajado, así que cada visita cae en el mes de su fecha. Si una semana cruza dos meses, sus visitas de limpieza se reparten entre ambos reportes según su fecha. La agrupación semanal de limpieza solo sirve para saber cuánto pagarle a la persona esa semana; no define el mes contable.

### 4.4.1 Libro del mes (captura tipo lista)

- La pantalla principal de quien está en turno es una **lista de movimientos del mes**. Cada renglón es un ingreso (pago de depto u **otro ingreso**, como cooperaciones extraordinarias o reembolsos) o un egreso (basura, limpieza u otro).
- El reporte mensual se obtiene directamente de esa lista: saldo inicial + ingresos − egresos.
- Mientras el mes está abierto, los renglones se pueden editar o borrar; la bitácora registra cada cambio. Al cerrar el mes (lo hace el administrador saliente dentro de su ventana, o el superadmin), la lista queda congelada y solo el superadmin puede reabrirla. Un renglón no cambia de mes al editarlo: se borra y se captura en el mes correcto.

### 4.5 Widget visual de calendario ("blueprint" del edificio)

Se muestra en el dashboard principal como referencia rápida de quién administra actualmente.

- **Forma**: rectángulo alto, cuadrícula de **2 columnas × 5 filas**, replicando la distribución física real del edificio (de arriba hacia abajo = de piso más alto a más bajo):

  | Fila       | Columna izquierda | Columna derecha |
  | ---------- | ----------------- | --------------- |
  | 1 (arriba) | 501               | 502             |
  | 2          | 401               | 402             |
  | 3          | 301               | 302             |
  | 4          | 201               | 202             |
  | 5 (abajo)  | 101               | 102             |

- **Resaltado**: el/los depto(s) con turno activo en el mes actual se muestran con un color distintivo; el resto en un tono neutro. Si hay una delegación activa ese mes, se diferencia visualmente (ej. depto original y depto delegado con distinta intensidad de color, o un ícono de "delegado").
- **Cálculo automático**: se define un **punto de anclaje** conocido — _agosto y septiembre de 2026 corresponden al turno del depto 501_ — y a partir de ahí, usando el orden fijo de rotación (sección 4.2, ciclo de 10 deptos × 2 meses = 20 meses) y la duración fija de 2 meses por turno, el sistema calcula el depto en turno para cualquier mes pasado o futuro, sin necesidad de captura manual mes a mes (salvo que exista una delegación registrada, que sobreescribe puntualmente ese periodo).
- **Dato de configuración inicial**: `mes_ancla = 2026-08`, `depto_ancla = 501`.

## 5. Alcance v1 (MVP)

Incluye:

- ✅ Generación automática del reporte mensual (PDF descargable y compartible).
- ✅ Histórico consultable de todos los meses anteriores.
- ✅ Calendario de turnos de administración automatizado, con traspaso/delegación manual auditable.
- ✅ Widget visual tipo "blueprint" del edificio en el dashboard, con el depto en turno resaltado automáticamente (ver sección 4.5).
- ✅ Registro de pagos, adeudos y adelantos por depto.
- ✅ Registro de egresos por categoría (basura, limpieza, otros).
- ✅ Roles: dueño (lectura total) / depto en turno (escritura limitada) / superadmin (escritura total).
- ✅ Bitácora de auditoría de todos los cambios.
- ✅ Autenticación por usuario/contraseña (uno por depto), sesión persistente en móvil.

## 6. Fuera de alcance v1 (futuras versiones)

- ❌ Recordatorios automáticos de pago (WhatsApp/email).
- ❌ Notificaciones push.
- ❌ Reportes/gráficas financieras avanzadas (tendencias, proyecciones).
- ❌ Soporte multi-edificio (por ahora es exclusivo para Edificio Correspondencia 63).
- ❌ Integración con WhatsApp Business API.

## 7. Modelo de datos preliminar (entidades)

- **Depto**: id, número, nombre del dueño, activo/inactivo
- **Usuario**: id, depto_id (nulo si es superadmin), username, password_hash, rol (dueño | superadmin)
- **TurnoCalendario**: id, depto_id, mes_inicio, mes_fin, es_delegado (bool), depto_delegado_id (nulo)
- **ReporteMensual**: id, mes, año, saldo_inicial, saldo_final, total_ingresos, total_egresos, estado (abierto | cerrado)
- **PagoDepto**: id, reporte_id, depto_id, monto_mes_actual, adeudo_monto, adeudo_detalle, adelanto_monto, observaciones
- **Egreso**: id, reporte_id, categoria (basura | limpieza | otros), fecha, descripción, importe
- **Auditoria**: id, usuario_id, tabla, registro_id, campo, valor_anterior, valor_nuevo, timestamp

## 8. Stack técnico

| Capa                     | Tecnología                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Backend                  | NestJS (TypeScript)                                                                           |
| Base de datos            | PostgreSQL                                                                                    |
| Frontend                 | React, mobile-first / responsive                                                              |
| UI Library               | shadcn/ui + Tailwind CSS                                                                      |
| Autenticación            | Usuario/contraseña por depto; JWT de acceso corto + refresh token rotativo en cookie httpOnly |
| Hosting                  | VPS propio del usuario, dominio propio → virtualhost                                          |
| Generación de PDF        | @react-pdf/renderer (en el backend, sin Chromium)                                             |
| ORM                      | Prisma (aislado en adaptadores de salida)                                                     |
| Contratos compartidos    | `packages/shared` con esquemas Zod                                                            |
| Frontend (routing/datos) | TanStack Router + TanStack Query + react-hook-form                                            |
| Pruebas                  | Vitest + Testcontainers (Postgres) + Playwright                                               |
| Despliegue               | Docker Compose + Caddy (HTTPS automático)                                                     |
| Arquitectura             | Hexagonal (puertos y adaptadores), SOLID, DRY                                                 |

### 8.1 Estructura de repositorio

**Monorepo** con dos paquetes (`/backend` y `/frontend`), usando _workspaces_ de npm/pnpm para simplificar el manejo de dependencias y, opcionalmente, compartir tipos/DTOs entre ambos lados sin duplicar código. No se recomienda una herramienta de monorepo más pesada (Nx, Turborepo) dado el tamaño del proyecto — un workspace simple es suficiente.

## 9. Requisitos no funcionales

- Mobile-first: la experiencia principal es desde el celular.
- Datos persistentes todo el año, accesibles remotamente (no depende del navegador local).
- HTTPS obligatorio (ej. Let's Encrypt/certbot en el VPS).
- Contraseñas hasheadas (nunca en texto plano).
- Bitácora de auditoría de solo inserción (no editable ni borrable).

## 10. Notas y supuestos de trabajo

Todas las reglas de negocio quedaron confirmadas (secciones 3 y 4). Los dos últimos puntos se resolvieron con un valor por defecto razonable, ajustable si en la práctica se necesita otra cosa:

1. **Pagos parciales**: se permiten abonos que no liquidan el adeudo completo (sección 4.3).
2. **Depto sin dueño activo**: se maneja marcándolo como inactivo (sección 4.3).

## 11. Plan de trabajo por fases

Objetivo: avanzar de forma incremental, entendiendo cada pieza antes de pasar a la siguiente. Cada fase produce algo que se puede correr y ver funcionando.

| Fase                         | Contenido                                                                                              | Qué se aprende                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **0. Setup**                 | Estructura del monorepo, NestJS inicial, React inicial, conexión a PostgreSQL, variables de entorno    | Estructura de un proyecto Nest/React, workspaces, ORM (TypeORM o Prisma) |
| **1. Modelo de datos**       | Entidades de la sección 7 como migraciones/esquema en PostgreSQL                                       | Diseño de base de datos, migraciones, relaciones                         |
| **2. Autenticación y roles** | Login usuario/contraseña por depto, sesión, guardias de permisos (dueño vs superadmin vs turno activo) | Auth en NestJS (Passport/JWT o sesiones), guards, control de acceso      |
| **3. CRUD básico**           | Endpoints y pantallas para deptos, reportes mensuales, pagos, egresos                                  | API REST con NestJS, formularios y tablas en React con shadcn/ui         |
| **4. Lógica de turnos**      | Cálculo automático del turno activo (ancla + orden fijo), delegaciones, widget blueprint               | Lógica de negocio con fechas, cálculo de ciclos, SVG/HTML dinámico       |
| **5. Reporte PDF**           | Generación del PDF mensual con el mismo espíritu del reporte actual                                    | Generación de PDFs desde el backend (Puppeteer/PDFKit)                   |
| **6. Bitácora de auditoría** | Registro automático de cambios en pagos/egresos/turnos                                                 | Interceptores/middlewares en NestJS, trazabilidad de datos               |
| **7. Deploy**                | Publicar en el VPS: dominio, HTTPS, virtualhost, base de datos en producción                           | Despliegue real, nginx, certbot, variables de entorno en producción      |
| **8. Pulido**                | Ajustes de UI, pruebas con datos reales del histórico (los PDFs que ya compartiste)                    | Migración de datos reales, control de calidad                            |

Cada fase la iremos armando juntos paso a paso: yo te explico el "por qué" de cada pieza antes de escribir el código, y avanzamos solo cuando quede claro.

---

_Este documento es la base para iniciar el desarrollo (spec-driven development). Se irá actualizando conforme se resuelvan los puntos pendientes y evolucione el proyecto._
