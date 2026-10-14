# ADR-0014: Bitácora de auditoría

**Estado:** Aceptado · **Fecha:** 2026-10-14

## Contexto

La spec pide que todo cambio a un registro quede en una bitácora inmutable: quién, cuándo, qué campo, valor anterior y valor nuevo. La tabla `audit_log` existe desde la fase 2 con sus triggers de solo inserción (ADR-0012), pero nadie escribía en ella. La fase 4 define cómo la usan los casos de uso antes de que lleguen las funcionalidades de escritura (turnos, libro del mes, reportes).

## Decisión

- **Se audita en la capa de aplicación, no con un interceptor HTTP:**
  - Solo el caso de uso sabe qué entidad cambió, cómo era antes y cómo quedó. Un interceptor solo ve la petición y la respuesta.
  - La entrada se escribe en la misma transacción (`UnitOfWork`) que el cambio: si algo falla, no se guarda ninguno de los dos.
  - Un job o un script que use el caso de uso queda auditado igual que una petición HTTP.
- **El puerto `AuditTrail` vive en el shared kernel**, junto a `UnitOfWork`, porque lo usan los casos de uso de todos los módulos y un módulo no puede importar el dominio de otro. El módulo `audit` aporta el adaptador Prisma (global, como `PrismaModule`) y la parte de lectura.
- **Composición en lugar de decorador o clase base** (el PLAN proponía cualquiera de las dos):
  - Un decorador no ve el estado anterior de la entidad, y una clase base con inyección de dependencias en Nest obliga a repetir el constructor en cada subclase.
  - En su lugar, cada módulo declara una vez cómo se ve cada entidad en la bitácora (`AuditSubject`: tipo, id, etiqueta y _snapshot_ de campos).
  - El caso de uso llama a `trackChanges(subject, entidad)` antes de modificarla y a `audit.record(actor, tracked.change(ACCIÓN))` dentro de la transacción. `diffSnapshots` calcula los campos que cambiaron.
- **Secretos:** un campo marcado como `Redacted` (el hash de la contraseña) se compara en memoria y solo se registra `{ field, redacted: true }`. Ni el hash ni la contraseña temporal llegan a la bitácora.
- **Las entradas se copian, no se referencian:** cada fila guarda el rol y el depto de quien actuó y una etiqueta legible de la entidad (por ejemplo `502`), tal como eran en ese momento. La bitácora se lee igual años después, sin joins a otros módulos.
- **Salvaguardas:**
  - El adaptador rechaza escribir fuera de una transacción.
  - Los dobles de prueba (`FakeUnitOfWork` y `RecordingAuditTrail`) hacen lo mismo y descartan las entradas si el trabajo falla, así que las pruebas unitarias detectan un registro fuera de la transacción.
  - La migración agrega `CHECK` de actor ↔ depto, `changes` como arreglo JSON y formato de los códigos.
- **Lectura:**
  - `GET /api/audit-log`, filtrable por tipo de entidad, por registro (`entityId`) y por quién actuó (superadmin o un depto).
  - Paginación por cursor (keyset sobre el id, más reciente primero): una página no se recorre cuando llegan entradas nuevas, a diferencia de un offset.
  - La lee cualquier usuario con sesión: los dueños tienen lectura total (spec 5) y la bitácora no contiene secretos.
- **Qué se audita:** los cambios a registros. Por ahora, el cambio y el reseteo de contraseñas. Login, refresh y logout no son cambios a un registro y no se auditan.

## Consecuencias

- Cada caso de uso de escritura nuevo inyecta `AUDIT_TRAIL`, declara o reutiliza el `AuditSubject` de su entidad y agrega su acción y sus campos a las etiquetas en español de `frontend/src/features/audit/labels.ts`. Un código sin etiqueta se muestra tal cual.
- Como `audit_log` no se vacía entre pruebas, las pruebas de integración que la leen filtran por una entidad o un registro propios.
- Si en la fase 7 un job diario genera cargos sin un usuario detrás, hará falta un actor de sistema (un rol nuevo en `actor_role`).
