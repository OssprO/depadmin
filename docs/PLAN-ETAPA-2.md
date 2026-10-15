# Plan de trabajo — Etapa 2

**Versión:** 1.0 (borrador para aprobar) · **Fecha:** 2026-10-14 · **Base:** `docs/PLAN.md` v2.1

La Etapa 1 dejó la plataforma completa en local; solo falta publicarla (fase 5). Esta etapa agrega lo que pidió el administrador del sistema después de usarla: el historial completo del edificio, más tipos de usuario, pantallas para tableta y escritorio, herramientas, recuperación de contraseña, avisos por WhatsApp y una guía para los dueños.

El modo de trabajo no cambia: una fase por PR, con el porqué de cada decisión, pruebas y aprobación antes de seguir. La numeración continúa la de `docs/PLAN.md`.

---

## 1. Resumen y orden propuesto

| Fase | Qué                                               | Por qué en este lugar                                                                                               |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 12   | Historial del edificio (mayo 2022 – julio 2026)   | La captura a mano empieza en agosto 2026; el historial tiene que entrar antes, porque mueve el inicio de los libros |
| 13   | Usuarios de solo lectura, inquilinos y temporales | Cambia el modelo de usuarios y permisos; conviene hacerlo antes de rediseñar pantallas                              |
| 14   | Diseño para tableta y escritorio                  | Toca todas las pantallas; se hace una vez que el contenido (historial, usuarios) ya está                            |
| 15   | Herramientas: contador de efectivo                | Pequeña e independiente; estrena la sección _Herramientas_ ya con el diseño nuevo                                   |
| 16   | Archivo de documentos                             | Guarda los PDF y fotos originales; necesita almacenamiento en disco y respaldos, igual que el despliegue            |
| 5    | Despliegue (de la Etapa 1)                        | Requisito para WhatsApp y para que los dueños usen la app; necesita el dominio                                      |
| 17   | WhatsApp: recuperación de contraseña y libros     | Necesita la app publicada en HTTPS y un número de WhatsApp Business                                                 |
| 18   | Guía de usuario para los dueños                   | Al final, cuando las pantallas ya no cambien; las capturas se generan con Playwright para que no se queden viejas   |

Las fases 13, 14 y 15 no dependen entre sí y se pueden reordenar. La 17 depende de la 5.

---

## 2. Fases

### Fase 12: Historial del edificio

**Fuente.** Los 7 PDF «Balance Correspondencia 63» y las 55 fotos de `Documents/` se transcribieron en `Documents/importacion/` (fuera del repositorio, porque traen nombres y pagos de los vecinos):

- `transcripcion.txt`: cada hoja tal como está en el papel, mes por mes.
- `generar.py`: produce `historial.json` (lo que leerá la plataforma) y `movimientos.csv` (para revisar en una hoja de cálculo), y comprueba la aritmética de cada hoja y que cada mes abra con el saldo con que cerró el anterior.
- `deptos.json` (propietarios según el rol 2026-2028), `tarifas.json` y `penalizaciones.json` (las que el papel documenta).

**Resultado de la transcripción:** 51 meses (mayo 2022 – julio 2026) en 54 hojas, con 1,194 movimientos: 315 pagos de deptos, 197 semanas de basura, 553 visitas de limpieza y 126 otros egresos. Todas las hojas cuadran al centavo con sus propios totales. Lo que no cuadraba se registró como un ajuste explícito con su explicación (sección 4).

**Decisión de diseño: el historial entra a la caja, las cuentas por depto empiezan en el corte.**

Se probó reconstruir el adeudo de cada depto desde mayo 2022 (cuotas y penalizaciones contra pagos). La suma sale $23,900 arriba de lo que dice el papel de julio 2026, y ningún depto coincide. Las causas son conocidas: faltan tres meses completos (sus pagos no se saben), en 2022 se pagaban $100 de administración fuera de la caja, y en febrero 2023 la cuota cambió a mitad de mes. Si las cuentas se calcularan desde 2022, la plataforma diría que casi todos deben, y eso es falso.

Por eso:

1. **Caja (libro del mes):** los 51 meses entran como meses **cerrados** con todos sus renglones y su foto (saldo inicial, ingresos, egresos, saldo final). El _Histórico_, el libro de cada mes y su PDF funcionan igual que en un mes capturado. Cada mes guarda de qué hoja salió.
2. **Cuentas por depto:** siguen empezando en el corte (agosto 2026), con la carga inicial de la fase 11a tomada del balance de julio 2026. Los pagos anteriores al corte quedan en la caja, pero no se usan para calcular adeudos.
3. **Observaciones del papel:** en un mes importado, la sección de deptos del PDF y del libro muestra lo que decía el papel («ADEUDA JULIO», «PAGÓ EN JUNIO»…) en lugar de un estado de cuenta calculado.
4. **Turnos:** el calendario solo se calcula desde agosto 2026. Antes de eso la rotación fue distinta (por ejemplo, 202 llevó abril–mayo 2024, y el cálculo hacia atrás diría 201), así que los meses importados no muestran responsable calculado. Las penalizaciones históricas quedan como texto del papel.
5. **Inicio de la contabilidad:** pasa a mayo 2022 con $712.25 en caja. El primer mes que se captura a mano es agosto 2026; abre con el saldo final de julio 2026 ($18,247.02).

**Cómo se sube:** _Administración → Importar historial_, solo el superadmin.

1. Se elige `historial.json`.
2. La plataforma muestra una vista previa sin guardar nada: meses, totales por mes, alertas y el resultado de las mismas comprobaciones de `generar.py`.
3. Al confirmar, todo entra en una sola transacción, a nombre del superadmin, con su registro en la bitácora. Si algo falla, no entra nada.
4. Solo se puede importar mientras no haya meses capturados a mano (o antes del primero).

**Backend:** un módulo nuevo `history-import` con su caso de uso, que crea los meses a través de `reports` y `cashbook` (sin cobrar cuotas al abrirlos), marca el inicio de la facturación en el corte, y valida el archivo con un esquema Zod compartido. También aplica los nombres de propietario (`PUT /api/units/:number/owner` ya existe).

**Conceptos:** migración de datos con vista previa, idempotencia, separar la historia de caja de la de cuentas.

### Fase 13: Usuarios de solo lectura, inquilinos y temporales

Hoy hay un usuario por depto (su dueño) más el superadmin (pregunta 10 de la Etapa 1).

- **Tipos de usuario:**
  - _Dueño_ (como hoy): uno por depto, escribe cuando su depto está en turno.
  - _Solo lectura_: ve todo lo que ve un dueño (transparencia total) y no puede escribir nunca. Puede estar ligado a un depto (un inquilino o un familiar) o a ninguno (por ejemplo, un contador).
  - _Temporal_: cualquier usuario puede tener fecha de vencimiento. Al vencer ya no entra, y sus sesiones se cierran solas.
- Varios usuarios por depto: el dueño y sus inquilinos o familiares.
- Solo el superadmin crea, edita, desactiva y reactiva usuarios, y cada cambio va a la bitácora.
- La regla de escritura sigue en `WriteAccessPolicy`: un usuario de solo lectura nunca pasa, sin importar el turno.
- La lista de usuarios (_Administración → Usuarios_) muestra el tipo, el depto y el vencimiento.

**Conceptos:** roles frente a permisos derivados, expiración de credenciales.

### Fase 14: Diseño para tableta y escritorio

Hoy la app está pensada para el celular (barra inferior y hojas que suben desde abajo).

- **Tableta (≥ 768 px):** barra lateral compacta con íconos y nombres, contenido a dos columnas donde ayuda (libro y resumen del mes lado a lado), formularios en un panel lateral en lugar de la hoja inferior.
- **Escritorio (≥ 1024 px):** barra lateral fija, tablas con más columnas (estados de cuenta, histórico, bitácora), el libro del mes con el resumen fijo a un lado, y atajos de teclado para capturar.
- Un solo código: los mismos componentes con puntos de quiebre de Tailwind, sin una app aparte.
- Las pruebas de navegador corren en tres tamaños (Pixel 7, iPad y escritorio), con axe en cada uno.

**Conceptos:** diseño adaptable, puntos de quiebre, navegación por tamaño de pantalla.

### Fase 15: Herramientas: contador de efectivo

Nueva sección _Herramientas_ en el menú. La primera es el contador de efectivo:

- Una fila por denominación vigente en México: a la izquierda la denominación y a la derecha un campo numérico con la cantidad de piezas, y el subtotal de la fila.
  - Billetes: $1,000, $500, $200, $100, $50 y $20.
  - Monedas: $20, $10, $5, $2, $1 y 50¢.
- Debajo de todo, el total. Se recalcula al escribir, sin botones.
- Botón «Limpiar» que regresa todo a cero.
- Es solo una utilidad: no guarda nada ni toca el libro. Funciona sin conexión.
- Campos grandes y teclado numérico en el celular; el cálculo se hace en centavos, como el resto de la app.

**Conceptos:** estado local de formulario, componentes accesibles para captura rápida.

### Fase 16: Archivo de documentos

- Sección _Documentos_: los PDF y fotos originales de los balances, el reglamento interno y el rol de administración, para verlos y descargarlos.
- El superadmin sube, renombra y borra; todos los demás ven y descargan.
- Cada mes importado (fase 12) enlaza a la hoja de donde salió.
- Los archivos se guardan en el disco del servidor, fuera de la base, y entran en los respaldos (fase 5). Límite de tamaño y solo PDF, JPG y PNG.

**Conceptos:** almacenamiento de archivos, descargas autenticadas, respaldos.

### Fase 5: Despliegue

Sin cambios respecto a `docs/PLAN.md`, más los pendientes de `docs/SEGURIDAD.md`. Necesita el dominio.

### Fase 17: WhatsApp: recuperación de contraseña y libros mensuales

Ver la sección 3. En resumen:

- Teléfono de WhatsApp por usuario, con su consentimiento para recibir mensajes.
- «Olvidé mi contraseña» en el login: llega un código de 6 dígitos por WhatsApp, válido 10 minutos y de un solo uso.
- Al cerrar un mes, el PDF le llega por WhatsApp a quien aceptó recibirlo.
- Los mensajes salen por un puerto `MessageSender`; WhatsApp es un adaptador, así que se puede cambiar por correo sin tocar el dominio.

**Conceptos:** integración con un proveedor externo, plantillas de mensajes, códigos de un solo uso.

### Fase 18: Guía de usuario para los dueños

- Clara, breve y pensada para personas mayores de 60 años: letra grande, una tarea por página, pasos numerados, una captura por paso, sin palabras técnicas.
- Temas: entrar y cambiar la contraseña, instalar la app en el celular, ver el balance del mes y su PDF, ver el estado de cuenta, y qué hacer cuando le toca el turno (capturar pagos, basura y limpieza, y cerrar el mes).
- Se entrega como PDF para compartir por WhatsApp y como sección _Ayuda_ dentro de la app.
- Las capturas las toma Playwright con datos de ejemplo, así que se regeneran cuando cambie una pantalla.

---

## 3. Investigación: recuperar la contraseña y WhatsApp

**Lo que hay hoy:** cada quien cambia su contraseña, y si alguien la olvida, el superadmin le genera una temporal que debe cambiar al entrar. Funciona, pero depende de una sola persona.

**Opciones:**

| Opción                                    | Ventajas                                                                                   | Desventajas                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Solo el superadmin (actual)               | Sin costo ni servicios externos                                                            | Depende de una persona                                                                                                          |
| Correo con enlace de un solo uso          | Gratis con un proveedor como Resend o el SMTP de Gmail para este volumen                   | Varios dueños casi no usan correo; los mensajes pueden caer en spam                                                             |
| Código por WhatsApp (API oficial de Meta) | Es donde ya están todos los vecinos; el mismo canal sirve para mandar el libro de cada mes | Requiere una cuenta de Meta Business, un número propio que no esté en la app normal de WhatsApp y plantillas aprobadas por Meta |
| WhatsApp con librerías no oficiales       | Sin trámites                                                                               | Violan los términos de WhatsApp y Meta bloquea el número; **descartado**                                                        |

**Costo de WhatsApp:** Meta cobra por mensaje de plantilla, según el país del destinatario y el tipo (autenticación, utilidad o marketing). Los mensajes de utilidad son gratis si van dentro de las 24 horas después de que la persona escribió. Para este edificio serían unos 15 libros al mes y pocos códigos al año: centavos de dólar al mes. Las tarifas exactas de México hay que confirmarlas en la tabla oficial de Meta antes de contratar, porque cambiaron en julio 2025 y en enero 2026 y las fuentes no oficiales no coinciden.

**Requisitos prácticos:**

1. Una cuenta de Meta Business (portafolio comercial) y una app en developers.facebook.com.
2. Un número de teléfono dedicado (puede ser un chip prepago) que no tenga WhatsApp normal.
3. Dos plantillas aprobadas por Meta: el código de acceso (categoría autenticación) y el aviso del libro con el PDF adjunto (categoría utilidad).
4. La app publicada (fase 5): el envío sale del servidor hacia la API de Meta, y las claves viven ahí.
5. Consentimiento de cada vecino para recibir mensajes, guardado en la plataforma.

**Recomendación:** sí conviene, pero después del despliegue. WhatsApp resuelve dos cosas con un solo trámite (la recuperación de contraseña y el envío del libro), y es el canal que los dueños ya usan. Se integra detrás de un puerto, así que si Meta pone trabas se cambia por correo sin tocar el resto. Mientras tanto, la recuperación por el superadmin sigue funcionando. El botón «Compartir» del libro (que abre WhatsApp desde el celular) se queda.

Fuentes: [precios de la plataforma de WhatsApp Business (Meta)](https://developers.facebook.com/docs/whatsapp/pricing), [actualizaciones de precios (Meta)](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing).

---

## 4. Lo que falta o no cuadra en el historial

**Hojas que faltan.** Hoy entran como un ajuste por la diferencia de saldos. Si aparecen, se sustituyen por sus renglones reales:

| Mes                | Qué falta                                             | Diferencia que cubre el ajuste |
| ------------------ | ----------------------------------------------------- | ------------------------------ |
| Octubre 2022       | La hoja completa                                      | +$3,054.00                     |
| Diciembre 2022     | La hoja completa                                      | −$3,232.00                     |
| Marzo 2025         | La segunda hoja (otros egresos y totales)             | −$42,520.17 en otros egresos   |
| Abril 2025         | La segunda hoja (egresos)                             | −$3,578.00                     |
| Mayo 2025          | La segunda hoja (egresos)                             | −$3,953.00                     |
| Junio 2025         | La segunda hoja (egresos)                             | −$3,889.00                     |
| Julio 2025         | La segunda hoja (egresos)                             | −$6,851.50                     |
| Febrero 2026       | La hoja completa                                      | +$6,509.00                     |
| Antes de mayo 2022 | ¿Existen hojas anteriores? Mayo 2022 abre con $712.25 | —                              |

**Errores del papel.** Se conservan los saldos del papel con un ajuste explicado, para que todos los meses siguientes coincidan con las hojas que ya circularon:

- Febrero 2024: error de suma de $270 (los ingresos totales dicen $24,742.50 en vez de $24,472.50).
- Julio 2023 (hoja al día 10): error de resta de $50.
- Agosto 2023: los otros egresos suman $1 menos que su total.
- Marzo 2023 y septiembre 2023: redondeos de $0.05 y $0.30.

**Para revisar:**

- Enero 2025: el PDF y la hoja impresa difieren en $270 de limpieza; se usó la impresa porque es la que coincide con febrero.
- Julio 2023: la limpieza del día 10 aparece en las dos hojas del mes.
- Diciembre 2025: la segunda hoja dice que 202 debe diciembre, y la primera registra que lo pagó.
- Abril y junio 2026: dos renglones ($74 y $359) dicen «Nuevo UPS para las cámaras», que parece copiado de julio.
- Penalización de 302 en 2023: el papel registra $1,000 «por no llevar la administración», pero no dice de qué meses.
- Semanas de basura que no aparecen pagadas: 20 de noviembre 2023, 28 de julio 2025 (pudo pagarse en la hoja de julio que falta) y 22 de junio 2026.

---

## 5. Preguntas abiertas

Cada una tiene un valor por defecto para no bloquear el avance.

| #   | Pregunta                                                                                  | Valor por defecto                                                                      | Fase |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| 11  | ¿Apruebas el diseño de la fase 12 (caja desde 2022, cuentas por depto desde agosto 2026)? | Sí                                                                                     | 12   |
| 12  | ¿Aparecen las hojas que faltan (sección 4)?                                               | Se importan los ajustes; cuando aparezcan, se reemplazan                               | 12   |
| 13  | ¿La carga inicial de agosto 2026 sale del balance de julio 2026?                          | Sí: 202 debe junio y julio, 301 debe $9,300, 302 debe junio y julio; los demás en cero | 12   |
| 14  | ¿Un usuario de solo lectura ve todo, como un dueño, o solo lo de su depto?                | Ve todo (transparencia total, como los dueños)                                         | 13   |
| 15  | ¿El contador de efectivo incluye monedas de 20¢ y 10¢?                                    | No; llega hasta 50¢                                                                    | 15   |
| 16  | ¿Los vecinos tienen correo, o WhatsApp es el único canal realista?                        | WhatsApp como canal principal; el superadmin como respaldo                             | 17   |
| 17  | ¿Quién pone el número de WhatsApp Business y la cuenta de Meta?                           | El superadmin, con un chip dedicado                                                    | 17   |
