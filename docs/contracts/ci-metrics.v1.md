# Contrato provisional de métricas CI v1

> **PROVISIONAL — PENDIENTE DE VALIDACIÓN CON AGENTEGESTIONPROYECTOS.** Este contrato prepara evidencia futura; no significa que AgenteGestionProyectos ya consuma el artefacto.

## Propósito y alcance

`reports/ci-metrics.json` identifica una ejecución de CI y publica las pruebas unitarias, las pruebas de integración y la cobertura de líneas que realmente se pudo medir. El formato versionado se valida con [`schemas/ci-metrics.v1.schema.json`](../../schemas/ci-metrics.v1.schema.json). El CLI no incorpora dependencias: usa módulos de Node.js.

`total_tests` y `failed_tests` agregan **solo** las pruebas backend unitarias e integradas representadas por `unit-summary.json` e `integration-summary.json`. Las pruebas de tooling/CI que se ejecuten por separado no forman parte de esos conteos. Se agregan únicamente cuando ambos resúmenes están completos y son válidos; en otro caso ambos valores son `null`. Los conteos por suite conservan la evidencia individual disponible.

## Identidad y estado

| Campo | Origen y significado |
| --- | --- |
| `schema_version` | Literal `v1`. |
| `repository` | `GITHUB_REPOSITORY`, con formato `owner/repo`. |
| `commit_sha` | `GITHUB_SHA`, SHA completo de 40 caracteres correspondiente al checkout realmente probado. No se crea una identidad local ficticia. |
| `workflow_run_id` | `GITHUB_RUN_ID`, conservado como cadena decimal. |
| `workflow_run_attempt` | `GITHUB_RUN_ATTEMPT`, cadena decimal opcional. |
| `status` | `CI_STATUS`: `success`, `failure` o `cancelled`, calculado por el workflow con el resultado de sus comprobaciones. |
| `e2e_status` | Extensión frontend opcional: puede ser `not_implemented`. El backend no la emite ni la requiere. |

En pull requests el workflow prueba el **SHA de origen del PR** (`github.event.pull_request.head.sha`), registra el SHA real de `git rev-parse HEAD` como `GITHUB_SHA` para el generador y asocia el artefacto a ese checkout y a esa ejecución de Actions. No se sustituye por el SHA de merge sintético de GitHub y no se afirma compatibilidad del resultado con dicho merge.

El estado no se deduce de los conteos. Un pipeline fallido sigue siendo `failure` aunque las dos suites pasen. `success` se rechaza si falta un resumen completo o si una suite informa fallas/no éxito. En pipelines fallidos o cancelados, un resumen ausente representa métricas desconocidas (`null`); un resumen presente pero malformado se rechaza. Los datos inválidos no reemplazan un artefacto existente.

El esquema permite extensiones adicionales a nivel superior (`additionalProperties: true`) para coordinar consumidores. La extensión frontend acordada puede incluir `e2e_status: "not_implemented"`; no representa un reporte E2E ni se incluye en los campos requeridos compartidos. `coverage_basis` también es compartido, pero su valor es una descripción no vacía **propia de cada productor**: el backend declara su medición de archivos cargados `src/**/*.ts`; el frontend describe únicamente su subconjunto real de componentes TypeScript. No se exige la frase backend a otro productor.

La política de agregación descrita aquí es específica del backend: solo suma las suites unit e integración cuando ambos resúmenes backend existen y son completos. El frontend, que aún no tiene reporte de integración, puede omitir por completo el objeto opcional `test_suites`; no debe fabricar un informe de integración para satisfacer este contrato.

## Conteos por suite

El reporter `scripts/ci-reporter.mjs` consume los eventos de `node:test` y emite un único documento JSON al terminar normalmente el stream, sin texto humano. Los archivos `reports/unit-summary.json` y `reports/integration-summary.json` no contienen identidad; el workflow los mantiene en el directorio limpio de esa ejecución.

Cada resumen tiene esta forma:

```json
{
  "schema_version": "ci-suite-summary.v1",
  "counts": {
    "tests": 12,
    "failed": 0,
    "passed": 10,
    "cancelled": 0,
    "skipped": 1,
    "todo": 1,
    "success": true
  },
  "coverage": null,
  "coverage_basis": "Not collected (no test:coverage event; integration reporter runs without test coverage)."
}
```

`counts` toma la última notificación `test:summary`. Si no existe o un campo no está disponible, se conserva como `null`; no se inventan ceros. En el artefacto final, `test_suites.unit` y `test_suites.integration` contienen sus conteos o `null`. Un conteo real igual a `0` no equivale a un conteo desconocido.

## Cobertura

La cobertura se obtiene únicamente de los eventos reales `test:coverage` del reporter de la suite unitaria. El workflow restringe la medición a archivos cargados que coinciden con `src/**/*.ts` mediante `--experimental-test-coverage` y `--test-coverage-include=src/**/*.ts`; no habilita `--test-coverage-include-all`. Las rutas incluidas se expresan relativas al `workingDirectory` de Node, por ejemplo `src/domain/cotizacion.ts`. Se excluyen rutas fuera de `src/**/*.ts`.

El objeto `coverage` del resumen unitario incluye `metric: "lines"`, `coveredLineCount`, `totalLineCount`, las cantidades equivalentes de ramas/funciones cuando están disponibles y los archivos medidos. El artefacto v1 publica:

- `coverage_percentage`: porcentaje de líneas cubiertas, calculado como `coveredLineCount / totalLineCount * 100` y redondeado a dos decimales.
- `coverage_metric`: `"lines"` cuando hay un total de líneas medible; `null` si falta la medición.
- `coverage_basis`: descripción no vacía de la base realmente medida por ese productor. En el backend indica archivos cargados `src/**/*.ts` de la suite unitaria; la suite de integración no mide cobertura y las pruebas de tooling no se suman ni a la cobertura ni a los conteos backend. Otros productores informan su propio subconjunto sin copiar esta frase.

Cero líneas cubiertas de un total conocido produce `0`; ausencia de informe, ausencia de archivos coincidentes o denominador no medible produce `null`. No hay umbral de cobertura bloqueante.

## Generación y validación

Desde la raíz del checkout con Node.js compatible con el proyecto:

```sh
node scripts/ci-metrics.mjs --help
node scripts/ci-metrics.mjs
```

El CLI lee `reports/unit-summary.json` y `reports/integration-summary.json`, requiere `GITHUB_REPOSITORY`, `GITHUB_SHA`, `GITHUB_RUN_ID` y `CI_STATUS`, y acepta `GITHUB_RUN_ATTEMPT` como opcional. Valida identidad, estado e informes; después valida el documento construido contra el esquema v1 y solo entonces escribe `reports/ci-metrics.json`. No hay valores de identidad por defecto para ejecución local.

El validador exportado `validateCiMetrics` implementa el subconjunto de esquema usado aquí: tipos, `enum`, `const`, `pattern`, límites numéricos, campos requeridos y propiedades adicionales. No se presenta como un motor JSON Schema general.

## Estado de interoperabilidad

v1 es una propuesta provisional para futura interoperabilidad con MultiRepo. Antes de que otro sistema consuma el artefacto, deben validarse con AgenteGestionProyectos los nombres, la semántica de estado y la política de SHA. Este cambio no implementa ingesta automática en el agente ni modifica el comportamiento funcional del backend.
