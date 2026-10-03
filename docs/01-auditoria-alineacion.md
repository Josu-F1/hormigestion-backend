# Auditoría de alineación del diseño de HormiGestión

Fecha: 3 de octubre de 2026.

> **Antecedente de diseño, anterior a la implementación.** El dictamen y las observaciones del repositorio describen la situación encontrada en la revisión inicial. Desde entonces se implementaron la base, cotización y reportería/proyección, además de los módulos cliente y administrativo del frontend. Para decidir qué falta hoy, consultar [ESTADO_DEL_PROYECTO.md](ESTADO_DEL_PROYECTO.md); conservar esta auditoría como evidencia de las diferencias originales entre entregables.

## 1. Dictamen

**El Documento_Entregable está parcialmente alineado con el Acta_de_Constitucion, pero todavía no constituye una especificación integrada lista para implementar todas las reglas de negocio.**

Hay coherencia en el objetivo general, las cinco resistencias comercializadas, la cotización pública, el uso de Node.js/PostgreSQL/Docker y la operación de despacho. Sin embargo, el módulo de proyección automática de demanda del acta no está desarrollado como módulo funcional; la calidad aparece principalmente en la base de datos; y hay contradicciones entre arquitectura, modelo de datos, roles y prototipos.

Los documentos de infraestructura, roles y prototipos citan explícitamente actividades anteriores. Esto demuestra una intención de seguir una secuencia, pero **las referencias por sí solas no demuestran que las reglas anteriores se hayan conservado**. Las divergencias descritas aquí indican que faltó una revisión de integración. No permiten atribuir incumplimientos personales ni determinar cómo trabajó cada integrante.

Se puede comenzar la base técnica y los catálogos. Las decisiones señaladas como P1 deben resolverse antes de implementar el flujo de negocio afectado. Las P2 condicionan la puesta en producción. Las P3 son correcciones documentales.

## 2. Fuentes y método

Se extrajo el texto de los tres PDF completos. Se renderizaron las 69 páginas del entregable y las 8 del acta, se revisaron sus hojas de contacto y se ampliaron páginas relevantes de diagramas y prototipos. También se inspeccionaron el DDL y los archivos pertinentes del frontend. No se ejecutó el SQL ni se alteraron los documentos fuente.

Todas las referencias `E p.` usan la **página física del PDF de 69 páginas**, porque la numeración impresa se reinicia en cada documento. `A p.` corresponde al acta y `I p.` al informe previo.

| Fuente | Contenido revisado | Identificador usado |
| --- | --- | --- |
| `../../Documento_Entregable.pdf` | 69 páginas | E |
| `../../Acta_de_Constitucion.pdf` | 8 páginas | A |
| `../../Informe_del_Proyecto-Grupo4-1.pdf` | 12 páginas; antecedente adicional disponible | I |
| `../../hormigestion_db_schema(1).sql` | DDL, enumeraciones, restricciones, vistas y semillas | SQL |
| `../../hormigestion-frontend/src/` | Navegación, login, cotizador, confirmación, Kanban, monitor, chofer, usuarios y reportes | FE |
| `../` | Repositorio backend sin commits ni archivos de aplicación al iniciar la revisión | BE |

El repositorio frontend estaba en `main`, sin cambios locales al iniciar la revisión. El backend estaba vacío, con Git inicializado y sin commits. Las referencias a repositorios en E p. 11 describen componentes que aún no existen localmente en el backend; son diseño previsto, no evidencia de implementación.

La revisión verifica consistencia documental y técnica del código disponible. No acredita aceptación del patrocinador, cumplimiento jurídico ni exactitud del texto de NTE INEN 1855-1. Las afirmaciones normativas de los documentos deben contrastarse con la norma aplicable antes de convertirlas en dictámenes automáticos de calidad.

### Estructura del entregable

| Páginas físicas | Documento | Versión / fechas declaradas | Relación con los anteriores |
| --- | --- | --- | --- |
| 1-11 | Arquitectura, IN-DS-ARQ-01 | 1.0; 31/08/2026 | Base técnica; cita RF y RNF |
| 12-35 | Infraestructura Docker, IN-DA-INF-01 | 2.0; elaboración 31/08; revisión 11/09 | Declara usar arquitectura y ANX-BD-01 |
| 36-43 | ERD y modelo de datos, ANX-BD-01 | 1.0; elaboración 03/09; revisión 04/09 | Desarrolla cotización, logística y calidad |
| 44-52 | Acceso y roles, IN-DA-ROL-01 | 1.0; 08/09/2026 | Declara usar actividades 8, 9 y 10 |
| 53-69 | Prototipos, IN-DA-PROT-01 | 1.0; 15/09/2026 | Declara basarse en acceso y roles |

La revisión de infraestructura del 11/09 es posterior al documento de roles del 08/09, aunque este declara tenerla como predecesora. Esto puede deberse a revisiones normales; debe registrarse qué versión de infraestructura consumió el diseño de roles. También se llama al diseño «Fase 2» y al desarrollo «Fase 3» en el entregable, mientras el acta usa «Fase 3» y «Fase 4» respectivamente.

## 3. Cobertura frente al acta

«Presente» significa que existe diseño; no significa que el requisito esté implementado o probado.

| Compromiso del acta | Evidencia en el entregable / repositorios | Evaluación | Trabajo necesario para el backend |
| --- | --- | --- | --- |
| Sitio y catálogo de f'c 180, 210, 240, 280 y 350; A p. 1, 6 | Arquitectura E p. 3, 7; resistencias E p. 37; landing E p. 58 | Presente, con datos comerciales divergentes | Catálogo único editable; separar semillas de precios reales |
| Cotización de volumen, precio y flete; solicitudes 24/7; A p. 1, 6 | Casos de uso E p. 4; ERD E p. 37-38; prototipo E p. 59-62 | Parcial | Unificar fórmulas; persistir IVA y bombeo; confirmar solicitud y notificar |
| Asignación por vehículo y turno sin cruces; A p. 1, 3, 6 | Arquitectura E p. 4, 7; pedidos/despachos E p. 39-42; Kanban E p. 64 | Parcial | Reservas por viaje y conductor; impedir conflictos concurrentes; dividir pedidos |
| Ventana de aproximadamente 90 minutos desde carga; A p. 2 | Arquitectura/roles desde salida E p. 4, 49; ERD desde carga E p. 36, 39 | Contradictorio | Definir origen temporal único, umbrales, evento de fin e incidencias |
| Lote, hora de carga, resistencia, slump y ensayos 7/28 días; A p. 1, 6 | Tablas de calidad E p. 39-43 y SQL; monitor E p. 64 solo sigue viajes | Parcial | Casos de uso de calidad, responsable, permisos, ensayos pendientes y dossier |
| Proyección automática semanal y recomendaciones por resistencia, volumen, zona y horario; A p. 2, 4, 6 | Arquitectura menciona reportes; E p. 65 describe datos históricos; sin flujo de pronóstico completo | Brecha principal | Importación del historial, análisis programado, resultados persistidos, panel, alerta y evaluación |
| Notificación interna de solicitudes fuera de horario; A p. 6 | Infraestructura E p. 20, 29 se concentra en alertas 60/80 | Parcial | Evento persistente de solicitud, entrega de notificación, reintentos y destinatario |
| Node.js, PostgreSQL, n8n y Docker; A p. 4 | E p. 1-5, 12-35 | Alineado en tecnología general | Convertir diseño en código y configuración verificables; corregir ejemplos |
| Respaldos diarios y recuperación; A p. 3, 4, 8 | Infraestructura E p. 27-28, 34 | Presente en diseño | Implementar respaldo completo, restauración de prueba y recuperación de n8n |
| Cotizar en menos de 3 min sobre 20 casos; 10 solicitudes primer mes; trazabilidad del 100%; A p. 3, 6 | RNF de latencia no reemplaza indicadores de negocio; no hay protocolo completo | Pendiente | Definir mediciones, consultas y pruebas de aceptación vinculadas al acta |
| Manual, credenciales de prueba, capacitación de 4 h y cierre 04/12/2026; A p. 6-8 | Entregable centrado en diseño | Fuera de esta actividad, pendientes para el proyecto | Incluir en backlog de entrega, sin considerarlos incumplidos por faltar en un diseño |
| Excluir SRI, pagos, app nativa, GPS en vivo, contabilidad/nómina y chatbot; A p. 6 | Vista móvil web y mapas en E p. 66; mención de facturación en E p. 12 | No se demuestra una ampliación implementada | Aclarar que un enlace a mapa y un resumen comercial no agregan GPS ni facturación electrónica |

La mayor brecha no se resuelve renombrando «Reportería» como «IA»: los gráficos históricos de E p. 65 no contienen horizonte futuro, generación semanal, recomendaciones ni evaluación contra el despacho real.

## 4. Contradicciones que afectan reglas de negocio (P1)

### H01. Proyección de demanda sin diseño funcional completo

El acta dedica un quinto módulo a análisis automático de series temporales y regresión, recomendaciones y alerta semanal (A p. 2, 4, 6). El árbol de aplicación de E p. 5 no contiene este módulo; el modelo E p. 36-43 y el SQL no definen resultados de proyección ni ejecuciones analíticas; la pantalla de reportes E p. 65 describe estadísticas históricas. n8n está previsto, pero su mera presencia no implementa la proyección.

**Impacto:** una implementación que replique únicamente las pantallas actuales quedaría incompleta frente al acta. **Corrección:** definir datos de entrada, importación histórica, periodicidad, horizonte, agrupaciones, método inicial, almacenamiento, panel, alerta y validación del error. No introducir un chatbot: el acta lo excluye expresamente.

### H02. Calidad modelada sin completar la operación

E p. 39-43 y SQL líneas 267-302 contienen controles, probetas y ensayos. E p. 47 no define permisos para registrarlos; E p. 64 llama «Trazabilidad» a un monitor de viaje; E p. 69 no incluye una pantalla para ensayos. SQL incluye `LABORATORISTA`, que no aparece en el modelo de roles de E p. 46.

Además, `ensayos_rotura` exige `fecha_rotura`, carga, esfuerzo y dictamen desde la creación: no permite una fila de ensayo programado pendiente sin inventar resultados. Su restricción admite 3, 7, 14, 28 y 56 días, mientras los entregables se centran en 7 y 28. No hay control de duplicados ni un flujo de corrección de resultados.

**Corrección:** especificar responsable y permisos; separar programación de resultados; modelar las probetas y edades objetivo; conservar correcciones auditables. La entrega física y la finalización del dossier a 28 días deben tener estados distintos.

**Ampliación por investigación operativa:** el SQL representa un cilindro en `muestras_probetas`, pero admite varios ensayos de rotura para la misma pieza. Separar muestreo/probeta, permitir una sola rotura física por probeta y agrupar resultados por muestra/edad. Véase [la investigación y su evidencia](03-operacion-hormigon-y-ajustes.md).

### H03. Dos puntos de inicio para los 90 minutos

Arquitectura E p. 1 y 4, infraestructura E p. 12 y roles E p. 49 empiezan en salida de planta. Acta A p. 2, ERD E p. 36 y 39 y SQL líneas 252 y 328 usan carga/contacto agua-cemento. Por ejemplo, con carga 08:00 y salida 08:20, a las 09:25 una regla marca 85 minutos y la otra 65: el estado de alerta puede ser diferente.

`hora_carga NOT NULL` impide crear un despacho futuro programado sin atribuirle una carga que todavía no ocurrió. No hay restricciones de secuencia temporal. La vista `v_auditoria_fraguado_90min` exige carga y descarga: sirve para auditoría terminada, no para vigilar viajes activos.

**Corrección propuesta:** usar carga como referencia consistente con el acta, registrar salida separada y calcular tiempos con fechas persistidas y reloj del servidor. Confirmar con planta el significado exacto de carga, el fin de descarga, los límites y las excepciones; no declarar conformidad normativa por defecto.

**Ampliación por investigación operativa:** mantener 90 minutos como política del acta, sin rechazo técnico automático por exceso. No se verificó el texto completo de la edición INEN aplicable; los comentarios del SQL no acreditan una cláusula normativa. Véase [el contraste técnico y normativo](03-operacion-hormigon-y-ajustes.md).

### H04. Roles y autorización sin un vocabulario común

El acta A p. 4 y 6 habla de propietario, despachador y cliente como tres roles. E p. 46 distingue Cliente público, Administrador, Operador y Chofer. SQL líneas 373-377 inserta `ADMINISTRADOR`, `DESPACHADOR`, `LABORATORISTA` y `CONDUCTOR`. El JWT de E p. 52 utiliza `operador_despacho`; el frontend usa `admin`, `operador` y `chofer`.

SQL no vincula `usuarios` con `conductores`. Por ello no hay una relación explícita para comprobar qué viajes pertenecen al chofer autenticado. El prototipo asigna mixer al usuario (E p. 65), pero el DDL solo relaciona mixer y conductor por despacho.

La matriz E p. 47 niega al Administrador actualizar estado de tránsito, pese a describirlo como de acceso completo; el diagrama E p. 48 lo conecta a iniciar tránsito, mientras E p. 49 asigna ese caso al Chofer. El catálogo público también figura denegado al Chofer, aunque no requiere autenticación.

**Corrección:** definir códigos canónicos, tratar al visitante como actor público, completar calidad y resolver explícitamente las excepciones de la matriz. El selector visual de login nunca debe conceder permisos. La asignación y el acceso a cada viaje deben verificarse por identidad en el backend.

### H05. Tres fórmulas diferentes de flete

E p. 3 define recargo por kilómetro fuera de un radio base de 10 km. E p. 37 y SQL líneas 128-137 definen tarifa zonal por m³. FE `Quoter.tsx:49` calcula `28 * distancia / 10` una vez por cotización, independiente del volumen y sin tramo gratuito.

Ejemplo ilustrativo con la semilla Ambato/Huachi: 8 m³ y 14 km producen USD 72 con tarifa zonal de USD 9/m³, y USD 39,20 con la fórmula del frontend. La fórmula de arquitectura no se puede calcular sin conocer la tarifa por km.

**Corrección:** validar con propietario si cobra por zona, viaje, m³, km o combinación; guardar la regla y el importe usados. No asumir que los valores semilla constituyen tarifas aprobadas.

### H06. Desperdicio y geometría incompatibles

E p. 3 propone 3%-7%; E p. 36 propone 5%-10%; E p. 42 permite 0%-20%. SQL restringe ese rango solo en `elementos_constructivos`, no en `detalles_cotizacion.desperdicio_pct`. Las semillas incluyen 8% y 10%, fuera del rango de arquitectura. FE `Quoter.tsx:39-44` redondea el volumen hacia arriba a una décima y no aplica desperdicio.

**Corrección:** definir rango, valor sugerido por elemento, posibilidad de ajuste y redondeo; aplicar validación también al detalle. Precisar qué geometrías cubre `largo * ancho * espesor` y cómo se ingresan múltiples elementos o un volumen directo. Una losa alivianada necesita una regla acordada; su nombre en un catálogo no define el cálculo.

### H07. Límite de carga declarado pero no garantizado

Arquitectura E p. 3-4 y roles E p. 48 hablan de máximo 8 m³. ERD E p. 40 menciona capacidad típica de 6-8 m³; SQL líneas 209-217 permite mixers de 4-12 m³ y en despachos solo exige volumen positivo. Una FK identifica el camión, pero no compara el volumen con su capacidad, pese a la garantía afirmada en E p. 42.

**Corrección:** acordar si 8 m³ es límite global o solo capacidad de la flota actual; validar capacidad real por viaje en una transacción. Un pedido de 20 m³ es válido si se divide en viajes adecuados; no aplicar el límite de un mixer a toda la cotización.

### H08. Estados de venta mezclados con estados de viaje

E p. 64 muestra Pendiente, Aprobado, En Tránsito, Entregado y Cerrado en tarjetas identificadas por cotización. SQL líneas 51-73 separa 5 estados de cotización, 4 de pedido y 6 de despacho; estos incluyen carga, obra y rechazo, ausentes en el Kanban.

**Corrección:** conservar tres ciclos separados y definir una proyección para el tablero. Mostrar los viajes hijos de un pedido; una cotización no puede pasar directamente a «descargado». Definir rechazo, cancelación, vencimiento, entregas parciales y significado de cerrado. No borrar estos casos para coincidir con cinco columnas.

### H09. Agenda y reservas insuficientes para evitar cruces

El acta A p. 1 y 3 exige vehículo y turno sin cruces. SQL tiene una fecha de entrega del pedido, pero no un intervalo de reserva programada por despacho, ni retorno/disponibilidad del mixer, ni reserva de conductor. No hay exclusión de solapamientos ni estrategia de concurrencia. Un estado global `DISPONIBLE` tampoco reserva una fecha futura.

**Corrección:** modelar inicio y fin por recurso, turnos y duración del ciclo; considerar retorno y limpieza. Evitar que dos solicitudes simultáneas reserven el mismo recurso, mediante transacción y restricciones o bloqueos apropiados. Probar el conflicto concurrente, no únicamente el formulario.

### H10. Precios y geografía de demostración divergentes

SQL líneas 380-386 usa precios 72, 78, 84, 91 y 105. FE `Quoter.tsx:6-11` y los mockups E p. 60 usan 145, 158, 172, 189 y 218. E p. 1 ubica la compañía en Ambato; E p. 36-37 y SQL líneas 397-408 usan Tungurahua. Los mockups y FE incluyen Quito, La Armenia, Tumbaco, Sangolquí y Rumiñahui; `Login.tsx:70` muestra «Planta Quito Norte».

**Corrección:** obtener ubicación y lista vigentes del patrocinador; usar configuración y catálogo compartidos. Estos datos pueden ser ficticios de diseño: la divergencia no demuestra por sí sola que la empresa real haya cambiado de sede.

### H11. Desglose comercial incompleto en persistencia

E p. 4 y 59-62 contempla IVA, bomba pluma/estacionaria y PDF con vigencia de 7 días. SQL guarda hormigón, flete y total, y copia precios unitarios de hormigón/flete en detalles, pero no tiene campos explícitos de tipo/tarifa/subtotal de bombeo, tasa e importe de IVA ni reglas de redondeo. Tampoco fuerza los 7 días ni una fórmula consistente de totales.

**Corrección:** ampliar el desglose y guardar una fotografía de las condiciones utilizadas. El backend calcula el precio final a partir de entradas válidas y tarifas propias. La tasa del 15% que aparece en el prototipo se trata aquí como dato del prototipo, no como verificación tributaria vigente.

## 5. Observaciones de infraestructura y datos

### H12. Ejemplos Docker que requieren corrección antes de producción (P2)

- **Runtime:** E p. 18-19 utiliza `node:20-alpine`. La documentación oficial de Node.js consultada el 03/10/2026 clasifica v20 como EOL y v24 como LTS. Actualizar a una línea soportada; fijar versión concreta al construir. [Versiones de Node.js](https://nodejs.org/en/about/previous-releases).
- **Recuperación:** E p. 26 asocia un healthcheck fallido con reinicio automático. Las políticas de reinicio actúan cuando el contenedor termina; marcarlo `unhealthy` no provoca por sí mismo ese reinicio. Definir la acción operativa para un proceso vivo pero degradado. [Políticas de reinicio de Docker](https://docs.docker.com/engine/containers/start-containers-automatically/).
- **Actualización:** E p. 29 y 34 llama rolling update a recrear un único contenedor. `compose up` detiene y recrea los servicios cambiados; presupuestar esa interrupción. `docker compose rollback`, indicado en E p. 29, no figura como subcomando de Compose. El ejemplo de E p. 34 usa `latest`, en conflicto con su propia prohibición. Documentar regreso a una etiqueta/digest anterior con el servicio realmente configurado para usarla. [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), [subcomandos de Compose](https://docs.docker.com/reference/cli/docker/compose/).
- **n8n:** E p. 23 y 34 define `N8N_BASIC_AUTH_USER/PASSWORD`, pero E p. 32 usa n8n 1.62.1. La documentación del proyecto indica que Basic Auth del acceso a la instancia fue retirado en 1.0. Completar la configuración de cuentas de n8n; esto es independiente de la autenticación de webhooks o de HormiGestión. [Documentación oficial de n8n](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/host-n8n/configure-n8n/user-management.md).
- **Salida de notificaciones:** n8n queda exclusivamente en `red_interna` sin salida a internet (E p. 20, 22, 33), mientras se contemplan integraciones externas. Resolver un canal de salida controlado o un intermediario autorizado; no publicar PostgreSQL ni el editor de n8n para resolverlo.
- **Respaldos:** E p. 23 habla de `.sql.gz`; E p. 27 usa archivo personalizado `.dump`. Elegir un formato y restauración compatibles. El ejemplo E p. 34 pasa un nombre de archivo del host a `pg_restore` dentro del contenedor sin montarlo ni enviar su contenido. `pg_restore --list` enumera el archivo; no reemplaza una restauración de prueba. Incorporar también flujos/datos de n8n y su clave de cifrado. [pg_restore de PostgreSQL 16](https://www.postgresql.org/docs/16/app-pgrestore.html).
- **Configuración incompleta:** se promete límite para cinco servicios (E p. 21), pero el Compose E p. 30-33 solo declara recursos para backend, PostgreSQL y n8n. Los agentes de monitoreo y `backup_data` descritos tampoco están completos en ese Compose. FE se describe sin root, pero el Dockerfile no declara `USER`. Validar usuario efectivo y arranque de Nginx antes de dar esa condición por cumplida.
- **Secretos:** un único `env_file: .env` para servicios diferentes entrega variables innecesarias a cada uno; limitar cada servicio a sus credenciales. Decidir una identidad de base de datos de aplicación distinta de la usada para administración y migraciones.
- **Rutas:** E p. 20 elimina `/api/` al reenviar a backend. El contrato interno y público debe acordarse y verificarse para no duplicar o perder el prefijo.

Estas son observaciones del diseño y sus ejemplos, no fallos observados de una instalación productiva. No hay tal instalación disponible en el repositorio.

### H13. Disponibilidad y dimensionamiento sin verificación presupuestaria (P2)

A p. 7 limita alojamiento a USD 120/año y gasto total a USD 340. E p. 22 exige un VPS de 4 vCPU, 4 GB, 60 GB y ancho de banda garantizado, pero no incluye cotización que demuestre compatibilidad con ese techo. No se concluye que sea imposible: falta evidencia de costo y de capacidad necesaria.

E p. 15 y 25 equipara 99,2% en horario productivo a 5,8 h de caída mensual. Ese valor corresponde aproximadamente a 30 días de 24 h: `720 * 0,008 = 5,76 h`. Con el horario de 11 h/día de E p. 21 y un ejemplo de 22 días operativos, sería `242 * 0,008 = 1,936 h`. El denominador real debe acordarse. La recepción pública 24/7 del acta merece una medición separada.

Un timeout de proxy de 5 s no acredita respuestas inferiores a 1,2 s. El documento habla de pruebas de carga preliminares, pero los materiales disponibles no incluyen resultados reproducibles; el dimensionamiento se trata como estimación. Medir consultas, concurrencia y percentil de latencia antes de asumir garantías.

### H14. DDL útil como referencia, no como migración inicial sin revisión (P1/P2)

El script empieza con `DROP ... CASCADE` para tablas, vistas y tipos (SQL líneas 15-39). Es una limpieza de desarrollo expresamente comentada, pero no debe integrarse en el arranque ni aplicarse a información real. Separar migraciones, catálogo inicial y datos de demostración; la evolución del esquema debe ser incremental.

Otros ajustes necesarios:

- El SQL crea **16 tablas**. Infraestructura E p. 19 y 22 habla de 15; el esquema formal E p. 41-42 enumera 14 y no documenta `roles`/`usuarios`.
- Una FK y `UNIQUE(despacho_id)` garantizan un máximo de un control por despacho, no que todos los despachos tengan uno. Acordar cuándo un despacho puede cerrarse y cómo se mide cobertura de calidad.
- `despachos.lote_id` es opcional y puede eliminarse con `SET NULL`, mientras el control exige lote; no se garantiza que ambos correspondan al mismo lote/resistencia.
- El DDL permite estados con marcas temporales inconsistentes, desperdicio del detalle fuera del rango, importes negativos en varios campos y pedidos sin validación de volumen positivo.
- `usuarios` y `conductores` duplican identidad sin vínculo; no hay historial de transiciones ni auditoría de cambios de calidad/autorización.
- La vista de dossier parte de `ensayos_rotura` con joins internos: no mostrará por sí sola los controles o muestras pendientes de ensayo. Preparar una consulta que exponga faltantes.
- Detalles admiten múltiples resistencias en una cotización; el pedido guarda volumen global y los viajes una resistencia, sin líneas de pedido que controlen lo pendiente de cada mezcla. Añadir ese vínculo para no aceptar una combinación distinta de la aprobada.
- La declaración de 3FN no basta para garantizar consistencia de datos derivados. Volúmenes, subtotales y porcentajes almacenados requieren cálculo centralizado y una política explícita de fotografía histórica o recomputación.

Estas conclusiones proceden de lectura estática del DDL. Su sintaxis, instalación en PostgreSQL y comportamiento real de migraciones quedan pendientes de implementación y prueba.

## 6. Antecedentes y coherencia documental

### H15. El informe previo contiene un alcance distinto (P1 de gestión)

I p. 1 y 7 propone cuatro módulos, sin proyección predictiva como quinto módulo. I p. 7 y 12 difiere logística y calidad a una segunda implantación, aunque I p. 10 también las ubica en el Sprint 3 del semestre. A p. 1-2 y 7 incorpora cinco módulos y los coloca en el período actual, incluida la proyección.

También cambian el objetivo de cotización de menos de 5 min (I p. 1, 6) a menos de 3 min (A p. 3, 6), y la fecha del sitio de diciembre (I p. 6) a antes del 06/11 (A p. 6).

**Criterio de esta preparación:** usar el acta que el usuario identifica como referencia de alcance y registrar las diferencias del antecedente. Si existió un cambio posterior aprobado, debe incorporarse con su versión; no se encontró en estos archivos. Las casillas de firma del acta A p. 8 y de los entregables revisados están vacías: los nombres y fechas no prueban una aprobación formal firmada.

### H16. Requisitos y cronograma citados sin sus documentos completos (P3, con efecto en trazabilidad)

E cita RF-06, RF-09, RF-10 y RNF-01 a RNF-04, además de `IN-PL-PLA-01`, pero no incluye una especificación completa con criterios de aceptación ni ese plan de actividades. No se encontraron documentos separados equivalentes en la carpeta. Los valores citados sirven como insumo; no debe afirmarse que se validó todo el catálogo de RF ni inventar códigos RF faltantes.

La numeración de fases y las fechas/versiones deben unificarse. El acta misma denomina «semana 16» al intervalo 19/11-04/12; conviene revisar esa etiqueta sin modificar por cuenta propia la fecha comprometida.

### H17. Conteos y texto de edición sin consolidar (P3)

E p. 53 afirma 11 pantallas, pero su desglose `3 + 6 + 1` suma 10; E p. 69 combina 7+8 en una sola vista. El código también tiene diez componentes de pantalla. Aclarar si se cuentan números de mockup o vistas distintas. E p. 37 conserva instrucciones de maquetación en el texto; E p. 67 deja pendiente una captura del design system. Estos detalles no bloquean la API, pero refuerzan que el documento requiere consolidación editorial.

## 7. Estado del frontend y consecuencias de integración

El frontend React/TypeScript es una base visual aprovechable. Su comportamiento actual es de demostración:

| Evidencia del código | Estado observado | Consecuencia para backend e integración |
| --- | --- | --- |
| `src/App.tsx:27-53` | Pantallas seleccionadas por estado local; navegador de demo abre las privadas | Sustituir navegación de demostración por rutas y sesión verificadas |
| `src/screens/Login.tsx:20-31` | Retardo simulado y navegación según selector; sin validación de credenciales | API devuelve identidad/rol real; el frontend debe consumirla |
| `src/screens/Quoter.tsx:6-53` | Precios y constantes locales; fórmula sin desperdicio | Cotización final calculada y persistida en servidor |
| `src/screens/Confirmation.tsx:7-8,45-50` | Número, vigencia, pedido y total fijos | Mostrar respuesta real de creación; el éxito visual no prueba persistencia |
| `src/screens/KanbanBoard.tsx:46-53,79` | Tarjetas de ejemplo y asignación en memoria | Conectar pedidos y viajes con identificadores y reglas distintas |
| `src/screens/TraceabilityMonitor.tsx:66-79` | Viajes ficticios; suma un minuto cada 10 s y limita a 90 | Renderizar tiempo a partir de fecha persistida; conservar exceso real |
| `src/screens/DriverView.tsx:9-33,43-53` | Timer local, reiniciable al desmontar, viaje fijo | Recuperar viaje propio y marcas desde servidor tras recarga |
| `src/screens/UserManagement.tsx:54-77` | Usuarios locales, creación/desactivación/eliminación en memoria | Autorización y persistencia real; definir credenciales y vínculo de conductor |
| `src/screens/Reports.tsx` | Datos precargados | Consultas históricas reales y módulo adicional de proyección |

No se encontraron llamadas `fetch`, Axios ni persistencia `sessionStorage`/`localStorage` en `src`, aunque E p. 8 las describe como arquitectura prevista. Esto no invalida un prototipo; impide tratarlo como frontend integrado o como autoridad de reglas comerciales.

Un botón «Ver mapa» puede ser un enlace externo para orientación; no demuestra seguimiento satelital en vivo. La vista de chofer es web y está alineada con la exclusión de app móvil nativa. Los rótulos «facturación» de un reporte necesitan definición, pero no prueban implementación de SRI o contabilidad.

## 8. Acciones priorizadas

1. **Establecer alcance y trazabilidad:** mantener los cinco módulos del acta, resolver las diferencias con el informe previo e identificar la versión de cada insumo.
2. **Cerrar reglas comunes:** carga/salida, capacidad, flete, desperdicio, precios, IVA/bombeo, estados y roles. Documentar decisiones y ejemplos numéricos antes de implementar cada flujo.
3. **Preparar datos:** migraciones incrementales; reservas; vínculo usuario-conductor; calidad pendiente; desglose comercial; líneas de pedido; auditoría y resultados de proyección.
4. **Construir en dependencias:** base técnica, autenticación, catálogos, cotización/solicitudes, pedidos/despachos, calidad y proyección.
5. **Completar la integración y aceptación:** reemplazar datos simulados; agregar pantallas de calidad y proyección; medir los compromisos del acta y probar restauración.

La secuencia, propuesta de módulos/API y criterios verificables están en [Preparación del backend](02-preparacion-backend.md). Este análisis prepara el trabajo; no acredita que el backend exista o que el producto cumpla ya el acta.
