# Plan de trabajo — Etapa 2

**Versión:** 1.0 (borrador para aprobar) · **Fecha:** 2026-10-14 · **Base:** `docs/PLAN.md` v2.1

La Etapa 1 dejó la plataforma completa en local; solo falta publicarla (fase 5). Esta etapa agrega lo que pidió el administrador del sistema después de usarla: el historial completo del edificio, más tipos de usuario, pantallas para tableta y escritorio, herramientas, recuperación de contraseña, avisos por WhatsApp y una guía para los dueños.

El modo de trabajo no cambia: una fase por PR, con el porqué de cada decisión, pruebas y aprobación antes de seguir. La numeración continúa la de `docs/PLAN.md`.

---

## 1. Resumen y orden propuesto

| Fase | Qué                                               | Por qué en este lugar                                                                                             |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 12   | Historial del edificio (mayo 2022 – julio 2026)   | Los documentos ya están transcritos, y revisarlos contra el papel lleva tiempo                                    |
| 13   | Usuarios de solo lectura, inquilinos y temporales | Cambia el modelo de usuarios y permisos; conviene hacerlo antes de rediseñar pantallas                            |
| 14   | Diseño para tableta y escritorio                  | Toca todas las pantallas; se hace una vez que el contenido (historial, usuarios) ya está                          |
| 15   | Herramientas: contador de efectivo                | Pequeña e independiente; estrena la sección _Herramientas_ ya con el diseño nuevo                                 |
| 16   | Archivo de documentos                             | Guarda los PDF y fotos originales; necesita almacenamiento en disco y respaldos, igual que el despliegue          |
| 5    | Despliegue (de la Etapa 1)                        | Requisito para WhatsApp y para que los dueños usen la app; necesita el dominio                                    |
| 17   | WhatsApp: recuperación de contraseña y libros     | Necesita la app publicada en HTTPS y un número de WhatsApp Business                                               |
| 18   | Guía de usuario para los dueños                   | Al final, cuando las pantallas ya no cambien; las capturas se generan con Playwright para que no se queden viejas |

Las fases 13, 14 y 15 no dependen entre sí y se pueden reordenar. La 17 depende de la 5.

---

## 2. Fases

### Fase 12: Historial del edificio

El detalle está en el ADR-0022. Se divide en dos PR: **12a** (importar y revisar) y **12b** (verificar y publicar).

**Fuente.** Los 7 PDF «Balance Correspondencia 63» y las 55 fotos de `Documents/` se transcribieron en `Documents/importacion/`, fuera del repositorio porque traen nombres y pagos de los vecinos:

- `transcripcion.txt`: cada hoja tal como está en el papel, mes por mes.
- `generar.py`: produce `historial.json` (lo que se sube) y `movimientos.csv` (para revisar en una hoja de cálculo), y comprueba que cada hoja cuadre con sus propios totales.
- `deptos.json`: propietarios según el rol 2026-2028.

**Resultado de la transcripción:** 51 meses (mayo 2022 – julio 2026), 51 hojas y 1,186 movimientos: 315 pagos de deptos, 197 semanas de basura, 553 visitas de limpieza, 120 otros egresos y un ajuste de ingreso. Cada hoja cuadra al centavo con sus propios totales. Lo que el papel tiene mal entró como ajuste explicado (sección 4). Los meses sin papel quedan vacíos.

**Decisiones (respuestas del 2026-10-14):**

1. **El historial va aparte de los libros, y el corte queda fijo.** Agosto 2026 abre con el efectivo que captura el superadmin, quien también captura toda la carga inicial. Corregir el historial no mueve los libros: la pantalla solo muestra cuánto difiere su cierre del efectivo de agosto.
2. **Los meses pasados quedan abiertos para revisarlos a mano.** Mientras están en revisión nada va a la bitácora, que empieza con los libros en agosto 2026. Verificar el historial sí queda registrado y lo congela (12b).
3. **Solo el superadmin ve y corrige el historial** mientras está en revisión.
4. **Los meses sin hoja entran vacíos:** el papel existe y se captura cuando aparezca.
5. **Las cuentas por depto no se reconstruyen.** Al calcularlas desde 2022 salen $23,900 arriba del papel, por los meses faltantes, la administración pagada fuera de la caja y el cambio de cuota a mitad de febrero 2023. Los meses pasados conservan las observaciones del papel por depto.

**Fase 12a (este PR):**

- Módulo `history` con tablas propias: el periodo, las hojas (cifras del papel, alertas y observaciones por depto) y los renglones, con las mismas reglas que los del libro.
- _Administración → Historial_:
  - Importar con vista previa: meses, hojas, movimientos, meses sin hoja, meses que no cuadran y nombres.
  - Lista de meses con su estado frente al papel («Cuadra», «Faltan $x», «Sin hoja»).
  - Cómo se une con agosto 2026.
  - Descartar para importar de nuevo.
- Detalle de cada mes:
  - Sus cifras contra el papel, con dos diferencias: la propia del mes y la que arrastra de meses anteriores.
  - Sus hojas, con alertas y observaciones.
  - Sus movimientos.
  - Agregar, corregir y borrar renglones y hojas.
- Los libros empiezan después del historial (puerto `HISTORY_BOUNDARY`).
- La semana de basura que empezó antes de los libros (la del 27 de julio, en agosto 2026) ya no se sugiere como pendiente.
- La importación aplica los nombres del rol 2026-2028, con registro en la bitácora porque son datos vigentes.

**Fase 12b:**

- «Verificar el historial»: queda en la bitácora y congela los meses.
- Una vez verificado, todos ven los meses pasados en el _Histórico_, con su libro de solo lectura.
- El PDF de un mes pasado, con las observaciones del papel en lugar del estado de cuenta.

**Conceptos:** migración de datos con vista previa, modelos separados para la misma idea (historia frente a libros), reconciliación contra una fuente externa.

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

**Hojas que faltan.** El papel existe y el superadmin lo captura en la revisión. Mientras tanto esos meses (o sus egresos) quedan vacíos, y la diferencia se ve en la revisión:

| Mes                | Qué falta                                             | Diferencia con el papel      |
| ------------------ | ----------------------------------------------------- | ---------------------------- |
| Octubre 2022       | La hoja completa                                      | +$3,054.00                   |
| Diciembre 2022     | La hoja completa                                      | −$3,232.00                   |
| Marzo 2025         | La segunda hoja (otros egresos y totales)             | −$42,520.17 en otros egresos |
| Abril 2025         | La segunda hoja (egresos)                             | −$3,578.00                   |
| Mayo 2025          | La segunda hoja (egresos)                             | −$3,953.00                   |
| Junio 2025         | La segunda hoja (egresos)                             | −$3,889.00                   |
| Julio 2025         | La segunda hoja (egresos)                             | −$6,851.50                   |
| Febrero 2026       | La hoja completa                                      | +$6,509.00                   |
| Antes de mayo 2022 | ¿Existen hojas anteriores? Mayo 2022 abre con $712.25 | —                            |

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

| #   | Pregunta                                                                   | Valor por defecto                                                                                    | Fase |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 11  | ¿Cómo entra el historial?                                                  | **Respondida:** aparte de los libros, en revisión y sin bitácora; el corte de agosto 2026 queda fijo | 12   |
| 12  | ¿Aparecen las hojas que faltan (sección 4)?                                | **Respondida:** existen y el superadmin las captura; esos meses entran vacíos                        | 12   |
| 13  | ¿La carga inicial de agosto 2026 sale del balance de julio 2026?           | **Respondida:** el superadmin la captura toda                                                        | 12   |
| 14  | ¿Un usuario de solo lectura ve todo, como un dueño, o solo lo de su depto? | Ve todo (transparencia total, como los dueños)                                                       | 13   |
| 15  | ¿El contador de efectivo incluye monedas de 20¢ y 10¢?                     | **Respondida:** no; llega hasta 50¢                                                                  | 15   |
| 16  | ¿Los vecinos tienen correo, o WhatsApp es el único canal realista?         | WhatsApp como canal principal; el superadmin como respaldo                                           | 17   |
| 17  | ¿Quién pone el número de WhatsApp Business y la cuenta de Meta?            | El superadmin, con un chip dedicado                                                                  | 17   |
