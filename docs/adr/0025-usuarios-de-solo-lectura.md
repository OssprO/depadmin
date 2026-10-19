# ADR-0025: Usuarios de solo lectura, temporales y desactivados

**Estado:** Aceptado · **Fecha:** 2026-10-16

## Contexto

Hasta la fase 13 había un usuario por depto (su dueño) más el superadmin. El plan de la etapa 2 pide:

- Usuarios que vean todo y nunca escriban: un inquilino o un familiar de un depto, o alguien de ninguno, como un contador.
- Usuarios temporales: al vencer ya no entran y sus sesiones se cierran solas.
- Varios usuarios por depto.
- Que solo el superadmin cree, cambie, desactive y reactive usuarios, y que todo vaya a la bitácora.

## Decisión

- **Un rol nuevo, `READER`, en el `Actor` del shared kernel:** `{ role: 'READER', userId, unit: UnitNumber | null }`. `WriteAccessPolicy.decide` lo rechaza siempre con `READ_ONLY`, sin importar el turno. Leer no pasa por la política, así que ve lo mismo que un dueño. Administrar sigue siendo del superadmin (`SUPERADMIN_ONLY`).
- **Un dueño por depto, y cualquier número de usuarios de solo lectura.** Se quitó el índice único de `unit_number`. Lo reemplaza una restricción de exclusión, `app_user_one_owner_per_unit`, que Prisma no intenta borrar. Un dueño se llama como su depto, así que un usuario de solo lectura no puede llamarse solo con un número (`USERNAME_RESERVED`).
- **Cualquier usuario, salvo el superadmin, puede vencer y desactivarse.** `User` tiene:
  - `expiresOn`: el último día en que puede entrar.
  - `disabled`.
  - `canSignInOn(today)`: tiene contraseña, no está desactivado y no ha vencido.

  `SignIn` lo revisa después de validar la contraseña. Solo quien la sabe se entera de que su acceso está desactivado (`ACCESS_DISABLED`) o vencido (`ACCESS_EXPIRED`); con una contraseña equivocada la respuesta sigue siendo `INVALID_CREDENTIALS`. `RefreshSession` cierra la sesión de quien ya no puede entrar, así que el token de acceso (15 minutos) es lo más que dura un acceso vencido. Desactivar a alguien revoca sus sesiones en ese momento.

- **Casos de uso del superadmin** (`manage-users.ts`), todos con bitácora:
  - `CreateReader`: entrega una contraseña temporal que se cambia al entrar (`USER_CREATED`).
  - `ChangeUserAccess`: cambia el depto (solo de un usuario de solo lectura; el dueño se queda con el suyo) y el vencimiento (`USER_ACCESS_CHANGED`).
  - `DisableUser` y `EnableUser` (`USER_DISABLED` y `USER_ENABLED`).

  Un vencimiento se fija de hoy en adelante (`USER_EXPIRY_PAST`): para quitar el acceso ya, se desactiva al usuario.

- **Bitácora:** el rol `READER` se agrega a `audit_actor_role`. Un usuario de solo lectura solo cambia su propia contraseña, y queda registrado con su depto si lo tiene.
- **Pantalla _Administración → Usuarios_:**
  - Muestra el tipo, el depto, el vencimiento y el estado de cada usuario (Activa, Temporal, Sin acceso, Vencido o Desactivado).
  - Desde ahí se crea un usuario de solo lectura, se cambia el acceso de cualquiera, se desactiva o reactiva y se restablece la contraseña.

## Consecuencias

- **Un usuario vencido o desactivado** puede seguir viendo la app hasta 15 minutos, mientras dura su token de acceso; después ya no entra.
- **El vencimiento es un día en el calendario del edificio** (`Clock.today()`), no una hora.
- **El dueño de cada depto sigue siendo uno solo.** Cambiar de dueño es cambiar el nombre del propietario (`RenameUnitOwner`) y restablecer la contraseña del usuario del depto.
