# Estado del backend para el equipo

Revisión: 3 de octubre de 2026. Inventario contrastado con el código de `main`, hasta `3fab6a7`. Este documento describe la implementación vigente; la auditoría y el plan inicial describen antecedentes y propuestas. Actualizar este inventario cuando se entregue un módulo.

**El backend ya tiene una base funcional y contratos para integrar el sitio, el cotizador y la reportería.** Pedidos, despacho y calidad todavía necesitan sus casos de uso. Tener parámetros o cuentas de un área no significa que sus operaciones estén implementadas.

Para empezar: [README](../README.md), [entorno y colaboración](../CONTRIBUTING.md) y contrato ejecutable `GET /api/v1/openapi.json` ([fuente](../src/infrastructure/openapi.ts)). Los cuerpos completos, validaciones y respuestas se consultan en ese contrato.

## 1. Qué está hecho y qué falta

| Área | Implementado y reutilizable | Trabajo pendiente |
| --- | --- | --- |
| Entorno e infraestructura | TypeScript/Express, PostgreSQL, Docker, migrador con checksum, cuenta DB limitada, salud, errores y logs | Despliegue productivo y procedimientos de respaldo/restauración comprobados |
| Identidad | Login, JWT de 15 minutos, identidad vigente, roles, alta/edición/desactivación de usuarios | Pantallas de administración de usuarios y recuperación de contraseña |
| Configuración y catálogo | Parámetros comerciales/técnicos editables, versiones históricas, catálogos públicos y flota administrativa | Pantalla de edición; confirmar datos comerciales y referencias INEN con la empresa |
| Cotización | Geometrías, desperdicio, redondeo, flete/bombeo/impuesto, registro idempotente, snapshot, comprobante privado/PDF, consulta y estados comerciales | Formulario público y gestión comercial en frontend; convertir aprobación en pedido/programación |
| Módulo 3.5 | Indicadores, demanda por resistencia/zona, CSV, proyección estadística de cuatro semanas, recomendaciones y pulso semanal | Evaluar demanda efectiva con pedidos/despachos; validar el pronóstico para operación real |
| Logística | Parámetros de capacidad/horarios/ciclo, mixers, conductores y despacho administrativo: asignación, disponibilidad, viajes activos e inicio de tránsito | Pedido/programación completa, recepción y cierre operativo |
| Calidad | Parámetros técnicos y rol LABORATORISTA | Controles, muestras, probetas, ensayos, dictamen y dossier/trazabilidad |
| Conductor | Cuenta y rol CONDUCTOR | Operaciones y restricciones por viaje/conductor asignado |
| Automatización | Evento `COTIZACION_SOLICITADA` persistido en outbox con la cotización | Worker y entrega a n8n; notificaciones externas y alerta programada |

El catálogo público y el dashboard del otro repositorio ya consumen esta API. La [guía del frontend](../../hormigestion-frontend/docs/ESTADO_DEL_PROYECTO.md) indica las pantallas funcionales. El SQL original y las pantallas del boceto son referencias de diseño, no evidencia de operaciones disponibles.

## 2. API disponible y permisos

Todas las rutas de esta tabla llevan el prefijo `/api/v1`. Las rutas privadas usan `Authorization: Bearer <token>`.

| Método y ruta | Acceso | Estado/uso |
| --- | --- | --- |
| `GET /openapi.json` | Público | Contrato vigente |
| `GET /catalogos` | Público | Configuración comercial, versión y catálogos activos |
| `GET /catalogos/resistencias`, `/catalogos/elementos`, `/catalogos/zonas-flete`, `/catalogos/servicios` | Público | Consultas específicas |
| `POST /cotizaciones/calcular` | Público | Calcula sin guardar |
| `POST /cotizaciones` | Público + `Idempotency-Key` UUID v4 | Guarda solicitud y evento; devuelve token del comprobante |
| `GET /cotizaciones/:id/comprobante`, `/cotizaciones/:id/pdf` | Token propio vigente o ADMINISTRADOR/DESPACHADOR | Comprobante de una solicitud; contiene información privada |
| `POST /auth/login` | Credenciales | El servidor determina el rol |
| `GET /auth/me` | Cualquier cuenta activa | Identidad de la sesión |
| `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id` | ADMINISTRADOR | Gestión de personal |
| `GET /admin/configuracion`, `PUT /admin/configuracion`, `GET /admin/configuracion/historial` | ADMINISTRADOR | Configuración completa y revisiones |
| `GET /mixers` | ADMINISTRADOR/DESPACHADOR | Flota administrativa, sin agenda |
| `GET /cotizaciones` | ADMINISTRADOR/DESPACHADOR | Listado con `limit`/`offset`, filtros por `estado` y búsqueda por `q` (código, cliente, teléfono, dirección), con conteo total |
| `POST /cotizaciones/:id/contactar`, `/cotizaciones/:id/aprobar`, `/cotizaciones/:id/rechazar` | ADMINISTRADOR/DESPACHADOR | Transiciones con `versionEsperada` y `motivo` |
| `GET /admin/reportes`, `GET /admin/reportes/exportar.csv` | ADMINISTRADOR | Reportería y exportación filtradas |

Fuera del prefijo: `GET /health/live` verifica el proceso; `GET /health/ready` verifica disponibilidad de la base/configuración. Roles exactos: `ADMINISTRADOR`, `DESPACHADOR`, `LABORATORISTA`, `CONDUCTOR`. Cada petición privada vuelve a comprobar cuenta activa y rol en PostgreSQL.

Los errores tienen la forma `{"error":{"codigo":"…","mensaje":"…","requestId":"…"}}`; validación puede añadir `campos`. Integrar tratamiento de 400/422 (entrada), 401 (sesión), 403 (permiso), 409 (conflicto), 429 (límite) y 503 (servicio). Usar `requestId` para localizar el fallo sin compartir credenciales ni datos personales.

## 3. Contratos que deben conservarse

1. **Una fuente de precios y reglas.** El catálogo procede de configuración; el cálculo comercial usa [cotizacion.ts](../src/domain/cotizacion.ts) y Decimal.js. Decimales de respuesta son cadenas; el frontend los formatea y envía mediciones, sin sustituir el cálculo del servidor.
2. **Versiones e historia.** La edición de configuración exige versión esperada y motivo. La cotización conserva un snapshot inmutable. Cambiar tarifas actuales no altera cotizaciones anteriores. Conservar los códigos existentes y desactivar registros; mixers retirados usan `INACTIVO`.
3. **Reintentos seguros.** Una nueva confirmación genera un UUID v4 para `Idempotency-Key`. El mismo contenido y clave devuelve la solicitud anterior; otro contenido con esa clave devuelve 409. Una versión comercial desactualizada requiere recalcular antes de confirmar.
4. **Estados comerciales.** `PENDIENTE → CONTACTADA → APROBADA`; rechazo desde pendiente/contactada. `VENCIDA` se deriva del reloj del servidor para solicitudes aún pendientes/contactadas. La aprobación comercial no reserva mixer, fecha ni capacidad.
5. **Identidad del servidor.** Mantener autorización en aplicación/backend, además de cualquier guardia visual. No aceptar un rol elegido por el navegador. Debe permanecer al menos un administrador activo.
6. **Origen de los datos.** Conservar `datosDemostracion` y la separación `DEMO`/`REAL` al extender consultas y entidades. Tarifas, impuestos, contactos y parámetros iniciales son ficticios; la referencia normativa no está verificada.
7. **Migraciones incrementales.** `001_base.sql` y `002_reporteria.sql` ya están aplicadas y tienen checksum. Añadir una migración nueva; no editar las anteriores para actualizar una instalación. Ver [CONTRIBUTING](../CONTRIBUTING.md).
8. **Atomicidad.** Registro de cotización, detalle, snapshot y outbox permanecen en una transacción. La existencia del evento no implica que se haya enviado un mensaje.

## 4. Cómo interpretar la reportería

Filtros actuales: `desde`, `hasta`, `origen`, `resistencia`, `zona`. Fechas ISO, período máximo de 366 días; los códigos desactivados siguen siendo consultables para historia. Los indicadores usan solicitudes únicas. Los conteos por resistencia pueden compartir una cotización; no se suman como solicitudes independientes.

El valor mostrado es el subtotal histórico del hormigón, excluyendo flete, bombeo e impuesto. La demanda incluye interés cotizado, también rechazado/vencido. Estas cifras no equivalen a facturación, producción ni despachos ejecutados.

La proyección usa hasta 26 semanas cerradas, requiere cuatro semanas útiles y compara modelos estadísticos mediante evaluación temporal. Produce cuatro semanas futuras; las fechas del reporte no reemplazan su ventana histórica. `origen`, resistencia y zona sí filtran su base. No presentar un escenario de frontend como nuevo pronóstico almacenado. Conservar los resultados insuficientes/errores no disponibles en lugar de inventar precisión.

El pulso semanal se calcula al consultar la API según el reloj/zona de la planta. Su revisión de capacidad es nominal; no consulta reservas ni disponibilidad real. No hay todavía un envío semanal programado. Más detalle en [la guía del módulo 3.5](06-dashboard-y-reporteria.md).

## 5. Dónde trabajar

| Responsabilidad | Archivos existentes |
| --- | --- |
| HTTP, validación de entrada y errores | [app.ts](../src/app.ts) y [openapi.ts](../src/infrastructure/openapi.ts) |
| Identidad, configuración y cotizaciones | [services.ts](../src/application/services.ts) |
| Reglas comerciales y configuración | [cotizacion.ts](../src/domain/cotizacion.ts), [configuracion.ts](../src/domain/configuracion.ts) |
| Reportería y pronóstico | [report-service.ts](../src/application/report-service.ts), [reporteria.ts](../src/domain/reporteria.ts) |
| Repositorios y persistencia | [interfaces](../src/domain/repositories.ts), [store.ts](../src/infrastructure/database/store.ts), [report-store.ts](../src/infrastructure/database/report-store.ts) |
| Migración y permisos DB | [migrate.ts](../src/infrastructure/database/migrate.ts), [migraciones](../src/infrastructure/database/migrations/) |
| Comprobante PDF | [pdf.ts](../src/infrastructure/pdf.ts) |
| Datos ficticios | [demo.ts](../src/domain/demo.ts), [semilla base](../src/infrastructure/database/seed-demo.ts), [semilla histórica](../src/infrastructure/database/seed-report-demo.ts) |
| Comprobaciones | [unitarias](../tests/unit/), [integradas](../tests/integration/api.test.ts), [runner aislado](../scripts/test-integration.ts) |

Un módulo nuevo incorpora dominio, servicio, repositorio, migración si corresponde y rutas/contrato. Reutilizar identidad, configuración y errores existentes. Para pedidos/despachos, crear sus entidades y relación con la cotización; no convertir directamente una cotización en un viaje. Calidad debe distinguir muestra, probeta y ensayo según [la investigación](03-operacion-hormigon-y-ajustes.md).

## 6. Evidencia y límites de entrega

Base registrada: `89b584a` inicializa el backend; `3fab6a7` añade reportería/proyección. La última verificación funcional documentada pasó **23 pruebas unitarias y 26 integradas**, typecheck, build e imagen Docker con Node.js 24/PostgreSQL 16. La revisión actual añade documentación; no implica una nueva aceptación de todos los módulos del acta.

Siguen pendientes validación con datos reales, pruebas operativas de logística/calidad, producción, recuperación ante fallos y aceptación con la empresa. Las decisiones del plan inicial no se convierten en funcionalidades hasta que existan código, contrato y evidencia de ejecución.

Al entregar un cambio, actualizar las filas afectadas de este inventario, OpenAPI y la guía de integración correspondiente. Registrar qué se verificó, migraciones necesarias, cambios de contrato y pendientes concretos en el commit/PR.
