# HormiGestión backend

Leer [docs/ESTADO_DEL_PROYECTO.md](docs/ESTADO_DEL_PROYECTO.md) y [CONTRIBUTING.md](CONTRIBUTING.md) antes de implementar. La auditoría y el plan inicial son antecedentes; el inventario vigente distingue funcionalidad terminada, API sin interfaz y módulos pendientes.

- Stack: Node.js 24 LTS, npm/`package-lock.json`, TypeScript, Express 5, PostgreSQL 16. Reutilizar la arquitectura de dominio, aplicación e infraestructura.
- HTTP/contrato: `src/app.ts`, `src/infrastructure/openapi.ts`. Servicios: `src/application/`. Reglas: `src/domain/`. Persistencia/migraciones: `src/infrastructure/database/`.
- Mantener precios/cálculos en el servidor, decimales de respuesta como cadenas, snapshots históricos, control de versión e idempotencia. Conservar DEMO/REAL y los roles canónicos.
- Autorización en backend y comprobación de cuenta activa por petición. La aprobación de cotización no implica pedido ni reserva. Outbox persistido no implica notificación enviada.
- Evolucionar PostgreSQL con migraciones nuevas; conservar checksums de las aplicadas y privilegios limitados de aplicación. No ejecutar el SQL original destructivo ni eliminar el volumen para actualizar.
- Conservar cambios locales del usuario, `.env` y secretos fuera de Git. Revisar estado/ramas antes de actuar; el acuerdo actual de este repositorio parte de `main`.
- Verificar los cambios pertinentes con `npm run typecheck`, `npm test`, `npm run test:integration` y `npm run build`; integración usa el runner aislado. Para documentación solamente, comprobar referencias y coherencia con el código.
- Actualizar inventario y OpenAPI cuando cambie una funcionalidad/contrato. No presentar una propuesta o parámetro preparado como módulo implementado.
