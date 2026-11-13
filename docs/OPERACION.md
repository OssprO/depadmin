# Operación: qué hacer cuando algo pasa

Este documento es para el día en que algo falla: un correo de aviso, la app que no abre, o datos que hay que recuperar. También es la entrega para quien un día ayude al superadmin o lo reemplace. Cómo se instaló todo está en [`DESPLIEGUE.md`](DESPLIEGUE.md); por qué, en el [ADR-0030](adr/0030-operacion.md).

**Convenciones:** igual que en `DESPLIEGUE.md`. Los comandos **(como deploy)** se corren en el VPS con `sudo -iu deploy`, dentro de `/opt/depadmin`.

---

## 1. Las cuentas y dónde está cada secreto

Aquí no va ningún secreto, solo dónde vive cada uno. **El gestor de contraseñas del superadmin tiene una copia de todos.** Sin la contraseña de `restic` no se puede restaurar ningún respaldo de B2.

| Qué                                    | Para qué                                           | Dónde vive el secreto                                                                                             |
| -------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| VPS (usuario propio y `deploy`)        | Corre la app                                       | La llave SSH en la computadora del superadmin; la de `deploy`, en los secretos de GitHub                          |
| `/opt/depadmin/.env`                   | Contraseñas de la base, `JWT_SECRET`, `restic`, B2 | En el VPS (`chmod 600`) y en el gestor de contraseñas                                                             |
| GitHub (repositorio `OssprO/depadmin`) | El código, CI, los despliegues y las versiones     | Cuenta del superadmin. _Settings → Secrets_: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |
| Backblaze B2                           | La copia cifrada de los respaldos fuera del VPS    | Cuenta del superadmin. La llave `depadmin-restic` está en el `.env` (`B2_KEY_ID`, `B2_APPLICATION_KEY`)           |
| healthchecks.io                        | Avisa si un respaldo o un job falla o no llega     | Cuenta del superadmin. La URL con la llave está en el `.env` (`HEALTHCHECKS_PING_URL`)                            |
| UptimeRobot                            | Avisa si la app deja de responder                  | Cuenta del superadmin                                                                                             |
| Namecheap                              | El dominio `osspro.site` y su DNS                  | Cuenta del superadmin                                                                                             |
| Usuario superadmin de la app           | Reabrir meses, usuarios, contraseñas               | El superadmin                                                                                                     |

---

## 2. Llegó un correo de aviso

| Aviso                                     | Qué significa y qué hacer                                                                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UptimeRobot: la app está caída            | Nadie puede entrar. Sigue la sección 3                                                                                                                                                                                                                    |
| healthchecks.io: `backup` falló           | El correo dice en qué paso (`failed at: …`). Si fue al copiar a B2, la copia del VPS sí está: revisa la cuenta y las llaves de B2 y corre `./backup.sh` a mano **(como deploy)**. Si fue al sacar la copia, la base tiene un problema: sigue la sección 3 |
| healthchecks.io: `backup` no llegó        | El cron no corrió o el VPS estuvo apagado a las 3:30. Revisa `crontab -l` y `tail /var/backups/depadmin/backup.log`, y corre `./backup.sh` a mano                                                                                                         |
| healthchecks.io: `open-current-month`     | El job no abrió el mes. Entra como superadmin y abre el mes desde el libro; luego busca la causa en `docker compose logs --since 24h api`. Si el aviso es que **no llegó**, la API no estuvo arriba a las 00:05: sigue la sección 3                       |
| healthchecks.io: `purge-expired-sessions` | Las sesiones vencidas no se borraron. No es urgente: el job lo intenta cada noche. Revisa `docker compose logs api`                                                                                                                                       |
| healthchecks.io: `restore-test`           | Pasaron 90 días sin probar la restauración. Corre `./restore-test.sh` **(como deploy)**                                                                                                                                                                   |

---

## 3. La app no abre

Ve en orden, y para en cuanto encuentres la causa. Los comandos son **(como deploy)**.

1. **¿Es la app o el VPS?** `curl -s https://depadmin.osspro.site/api/health/ready`. Si no responde nada, entra al VPS por SSH. Si tampoco puedes, el VPS está caído: revísalo en el panel del proveedor.
2. **¿Están arriba los contenedores?** `docker compose ps`. Si alguno no está `healthy`, `docker compose up -d --wait` y luego `docker compose logs --tail 100 api` (o `db`, `web`).
3. **¿Hay disco?** `df -h /`. Si está lleno, `docker system df` y `docker image prune -a`.
4. **¿Fue un despliegue?** Si empezó justo después de uno, vuelve a la versión anterior: `./deploy.sh 1.0.2`, con el número anterior de **GitHub → Releases**.
5. **¿Responde la base?** `docker compose exec db pg_isready -U depadmin`. Si no, `docker compose logs --tail 100 db`. Si los datos se dañaron, sigue la sección 4.
6. **¿Es solo un celular?** Revisa los errores que mandan los navegadores: `docker compose logs --since 24h api | grep BrowserError`.

---

## 4. Restaurar un respaldo

Solo si los datos se perdieron o se dañaron. Para comprobar que los respaldos sirven, basta `./restore-test.sh`, que no toca la base de la app.

1. **(como deploy)** Elige la copia. `./backup.sh list` muestra las del VPS y las de B2, con la hora en UTC. La más reciente es `latest`. Para otra, usa su ID.
2. **(como deploy)** Sácala a un archivo. Desde el VPS:

   ```bash
   cd /opt/depadmin
   docker compose --progress quiet run --rm -T --user "$(id -u):$(id -g)" restic \
     dump --host depadmin latest /depadmin.dump > /var/backups/depadmin/restaurar.dump
   ```

   O desde B2, si la copia del VPS no sirve: agrega `-r "$(sed -n 's/^RESTIC_REMOTE_REPOSITORY=//p' .env)"` después de `restic`.

3. **(como deploy)** Reemplaza la base con ese archivo, igual que en el paso 7.2 de `DESPLIEGUE.md`:

   ```bash
   docker compose stop api web
   docker compose exec -T db dropdb -U depadmin depadmin
   docker compose exec -T db createdb -U depadmin depadmin
   docker compose exec -T db pg_restore -U depadmin -d depadmin --no-owner --exit-on-error < /var/backups/depadmin/restaurar.dump
   docker compose exec -T db psql -U depadmin -d depadmin -c 'DELETE FROM refresh_token'
   docker compose up --detach --wait
   shred -u /var/backups/depadmin/restaurar.dump
   ```

4. Todo lo registrado después de esa copia se perdió. Avisa a los vecinos y vuelve a capturar lo que falte.

**Si el VPS se perdió por completo:** instala uno nuevo con `DESPLIEGUE.md` (pasos 2 a 6) y pon en su `.env` los mismos valores que guardaste en el gestor de contraseñas: la misma `RESTIC_PASSWORD` y las mismas llaves de B2. Luego saca la copia desde B2 (paso 2 de esta sección, con `-r`) y sigue con el paso 3.

---

## 5. Desplegar a mano

- **La versión de `main` otra vez:** en GitHub, **Actions → Deploy → Run workflow**, sobre `main`.
- **Una versión concreta:** **(como deploy)** `./deploy.sh 1.0.2`, con un número de **Releases**. Saca un respaldo antes y, si la versión no arranca sana, regresa sola a la que estaba.

---

## 6. Si el superadmin no está

Hoy solo el superadmin reabre meses, restablece contraseñas, administra usuarios y despliega. **Todavía no hay suplente** (pregunta 25 del [plan de la Etapa 3](PLAN-ETAPA-3.md)).

Mientras no lo haya:

- **Los turnos siguen solos.** Cada depto escribe su mes y lo cierra en su entrega. El mes se abre solo el día 1.
- **Lo que espera al superadmin:** reabrir un mes cerrado, restablecer una contraseña, asignar quién cubre un depto inactivo, y cualquier problema del VPS.
- **Lo que necesitaría un suplente:** una cuenta en la app con esos permisos, que todavía no existe, y para la infraestructura acceso al gestor de contraseñas con lo de la sección 1. Cuando se elija a alguien, se crea su acceso y se escribe aquí su nombre.

---

## 7. A quién llamar

| Para                      | Quién                                                      |
| ------------------------- | ---------------------------------------------------------- |
| La app, el VPS, los datos | El superadmin                                              |
| El turno del mes          | El depto que lo tiene (en la app, **Turnos**)              |
| El suplente               | _Pendiente: se escribe aquí cuando se elija (pregunta 25)_ |
