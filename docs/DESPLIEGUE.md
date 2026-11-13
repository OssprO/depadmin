# Despliegue en el VPS

Esta guía publica DepAdmin en **https://depadmin.osspro.site**, en un VPS con Ubuntu. Se sigue una sola vez, en orden. Las decisiones están en el [ADR-0026](adr/0026-despliegue-con-nginx.md).

Al final queda así:

```
Navegador ──HTTPS──▶ nginx del VPS (certificado de Let's Encrypt; un virtual host por subdominio)
                        │  127.0.0.1:8063
                        ▼
                     contenedor web (nginx: la app y sus cabeceras) ──/api──▶ contenedor api (NestJS)
                                                                                   │
                                                                                   ▼
                                                                          contenedor db (Postgres 18)
```

- **Cada versión nueva se publica sola.** Cuando un cambio llega a `main` y pasa CI, GitHub Actions le pone un número de versión (como `1.0.3`, [ADR-0027](adr/0027-versiones.md)), construye las imágenes, las sube a GHCR, las despliega en el VPS por SSH y anota la versión en **GitHub Releases**.
- **Respaldo cifrado cada noche,** en el VPS y en Backblaze B2, y avisos por correo si algo falla: el respaldo, un job o la app entera ([ADR-0030](adr/0030-operacion.md)). Qué hacer cuando algo pasa está en [`OPERACION.md`](OPERACION.md).

**Convenciones de la guía:**

- `TU_IP` es la IPv4 pública del VPS.
- Los comandos con `sudo` se corren con tu usuario de siempre en el VPS.
- Los que dicen **(como deploy)** se corren como el usuario `deploy`, que se crea en el paso 2.
- Los que dicen **(en tu computadora)** se corren en tu máquina, no en el VPS.

---

## 0. Antes de empezar

En el VPS, revisa:

```bash
lsb_release -ds        # Ubuntu 22.04 o 24.04
uname -m               # x86_64
free -h                # 1 GB de RAM como mínimo, mejor 2 GB
df -h /                # unos 5 GB libres
curl -4 ifconfig.me    # esta es TU_IP
```

Si `uname -m` dice `aarch64` (un VPS ARM), agrega `platforms: linux/arm64` a los dos pasos `docker/build-push-action` de `.github/workflows/deploy.yml`.

Si tu proveedor tiene un **firewall en su panel web**, abre ahí los puertos 22, 80 y 443. No basta con abrirlos en `ufw`.

---

## 1. El subdominio en Namecheap

1. Entra a [namecheap.com](https://www.namecheap.com), luego **Account → Domain List** y pulsa **Manage** junto a `osspro.site`.
2. En la pestaña **Domain**, la sección **NAMESERVERS** debe decir **Namecheap BasicDNS**. Si dice otra cosa, elígelo y guarda con la palomita verde.
3. Ve a la pestaña **Advanced DNS**. En **HOST RECORDS**, pulsa **ADD NEW RECORD** y llénalo así:

   | Type     | Host       | Value   | TTL       |
   | -------- | ---------- | ------- | --------- |
   | A Record | `depadmin` | `TU_IP` | Automatic |

   Guarda con la palomita verde.

   Los registros que Namecheap trae de fábrica (el `CNAME` de `www` o el «URL Redirect» de `@`) no afectan al subdominio. Puedes dejarlos.

4. **IPv6:** no agregues un registro `AAAA` si no sabes que tu VPS y su nginx responden por IPv6. Si existe y no responde, Let's Encrypt falla en el paso 5.
5. **(en tu computadora)** Comprueba que el subdominio ya apunta al VPS. Puede tardar de 5 a 30 minutos:

   ```bash
   dig +short depadmin.osspro.site     # debe imprimir TU_IP
   ```

   Si no tienes `dig`, usa `nslookup depadmin.osspro.site`.

---

## 2. Preparar el VPS

### 2.1 Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 nginx

Si ya lo tienes por tus otros experimentos, este paso solo lo comprueba:

```bash
sudo apt install -y nginx
systemctl status nginx --no-pager      # debe decir «active (running)»
```

### 2.3 Firewall

**Cuidado:** permite SSH antes de activar el firewall, o te quedarás fuera del VPS.

```bash
sudo ufw allow OpenSSH          # si tu SSH usa otro puerto: sudo ufw allow 2222/tcp
sudo ufw allow 'Nginx Full'     # 80 y 443
sudo ufw enable
sudo ufw status
```

Docker se salta `ufw` con los puertos que publica. Por eso el compose publica la app solo en `127.0.0.1`, donde únicamente el nginx del VPS la alcanza.

### 2.4 Docker

Si ya está instalado, comprueba que `docker compose version` diga v2 o posterior y pasa al 2.5. Si no, instálalo desde el repositorio oficial de Docker:

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world       # debe imprimir «Hello from Docker!»
```

### 2.5 El usuario `deploy` y sus carpetas

GitHub Actions entra al VPS como `deploy`. Ese usuario no tiene `sudo`, pero puede usar Docker:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 750 /opt/depadmin
sudo install -d -o deploy -g deploy -m 700 /var/backups/depadmin
```

Pertenecer al grupo `docker` equivale a ser root en el VPS. Por eso la llave de `deploy` es solo para GitHub Actions y no se usa para nada más.

---

## 3. La llave SSH de GitHub Actions

1. **(en tu computadora)** Crea una llave solo para los despliegues, sin frase de paso, porque la usa un robot:

   ```bash
   ssh-keygen -t ed25519 -C "github-actions-depadmin" -f ~/.ssh/depadmin_deploy -N ""
   cat ~/.ssh/depadmin_deploy.pub         # copia esta línea
   ```

2. En el VPS, autoriza esa llave para `deploy`. Pega la línea en lugar de `PEGA_AQUI`:

   ```bash
   sudo install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
   echo 'PEGA_AQUI' | sudo tee -a /home/deploy/.ssh/authorized_keys
   sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
   sudo chmod 600 /home/deploy/.ssh/authorized_keys
   ```

3. **(en tu computadora)** Prueba la llave. Debe mostrar una tabla vacía de contenedores, sin pedir contraseña:

   ```bash
   ssh -i ~/.ssh/depadmin_deploy deploy@TU_IP docker ps
   ```

   La primera vez SSH pregunta si confías en el servidor. Compara la huella que muestra con la del VPS (`sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) y responde `yes`.

4. **(en tu computadora)** Guarda la huella del servidor. Es lo que vas a pegar en `DEPLOY_KNOWN_HOSTS` en el paso 6:

   ```bash
   ssh-keyscan -t ed25519 TU_IP           # agrega -p 2222 si tu SSH usa otro puerto
   ```

---

## 4. Los secretos del VPS

**(como deploy)** Entra con `sudo -iu deploy` y crea el `.env` de la app. Las dos claves salen al azar y nunca se escriben a mano:

```bash
cd /opt/depadmin
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
DEPADMIN_IMAGE=ghcr.io/osspro/depadmin
DEPADMIN_TAG=latest
WEB_PORT=8063
EOF
chmod 600 .env
ss -ltn | grep 8063 || echo "el puerto 8063 está libre"
exit
```

- **Si el puerto 8063 está ocupado** por otro experimento, cambia `WEB_PORT` aquí y el `8063` del virtual host en el paso 5.
- **`POSTGRES_PASSWORD` se usa solo la primera vez**, cuando se crea la base. Cambiarla después en el `.env` no cambia la contraseña de la base.
- Respalda este `.env` en tu gestor de contraseñas.

---

## 5. El virtual host y el HTTPS

1. Crea el virtual host. Es el mismo contenido que `infra/nginx/depadmin.osspro.site.conf` del repositorio:

   ```bash
   sudo tee /etc/nginx/sites-available/depadmin.osspro.site > /dev/null <<'EOF'
   server {
       listen 80;
       listen [::]:80;
       server_name depadmin.osspro.site;

       location / {
           proxy_pass http://127.0.0.1:8063;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
           client_max_body_size 2m;
           proxy_read_timeout 60s;
       }
   }
   EOF
   sudo ln -s /etc/nginx/sites-available/depadmin.osspro.site /etc/nginx/sites-enabled/
   sudo nginx -t                    # debe decir «syntax is ok» y «test is successful»
   sudo systemctl reload nginx
   ```

2. Saca el certificado. Certbot pide un correo para avisos de vencimiento y que aceptes los términos de Let's Encrypt, y luego agrega solo el bloque HTTPS y la redirección desde HTTP:

   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d depadmin.osspro.site
   sudo certbot renew --dry-run     # comprueba que la renovación automática funcionará
   ```

3. Abre https://depadmin.osspro.site. El candado ya debe aparecer, junto con un **502 Bad Gateway**. Es normal: la app todavía no está corriendo.

---

## 6. GitHub y el primer despliegue

1. En GitHub, ve a **Settings → Secrets and variables → Actions** del repositorio y crea estos **secrets** (pestaña _Secrets_, botón _New repository secret_):

   | Nombre               | Valor                                                                                                  |
   | -------------------- | ------------------------------------------------------------------------------------------------------ |
   | `DEPLOY_HOST`        | `TU_IP`                                                                                                |
   | `DEPLOY_USER`        | `deploy`                                                                                               |
   | `DEPLOY_SSH_KEY`     | Todo el contenido de `~/.ssh/depadmin_deploy` (la privada, sin `.pub`), con sus líneas `BEGIN` y `END` |
   | `DEPLOY_KNOWN_HOSTS` | La línea que imprimió `ssh-keyscan` en el paso 3                                                       |

2. En la pestaña **Variables** de la misma pantalla, crea:

   | Nombre        | Valor                              |
   | ------------- | ---------------------------------- |
   | `APP_URL`     | `https://depadmin.osspro.site`     |
   | `DEPLOY_PORT` | Solo si tu SSH no usa el puerto 22 |
   | `DEPLOY_PATH` | Solo si no usaste `/opt/depadmin`  |

3. Lleva esta fase a `main`: el PR de la fase a `develop` y luego un PR de `develop` a `main`. Cuando CI pasa en `main`, el workflow **Deploy** corre solo. También puedes lanzarlo a mano en **Actions → Deploy → Run workflow**, sobre `main`.
4. **Las imágenes nacen privadas en GHCR**, así que el primer despliegue puede fallar en `docker compose pull` con `denied` o `unauthorized`. Para arreglarlo, hazlas públicas: en tu perfil de GitHub, **Packages → depadmin-api → Package settings → Change visibility → Public**, y lo mismo con `depadmin-web`. El código ya es público y las imágenes no llevan datos ni secretos. Después pulsa **Re-run failed jobs** en el workflow.

   Si prefieres dejarlas privadas, crea un token clásico con solo `read:packages` y, **(como deploy)**, corre `docker login ghcr.io -u OssprO`, usando el token como contraseña.

5. Cuando el workflow termina en verde, la app corre en el VPS, pero con la base vacía: nadie puede entrar todavía. El paso 7 carga los datos.

---

## 7. Cargar los datos (una sola vez)

Se copia tu base de desarrollo tal como está: el historial, la carga inicial, los movimientos desde agosto, los usuarios y la bitácora. **Antes de copiarla, borra de tu base local cualquier prueba que no deba llegar a producción.**

1. **(en tu computadora)** Desde la carpeta del repositorio, saca la copia y súbela:

   ```bash
   pnpm db:up
   docker exec depadmin-dev-db-1 pg_dump -U depadmin -d depadmin --format=custom > ~/depadmin-inicial.dump
   scp -i ~/.ssh/depadmin_deploy ~/depadmin-inicial.dump deploy@TU_IP:/opt/depadmin/
   ```

2. **(como deploy)** Reemplaza la base vacía por la copia:

   ```bash
   cd /opt/depadmin
   docker compose stop api web
   docker compose exec -T db dropdb -U depadmin depadmin
   docker compose exec -T db createdb -U depadmin depadmin
   docker compose exec -T db pg_restore -U depadmin -d depadmin --no-owner --exit-on-error < depadmin-inicial.dump
   docker compose exec -T db psql -U depadmin -d depadmin -c 'DELETE FROM refresh_token'
   docker compose up --detach --wait
   shred -u depadmin-inicial.dump
   ```

   - **El `DELETE`** cierra las sesiones que traía la copia.
   - **`shred`** borra el archivo, porque tiene datos de los vecinos.
   - Borra también `~/depadmin-inicial.dump` en tu computadora.

3. **Las contraseñas también vienen de desarrollo.** Entra como superadmin y, si la tuya era de prueba, cámbiala en **Más → Mi cuenta → Cambiar contraseña**.

---

## 8. Comprobar

- https://depadmin.osspro.site abre el login con candado.
- **(en tu computadora)**:

  ```bash
  curl -s https://depadmin.osspro.site/api/health                       # "status":"ok" y la versión, p. ej. "1.0.0"
  curl -s https://depadmin.osspro.site/api/health/ready                 # lo mismo, pero solo si la base responde (si no, 503)
  curl -sI https://depadmin.osspro.site | grep -iE 'strict-transport|content-security'
  ```

- Entra como superadmin y revisa el Libro y las Cuentas. El 301 debe deber $11,400.
- En el celular, abre el sitio en Chrome y elige **Agregar a la pantalla principal**.

---

## 9. Respaldos y avisos

Lo decide el [ADR-0030](adr/0030-operacion.md):

- **Cada noche** `backup.sh` saca una copia de la base y la guarda **cifrada** con `restic`, en el VPS y en Backblaze B2. Conserva 14 copias diarias, 8 semanales y 12 mensuales.
- **Antes de cada despliegue,** `deploy.sh` saca otra, solo en el VPS.
- **healthchecks.io** te escribe si el respaldo o un job de la app falla, o si no llega a tiempo. **UptimeRobot** te escribe si la app deja de responder.

Mientras `restic` no esté configurado, `backup.sh` saca un respaldo sin cifrar, como antes, y avisa que falta este paso.

### 9.1 Backblaze B2 (en tu navegador, una vez)

1. Crea una cuenta en [backblaze.com](https://www.backblaze.com/sign-up/cloud-storage) (B2 Cloud Storage). Los primeros 10 GB son gratis.
2. En **Buckets → Create a Bucket**, crea uno **privado** con un nombre único, por ejemplo `depadmin-respaldos-` y unas letras al azar. Deja _Object Lock_ apagado; el cifrado de B2 es opcional, porque `restic` ya cifra.
3. En ese bucket, **Lifecycle Settings → Keep only the last version of the file.** `restic` borra las copias viejas escondiéndolas, y sin esta regla seguirían ocupando espacio.
4. Anota su **Endpoint**, por ejemplo `s3.us-west-004.backblazeb2.com`.
5. En **Application Keys → Add a New Application Key**, crea una llave llamada `depadmin-restic`, solo para ese bucket, de lectura y escritura. Copia el `keyID` y el `applicationKey`: este último se muestra una sola vez.

### 9.2 healthchecks.io y UptimeRobot (en tu navegador, una vez)

1. Crea una cuenta en [healthchecks.io](https://healthchecks.io/) (plan gratis) y un proyecto `DepAdmin`. En **Settings → Ping key**, genera la llave. Tu URL es `https://hc-ping.com/TU_PING_KEY`. Los avisos van al correo de tu cuenta.
2. No crees las revisiones a mano: cada una aparece con su primer aviso (`backup`, `open-current-month`, `purge-expired-sessions` y `restore-test`), con un periodo de 1 día y 1 hora de gracia. Después de correr `./restore-test.sh` la primera vez, cambia **la de `restore-test`** a un periodo de **90 días** y 7 de gracia: así te recuerda probar la restauración cada tres meses.
3. Crea una cuenta en [UptimeRobot](https://uptimerobot.com/) (plan gratis) y un monitor **HTTP(s)** a `https://depadmin.osspro.site/api/health/ready`, cada 5 minutos, que avise a tu correo. Responde 503 si la base no contesta, y eso cuenta como caída.

### 9.3 Los secretos (como deploy)

Agrega al `.env` lo de los pasos anteriores. La contraseña de `restic` sale al azar:

```bash
cd /opt/depadmin
cat >> .env <<EOF
RESTIC_PASSWORD=$(openssl rand -base64 32)
RESTIC_REMOTE_REPOSITORY=s3:TU_ENDPOINT/TU_BUCKET/depadmin
B2_KEY_ID=TU_KEY_ID
B2_APPLICATION_KEY=TU_APPLICATION_KEY
HEALTHCHECKS_PING_URL=https://hc-ping.com/TU_PING_KEY
EOF
nano .env       # reemplaza los TU_… y revisa que no haya líneas repetidas
grep '^RESTIC_PASSWORD=' .env
```

**Copia `RESTIC_PASSWORD` a tu gestor de contraseñas, junto con las llaves de B2.** Si el VPS se pierde, sin esa contraseña nadie puede abrir los respaldos de B2, ni siquiera tú.

### 9.4 Crear los repositorios y probar (como deploy)

```bash
cd /opt/depadmin
./backup.sh init            # crea el repositorio del VPS y el de B2; una sola vez
./backup.sh                 # el respaldo de cada noche, ahora a mano
./backup.sh list            # las copias que hay en cada uno
./restore-test.sh           # restaura la última copia de B2 en una base aparte
docker compose up -d api    # la API toma HEALTHCHECKS_PING_URL
```

`restore-test.sh` termina con `restore-test: OK (movimientos …, usuarios …, bitácora …)`. La base de la app no se toca.

### 9.5 Cada noche, a las 3:30 (como deploy)

Si no lo tienes ya, programa el respaldo con `crontab -e`, a las 3:30 hora del VPS (`timedatectl` te dice cuál es):

```
30 3 * * * /opt/depadmin/backup.sh >> /var/backups/depadmin/backup.log 2>&1
```

Los `.dump` sin cifrar de antes de `restic` se borran solos a las dos semanas. Las copias que bajaste a tu computadora con `rsync` ya no hacen falta; bórralas con `shred -u`.

**Cada tres meses,** corre `./restore-test.sh`; healthchecks.io te lo recuerda. Para restaurar un respaldo de verdad, sigue [`OPERACION.md`](OPERACION.md).

---

## 10. El día a día

Los comandos de esta sección se corren **como deploy** dentro de `/opt/depadmin`, salvo que se diga otra cosa.

| Para                             | Haz                                                                                                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publicar una versión             | Llévala a `main`; el workflow Deploy hace lo demás. Su número sale de los commits (ADR-0027) y se ve en la app, en «Estado del sistema». `deploy.sh` saca un respaldo antes de las migraciones, y si la versión nueva no arranca sana regresa sola a la anterior (ADR-0029) |
| Ver si todo está bien            | `docker compose ps`                                                                                                                                                                                                                                                         |
| Ver los logs                     | `docker compose logs -f api` (o `web`, `db`, `migrate`); `docker compose logs --since 1h api`                                                                                                                                                                               |
| Volver a la versión anterior     | `./deploy.sh 1.0.2`, con una versión de **Releases** en GitHub. Si la versión nueva agregó una migración que la anterior no entiende, restaura además el respaldo que `deploy.sh` sacó justo antes de desplegarla (`OPERACION.md`)                                          |
| Un PR de Dependabot              | Llegan a `develop`, también los de seguridad. Si CI pasa, fusiónalo: llega a producción con el siguiente `develop → main` (si es de seguridad, ábrelo en seguida). Si CI falló por algo que ya se arregló en `develop`, comenta `@dependabot rebase` en el PR               |
| Actualizar Postgres              | Solo dentro de la misma versión mayor (18.x), a propósito: `./backup.sh`, luego `docker compose pull db` y `docker compose up -d --wait db`. Los despliegues no la tocan. Cambiar de versión mayor requiere respaldar y restaurar                                           |
| Ver los respaldos                | `./backup.sh list`; el último resultado está en `tail /var/backups/depadmin/backup.log`                                                                                                                                                                                     |
| Probar que se pueden restaurar   | `./restore-test.sh`, cada tres meses                                                                                                                                                                                                                                        |
| Ver los errores de los celulares | `docker compose logs --since 24h api \| grep BrowserError`: lo que falló en el navegador de un vecino, sin datos personales                                                                                                                                                 |
| Reiniciar la API                 | `docker compose restart api`                                                                                                                                                                                                                                                |
| Cerrar todas las sesiones        | Cambia `JWT_SECRET` en `.env` y corre `docker compose up -d`                                                                                                                                                                                                                |
| Actualizar Ubuntu                | Con tu usuario: `sudo apt update && sudo apt upgrade -y`. Ubuntu ya instala solo los parches de seguridad (`unattended-upgrades`)                                                                                                                                           |
| Renovar el certificado           | Nada: el temporizador de certbot lo renueva (`systemctl list-timers \| grep certbot`)                                                                                                                                                                                       |

---

## 11. Si algo falla

| Síntoma                                                | Causa probable y solución                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Certbot falla al validar                               | El DNS todavía no apunta al VPS (`dig`), hay un `AAAA` que no responde, o el puerto 80 está cerrado en `ufw` o en el panel del proveedor                       |
| **502 Bad Gateway**                                    | Los contenedores no están arriba (`docker compose ps`), o `WEB_PORT` del `.env` no coincide con el `proxy_pass` del virtual host                               |
| Deploy: `Permission denied (publickey)`                | `DEPLOY_SSH_KEY` o `DEPLOY_USER` están mal, o la llave pública no quedó en `/home/deploy/.ssh/authorized_keys`                                                 |
| Deploy: `Host key verification failed`                 | `DEPLOY_KNOWN_HOSTS` no corresponde al VPS: repite el `ssh-keyscan` del paso 3                                                                                 |
| Deploy: `denied` al bajar las imágenes                 | Los paquetes de GHCR son privados (paso 6.4)                                                                                                                   |
| Deploy: `dependency failed to start` o `migrate` falla | `docker compose logs migrate` dice qué migración falló. `deploy.sh` ya regresó a la versión anterior; su salida en el workflow trae los últimos logs           |
| Deploy: `could not pull`                               | GHCR no respondió en 10 minutos, o la versión no existe. La versión anterior sigue corriendo; vuelve a lanzar el workflow                                      |
| «Demasiados intentos» para todos a la vez              | El virtual host no envía `X-Forwarded-For` (paso 5), y la API cuenta a todos como una sola IP                                                                  |
| El VPS se queda sin disco                              | `docker system df`; `docker image prune -a` borra las imágenes que ningún contenedor usa. Los logs de los contenedores ya tienen tope (30 MB por servicio)     |
| Correo de healthchecks.io: `backup` falló              | Dice en qué paso (`failed at: copying to B2`). La copia del VPS ya está; revisa las llaves de B2 en el `.env` y corre `./backup.sh` a mano. Ver `OPERACION.md` |
| Correo de healthchecks.io: `backup` no llegó           | El cron no corrió: revisa `crontab -l` y `tail /var/backups/depadmin/backup.log`                                                                               |
| Correo de healthchecks.io: `open-current-month`        | La API no abrió el mes. Ábrelo desde la app como superadmin y revisa `docker compose logs api`                                                                 |
| Correo de UptimeRobot                                  | La app no responde. Sigue «La app no abre» en `OPERACION.md`                                                                                                   |
