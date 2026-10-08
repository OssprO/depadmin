# Plan de trabajo — DepAdmin (Edificio Correspondencia 63)

**Versión:** 1.1 · **Fecha:** 2026-10-07 · **Base:** `docs/SPEC.md` v0.3

Este plan reemplaza a la sección 11 de la spec. Cada fase termina en algo que se puede correr, probar y revisar. Modo de trabajo: Claude explica el porqué de cada decisión, implementa con pruebas y entrega la fase como un PR. Tú revisas y apruebas antes de pasar a la siguiente.

---

## 1. Decisiones técnicas

| Tema | Decisión | Motivo |
|---|---|---|
| Arquitectura backend | Hexagonal (puertos y adaptadores) por módulo de negocio | El dominio no depende de Nest, Prisma ni HTTP: se prueba aislado y la infraestructura se puede cambiar |
| Persistencia | PostgreSQL + Prisma, solo dentro de adaptadores de salida | Migraciones maduras y cliente tipado; los modelos Prisma se mapean a entidades de dominio |
| Contratos | `packages/shared` con esquemas Zod | Una sola definición valida la API (backend) y los formularios (frontend), sin duplicar (DRY) |
| Auth | JWT de acceso (15 min, en memoria) + refresh token rotativo (cookie httpOnly/Secure/SameSite=Strict, guardado hasheado en BD, con detección de reuso) | Sesión de semanas en el móvil, revocable y protegida contra XSS |
| Hash de contraseñas | argon2id | Recomendación actual de OWASP |
| Frontend | React 19 + TanStack Router + TanStack Query + react-hook-form + shadcn/ui (Base UI) | Rutas tipadas, caché de servidor y formularios validados con los esquemas compartidos |
| PDF | @react-pdf/renderer en el backend | Sin Chromium, ligero para el VPS y escrito con componentes React |
| Pruebas | Vitest en todo el repo · Testcontainers (Postgres real) · Playwright en viewport móvil | Un solo runner; las pruebas de integración corren contra el mismo motor que producción |
| Despliegue | Docker Compose (api, web, db) + Caddy con HTTPS automático | Reproducible; el entorno local es igual al de producción |
| CI | GitHub Actions: lint, typecheck, pruebas y build en cada PR | El repo ya está en `github.com/OssprO/depadmin` |
| Idioma | Código en inglés, UI en español, glosario en la sección 3 | Convención estándar, conservando el lenguaje del negocio |
| Dinero | Enteros en **centavos** (value object `Money`) | Evita errores de punto flotante |
| Runtime | Node 24 LTS (fijado en `.nvmrc`, `engines` y las imágenes Docker) · pnpm fijado con `packageManager` | Builds deterministas |

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
├── shared-kernel/          Money, YearMonth, UnitNumber, DomainError, Result, puerto Clock
├── modules/
│   ├── identity/           usuarios, login, refresh, políticas de acceso
│   ├── units/              deptos y su historial de estado (activo/inactivo)
│   ├── shifts/             cálculo de turnos, delegaciones
│   ├── cashbook/           libro de caja del mes: todos los movimientos (pagos de depto, otros ingresos, egresos)
│   ├── billing/            cargos (cuota, multa), asignación de pagos a cargos, estado de cuenta
│   ├── reports/            reporte mensual: apertura, cierre, reapertura, PDF
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

| Negocio | Código |
|---|---|
| Depto | `Unit` |
| Dueño | `Owner` (usuario con rol `OWNER`) |
| Superadmin | rol `SUPERADMIN` |
| Turno / Gobierno | `Shift` |
| Traspaso / Delegación | `ShiftDelegation` |
| Cuota de mantenimiento | `MaintenanceFee` (un tipo de `Charge`) |
| Multa por no tomar turno | `ShiftSkipPenalty` (un tipo de `Charge`) |
| Movimiento (renglón del libro) | `CashMovement` (dirección `IN`/`OUT` y categoría) |
| Pago de depto / Abono | `CashMovement` de categoría `UNIT_PAYMENT` + `PaymentAllocation` |
| Otro ingreso | `CashMovement` de categoría `OTHER_INCOME` |
| Adeudo | `outstandingBalance` (derivado) |
| Adelanto | `creditBalance` / cargos futuros ya cubiertos (derivado) |
| Estado de cuenta | `AccountStatement` |
| Egreso | `CashMovement` de categoría `GARBAGE`, `CLEANING` u `OTHER_EXPENSE` |
| Visita de limpieza | `CashMovement` de categoría `CLEANING` (una por visita) |
| Libro del mes (la lista) | `MonthlyCashbook` (vista de lectura) |
| Reporte mensual | `MonthlyReport` |
| Bitácora | `AuditLog` |

---

## 4. Ajustes al modelo de datos de la spec (sección 7)

Estos cambios se proponen para cumplir las mismas reglas con un diseño más robusto. Se confirman al inicio de la fase 1 y luego se reflejan en la spec.

1. **Libro de cargos y abonos en lugar de `PagoDepto` con montos de adeudo y adelanto.** Cada mes se genera un `Charge` de $700 por depto activo (más las multas que apliquen). Cada pago de depto se aplica a los cargos más antiguos primero (FIFO) mediante `PaymentAllocation`. Adeudo, adelanto y pago parcial se **derivan** del libro en vez de capturarse a mano: no hay campos que se desincronicen y el estado de cuenta siempre cuadra.
2. **Historial de estado del depto** (`UnitStatusPeriod`: desde, hasta, activo/inactivo). Un booleano no alcanza, porque el cálculo de turnos y cargos de meses pasados necesita saber si el depto estaba activo *en ese momento*.
3. **`ShiftDelegation` como entidad propia** (periodo, depto original, depto delegado, motivo, creada por). El calendario base no se guarda: se calcula a partir del ancla.
4. **Un solo libro de caja (`CashMovement`) en lugar de tablas separadas para pagos y egresos.** Cada renglón tiene fecha, dirección (entrada o salida), categoría (`UNIT_PAYMENT`, `OTHER_INCOME`, `GARBAGE`, `CLEANING`, `OTHER_EXPENSE`), importe, descripción y, si es pago de depto, el depto. La fecha define el mes contable, en base de caja (spec 4.4). Cada visita de limpieza es un renglón propio con la tarifa vigente. El reporte mensual es simplemente el saldo inicial más la suma de los renglones del mes. Esto sustituye a `PagoDepto` y `Egreso` de la spec.
5. **`MonthlyReport` guarda una foto al cierre** (saldo inicial, ingresos, egresos, saldo final). Mientras está abierto, los totales se calculan en vivo. El saldo final de un mes cerrado es el saldo inicial del siguiente. Si se reabre, se recalculan en cascada los meses cerrados posteriores.
6. **`Settings`** con vigencias: cuota mensual, tarifa de limpieza, monto de basura, multa, ancla de turnos. Así un cambio de tarifa no altera los meses anteriores.
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
- `infra/docker-compose.dev.yml` con Postgres 17; `.env.example`; configuración validada con Zod al arrancar.
- Logger estructurado (pino), endpoint `/health`.
- Esqueleto de carpetas hexagonales y `shared-kernel` vacío.
- GitHub Actions: CI en cada PR.
- ADRs 001–010 con las decisiones de la sección 1.

**Conceptos:** workspaces, configuración estricta de TypeScript, límites arquitectónicos verificados automáticamente.

### Fase 1: Dominio núcleo (TypeScript puro, TDD)
Todo sin base de datos ni HTTP, solo lógica y pruebas.
- `shared-kernel`: `Money`, `YearMonth`, `UnitNumber`, `DateRange`, `Clock`, `DomainError`.
- `units`: `Unit`, `UnitStatusPeriod`.
- `shifts`: servicio `ShiftScheduler`, que calcula el turno de cualquier mes a partir del ancla (2026-08 → 501), el orden fijo, los deptos inactivos y las delegaciones. Se prueba exhaustivamente: meses pasados y futuros, ciclos completos, delegaciones e inactividad.
- `identity`: política `WriteAccessPolicy` (superadmin, depto en turno, depto delegado, ventana de cierre).
- `cashbook`: `CashMovement` y sus categorías, reglas de base de caja, totales del mes, reglas de edición según el estado del mes.
- `billing`: `Charge`, asignación FIFO de pagos, `AccountStatement` (adeudo, adelanto, parcial).
- Reglas de basura y limpieza (montos sugeridos según `Settings`).
- `reports`: ciclo de vida de `MonthlyReport` (abierto, cerrado, reabierto) y cálculo de saldos.

**Conceptos:** entidades frente a value objects, invariantes, servicios de dominio, TDD.

### Fase 2: Persistencia
- `schema.prisma` y la migración inicial según la sección 4, con índices y restricciones (unicidad de cargo por depto y mes, checks de montos ≥ 0).
- Adaptadores de repositorio y mappers Prisma ↔ dominio; `UnitOfWork` sobre `$transaction`.
- Trigger y permisos de solo inserción para `audit_log`.
- Seed: 10 deptos, superadmin, configuración inicial y ancla de turnos.
- Pruebas de integración con Testcontainers.

**Conceptos:** mapeo entre persistencia y dominio, migraciones, transacciones, pruebas contra una BD real.

### Fase 3: Identidad, sesión y shell del frontend
- Backend: login, refresh con rotación y detección de reuso, logout, cambio de contraseña, reseteo de contraseña por el superadmin. Guard de autenticación JWT y decorador `@CurrentUser`. Rate limiting en login (`@nestjs/throttler`). Helmet y CORS restringido.
- Frontend: TanStack Router y Query, cliente HTTP con refresh automático en 401, pantalla de login, layout móvil (barra inferior de navegación), rutas protegidas por rol.
- Primer E2E con Playwright: login, recarga de página con la sesión persistida y logout.

**Conceptos:** ciclo de vida de los tokens, cookies seguras, guards frente a políticas de dominio.

### Fase 4: Bitácora de auditoría
Va antes de las funcionalidades de escritura para que todas la usen desde el primer día.
- Puerto `AuditTrail` y adaptador Prisma. Los casos de uso registran cambios a nivel de campo (antes y después) dentro de su transacción, mediante un decorador o clase base de caso de uso (DRY).
- Endpoint de consulta paginado y filtrable; pantalla de bitácora (solo lectura).

**Conceptos:** trazabilidad, inmutabilidad, por qué se audita en la capa de aplicación y no con un interceptor HTTP.

### Fase 5: Despliegue temprano (walking skeleton)
- Dockerfiles multi-stage (api, web), `infra/docker-compose.yml`, Caddyfile con tu dominio.
- Migraciones automáticas al desplegar; secretos fuera del repo.
- Backups diarios con `pg_dump` y retención, más una prueba de restauración documentada.
- CD con GitHub Actions: imagen al registry (GHCR) y despliegue por SSH al VPS.
- Desde aquí, cada fase termina desplegada en producción.

**Conceptos:** imágenes reproducibles, reverse proxy, HTTPS, backups probados.

### Fase 6: Turnos, delegaciones y blueprint
- API: calendario de turnos (rango de meses), turno actual, crear o cancelar una delegación (solo superadmin), marcar un depto activo o inactivo (solo superadmin).
- Multa por no tomar turno: al registrar una delegación por omisión se genera el cargo de $1,200 en el libro.
- Frontend: widget blueprint de 2×5 en el dashboard (depto en turno resaltado, delegación diferenciada), vista de calendario y pantallas de administración.

**Conceptos:** aritmética de ciclos sobre fechas, cálculo con excepciones.

### Fase 7: Libro del mes (captura tipo lista), cuotas y estado de cuenta
Es la pantalla principal de quien está en turno: la lista de movimientos del mes. Con llenarla, el reporte queda hecho.
- **Vista de lista** agrupada por día, con el saldo inicial, el total de ingresos, el total de egresos y el saldo actual siempre visibles arriba. Es el borrador vivo del reporte.
- **Botón "+ Agregar"** que abre una hoja inferior (bottom sheet) en el móvil:
  1. Se elige el tipo: *Pago de depto*, *Otro ingreso*, *Basura*, *Limpieza* u *Otro egreso*.
  2. Los campos se adaptan al tipo y vienen prellenados: la fecha de hoy, el importe sugerido según `Settings` ($700, $150, la tarifa de limpieza) y, en *Pago de depto*, los deptos con adeudo primero.
  3. Se guarda con un toque y se puede seguir agregando sin salir de la hoja.
- En cada pago de depto, el renglón muestra qué cubrió el pago (por ejemplo "cubre sep y oct" o "abono parcial a ago").
- Tocar un renglón permite editarlo o borrarlo mientras el mes esté abierto, con auditoría.
- Funciona en modo de solo lectura para quien no está en turno (transparencia total).
- Backend: casos de uso `AddCashMovement`, `EditCashMovement` y `RemoveCashMovement`, una sola entrada para todas las categorías (DRY), con una estrategia de validación por categoría. La query `MonthlyCashbook` arma la vista. Los cargos del mes se generan de forma idempotente al abrir el mes, y la asignación FIFO se hace al guardar un pago de depto.
- Estado de cuenta por depto y tabla general de adeudos y adelantos.

**Conceptos:** contabilidad de libro (ledger), patrón Strategy por categoría, idempotencia, read models (CQRS ligero), UX de captura móvil.

### Fase 8: Egresos recurrentes asistidos
Todo vive dentro de la misma lista; esta fase solo agrega atajos para lo que se repite.
- Basura: cada semana aparece en la lista un renglón **pendiente** de $150; se confirma con un toque y se ajusta la fecha real de pago si hace falta. Los pendientes no cuentan en los totales hasta que se confirman.
- Limpieza: atajo para marcar varias visitas en un minicalendario, que genera un renglón por visita, más un resumen semanal de cuánto pagarle a la persona.
- Otros egresos: captura libre con fecha, descripción e importe (comprobante opcional; ver pregunta abierta 5).

**Conceptos:** sugerencias frente a hechos registrados, reglas configurables con vigencia.

### Fase 9: Reporte mensual e histórico
- Ciclo de vida del mes sobre la lista de la fase 7: abrir (se toma el saldo inicial del mes anterior y se generan los cargos), cerrar (se congela la lista y se guarda la foto, con una advertencia si quedan renglones de basura pendientes) y reabrir (solo superadmin, con recálculo en cascada y auditoría).
- Dashboard: saldo actual, ingresos y egresos del mes, deptos con adeudo y blueprint.
- Histórico navegable por mes: cada mes cerrado se ve como su lista congelada más el resumen.

**Conceptos:** máquinas de estado, snapshots frente a cálculo en vivo.

### Fase 10: Reporte PDF
- Plantilla con @react-pdf/renderer que conserve el espíritu del reporte actual. Se necesita un PDF de ejemplo como referencia (ver la sección 6).
- Descarga del PDF y botón de compartir (Web Share API, que en el móvil abre WhatsApp directamente).
- El PDF de un mes cerrado se genera desde su foto, así que siempre sale igual.

**Conceptos:** renderizado en el servidor, streams, Web Share API.

### Fase 11: Carga inicial, pulido y endurecimiento
- Pantalla o script de carga inicial: mes de corte, saldo de caja y adeudos o adelantos vigentes por depto. Los PDFs anteriores se suben como archivo de consulta.
- Alta de los 10 usuarios con contraseña temporal y cambio obligatorio en el primer login.
- PWA (manifest e ícono, instalable en el celular).
- Accesibilidad, estados vacíos y de error, revisión de rendimiento (Lighthouse) y de seguridad (OWASP ASVS nivel 1).
- Pruebas E2E de los flujos críticos completos.

---

## 6. Preguntas abiertas

Cada una tiene un valor por defecto para no bloquear el avance. Se confirman en la fase indicada.

| # | Pregunta | Valor por defecto | Fase |
|---|---|---|---|
| 1 | Si un depto está **inactivo**, ¿la rotación lo salta y todos los turnos siguientes se recorren, o su periodo lo cubre otro depto sin mover el resto? | Se salta y la rotación se recorre (la spec dice que "se excluye del cálculo") | 1 |
| 2 | **Ventana de cierre:** el reporte de septiembre suele cerrarse en los primeros días de octubre, cuando el turno ya cambió. ¿Quién puede escribir en un mes que sigue abierto? | El depto en turno de ese mes, hasta que lo cierre (además del superadmin) | 1 |
| 3 | ¿Los cargos de cuota se generan el día 1 de cada mes aunque nadie abra el reporte? | Se generan al abrir el reporte, con un job diario de respaldo que lo hace solo | 7 |
| 4 | ¿Qué día de la semana se paga la basura? | Se sugiere el domingo y el usuario lo ajusta | 8 |
| 5 | ¿Quieres adjuntar fotos de comprobantes en los egresos? Implica almacenar archivos en el VPS y respaldarlos. | No en la primera versión | 8 |
| 6 | Necesito **uno o dos PDFs reales** del reporte actual para replicar su formato. | — | 10 |
| 7 | Mes de corte, saldo de caja y adeudos o adelantos vigentes por depto para la carga inicial. | — | 11 |
| 8 | Dominio y subdominio, y acceso SSH al VPS (distribución y si ya tiene Docker). | — | 5 |
| 9 | ¿Los dueños pueden cambiar su propia contraseña? ¿Hay recuperación por email? | Cambio propio sí; sin email: el superadmin resetea | 3 |
| 10 | ¿Puede haber varios usuarios por depto (por ejemplo, pareja o inquilino con solo lectura)? | Un usuario por depto, como dice la spec | 2 |
