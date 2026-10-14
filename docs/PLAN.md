# Plan de trabajo — DepAdmin (Edificio Correspondencia 63)

**Versión:** 2.0 · **Fecha:** 2026-10-14 · **Base:** `docs/SPEC.md` v0.4

Este plan reemplaza a la sección 11 de la spec. Cada fase termina en algo que se puede correr, probar y revisar. Modo de trabajo: Claude explica el porqué de cada decisión, implementa con pruebas y entrega la fase como un PR. Tú revisas y apruebas antes de pasar a la siguiente.

---

## 1. Decisiones técnicas

| Tema                 | Decisión                                                                                                                                              | Motivo                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Arquitectura backend | Hexagonal (puertos y adaptadores) por módulo de negocio                                                                                               | El dominio no depende de Nest, Prisma ni HTTP: se prueba aislado y la infraestructura se puede cambiar |
| Persistencia         | PostgreSQL + Prisma, solo dentro de adaptadores de salida                                                                                             | Migraciones maduras y cliente tipado; los modelos Prisma se mapean a entidades de dominio              |
| Contratos            | `packages/shared` con esquemas Zod                                                                                                                    | Una sola definición valida la API (backend) y los formularios (frontend), sin duplicar (DRY)           |
| Auth                 | JWT de acceso (15 min, en memoria) + refresh token rotativo (cookie httpOnly/Secure/SameSite=Strict, guardado hasheado en BD, con detección de reuso) | Sesión de semanas en el móvil, revocable y protegida contra XSS                                        |
| Hash de contraseñas  | argon2id                                                                                                                                              | Recomendación actual de OWASP                                                                          |
| Frontend             | React 19 + TanStack Router + TanStack Query + react-hook-form + shadcn/ui (Base UI)                                                                   | Rutas tipadas, caché de servidor y formularios validados con los esquemas compartidos                  |
| PDF                  | @react-pdf/renderer en el backend                                                                                                                     | Sin Chromium, ligero para el VPS y escrito con componentes React                                       |
| Pruebas              | Vitest en todo el repo · Testcontainers (Postgres real) · Playwright en viewport móvil                                                                | Un solo runner; las pruebas de integración corren contra el mismo motor que producción                 |
| Despliegue           | Docker Compose (api, web, db) + Caddy con HTTPS automático                                                                                            | Reproducible; el entorno local es igual al de producción                                               |
| CI                   | GitHub Actions: lint, typecheck, pruebas y build en cada PR                                                                                           | El repo ya está en `github.com/OssprO/depadmin`                                                        |
| Idioma               | Código en inglés, UI en español, glosario en la sección 3                                                                                             | Convención estándar, conservando el lenguaje del negocio                                               |
| Dinero               | Enteros en **centavos** (value object `Money`)                                                                                                        | Evita errores de punto flotante                                                                        |
| Runtime              | Node 24 LTS (fijado en `.nvmrc`, `engines` y las imágenes Docker) · pnpm fijado con `packageManager`                                                  | Builds deterministas                                                                                   |

Cada decisión se registra como un ADR breve en `docs/adr/` durante la fase 0.

---

## 2. Arquitectura

### 2.1 Monorepo

```
depadmin/
├── backend/            NestJS (API)
├── frontend/           React + Vite (SPA mobile-first)
├── packages/shared/    Esquemas Zod, tipos de API, constantes de dominio compartidas
├── docs/               SPEC, PLAN, ADRs
├── infra/              docker-compose, Caddyfile, scripts de backup
└── .github/workflows/  CI/CD
```

### 2.2 Backend: hexagonal por módulo

```
backend/src/
├── shared-kernel/          Money, YearMonth, LocalDate, YearMonthRange, UnitNumber, DomainError, puerto Clock
├── modules/
│   ├── identity/           usuarios, login, refresh, políticas de acceso
│   ├── units/              deptos y su historial de estado (activo/inactivo)
│   ├── shifts/             cálculo de turnos, delegaciones
│   ├── cashbook/           libro de caja del mes: todos los movimientos (pagos de depto, otros ingresos, egresos)
│   ├── billing/            cargos (cuota, multa), asignación de pagos a cargos, estado de cuenta
│   ├── reports/            reporte mensual: apertura, cierre, reapertura, PDF
│   ├── settings/           tarifas con vigencia (cuota, limpieza, basura, multa)
│   └── audit/              bitácora de solo inserción
│   Cada módulo:
│     domain/          entidades, value objects, servicios de dominio, puertos de repositorio (interfaces)
│     application/     casos de uso (un caso de uso = una clase con execute), puertos de entrada
│     infrastructure/  adaptadores Prisma, mappers, adaptadores externos (PDF, reloj)
│     http/            controllers, pipes Zod, presenters
└── platform/           config (validada con Zod), PrismaService, UnitOfWork, logger, filtro de errores
```

**Regla de dependencias**, verificada con `eslint-plugin-boundaries` en CI:
`http → application → domain` e `infrastructure → application/domain`. `domain` no importa nada de Nest, Prisma ni de otros módulos (solo `shared-kernel`). Un módulo usa a otro solo a través de sus puertos de entrada (casos de uso o queries), nunca por sus repositorios.

**Cómo se aplica SOLID:**

- **S:** cada caso de uso es una clase con una sola responsabilidad (`RecordPayment`, `CloseMonthlyReport`, etc.).
- **O/L:** las categorías de egreso son estrategias de cálculo intercambiables.
- **I:** puertos pequeños y específicos (`ShiftCalendarReader` separado de `DelegationWriter`).
- **D:** los casos de uso dependen de interfaces; Nest inyecta los adaptadores mediante tokens.

**Transacciones:** un puerto `UnitOfWork`. Cada caso de uso de escritura corre en una transacción que incluye su registro de auditoría, así que o se guardan ambos o ninguno.

**Errores:** el dominio lanza `DomainError` tipados; un filtro global los traduce a HTTP con formato Problem Details (RFC 9457).

### 2.3 Frontend: organizado por funcionalidad

```
frontend/src/
├── app/            router, providers (Query, Auth), layout móvil
├── features/       auth, dashboard, shifts, payments, expenses, reports, audit, admin
│   └── <feature>/  api.ts (hooks de Query) · components/ · routes/ · model/
├── components/ui/  shadcn
└── lib/            cliente HTTP (fetch + refresh automático), utilidades
```

Los componentes de UI no contienen reglas de negocio. Los cálculos de dinero y turnos los hace el backend, que es la fuente de verdad. El frontend solo muestra y valida formularios con los esquemas de `shared`.

---

## 3. Glosario (dominio → código)

| Negocio                        | Código                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Depto                          | `Unit`                                                                        |
| Dueño                          | `Owner` (usuario con rol `OWNER`)                                             |
| Superadmin                     | rol `SUPERADMIN`                                                              |
| Turno / Gobierno               | `Shift`                                                                       |
| Traspaso / Delegación          | `ShiftDelegation`                                                             |
| Cuota de mantenimiento         | `MaintenanceFee` (un tipo de `Charge`)                                        |
| Multa por no tomar turno       | `ShiftSkipPenalty` (un tipo de `Charge`)                                      |
| Movimiento (renglón del libro) | `CashMovement` (dirección `IN`/`OUT` y categoría)                             |
| Pago de depto / Abono          | `CashMovement` de categoría `UNIT_PAYMENT` + `PaymentAllocation`              |
| Otro ingreso                   | `CashMovement` de categoría `OTHER_INCOME`                                    |
| Adeudo                         | `outstandingBalance` (derivado)                                               |
| Adelanto                       | `creditBalance` / cargos futuros ya cubiertos (derivado)                      |
| Estado de cuenta               | `AccountStatement`                                                            |
| Egreso                         | `CashMovement` de categoría `GARBAGE`, `CLEANING` u `OTHER_EXPENSE`           |
| Visita de limpieza             | `CashMovement` de categoría `CLEANING` (una por visita)                       |
| Libro del mes (la lista)       | `MonthlyCashbook` (vista de lectura)                                          |
| Reporte mensual                | `MonthlyReport`                                                               |
| Bitácora                       | `AuditLog`                                                                    |
| Ventana de escritura           | `WriteAccessPolicy.windowFor` (mientras dure el turno, más 5 días de entrega) |
| Entrega del turno              | `ShiftDelegation` registrada por el saliente (`assertCanHandOver`)            |
| Tarifas                        | `RateSettings` (una `RateTimeline` por tarifa)                                |

---

## 4. Ajustes al modelo de datos de la spec (sección 7)

Estos cambios se proponen para cumplir las mismas reglas con un diseño más robusto. Se confirman al inicio de la fase 1 y luego se reflejan en la spec.

1. **Libro de cargos y abonos en lugar de `PagoDepto` con montos de adeudo y adelanto.** Cada mes se genera un `Charge` de $700 por depto activo (más las multas que apliquen). Cada pago de depto se aplica a los cargos más antiguos primero (FIFO) mediante `PaymentAllocation`. Adeudo, adelanto y pago parcial se **derivan** del libro en vez de capturarse a mano: no hay campos que se desincronicen y el estado de cuenta siempre cuadra.
2. **Historial de estado del depto** (`Unit.inactivePeriods`: rangos de meses, con fin abierto mientras siga inactivo). Un booleano no alcanza, porque el cálculo de turnos y cargos de meses pasados necesita saber si el depto estaba activo _en ese momento_.
3. **`ShiftDelegation` como entidad propia** (periodo, depto original, depto delegado, motivo, creada por). El calendario base no se guarda: se calcula a partir del ancla.
4. **Un solo libro de caja (`CashMovement`) en lugar de tablas separadas para pagos y egresos.** Cada renglón tiene fecha, dirección (entrada o salida), categoría (`UNIT_PAYMENT`, `OTHER_INCOME`, `GARBAGE`, `CLEANING`, `OTHER_EXPENSE`), importe, descripción y, si es pago de depto, el depto. La fecha define el mes contable, en base de caja (spec 4.4). Cada visita de limpieza es un renglón propio con la tarifa vigente. El reporte mensual es simplemente el saldo inicial más la suma de los renglones del mes. Esto sustituye a `PagoDepto` y `Egreso` de la spec.
5. **`MonthlyReport` guarda una foto al cierre** (saldo inicial, ingresos, egresos, saldo final). Mientras está abierto, los totales se calculan en vivo. El saldo final de un mes cerrado es el saldo inicial del siguiente. Si se reabre, se recalculan en cascada los meses cerrados posteriores.
6. **`RateSettings`** con vigencias (módulo `settings`): cuota mensual, tarifa de limpieza, monto de basura y multa. El ancla de turnos es configuración de `ShiftRotation`. Así un cambio de tarifa no altera los meses anteriores.
7. **`AuditLog` de solo inserción garantizado en la BD:** un trigger rechaza UPDATE y DELETE, y el usuario de la aplicación no tiene esos permisos sobre la tabla.
8. **Correcciones como en una lista normal:** mientras el mes está abierto, los renglones se editan o borran (borrado lógico) y la bitácora guarda el antes y el después. Al cerrar el mes, sus renglones quedan congelados; solo el superadmin puede reabrirlo. Si se edita un pago de depto, sus asignaciones a cargos se recalculan.

---

## 5. Fases

Para todas las fases, **"terminado"** significa: pruebas en verde (unitarias de dominio con cobertura ≥ 90%, más integración de los adaptadores), lint y typecheck limpios, CI en verde, documentación o ADR actualizados y PR revisado y aprobado por ti.

### Fase 0: Fundaciones

- Workspace pnpm con `packages/shared`, `tsconfig.base.json` estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- ESLint flat config y Prettier unificados para todo el repo, más `eslint-plugin-boundaries` para la regla hexagonal.
- Migrar el backend de Jest a Vitest (con SWC para los decoradores de Nest).
- Husky + lint-staged + commitlint (Conventional Commits).
- Scripts en la raíz: `dev`, `build`, `lint`, `typecheck`, `test`, `test:int`, `test:e2e`.
- `infra/docker-compose.dev.yml` con Postgres 18; `.env.example`; configuración validada con Zod al arrancar.
- Logger estructurado (pino), endpoint `/health`.
- Esqueleto de carpetas hexagonales y `shared-kernel` vacío.
- GitHub Actions: CI en cada PR.
- ADRs 0001–0011 con las decisiones de la sección 1 (`docs/adr/`).

**Conceptos:** workspaces, configuración estricta de TypeScript, límites arquitectónicos verificados automáticamente.

### Fase 1: Dominio núcleo (TypeScript puro, TDD)

Todo sin base de datos ni HTTP, solo lógica y pruebas.

- `shared-kernel`: `Money`, `YearMonth`, `LocalDate`, `YearMonthRange`, `UnitNumber`, `Clock`, `DomainError`.
- `units`: `Unit` con su historial de inactividad.
- `shifts`: servicio `ShiftScheduler`, que calcula el turno de cualquier mes a partir del ancla (2026-08 → 501), el orden fijo, los deptos inactivos y las delegaciones. Se prueba exhaustivamente: meses pasados y futuros, ciclos completos, delegaciones e inactividad.
- `identity`: política `WriteAccessPolicy` (superadmin, depto en turno, depto delegado, ventana de escritura con 5 días de gracia al terminar el turno, cierre y entrega).
- `cashbook`: `CashMovement` y sus categorías, reglas de base de caja, totales del mes, reglas de edición según el estado del mes.
- `billing`: `Charge`, asignación FIFO de pagos, `AccountStatement` (adeudo, adelanto, parcial).
- `settings`: `RateSettings` con vigencias. Reglas de basura y limpieza (montos sugeridos y resumen semanal de limpieza).
- `reports`: ciclo de vida de `MonthlyReport` (abierto, cerrado, reabierto) y cálculo de saldos.

**Conceptos:** entidades frente a value objects, invariantes, servicios de dominio, TDD.

### Fase 2: Persistencia

- `schema.prisma` y la migración inicial según la sección 4, con índices y restricciones (unicidad de cargo por depto, mes y tipo; checks de montos; exclusión de traslapes). Las asignaciones de pagos se derivan al leer y no tienen tabla (ADR-0012).
- Adaptadores de repositorio y mappers Prisma ↔ dominio; `UnitOfWork` sobre `$transaction`.
- Trigger y permisos de solo inserción para `audit_log`.
- Seed: 10 deptos y tarifas iniciales. El superadmin se crea en la fase 3, junto con la tabla de usuarios; el saldo inicial, en la carga inicial (fase 11).
- Pruebas de integración con Testcontainers.

**Conceptos:** mapeo entre persistencia y dominio, migraciones, transacciones, pruebas contra una BD real.

### Fase 3: Identidad, sesión y shell del frontend

- Backend:
  - Login, refresh con rotación y detección de reuso, logout, cambio de contraseña y contraseña temporal generada por el superadmin.
  - Un guard JWT global, seguro por defecto (`@Public()` para excluir una ruta), y el decorador `@CurrentActor()`.
  - Rate limiting en el login (`@nestjs/throttler`) y Helmet. No se usa CORS, porque la API y la web comparten origen.
  - Errores con Problem Details y un pipe de validación Zod. Detalle en el ADR-0013.
- Tabla de usuarios: una cuenta por depto, sin contraseña hasta que el superadmin da acceso, más el superadmin, que se crea en el seed.
- Frontend:
  - TanStack Router (árbol en código) y Query.
  - Un cliente HTTP que refresca ante un 401, con las peticiones agrupadas y un candado entre pestañas.
  - Pantallas: login, layout móvil con barra inferior, cambio de contraseña (obligatorio tras una contraseña temporal), cuenta y _Usuarios_, solo para el superadmin.
- Primer E2E con Playwright (`e2e/`, Pixel 7) contra el sistema construido. Cubre login, recarga con la sesión persistida y logout, más el alta de un dueño con contraseña temporal.

**Conceptos:** ciclo de vida de los tokens, cookies seguras, guards frente a políticas de dominio.

### Fase 4: Bitácora de auditoría

Va antes de las funcionalidades de escritura para que todas la usen desde el primer día.

- Puerto `AuditTrail` en el shared kernel y adaptador Prisma en el módulo `audit`. Los casos de uso registran los cambios a nivel de campo (antes y después) dentro de su transacción.
  - DRY por composición: cada entidad declara una vez cómo se ve en la bitácora (`AuditSubject`) y el caso de uso usa `trackChanges(...)` más `audit.record(...)`. Un decorador no ve el estado anterior, y una clase base complica la inyección en Nest. Detalle en el ADR-0014.
  - Los campos secretos (`Redacted`) solo registran que cambiaron.
- Endpoint `GET /api/audit-log` paginado por cursor y filtrable por tipo, registro y quién actuó. Pantalla _Bitácora_ (solo lectura, para todos los usuarios), con los filtros en la URL.
- Auditar también el cambio y el reseteo de contraseñas de la fase 3 (sin hashes ni contraseñas temporales en la bitácora).

**Conceptos:** trazabilidad, inmutabilidad, por qué se audita en la capa de aplicación y no con un interceptor HTTP.

### Fase 5: Despliegue (pospuesta)

**Pospuesta (2026-10-14):** todavía no hay dominio y la idea es agregar más funcionalidad y los datos históricos antes de publicar. Se hará cuando el producto esté más avanzado, antes o junto con la fase 11. Mientras tanto, las fases continúan en local y en CI.

- Dockerfiles multi-stage (api, web), `infra/docker-compose.yml`, Caddyfile con tu dominio.
- Migraciones automáticas al desplegar; secretos fuera del repo (`JWT_SECRET`, credenciales del superadmin para el seed).
- `trust proxy` en Express para que el límite de intentos de login vea la IP real detrás de Caddy.
- Backups diarios con `pg_dump` y retención, más una prueba de restauración documentada.
- CD con GitHub Actions: imagen al registry (GHCR) y despliegue por SSH al VPS.

**Conceptos:** imágenes reproducibles, reverse proxy, HTTPS, backups probados.

### Fase 6: Turnos, delegaciones y blueprint

- API, con el detalle en el ADR-0015:
  - `GET /api/shifts/calendar` (hasta 36 meses) y `GET /api/shifts/current`. Cada mes indica quién responde y si quien consulta puede delegarlo (`canDelegate`).
  - `POST /api/shifts/delegations`: el superadmin delega cualquier parte de un periodo; el administrador saliente registra la entrega (el siguiente no toma el turno) dentro de su ventana.
  - `POST /api/shifts/delegations/:id/cancel` (solo superadmin).
  - `GET /api/units` y `POST /api/units/:number/status` para marcar un depto inactivo o reactivarlo (solo superadmin).
- Multa por no tomar turno: una delegación por omisión genera un cargo por cada mes delegado, con la tarifa vigente ese mes ($500, más la cuota normal: $1,200 por mes). Si se cancela, se retiran esos cargos. Todo queda en la bitácora.
- `WriteAccessPolicy` pasa al shared kernel, y los módulos se comunican por su capa de aplicación (`ListUnits`, `GetRates`, `LoadShiftCalendar` y los casos de uso de multas).
- Frontend:
  - Blueprint 2×5 en el inicio: depto en turno resaltado, delegación diferenciada (quién delegó y quién cubre), deptos inactivos y periodos sin cubrir.
  - Pantalla _Turnos_ con los periodos, sus delegaciones y las acciones permitidas (hoja inferior para delegar).
  - _Admin_ agrupa _Usuarios_ y la nueva pantalla _Deptos_.

**Conceptos:** aritmética de ciclos sobre fechas, cálculo con excepciones, comunicación entre módulos por casos de uso.

### Fase 7: Libro del mes (captura tipo lista), cuotas y estado de cuenta

Es la pantalla principal de quien está en turno: la lista de movimientos del mes. Con llenarla, el reporte queda hecho.

- **Vista de lista** agrupada por día, con el saldo inicial, el total de ingresos, el total de egresos y el saldo actual siempre visibles arriba. Es el borrador vivo del reporte.
- **Botón "+ Agregar"** que abre una hoja inferior (bottom sheet) en el móvil:
  1. Se elige el tipo: _Pago de depto_, _Otro ingreso_, _Basura_, _Limpieza_ u _Otro egreso_.
  2. Los campos se adaptan al tipo y vienen prellenados: la fecha de hoy, el importe sugerido según `Settings` ($700, $150, la tarifa de limpieza) y, en _Pago de depto_, los deptos con adeudo primero.
  3. Se guarda con un toque y se puede seguir agregando sin salir de la hoja.
- En cada pago de depto, el renglón muestra qué cubrió el pago (por ejemplo "cubre sep y oct" o "abono parcial a ago").
- Tocar un renglón permite editarlo o borrarlo mientras el mes esté abierto, con auditoría.
- Funciona en modo de solo lectura para quien no está en turno (transparencia total).
- Backend, con el detalle en el ADR-0016:
  - Casos de uso `AddMovement`, `ReviseMovement` y `RemoveMovement`: una sola entrada para todas las categorías (DRY), con una estrategia de validación por categoría y las verificaciones comunes en `CashbookAccess`.
  - `GetMonthlyReport` (módulo `reports`) arma la vista del mes. La asignación FIFO de pagos se recalcula en cada lectura, sin guardarse.
  - **Abrir el mes** (`OpenMonth`, adelantado de la fase 9): lo hace quien puede escribirlo, desde su día 1, en orden. Genera las cuotas de forma idempotente.
  - **Inicio de la contabilidad** (`SetReportingStart`, adelantado de la fase 11): el superadmin captura el primer mes y el efectivo en caja.
  - El estado de un depto solo cambia desde un mes sin abrir, porque un mes abierto ya cobró sus cuotas.
- Estado de cuenta por depto y tabla general de adeudos y adelantos (_Más → Estados de cuenta_).
- La barra inferior queda en Inicio, Libro, Turnos, Bitácora y Más.

**Conceptos:** contabilidad de libro (ledger), patrón Strategy por categoría, idempotencia, read models (CQRS ligero), UX de captura móvil.

### Fase 8: Egresos recurrentes asistidos

Todo vive dentro de la misma lista; esta fase solo agrega atajos para lo que se repite. El detalle está en el ADR-0017.

- Basura:
  - Cada semana aparece en el libro un renglón **pendiente** de $150, que se confirma con un toque. Tocarlo abre la hoja para ajustar la fecha real del pago antes de guardar.
  - Los pendientes no cuentan en los totales hasta que se confirman.
  - Cada renglón de basura guarda la semana que paga (su lunes), así que una semana pagada tarde o en otro mes ya no aparece como pendiente.
  - Una semana se paga una sola vez; lo garantizan el dominio y la base.
  - La semana es del mes donde cae su sábado, el día de pago (pregunta 4).
- Limpieza:
  - Un atajo marca varias visitas en un minicalendario del mes y genera un renglón por visita, todas o ninguna.
  - Debajo de la lista, un resumen semanal (lunes a domingo) de cuánto pagarle a la persona, que incluye las visitas del mes vecino cuando la semana cruza de mes.
- Otros egresos: captura libre con fecha, descripción e importe, sin comprobantes (pregunta 5).

**Conceptos:** sugerencias frente a hechos registrados, invariantes que cruzan agregados (una semana por pago), restricciones de exclusión.

### Fase 9: Reporte mensual e histórico

El detalle está en el ADR-0018.

- Cerrar un mes una vez que terminó (desde el día 1 siguiente), en orden. Lo hace el administrador saliente dentro de su ventana o el superadmin. Se congela la lista y se guarda la foto. Antes de confirmar, la pantalla avisa qué semanas de basura quedaron sin registrar.
- Reabrir, solo el superadmin. Al volver a cerrar se reexpresan en cascada los meses cerrados siguientes, y cada cambio queda en la bitácora con sus saldos.
- Histórico (`GET /api/months`): cada mes con sus cuatro cifras, congeladas si está cerrado y en vivo si está abierto; cada uno abre su libro.
- Dashboard (Inicio): pendientes (meses por cerrar y basura por confirmar), caja con los ingresos y egresos del mes, blueprint del turno y deptos con adeudo.
- Un mes cerrado congela sus delegaciones y sus multas (fase 6). El estado de los deptos ya no podía cambiar en meses abiertos (fase 7).
- Job diario (00:05, Ciudad de México) que abre el mes en curso si nadie lo abrió (pregunta 3), registrado en la bitácora como «Sistema».
- La basura se paga el sábado (pregunta 4).

**Conceptos:** máquinas de estado, snapshots frente a cálculo en vivo.

### Fase 10: Reporte PDF

El detalle está en el ADR-0019.

- `GET /api/months/:month/report.pdf` con @react-pdf/renderer, en el backend. Muestra las cuatro cifras, una línea por depto (lo que pagó, qué cubrió, adeudo y adelanto, y qué meses debe) y los egresos por categoría.
- Un mes cerrado sale de su foto, con las cuentas como estaban al terminar el mes, así que siempre sale igual. Un mes abierto sale como borrador.
- En el libro, «Descargar PDF» y «Compartir» (Web Share API: en el celular abre WhatsApp directamente).
- La plantilla sigue el modelo de la spec mientras llega un PDF real (pregunta 6). Ajustarla solo toca `monthly-report-pdf.tsx`.

**Conceptos:** renderizado en el servidor, streams, Web Share API.

### Fase 11a: Carga inicial y reporte con el formato del edificio

El detalle está en el ADR-0020.

- Nombre del propietario por depto, que edita el superadmin y aparece en el reporte.
- Carga inicial por depto (Administración → Carga inicial): adeudos de antes del primer mes, mes por mes (o lo que faltaba de un mes, o la multa), y el adelanto. Se puede editar hasta que cierra el primer mes.
- El PDF copia las hojas «Balance Correspondencia 63»: MES EN CURSO, ADEUDOS/ADELANTOS y OBSERVACIONES generadas, celdas en rojo o verde, egresos por concepto con las semanas de basura no pagadas en blanco, y totales.

### Fase 11b: Pulido y endurecimiento

- Alta de los 10 usuarios (el mecanismo ya existe desde la fase 3: contraseña temporal y cambio obligatorio en el primer login).
- Limpieza periódica de refresh tokens vencidos y división del bundle del frontend por rutas.
- Responder 409 (no 500) cuando la base rechaza dos delegaciones simultáneas sobre los mismos meses, o dos pagos de basura de la misma semana. Bloquear el mes mientras se cierra, para que un renglón agregado al mismo tiempo no quede fuera de la foto.
- PWA (manifest e ícono, instalable en el celular).
- Accesibilidad, estados vacíos y de error, revisión de rendimiento (Lighthouse) y de seguridad (OWASP ASVS nivel 1).
- Pruebas E2E de los flujos críticos completos.

---

## 6. Preguntas abiertas

Cada una tiene un valor por defecto para no bloquear el avance. Se confirman en la fase indicada.

| #   | Pregunta                                                                                                                                                                      | Valor por defecto                                                                                                                                                               | Fase |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Si un depto está **inactivo**, ¿la rotación lo salta y todos los turnos siguientes se recorren, o su periodo lo cubre otro depto sin mover el resto?                          | **Respondida:** no se recorre; el superadmin asigna quién cubre con una delegación. Mientras tanto, solo escribe el superadmin                                                  | 1    |
| 2   | **Ventana de cierre:** el reporte de septiembre suele cerrarse en los primeros días de octubre, cuando el turno ya cambió. ¿Quién puede escribir en un mes que sigue abierto? | **Respondida:** el depto en turno, mientras conserve el turno y 5 días más (la entrega). En ese plazo cierra sus meses y decide el siguiente turno; después, solo el superadmin | 1    |
| 3   | ¿Los cargos de cuota se generan el día 1 de cada mes aunque nadie abra el reporte?                                                                                            | **Aplicado:** se generan al abrir el mes; un job diario lo abre a las 00:05 si nadie lo hizo                                                                                    | 7    |
| 4   | ¿Qué día de la semana se paga la basura?                                                                                                                                      | **Respondida:** el sábado; se sugiere ese día y el usuario ajusta la fecha. La limpieza se paga el miércoles o el viernes                                                       | 8    |
| 5   | ¿Quieres adjuntar fotos de comprobantes en los egresos? Implica almacenar archivos en el VPS y respaldarlos.                                                                  | **Aplicado:** no en la primera versión                                                                                                                                          | 8    |
| 6   | Necesito **uno o dos PDFs reales** del reporte actual para replicar su formato.                                                                                               | **Aplicado:** el PDF sigue las hojas «Balance Correspondencia 63» que compartiste                                                                                               | 10   |
| 7   | Mes de corte, saldo de caja y adeudos o adelantos vigentes por depto para la carga inicial.                                                                                   | **Mecanismo listo:** el superadmin captura el corte en Inicio de la contabilidad y Carga inicial                                                                                | 11a  |
| 8   | Dominio y subdominio, y acceso SSH al VPS (distribución y si ya tiene Docker).                                                                                                | —                                                                                                                                                                               | 5    |
| 9   | ¿Los dueños pueden cambiar su propia contraseña? ¿Hay recuperación por email?                                                                                                 | **Aplicado:** cambio propio sí; sin email: el superadmin genera una contraseña temporal                                                                                         | 3    |
| 10  | ¿Puede haber varios usuarios por depto (por ejemplo, pareja o inquilino con solo lectura)?                                                                                    | **Aplicado:** un usuario por depto, como dice la spec                                                                                                                           | 3    |
