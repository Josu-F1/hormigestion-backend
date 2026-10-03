# Dashboard y reportería administrativa

Incremento del 3 de octubre de 2026. Implementa el módulo 3.5 con datos agregados de cotizaciones, proyección estadística y pulso semanal. El frontend consume la API real; no mantiene otra fuente de métricas.

Para el alcance general, APIs preparadas y módulos pendientes, consultar [ESTADO_DEL_PROYECTO.md](ESTADO_DEL_PROYECTO.md). La guía de arranque/colaboración está en [CONTRIBUTING.md](../CONTRIBUTING.md).

## API y autorización

| Método/ruta | Respuesta |
| --- | --- |
| `GET /api/v1/admin/reportes` | JSON de indicadores, demanda, proyección, planificación, alerta y recomendaciones |
| `GET /api/v1/admin/reportes/exportar.csv` | Archivo CSV con resumen, resistencias, zonas y serie diaria del período |

Ambas rutas requieren JWT Bearer válido y rol `ADMINISTRADOR`, comprobado en el servidor contra la cuenta vigente. 401 para falta/vencimiento del acceso; 403 para otros roles. No incluyen teléfonos, correos, direcciones de obra, tokens ni comprobantes privados.

Parámetros opcionales: `desde`, `hasta` (ISO `YYYY-MM-DD`), `origen` (`DEMO`/`REAL`), `resistencia` y `zona` (códigos de configuración). El servidor valida fechas, intervalo ordenado de hasta 366 días y existencia de códigos; permite consultar códigos desactivados para conservar su historial. Los parámetros desconocidos se rechazan. Por defecto usa los últimos 28 días y el origen correspondiente a la configuración DEMO de la planta.

Ejemplo, reemplazando `$TOKEN_ADMIN` por el token de la sesión:

```bash
curl -H "Authorization: Bearer $TOKEN_ADMIN" \
  'http://127.0.0.1:3000/api/v1/admin/reportes?desde=2026-09-01&hasta=2026-09-30&origen=DEMO&resistencia=FC-210'
```

El contrato actualizado se publica en `/api/v1/openapi.json`.

## Consolidación y consistencia

`PgReportStore` lee configuración y agregados en una transacción `REPEATABLE READ`. Un CTE parametrizado filtra cabeceras antes de consolidar detalles, evitando multiplicar conteos o importes cuando una cotización incluye varias resistencias. El índice incremental `002_reporteria.sql` cubre origen/fecha; no cambia la migración anterior ni borra tablas.

- Cada cotización se cuenta una vez en el resumen; por resistencia se usa el conteo único de cabeceras coincidentes.
- Volumen y valor proceden de los detalles históricos; un filtro de resistencia suma solamente esos detalles.
- `valorHormigon` conserva los subtotales registrados, sin volver a calcular con precios actuales. Excluye flete, bombeo e impuesto.
- Los estados aplican el vencimiento con el reloj del servidor, incluyendo el instante exacto de expiración.
- DEMO/REAL se filtran mediante `datos_demostracion` del registro, conservando la separación incluso si cambia el modo de la planta.
- El período anterior tiene la misma cantidad de días; las fechas y semanas corresponden a la zona horaria configurada. La agrupación usa [funciones de fecha de PostgreSQL](https://www.postgresql.org/docs/17/functions-datetime.html).
- La demanda incluye todos los estados y refleja interés cotizado, no ventas, pedidos o despachos.

El JSON incorpora `indicadores`, `indicadoresAnteriores`, `periodoAnterior`, `demanda`, `proyeccion`, `planificacion`, `alertaSemanal`, `recomendaciones`, `metodologia`, filtros/opciones, versión de configuración y momento de generación. Los decimales viajan como cadenas; los conteos, como enteros.

## Proyección y alerta

Historial máximo: 26 semanas cerradas. Se excluye la primera observada y la semana en curso. Mínimo: cuatro completas. Modelos de nivel: última semana, media móvil de cuatro y suavizamiento exponencial con cuatro alfas; selección por RMSE en validación temporal. La evaluación ofrece semanas de prueba, MAE, RMSE y WAPE. Con solo cuatro semanas el modelo inicial es la media y el error es desconocido. Sin suficiente historia se devuelve `HISTORIAL_INSUFICIENTE` y no se inventa un volumen.

Cada resistencia se pronostica por separado y los decimales redondeados se suman para conservar el total. Las cuatro semanas futuras mantienen ese nivel; no se extrapolan tendencias. Las zonas reciben proporciones de las últimas cuatro semanas y el ajuste del redondeo conserva la suma. Los filtros de origen/resistencia/zona afectan la proyección; las fechas del reporte no sustituyen su cobertura histórica.

El pulso identifica semana local y segmento con un ID estable. Compara las dos semanas anteriores completas, advierte ante variación absoluta ≥20%, historia insuficiente o estimación >80% de capacidad nominal. Se calcula al consultar el panel. No crea un evento de notificación semanal ni envía mensajes externos.

Precios, horario, capacidad de producción, días laborables y volumen de viaje se mantienen en la configuración editable/versionada. Los umbrales 20%/80% son iniciales y están en `ReportService`; todavía no tienen un campo administrativo propio. La referencia de capacidad no representa agenda disponible. Las recomendaciones requieren confirmar pedidos antes de producir hormigón fresco o asignar mixers.

Fuentes: [métodos simples](https://otexts.com/fpp3/simple-methods.html) y [validación temporal](https://otexts.com/fpp3/tscv.html). El error es orientativo para la selección de modelos sobre cotizaciones; no es un intervalo de confianza ni una garantía de acierto futuro. Integrar despachos y evaluar contra demanda efectiva sigue pendiente para completar ese alcance del acta.

## Semilla demostrativa

Inicializar migraciones y la semilla base antes de añadir la historia del panel:

```bash
npm run db:migrate
npm run db:seed:demo
npm run db:seed:reportes
```

Con la imagen Docker reconstruida:

```bash
docker compose run --rm migrate
docker compose run --rm seed-demo
docker compose run --rm api node dist/infrastructure/database/seed-report-demo.js
```

La última operación requiere `DEMO_MODE=true`, configuración demostrativa y entorno distinto de producción. Incorpora 198 cotizaciones ficticias, con contactos explícitamente no reales, volúmenes variables, varios estados y mezcla de resistencias/zonas. Usa un bloqueo transaccional y marcador de auditoría `reporteria-demo-v1`; repetirla no duplica ni restaura registros anteriores. No crea pedidos, despachos, reservas o eventos externos. Su historia se ancla a la fecha de la primera ejecución; no se regenera al cambiar de semana.

## CSV

Archivo UTF-8 con BOM, separador `;`, celdas entre comillas y saltos CRLF. Se protegen textos que puedan interpretarse como fórmulas de una hoja de cálculo. Se incluyen origen, período, zona horaria y alcance de las cifras, sin datos personales. El JSON y el CSV aplican las mismas reglas y autorización.

## Verificación e integración

23 pruebas de reglas y 26 de integración, typecheck/build e imagen Docker con Node.js 24/PostgreSQL 16. Casos administrativos: 401/403, agregación de cotizaciones mixtas, filtros combinados, DEMO/REAL, errores de consulta, resultado vacío, histórico/proyección reconciliados, exportación sin información de contacto, frontera semanal local y expiración inclusiva. La semilla se prueba dos veces, preservando datos anteriores y verificando ausencia de eventos ficticios. Las pruebas usan una base temporal y no borran el volumen de desarrollo.

La [guía del frontend](../../hormigestion-frontend/docs/02-modulo-administrativo.md) documenta su interfaz. Para integrar operaciones futuras, añadir repositorios de pedidos/despachos y su relación con cotización, conservar el origen DEMO/REAL y ampliar las fuentes/evaluación del pronóstico. No reutilizar cotizaciones como si fueran producción ejecutada.
