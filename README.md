# HormiGestión Backend

Estado al 3 de octubre de 2026: backend funcional con Node.js 24 LTS, TypeScript, Express 5 y PostgreSQL 16. Incluye configuración editable/versionada, acceso por roles, catálogos, cálculo/registro de cotizaciones, comprobante privado/PDF y módulo administrativo de reportería/proyección estadística.

Se revisaron el acta, el entregable de diseño, el informe previo, el SQL disponible y el frontend para establecer una base común antes de implementar.

## Documentación de preparación

- [Auditoría de alineación y coherencia](docs/01-auditoria-alineacion.md): evidencias por página, cobertura del acta, contradicciones entre entregables y observaciones sobre el SQL y el prototipo.
- [Plan de preparación e implementación del backend](docs/02-preparacion-backend.md): módulos, decisiones pendientes, cambios de datos, propuesta de API, orden de trabajo y criterios de aceptación.
- [Operación de hormigoneras y ajustes del dominio](docs/03-operacion-hormigon-y-ajustes.md): investigación con fuentes primarias, confirmación de pedidos, agenda, recepción, calidad y reglas afinadas para backend/frontend.
- [Skills instaladas](docs/04-skills-instaladas.md): herramientas de asistencia para Node.js, PostgreSQL, React, seguridad y pruebas de navegador, con procedencia y versiones verificadas.
- [Datos demo y primer incremento](docs/05-datos-demo-y-primer-incremento.md): supuestos autorizados, parámetros editables, API y verificación de la implementación.
- [Dashboard y reportería](docs/06-dashboard-y-reporteria.md): agregación de cotizaciones, demanda por resistencia/zona, proyección estadística, pulso semanal, CSV y semilla histórica ficticia.

## Conclusión de la revisión

La revisión inicial encontró alineación parcial con el acta. Cotización y logística tenían una base aprovechable. La trazabilidad de calidad está modelada en datos, pero falta completar sus casos de uso, permisos y pantallas. El módulo 3.5 añade una base funcional de proyección sobre cotizaciones; integrar despachos y validar la demanda efectiva contemplada en el acta sigue pendiente.

La tecnología documentada es Node.js, PostgreSQL y Docker, con una API REST organizada en dominio, aplicación e infraestructura. Las reglas contradictorias de precios, flete, desperdicio, capacidad, estados y cronómetro se registran como decisiones por resolver en la documentación.

El archivo `../hormigestion_db_schema(1).sql` es una referencia de diseño con una sección de limpieza destructiva. Debe transformarse en migraciones incrementales antes de usarlo sobre una base con información.

Los PDF, el SQL original y el frontend se conservaron sin modificaciones durante esta revisión.

La investigación posterior mantiene los 90 minutos del acta como política del proyecto, con alerta temporal separada del dictamen de calidad. El plan distingue muestreo, probeta y rotura, y contempla el ciclo completo de los recursos y el balance de recepción por viaje.

## Arranque de demostración

Ejecutar desde esta carpeta con Docker y Node.js 24+ disponibles:

```bash
npm run setup:local
docker compose up -d postgres
docker compose build api
docker compose run --rm migrate
docker compose run --rm seed-demo
docker compose up -d api
```

`setup:local` genera `.env` con secretos aleatorios y permisos locales; si ya existe, lo conserva. La migración no ejecuta el DDL original ni borra tablas. Repetir la semilla no restablece tarifas, cuentas ni contraseñas.

- API: `http://localhost:3000`
- Salud: `GET /health/live` y `GET /health/ready`
- Contrato: `GET /api/v1/openapi.json`
- PostgreSQL local: puerto `55432`, distinto de las bases existentes del equipo.

Compose es un entorno local con volumen persistente, cuenta limitada de aplicación y migrador separado. Para detenerlo conservando los datos: `docker compose stop`.

## Acceso y edición de parámetros

| Correo ficticio | Rol |
| --- | --- |
| `admin@demo.hormigestion.test` | ADMINISTRADOR |
| `despacho@demo.hormigestion.test` | DESPACHADOR |
| `calidad@demo.hormigestion.test` | LABORATORISTA |
| `conductor@demo.hormigestion.test` | CONDUCTOR |

La contraseña inicial de las cuentas de prueba es el valor **`DEMO_PASSWORD` de tu `.env` local**. Las credenciales no se incluyen en Git. Enviar correo y contraseña a `POST /api/v1/auth/login`; el servidor obtiene el rol y devuelve un JWT Bearer de 15 minutos.

El administrador consulta `GET /api/v1/admin/configuracion` y envía a `PUT /api/v1/admin/configuracion` el objeto completo modificado, `versionEsperada` y un `motivo`. Puede editar precios, zonas/flete, bombeo, impuesto, desperdicio, vigencia, capacidades, horarios, tiempos operativos y parámetros técnicos. El historial está en `GET /api/v1/admin/configuracion/historial`.

Las respuestas comerciales identifican `datosDemostracion`. Cada revisión conserva las cotizaciones anteriores. Para retirar un registro, conservar su código y desactivarlo; para un mixer, usar `INACTIVO`. La [guía del incremento](docs/05-datos-demo-y-primer-incremento.md) contiene los valores ficticios y ejemplos de solicitudes.

## Cotización pública

1. Consultar `GET /api/v1/catalogos` y obtener versión/códigos activos.
2. Enviar mediciones a `POST /api/v1/cotizaciones/calcular`; el servidor devuelve el desglose.
3. Confirmar con `POST /api/v1/cotizaciones`, contacto, obra y `versionConfiguracion`. El header `Idempotency-Key` requiere un UUID v4 aleatorio; reutilizarlo únicamente al reintentar la misma solicitud.
4. Guardar el `tokenComprobante` devuelto. Consultar `GET /api/v1/cotizaciones/:id/comprobante` o `/:id/pdf` con ese token Bearer.

La fecha preferida y los viajes estimados requieren confirmación posterior. La aprobación comercial todavía no genera una programación de recursos.

## Desarrollo y comprobaciones

Con PostgreSQL/semilla inicializados, detener el contenedor API y usar el servidor local:

```bash
docker compose stop api
npm ci
npm run dev
```

Comprobaciones:

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
```

Las pruebas integradas crean una base temporal propia y la eliminan al terminar; conservan los datos de desarrollo. Requieren la cuenta de migración del `.env`. Verificación: **23 pruebas de reglas y 26 de integración**, además de typecheck/build e imagen Docker con Node.js 24/PostgreSQL 16. El PDF de muestra se revisó visualmente con fuentes incorporadas.

El frontend del catálogo y del módulo administrativo ya consume esta API. `GET /api/v1/admin/reportes` y `/api/v1/admin/reportes/exportar.csv` requieren administrador. Para incorporar 198 cotizaciones ficticias de historia semanal, ejecutar `npm run db:seed:reportes` o el comando Docker indicado en la guía; la semilla conserva los registros anteriores y es idempotente.

Siguen en el plan: pedidos/reservas, despacho/cronómetro, calidad/ensayos, pronóstico validado con despachos, entrega de eventos a n8n y recuperación operativa. El evento de solicitud ya se guarda en PostgreSQL; el worker de notificaciones está pendiente. La alerta semanal del panel se calcula al consultarlo y no envía mensajes externos.
