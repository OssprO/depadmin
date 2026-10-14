# Shared kernel

Conceptos de dominio que usan todos los módulos. TypeScript puro: no importa paquetes ni APIs de Node (ni siquiera `Date`, para no depender de la zona horaria del servidor).

| Pieza                                                                                             | Qué es                                                                                   |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Money`                                                                                           | Importe en centavos enteros; nunca flotantes.                                            |
| `YearMonth`                                                                                       | Un mes (`2026-08`): la unidad de reportes, cargos y turnos.                              |
| `LocalDate`                                                                                       | Una fecha del calendario sin hora ni zona horaria (la fecha local del edificio).         |
| `YearMonthRange`                                                                                  | Meses consecutivos, con fin abierto opcional (por ejemplo, un depto inactivo sin fecha). |
| `UnitNumber`                                                                                      | Un depto: 101 … 502.                                                                     |
| `Clock`                                                                                           | Puerto para saber qué día es; el dominio nunca lee el reloj del sistema.                 |
| `Instant`                                                                                         | Un momento exacto (milisegundos desde 1970), para vencimientos.                          |
| `Actor`                                                                                           | Quién actúa: el superadmin o el dueño de un depto.                                       |
| `WriteAccessPolicy`                                                                               | Quién puede escribir, cerrar y entregar un mes (ventana del turno más 5 días de gracia). |
| `UnitOfWork`                                                                                      | Puerto para correr un caso de uso en una transacción.                                    |
| `AuditTrail`, `trackChanges`, `Redacted`                                                          | Puerto de la bitácora y el cálculo de cambios por campo (ADR-0014).                      |
| `DomainError` y subclases (`ValidationError`, `ConflictError`, `ForbiddenError`, `NotFoundError`) | Fallos de reglas de negocio con un `code` estable que el frontend traduce.               |

Importa siempre desde el barril: `import { Money, YearMonth } from '../../../shared-kernel/index.js'`.
