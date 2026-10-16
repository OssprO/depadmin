# Plan de trabajo — Etapa 2

**Versión:** 1.0 (borrador para aprobar) · **Fecha:** 2026-10-14 · **Base:** `docs/PLAN.md` v2.1

La Etapa 1 dejó la plataforma completa en local; solo falta publicarla (fase 5). Esta etapa agrega lo que pidió el administrador del sistema después de usarla: el historial completo del edificio, más tipos de usuario, pantallas para tableta y escritorio, herramientas, recuperación de contraseña, avisos por WhatsApp y una guía para los dueños.

El modo de trabajo no cambia: una fase por PR, con el porqué de cada decisión, pruebas y aprobación antes de seguir. La numeración continúa la de `docs/PLAN.md`.

---

## 1. Resumen y orden propuesto

| Fase | Qué                                                      | Por qué en este lugar                                                                                             |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 12   | Historial del edificio (mayo 2022 – julio 2026)          | Los documentos ya están transcritos, y revisarlos contra el papel lleva tiempo                                    |
| 13   | Captura y diseño (13a celular, 13b tableta y escritorio) | Prioridad del administrador al probarla: capturar como en el papel y una app más fácil de usar                    |
| 14   | Usuarios de solo lectura, inquilinos y temporales        | Cambia el modelo de usuarios y permisos; usa ya el diseño nuevo                                                   |
| 15   | Herramientas: contador de efectivo                       | Pequeña e independiente; estrena la sección _Herramientas_ ya con el diseño nuevo                                 |
| 16   | Archivo de documentos                                    | Guarda los PDF y fotos originales; necesita almacenamiento en disco y respaldos, igual que el despliegue          |
| 5    | Despliegue (de la Etapa 1)                               | Requisito para WhatsApp y para que los dueños usen la app; necesita el dominio                                    |
| 17   | WhatsApp: recuperación de contraseña y libros            | Necesita la app publicada en HTTPS y un número de WhatsApp Business                                               |
| 18   | Guía de usuario para los dueños                          | Al final, cuando las pantallas ya no cambien; las capturas se generan con Playwright para que no se queden viejas |

Las fases 14 y 15 no dependen entre sí y se pueden reordenar. La 17 depende de la 5.

---

## 2. Fases

### Fase 12: Historial del edificio

El detalle está en el ADR-0023, que reemplaza al ADR-0022. La fase 12a guardó el historial aparte; al probarla, el superadmin pidió que fuera parte de los mismos libros, y la 12b lo rehízo así.

**Fuente.** Los 7 PDF «Balance Correspondencia 63» y las 55 fotos de `Documents/` se transcribieron en `Documents/importacion/`, fuera del repositorio porque traen nombres y pagos de los vecinos:

- `transcripcion.txt`: cada hoja tal como está en el papel, mes por mes: sus renglones, la línea de cada depto (propietario, reparto entre «mes en curso» y «adeudos/adelantos», observaciones) y el «Responsable» cuando la hoja lo dice.
- `generar.py`: produce `historial.json` (formato 2, lo que se sube) y `movimientos.csv` (para revisar en una hoja de cálculo), y comprueba que cada hoja cuadre con sus propios totales.
- `deptos.json`: propietarios según el rol 2026-2028.

**Resultado de la transcripción:** 51 meses (mayo 2022 – julio 2026), 51 hojas y 1,186 movimientos: 315 pagos de deptos, 197 semanas de basura, 553 visitas de limpieza, 120 otros egresos y un ajuste de ingreso. Cada hoja cuadra al centavo con sus propios totales. Lo que el papel tiene mal entró como ajuste explicado (sección 4). Los meses sin papel quedan vacíos.

**Decisiones (respuestas del 2026-10-14 y del 2026-10-15):**

1. **Un solo libro desde mayo 2022.** El historial son meses normales del Libro, con todos sus renglones, abiertos para revisarlos y capturar lo que falte. Agosto 2026 abre con el cierre de julio.
2. **Antes del corte (agosto 2026) no hay cuotas, cuentas, turnos ni bitácora de renglones.** La bitácora registra cerrar y reabrir esos meses: cerrar un mes del historial es darlo por revisado, y reabrirlo para capturar una hoja que aparezca después queda registrado.
3. **Las cuentas por depto empiezan en el corte.** Al calcularlas desde 2022 salen $23,900 arriba del papel (meses faltantes, administración pagada fuera de la caja, cambio de cuota a mitad de febrero 2023). Lo que cada depto debía en agosto 2026 es la carga inicial, que captura el superadmin.
4. **El PDF de un mes del historial reproduce sus hojas:** una por hoja, con la línea de cada depto como la escribió el papel.
5. **Los meses sin hoja entran vacíos:** el papel existe y se captura cuando aparezca.

**Fase 12a (PR #13, ya en `develop`):** importación con vista previa, revisión de cada mes contra su papel, ajuste de la semana de basura anterior a los libros y respuesta 413 a un cuerpo demasiado grande.

**Fase 12b (este PR):**

- El inicio de los libros guarda su mes de corte. La importación arranca los libros con el historial, sus tarifas y sus renglones, y deja abiertos todos sus meses.
- Las hojas de papel guardan su línea por depto, su «Responsable» y los renglones que listan.
- Cada mes del historial se revisa en el Libro, con la tarjeta «Hoja de papel» (cifras contra el papel, alertas, línea por depto, corregir y agregar hojas).
- _Administración → Historial_ importa el archivo y lista los meses contra su papel, con enlace al Libro de cada uno.
- PDF de los meses del historial como su papel.
- El Histórico marca los meses del historial.

**Lo que sigue en esta fase, a mano:** revisar y cerrar los meses del historial hasta julio 2026 antes de cerrar agosto, y capturar las hojas que falten (sección 4).

**Conceptos:** migración de datos con vista previa, un modelo con dos regímenes (historia y libros en vivo) separados por una fecha de corte, reconciliación contra una fuente externa.

### Fase 13: Captura y diseño

Lo pidió el administrador al probar la plataforma con el historial: capturar un mes debe sustituir por completo lo que hoy hace el administrador en turno (anotar y luego pasarlo a un documento), y la app debe ser más fácil de usar. Detalle en el ADR-0024.

**13a: Captura y apariencia (este PR):**

- **«Agregar movimiento»:** los tipos van en dos grupos, _Ingresos_ (pago de depto, otro ingreso) y _Egresos_ (basura, limpieza, otro egreso). Los ingresos llevan **Observaciones** y los egresos **Descripción**.
- **Observaciones en el reporte:** las de los pagos de un depto salen en su columna OBSERVACIONES, unidas con « | » si pagó varias veces en el mes (sus importes ya salían sumados en un solo renglón). Sin observaciones escritas, el reporte pone las que sugiere la cuenta («ADEUDA OCTUBRE»…) o, en un mes del historial, las de su hoja (respuesta del 2026-10-15: opción b).
- **Navegación:** botón «Atrás» en cada pantalla que no abre la barra inferior; regresa a la pantalla anterior de la app o, si se abrió directo, a la que la lista.
- **Tema claro y oscuro según el sistema operativo** (`prefers-color-scheme` y `<meta name="color-scheme">`). Antes los colores oscuros existían pero nada los activaba; las pruebas de navegador ahora comprueban que el fondo cambia.
- **Color:** un borde verde para los ingresos y rojo para los egresos (en la lista del libro, el resumen del mes y los tipos del formulario), sin cambiar el color del texto.
- **Importación:** las hojas que faltaban (octubre y diciembre 2022, las segundas hojas de marzo a julio 2025 y febrero 2026) ya están transcritas: los 51 meses cierran como el papel. La observación de cada pago va también en el pago.

**13b: Tableta y escritorio (este PR):** el celular se queda como está.

- **Desde tableta (≥ 768 px):** un menú lateral fijo con todas las secciones (Inicio, Libro, Histórico, Turnos, Bitácora, Estados de cuenta, Administración, Mi cuenta) en lugar de la barra inferior; contenido más ancho; los formularios abren como panel a la derecha (`FormSheetContent`) en lugar de la hoja inferior, y «Agregar» encabeza los movimientos en lugar de flotar.
- **Escritorio (≥ 1024 px):** el Libro a dos columnas (el mes a la izquierda, sus movimientos a la derecha), el inicio y el historial a dos columnas, y la tecla N para agregar un movimiento.
- Un solo código: los mismos componentes con puntos de quiebre de Tailwind, y `useWideScreen` donde cambia qué se muestra (un solo menú a la vez).
- Las pruebas de navegador corren en celular, tableta y escritorio: `layouts.spec` comprueba el menú, el libro y los formularios en cada tamaño, y axe revisa todas las pantallas en los tres, en tema claro y oscuro.

**Conceptos:** captura que reemplaza al documento, temas del sistema, diseño adaptable, puntos de quiebre, navegación por tamaño de pantalla.

### Fase 14: Usuarios de solo lectura, inquilinos y temporales

Detalle en el ADR-0025. Antes había un usuario por depto (su dueño) más el superadmin (pregunta 10 de la Etapa 1).

- **Tipos de usuario:**
  - _Dueño_ (como antes): uno por depto, escribe cuando su depto está en turno.
  - _Solo lectura_ (rol `READER`): ve todo lo que ve un dueño y nunca escribe. Puede estar ligado a un depto (un inquilino o un familiar) o a ninguno (por ejemplo, un contador). Su usuario no puede ser solo un número, que es el de un dueño.
  - _Temporal_: cualquier usuario salvo el superadmin puede tener un último día. Al pasar ya no entra y su sesión se cierra al refrescarse (en 15 minutos a lo más).
- **Desactivar y reactivar:** cualquier usuario salvo el superadmin; desactivar cierra sus sesiones al momento.
- **Varios usuarios por depto:** el dueño (uno solo, garantizado por la base de datos) y sus inquilinos o familiares.
- **Solo el superadmin** crea, cambia, desactiva y reactiva usuarios, y cada cambio va a la bitácora.
- **La regla de escritura sigue en `WriteAccessPolicy`:** un usuario de solo lectura nunca pasa (`READ_ONLY`), sin importar el turno.
- **_Administración → Usuarios_** muestra el tipo, el depto, el vencimiento y el estado de cada uno, y desde ahí se crean y se administran.

**Conceptos:** roles frente a permisos derivados, expiración de credenciales.

### Fase 15: Herramientas: contador de efectivo

Nueva sección _Herramientas_ (en «Más» en el celular y en el menú lateral desde tableta), para todos los usuarios. La primera es el **contador de efectivo** (`/tools/cash`):

- **Una fila por denominación vigente en México:** a la izquierda la denominación, en medio un campo con la cantidad de piezas y a la derecha el subtotal de la fila.
  - Billetes: $1,000, $500, $200, $100, $50 y $20.
  - Monedas: $20, $10, $5, $2, $1 y 50¢.
- **Debajo de todo,** el total de billetes, el de monedas y el total general. Se recalcula al escribir, sin botones.
- **«Limpiar»** regresa todo a cero y vuelve al primer campo.
- **Captura rápida:**
  - Campos grandes con el teclado numérico del celular. Solo admiten piezas enteras, hasta 99,999.
  - Al tocar un campo se selecciona lo escrito.
  - _Enter_ («Siguiente» en el celular) pasa a la siguiente denominación. Después de 50¢ cierra el teclado para que se vea el total.
- **En escritorio,** billetes y monedas van lado a lado.
- **Es solo una utilidad:** no guarda nada ni llama al servidor, así que sigue contando sin conexión.
- **El cálculo es en centavos:** `features/tools/cash-count.ts` es una función pura con sus pruebas.

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

**Hojas que faltaban.** Ya aparecieron todas (octubre y diciembre 2022, las segundas hojas de marzo a julio 2025 y febrero 2026) y están transcritas: los 51 meses cierran como el papel, y julio 2026 cierra en $18,247.02. Queda una duda: si existen hojas anteriores a mayo 2022, que abre con $712.25.

**Errores del papel.** Se conservan los saldos del papel con un ajuste explicado, para que todos los meses siguientes coincidan con las hojas que ya circularon:

- Febrero 2024: error de suma de $270 (los ingresos totales dicen $24,742.50 en vez de $24,472.50).
- Julio 2023 (hoja al día 10): error de resta de $50.
- Agosto 2023: los otros egresos suman $1 menos que su total.
- Marzo 2023 y septiembre 2023: redondeos de $0.05 y $0.30; abril 2025 abre $0.17 abajo del cierre de marzo.
- Marzo 2025: «Total limpieza» dice $2,940 (sus renglones suman $2,970) y «Total otros» $42,520 (suman $42,430); el saldo del papel descuenta esos $90 de más, que entran como ajuste.
- Mayo 2025: «Total otros» dice $143.00 y sus renglones suman $143.50; el saldo arrastra los $0.50.

**Para revisar:**

- Enero 2025: el PDF y la hoja impresa difieren en $270 de limpieza; se usó la impresa porque es la que coincide con febrero.
- Julio 2023: la limpieza del día 10 aparece en las dos hojas del mes (cada hoja conserva la suya, como en el papel).
- Diciembre 2025: la segunda hoja dice que 202 debe diciembre, y la primera registra que lo pagó.
- Abril y junio 2026: dos renglones ($74 y $359) dicen «Nuevo UPS para las cámaras», que parece copiado de julio.
- Penalización de 302 en 2023: el papel registra $1,000 «por no llevar la administración», pero no dice de qué meses.
- Semanas de basura que no aparecen pagadas: 20 de noviembre 2023 y 22 de junio 2026 (la del 28 de julio 2025 sí se pagó, el 1 de agosto).

---

## 5. Preguntas abiertas

Cada una tiene un valor por defecto para no bloquear el avance.

| #   | Pregunta                                                                            | Valor por defecto                                                                                                        | Fase |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| 11  | ¿Cómo entra el historial?                                                           | **Respondida:** dentro de los libros, desde mayo 2022; antes de agosto 2026 sin cuotas, cuentas ni bitácora de renglones | 12   |
| 12  | ¿Aparecen las hojas que faltan (sección 4)?                                         | **Respondida:** aparecieron todas y ya están en el archivo de importación                                                | 12   |
| 13  | ¿La carga inicial de agosto 2026 sale del balance de julio 2026?                    | **Respondida:** el superadmin captura los adeudos y adelantos; la caja sale del cierre de julio                          | 12   |
| 14  | ¿Un usuario de solo lectura ve todo, como un dueño, o solo lo de su depto?          | **Respondida:** ve todo, como los dueños                                                                                 | 14   |
| 15  | ¿El contador de efectivo incluye monedas de 20¢ y 10¢?                              | **Respondida:** no; llega hasta 50¢                                                                                      | 15   |
| 16  | ¿Los vecinos tienen correo, o WhatsApp es el único canal realista?                  | WhatsApp como canal principal; el superadmin como respaldo                                                               | 17   |
| 17  | ¿Quién pone el número de WhatsApp Business y la cuenta de Meta?                     | El superadmin, con un chip dedicado                                                                                      | 17   |
| 18  | ¿Qué dicen las OBSERVACIONES del reporte cuando el administrador escribe las suyas? | **Respondida (opción b):** las del administrador; sin ellas, las que sugiere la cuenta o las de la hoja                  | 13   |
