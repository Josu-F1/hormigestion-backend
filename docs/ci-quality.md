# Pruebas y evidencia de calidad

El workflow [Backend quality](../.github/workflows/ci.yml) verifica pushes y PR hacia `develop` y `main`. No despliega, no hace merge ni publica datos fuera de los artefactos de Actions. La entrega de estos cambios va de `feature/ci-quality-metrics` hacia `develop`; `main` no cambia hasta una aprobación posterior.

## Ejecutar localmente

Usar Node.js **24 LTS** (`.node-version`; el proyecto admite `>=24 <27`) y PostgreSQL **16**:

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run test:ci-tools
npm run build
npm run test:integration
```

`npm test` conserva el runner original y no necesita base de datos. `test:coverage` ejecuta las mismas unitarias y escribe `reports/unit-junit.xml`, `reports/unit-lcov.info` y `reports/unit-summary.json`. `test:ci-tools` comprueba el generador y los reportes con datos temporales; sus fixtures no se suman como pruebas del backend.

### Integración aislada

Con la instalación local preparada según [CONTRIBUTING](../CONTRIBUTING.md), iniciar PostgreSQL y usar **solamente un servidor de pruebas/desarrollo autorizado**. El runner toma `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DB_PASSWORD`, `JWT_SECRET` y `COMPROBANTE_SECRET` de la configuración. Los secretos deben ser independientes y cumplir la validación de entorno. No copiar credenciales de producción.

```bash
NODE_ENV=test TEST_REPORTS_DIR=reports npm run test:integration
```

La cuenta migradora debe poder crear/eliminar bases, administrar el rol `hormigestion_app` y terminar conexiones de su base temporal. El runner genera una base `hormigestion_test_<id>`; la suite aplica las migraciones incrementales y comprueba la cuenta limitada de aplicación. No ejecutar directamente `tests/integration/api.test.ts`, no usar el SQL destructivo original y no eliminar volúmenes para actualizar.

El bloque `finally` cierra conexiones y elimina la base creada. Un apagado forzado puede impedir esa limpieza. Además, el migrador crea o cambia la contraseña de un **rol del servidor PostgreSQL**, por lo que el aislamiento de base no sustituye el aislamiento del servidor. En CI se usa un servicio PostgreSQL efímero exclusivo del job, sin volúmenes ni secretos productivos.

Sin `TEST_REPORTS_DIR`, el comando integrado conserva su salida local habitual. Con esa variable genera `integration-junit.xml` e `integration-summary.json` en el directorio indicado.

## Interpretar cobertura

Se utiliza la instrumentación nativa V8 de `node:test`, habilitada mediante `--experimental-test-coverage`, con `tsx` y el filtro `--test-coverage-include=src/**/*.ts`. No se añade una dependencia ni se cambia la lógica del backend.

La métrica es **líneas cubiertas / líneas medidas × 100** de los archivos TypeScript de `src/` **cargados por las pruebas unitarias**. No representa todos los archivos del backend: archivos no cargados no están en el denominador. Los paths y totales de la medición quedan en el resumen; LCOV permite contrastar `LF` y `LH`. No se promedian porcentajes por archivo.

La integración se reporta por separado y no se suma a la cobertura unitaria. Una cobertura alta no demuestra cobertura de HTTP, autorización, base de datos ni casos no ejercitados. Node puede cambiar su instrumentación entre versiones: comparar resultados con la misma versión y base. **No existe umbral bloqueante de 80 %**; su adopción requiere un acuerdo posterior.

## Evidencia local de esta entrega

Con Node.js **24.22.0** y PostgreSQL **16**, se observaron **23/23 unitarias**, **26/26 integradas**, typecheck y build correctos. La cobertura unitaria fue **373/381 líneas (97,90 %)**, reconciliada entre `unit-summary.json` y los totales `LH`/`LF` de LCOV. Los seis archivos medidos fueron `src/domain/{configuracion,cotizacion,demo,errors,reporteria}.ts` y `src/infrastructure/env.ts`.

Es evidencia local de la implementación, no una ejecución de GitHub Actions ni un porcentaje garantizado para cambios futuros. El resultado de cada commit se consulta en su propia ejecución y artefacto.

## Consultar Actions y artefactos

1. Abrir **Actions → Backend quality → ejecución** en GitHub.
2. Revisar typecheck, tooling, unitarias, build e integración. Cada paso conserva su salida y código de salida; un fallo no se oculta para obtener verde.
3. Descargar `ci-quality-<SHA>-<run_id>-<attempt>` en **Artifacts** (retención: 14 días).
4. Contrastar `ci-metrics.json` con JUnit, LCOV, los resúmenes y el commit probado.

El checkout de un PR usa explícitamente su **commit fuente** (head), igual que `run.head_sha` de Actions; no certifica el merge sintético con la base. Para pushes usa el commit del evento. El SHA se captura con `git rev-parse HEAD`, se pasa al generador y aparece en el nombre del artefacto junto al ID e intento de ejecución. Nunca atribuir estos resultados a otro SHA.

El workflow intenta generar/subir evidencia incluso con fallos. Un servicio que no inicia, cancelación forzada o fallo anterior al checkout puede impedir artefactos: **ausencia de artefactos es ausencia de prueba**, no cero fallos. El estado dentro de las métricas resume los pasos de calidad anteriores a la publicación; la conclusión final de Actions también puede fallar si falla generar o subir el artefacto. El consumidor debe comprobar ambos.

El token automático tiene únicamente `contents: read`; checkout no conserva credenciales. No se usa `pull_request_target`, tokens personales, secretos de repositorio ni servicios externos de cobertura.

## Contrato para consumidores

Ver [contrato provisional v1](contracts/ci-metrics.v1.md) y [JSON Schema](../schemas/ci-metrics.v1.schema.json). El adaptador actual de AgenteGestionProyectos todavía no descarga estas métricas: el artefacto prepara compatibilidad futura, no activa integración ni escrituras externas.

`ci:metrics` requiere identidad real de Actions y estado explícito. No fabrica IDs locales. Los resúmenes pueden obtenerse localmente, pero no deben publicarse como evidencia de una ejecución que no ocurrió.
