# Colaboración en el backend

Leer primero el [estado vigente](docs/ESTADO_DEL_PROYECTO.md). Allí se distingue la API implementada de las operaciones pendientes. Esta guía permite preparar otra máquina y entregar cambios sin reinicializar la base del equipo.

## 1. Preparar una instalación local

Requisitos: Node.js 24 LTS, npm y Docker con Compose. Ejecutar desde `hormigestion-backend`:

```bash
node --version
npm ci
npm run setup:local
docker compose up -d postgres
docker compose build api
docker compose run --rm migrate
docker compose run --rm seed-demo
docker compose up -d api
curl --fail http://127.0.0.1:3000/health/ready
```

`setup:local` crea `.env` con secretos independientes y conserva el archivo si existe. Cada integrante usa sus propias credenciales locales. La contraseña inicial de las cuentas ficticias es `DEMO_PASSWORD` de ese archivo; los correos/roles figuran en el [README](README.md). Mantener `.env`, tokens y datos personales fuera de commits, capturas y comentarios.

La API escucha en `127.0.0.1:3000` y PostgreSQL en `127.0.0.1:55432`. `DATABASE_URL` usa la cuenta limitada de aplicación; `MIGRATION_DATABASE_URL` usa el migrador. No sustituir la cuenta de aplicación por el propietario para resolver un permiso faltante.

Para demostrar reportes con historia, después de la semilla base:

```bash
docker compose run --rm api node dist/infrastructure/database/seed-report-demo.js
```

Requiere `DEMO_MODE=true`, configuración demostrativa y entorno distinto de producción. Añade 198 cotizaciones ficticias una sola vez, sin borrar las existentes. La historia se ancla a su primera ejecución; un período sin datos o el origen REAL vacío son resultados válidos. Repetirla no actualiza fechas ni restablece contraseñas/tarifas.

Para detener conservando el volumen: `docker compose stop`. `docker compose down -v` elimina los datos locales y no forma parte del arranque ni de la actualización habitual. El SQL original `../hormigestion_db_schema(1).sql` contiene limpieza destructiva: usar las migraciones del repositorio.

## 2. Desarrollar y actualizar

Con PostgreSQL iniciado e inicializado, ejecutar la API desde TypeScript:

```bash
docker compose stop api
npm run dev
```

Usar un solo servidor API en el puerto 3000. Para actualizar el entorno Docker después de recibir cambios, conservar `.env` y volumen:

```bash
npm ci
docker compose build api
docker compose run --rm migrate
docker compose up -d api
```

Añadir cambios de base mediante una nueva migración numerada, por ejemplo `003_<cambio>.sql`, comprobando qué número sigue disponible en la rama compartida. El migrador conserva checksum y rechaza cambios en archivos ya aplicados. Revisar también los permisos de la cuenta de aplicación en [migrate.ts](src/infrastructure/database/migrate.ts); las nuevas entidades deben tener permisos acordes a su uso. Mantener datos históricos y probar la actualización sobre una base existente.

Al cambiar una respuesta o entrada, actualizar [OpenAPI](src/infrastructure/openapi.ts), validación, pruebas pertinentes y consumidores del frontend en la misma entrega coordinada. Conservar códigos, roles, decimales como cadenas, error en español, versiones esperadas, idempotencia y separación DEMO/REAL detallados en [el inventario](docs/ESTADO_DEL_PROYECTO.md).

## 3. Ramas y entrega

La inicialización y estos incrementos del backend están en `main`, según el acuerdo del proyecto. No se ha establecido aquí una cadena obligatoria `develop` para este repositorio; esa estructura corresponde al frontend.

Antes de empezar, comprobar `git status` y actualizar la base compartida con `git pull --ff-only`. Si hay commits locales sin publicar, revisar el historial antes de integrar; no resetear trabajo para forzar la actualización. Para trabajo simultáneo se puede usar `feature/<modulo>` desde `main` y abrir PR a `main`, conservando el trabajo de los demás.

La entrega debe indicar:

- Comportamiento implementado y endpoints/roles afectados.
- Migraciones y comandos adicionales de instalación, si existen.
- Resultado de las comprobaciones pertinentes y límites de alcance.
- Cambios que el frontend necesita; actualizar [ESTADO_DEL_PROYECTO](docs/ESTADO_DEL_PROYECTO.md).

## 4. Comprobaciones y problemas frecuentes

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
```

El runner de integración crea y elimina **su propia base temporal**; necesita PostgreSQL iniciado y la cuenta de migración con permisos para crear esa base. Usar `npm run test:integration`, no ejecutar directamente el archivo de pruebas sobre la base de desarrollo. La evidencia anterior es de 23 casos unitarios y 26 integrados; registrar el resultado real de cada entrega.

| Síntoma | Revisar/acción |
| --- | --- |
| `/health/live` responde pero `/health/ready` falla | PostgreSQL, migraciones y configuración inicial; `docker compose ps` y logs del servicio afectado |
| Puerto 3000/55432 ocupado | Otra instancia API/DB; detener la instancia local duplicada o configurar puertos y URLs de forma coherente |
| Login falla tras cambiar `DEMO_PASSWORD` | La semilla conserva usuarios existentes; cambiar la variable no cambia su contraseña almacenada. Usar la contraseña original o el endpoint administrativo de edición |
| 401/403 | JWT vencido/cuenta inactiva o rol sin permiso; iniciar sesión con el rol requerido |
| 409 al confirmar/editar | Releer versión vigente; recalcular cotización o revisar clave de idempotencia antes de reintentar |
| Reporte REAL vacío | No hay datos reales para los filtros. No mezclarlo con DEMO para llenar indicadores |
| Error de checksum | Revisar cambios en migraciones aplicadas; recuperar el archivo original y añadir la evolución en una nueva migración |
| Frontend no conecta | API en 3000, proxy de Vite, ruta `/api/v1`; para otro origen configurar `CORS_ORIGINS` explícitamente |

Las verificaciones manuales, cambios comerciales y pruebas deben usar datos ficticios identificados. Los informes y respaldos con datos reales requieren su tratamiento operativo cuando se implemente ese entorno.
