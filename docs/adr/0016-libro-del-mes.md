# ADR-0016: Libro del mes, apertura de meses y estados de cuenta

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

La fase 7 hace usable el libro de caja: capturar, corregir y borrar renglones, ver el mes como su reporte vivo y consultar adeudos y adelantos. Para eso hacen falta piezas que el PLAN repartía en otras fases: el saldo de arranque (fase 11) y la apertura del mes con sus cuotas (fase 9). Además, el libro, los cargos y los reportes se necesitan entre sí, y los módulos no pueden formar ciclos.

## Decisión

- **Abrir el mes llega en esta fase (`OpenMonth`):**
  - Lo hace quien puede escribir el mes (su depto responsable o el superadmin), desde su día 1.
  - Los meses se abren en orden: abrir octubre abre antes los meses pendientes desde el inicio.
  - Cada mes abierto cobra la cuota a los deptos activos con la tarifa vigente (`ChargeMaintenanceFees`, idempotente).
  - Cerrar y reabrir siguen en la fase 9.
- **Inicio de la contabilidad (`SetReportingStart`):**
  - Lo captura el superadmin: el primer mes y el efectivo en caja.
  - El mes queda fijo en cuanto se abre; el efectivo se puede corregir mientras no se cierre ningún mes.
  - La carga inicial completa (adeudos previos, PDFs) sigue en la fase 11.
- **Grafo de módulos sin ciclos:**
  - `cashbook` (escritura) → `shifts` (permisos) → `billing` → `units`, `settings`.
  - `reports` es el lado de lectura que lo junta todo: la vista del mes (`GetMonthlyReport`) y los estados de cuenta (`GetAccounts`, cargos de `billing` contra pagos de `cashbook`).
  - `billing` no lee el libro: recibe los pagos como datos (`GetAccountStatements.of(unit, payments)`).
- **El estado de cada mes es un puerto del shared kernel (`MonthLedger`):**
  - `reports` lo implementa y lo provee de forma global.
  - `cashbook` (¿el mes está abierto?) y `units` lo consultan sin importar `reports`, que a su vez los lee a ellos. Es inversión de dependencias, igual que `AuditTrail`.
- **Cada módulo publica su vocabulario desde `application/`** (`export type { CashMovement, AccountStatement … }`). Otros módulos usan esos tipos sin importar dominios ajenos.
- **Escritura del libro:**
  - Tres casos de uso (`AddMovement`, `ReviseMovement`, `RemoveMovement`) para todas las categorías. La tabla `CATEGORY_RULES` del dominio es la estrategia por categoría.
  - Las verificaciones comunes (ventana de escritura y mes abierto) viven en un solo lugar: `CashbookAccess`.
  - Corregir reemplaza el renglón completo (`PUT`), y la bitácora registra solo los campos que cambiaron. Borrar es lógico, y la bitácora registra cada campo que tenía.
- **Lo derivado no se guarda:** la cobertura de cada pago («cubre sep y oct») y los adeudos y adelantos se recalculan en cada lectura con `allocatePayments` (ADR-0012).
- **El estado de un depto solo cambia desde un mes sin abrir.** Un mes abierto ya cobró sus cuotas a los deptos activos (`UNIT_STATUS_MONTH_OPENED`).
- **Frontend:**
  - La barra inferior queda en Inicio, Libro, Turnos, Bitácora y Más; _Más_ agrupa estados de cuenta, administración y mi cuenta.
  - La captura usa una hoja inferior con el tipo como botones, el importe sugerido y los deptos con adeudo primero. Incluye «Guardar y agregar otro».
  - Las reglas por categoría se repiten en el contrato compartido (`CATEGORY_RULES` en `packages/shared`) para validar el formulario; el backend tiene la última palabra.

## Consecuencias

- `ReportsModule` es global solo para exportar `MONTH_LEDGER`.
- Leer un mes recalcula los totales de los meses abiertos anteriores y todas las cuentas. Con diez deptos es inmediato; si creciera, se agregaría un caché.
- La fase 9 agrega cerrar y reabrir sobre `ReportLedger`; `CashbookAccess` ya rechaza escribir en un mes cerrado.
- Un mes abierto no puede corregir la cuota de un depto que quedó vacío a mitad de mes. Si hace falta, se registraría como otro ingreso o egreso.
