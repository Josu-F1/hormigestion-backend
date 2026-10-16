# CI quality metrics
Branch: feature/ci-quality-metrics from develop (549d7b47862e0c416dc433fbcb43f14a9fe64275). Delivery: single-pr, explicitly requested PR to develop. Runner: Node 24 node:test.
Objective: reproducible CI and provisional evidence; no backend functional changes. Forecast: ~650 authored lines plus tests; review load spans reporting and workflow, separate commits.

## Specs
S1. ### 1. Revisar las pruebas actuales

Inspeccionar `package.json`, `tests/`, `scripts/` y la configuración de base de datos.

Comprobar que las pruebas unitarias funcionan de forma reproducible.

Identificar los requisitos de PostgreSQL y migraciones antes de integrar las pruebas de integración.

No cambiar el comportamiento funcional del backend únicamente para conseguir que CI pase.


S2. ### 2. Crear GitHub Actions

Añadir un workflow en `.github/workflows/`.

Debe ejecutarse en:

- Push a `develop`.
- Pull requests hacia `develop`.
- Push a `main`.
- Pull requests hacia `main`.

Configurar Node.js compatible con el proyecto, instalar dependencias mediante `npm ci` y ejecutar:

- Comprobación de tipos.
- Pruebas unitarias.
- Compilación.
- Pruebas de integración, con PostgreSQL aislado cuando sea necesario.

Evitar credenciales de producción. Utilizar permisos mínimos del `GITHUB_TOKEN` automático.


S3. ### 3. Incorporar medición de cobertura

Evaluar el mecanismo de cobertura adecuado para el test runner existente de Node.js.

Generar una medición real, reproducible y verificable.

La cobertura debe informar al menos su porcentaje y la base de medición utilizada. No asignar cobertura estimada.

No imponer el umbral del 80 % como bloqueo hasta conocer la cobertura real y acordar su adopción.


S4. Sí, autorizo crear un **contrato provisional de métricas CI, versionado como v1**, porque AgenteGestionProyectos todavía no tiene un esquema formal para MultiRepo.

Repositorio del agente:
https://github.com/Saimol-Uta/AgenteGestionProyectos/tree/codex/frontend-manager-phase1

Referencias existentes:
- `src/agente_gestion/domain/code.py` — modelo `CIRunResult`.
- `src/agente_gestion/adapters/sources/actions.py` — adaptador de GitHub Actions.
- `src/agente_gestion/quality/evaluator.py` — evaluación de métricas y políticas.

**Instrucciones para el backend:**

1. Crear `docs/contracts/ci-metrics.v1.md` para documentar el contrato provisional.
2. Crear `schemas/ci-metrics.v1.schema.json` para validar su estructura.
3. Generar `ci-metrics.json` como artefacto de GitHub Actions.
4. Incluir obligatoriamente:
   - `schema_version`
   - `repository` (formato `owner/repo`)
   - `commit_sha`
   - `workflow_run_id`
   - `status`
   - `total_tests`
   - `failed_tests`
   - `coverage_percentage`
   - `coverage_metric` (por ejemplo, `lines`)
5. Permitir `null` para métricas no disponibles. No convertir datos desconocidos en cero ni inventar porcentajes de cobertura.
6. Obtener las métricas de resultados reales de las herramientas de pruebas y cobertura.
7. Garantizar que los artefactos estén asociados al commit y ejecución correctos.
8. Mantener compatibilidad futura con el frontend y AgenteGestionProyectos mediante este esquema versionado.

**Importante:** documentar claramente que el contrato es `PROVISIONAL — PENDIENTE DE VALIDACIÓN CON AGENTEGESTIONPROYECTOS`.

No modificar `main`, no activar escrituras externas y no imponer todavía el umbral del 80 % como condición bloqueante.

Implementar en una rama desde `develop` y abrir un PR hacia `develop`, sin realizar el merge automáticamente.
S5. ### 5. Documentación

Documentar cómo ejecutar las pruebas localmente, cómo interpretar la cobertura y cómo consultar los artefactos del workflow.

## Criterios de aceptación

1. GitHub Actions se ejecuta correctamente sobre `develop`.
2. Las pruebas unitarias y de integración son reproducibles.
3. La compilación y comprobación de tipos funcionan.
4. Se generan reportes de CI verificables.
5. Los artefactos quedan vinculados al commit correcto.
6. `main` permanece sin cambios hasta aprobar el PR.

## Entrega

Crear una rama `feature/ci-quality-metrics` desde `develop`.

Entregar el PR hacia `develop`, indicando pruebas ejecutadas, cobertura obtenida y problemas detectados.

No hacer merge automático ni modificar producción.

S6. Autorizo continuar con la entrega bajo las siguientes condiciones:

1. Comprueba si existe una issue aprobada que cubra CI Quality Metrics. Si no existe, autorizo crear una nueva, con alcance, criterios de aceptación y trazabilidad de los commits `2e10178` y `e61ebe2`.

2. Mantén la política de una rama por issue y un único PR. Puedes publicar `feature/ci-quality-metrics` y preparar un PR Draft hacia `develop`, vinculado a la issue correspondiente.

3. La revisión nativa sigue siendo obligatoria. Intenta resolver el bloqueo mediante los mecanismos disponibles. Si no es posible, documenta la limitación y deja el PR explícitamente pendiente de revisión, sin sustituirla por una aprobación simulada.

4. Verifica especialmente el riesgo 5: permisos del workflow, procedencia de artefactos CI, trazabilidad del commit, integridad de evidencias y protección frente a exposición de secretos.

5. Ejecuta CI remoto mediante GitHub Actions y documenta los resultados. No presentes las verificaciones locales como equivalentes a una ejecución remota.

6. Reporta la cobertura del 97,90 % únicamente sobre los seis archivos instrumentados, no como cobertura global del frontend.

7. No realices merge hacia `develop` hasta cumplir los controles de aprobación, revisión y CI. No modifiques `main` ni producción.

Al finalizar, entrega los enlaces de la issue y del PR, los resultados de Actions y los bloqueos pendientes.

## Tasks
- T1 | S1-S4,S6 | initial delegated reporting writer + inline workflow; reopened inline for proven remote SHA binding defect and targeted independent verification | done | commit: 2e101780f0ba61477486c9b3a2ac77f6e07e1f17; writer settled 13/13 tests; full Node24 tooling seam 15/15 (job-10). Baseline 23 unit +26 integration pass; helper RED then GREEN 2/2; actionlint corrected then GREEN. Node24.22 npm ci/typecheck/build passed. Reports: unit23/23, integration26/26, 373/381 lines =97.90%, LCOV reconciled. Independent verifier mva8lx5z-3-ia7x settled: S1/S3/S4/S5 PASS locally, S2 PARTIAL only because remote Actions not run. Independent Node24 tooling15/15, typecheck/build/actionlint PASS; CLI isolated probes and JUnit/LCOV reconcile. No code blockers. Parent staging explained; source-drift concern withdrawn. Scratch cleanup blocked by child safety; ignored .local/ci-quality-verify.Up3tca preserved. Native assess unavailable on workspace due untracked inventory; committed candidate assessment next. One coherent CI/reporting work unit committed with tests and docs: 2e101780f0ba61477486c9b3a2ac77f6e07e1f17. Committed-only native assessment remains unassessable because unrelated .codegraph inventory requires declaration; no additional test run is warranted.
- T2 | S2,S5,S6 | inline: mandatory native review in isolated same-clone worktree | blocked | implementation/docs commit: 2e101780f0ba61477486c9b3a2ac77f6e07e1f17; all functional/local independent checks passed. Native assessment unavailable; START returned native-start-retained-selection-candidate-mismatch, mutation_performed:false, mutation_outcome:none. Isolated worktree tree=c5e50a57 matches ec308b4; assessment high, host consent completed, four lens results admitted for review-8d5ad439c41dcdf8. Refuter launch failed reviewer-config-invalid: no model configured for review-refuter; fresh bound STATUS still collect. Native review mandatory, no approval/ack/burn. Human role configuration needed; preserve frozen worktree and do not reset/recover or edit global config. Any new fix on feature branch is not covered by this frozen candidate.
- T3 | S1-S6 | inline: one issue, one Draft PR to develop; Actions and artifact integrity evidence | in_progress | issue#2 and DraftPR#3 created/readback verified; feature published ec308b4. Actions38832147409 SUCCESS35s, but downloaded metrics incorrectly bind synthetic merge541edb9 vs run.head_shaec308b4, so remote acceptance FAIL despite green job. Artifact12017199853 ZIP digest verified1d1c161c0b70336779ae0b545bfad74db1809c23b1339eb936a6120ff2b6a9b4. Wait T1 repair then new remote execution and full artifact comparison. Main remote/local still5412744; no merge/automerge. Parent RED regression: explicit sourceB/defaultA incorrectly emitted A (exit1); fixed dedicated CI_COMMIT_SHA priority, invalid explicit rejects/no overwrite; GREEN focal and Node24 suite16/16+types/build/actionlint exit0 (job16). Independent targeted verifier mva9e1tu-5-tc8g settled PASS: Node24 CLI metrics10/10; no source/index changes. Its actionlint invocation included an extra directory argument and exited3, so independent lint unavailable in this pass; parent correctly targeted actionlint already PASS(job16), no retry needed. Original first-run failure and digest documented in Draft; do not reuse it as acceptance. Fix code/docs/tests committed as 35c232b27e3fcf8e4669c4d304e3d6a6c8a71e9a; local and independent targeted verification complete. Next remote proof must compare downloaded SHA/run/attempt and formats; no assertion yet that remote provenance is repaired.

## Log
L1. Original request (verbatim):
# Tarea: Implementar integración continua y métricas de calidad del backend

## Contexto

El backend está desarrollado en TypeScript y Node.js.

En el `package.json` revisado existen estos comandos:

- `npm test`
- `npm run test:integration`
- `npm run typecheck`
- `npm run build`

El proyecto requiere Node.js `>=24 <27`.

La rama `develop` contiene los últimos cambios de desarrollo y debe mantenerse separada de `main`.

## Cambios requeridos

### 1. Revisar las pruebas actuales

Inspeccionar `package.json`, `tests/`, `scripts/` y la configuración de base de datos.

Comprobar que las pruebas unitarias funcionan de forma reproducible.

Identificar los requisitos de PostgreSQL y migraciones antes de integrar las pruebas de integración.

No cambiar el comportamiento funcional del backend únicamente para conseguir que CI pase.

### 2. Crear GitHub Actions

Añadir un workflow en `.github/workflows/`.

Debe ejecutarse en:

- Push a `develop`.
- Pull requests hacia `develop`.
- Push a `main`.
- Pull requests hacia `main`.

Configurar Node.js compatible con el proyecto, instalar dependencias mediante `npm ci` y ejecutar:

- Comprobación de tipos.
- Pruebas unitarias.
- Compilación.
- Pruebas de integración, con PostgreSQL aislado cuando sea necesario.

Evitar credenciales de producción. Utilizar permisos mínimos del `GITHUB_TOKEN` automático.

### 3. Incorporar medición de cobertura

Evaluar el mecanismo de cobertura adecuado para el test runner existente de Node.js.

Generar una medición real, reproducible y verificable.

La cobertura debe informar al menos su porcentaje y la base de medición utilizada. No asignar cobertura estimada.

No imponer el umbral del 80 % como bloqueo hasta conocer la cobertura real y acordar su adopción.

### 4. Publicar evidencia para AgenteGestionProyectos

Preparar un artefacto estructurado, por ejemplo `ci-metrics.json`, con información suficiente para identificar:

- Repositorio.
- Commit SHA.
- Identificador de ejecución de GitHub Actions.
- Estado de ejecución.
- Cantidad de pruebas ejecutadas y fallidas, cuando sea verificable.
- Porcentaje de cobertura y base de medición, cuando esté disponible.

Acordar su esquema definitivo con la implementación MultiRepo del agente.

Publicar también reportes de pruebas y cobertura en formatos estándar cuando estén disponibles.

### 5. Documentación

Documentar cómo ejecutar las pruebas localmente, cómo interpretar la cobertura y cómo consultar los artefactos del workflow.

## Criterios de aceptación

1. GitHub Actions se ejecuta correctamente sobre `develop`.
2. Las pruebas unitarias y de integración son reproducibles.
3. La compilación y comprobación de tipos funcionan.
4. Se generan reportes de CI verificables.
5. Los artefactos quedan vinculados al commit correcto.
6. `main` permanece sin cambios hasta aprobar el PR.

## Entrega

Crear una rama `feature/ci-quality-metrics` desde `develop`.

Entregar el PR hacia `develop`, indicando pruebas ejecutadas, cobertura obtenida y problemas detectados.

No hacer merge automático ni modificar producción.

L2. User clarification (verbatim):
Sí, autorizo crear un **contrato provisional de métricas CI, versionado como v1**, porque AgenteGestionProyectos todavía no tiene un esquema formal para MultiRepo.

Repositorio del agente:
https://github.com/Saimol-Uta/AgenteGestionProyectos/tree/codex/frontend-manager-phase1

Referencias existentes:
- `src/agente_gestion/domain/code.py` — modelo `CIRunResult`.
- `src/agente_gestion/adapters/sources/actions.py` — adaptador de GitHub Actions.
- `src/agente_gestion/quality/evaluator.py` — evaluación de métricas y políticas.

**Instrucciones para el backend:**

1. Crear `docs/contracts/ci-metrics.v1.md` para documentar el contrato provisional.
2. Crear `schemas/ci-metrics.v1.schema.json` para validar su estructura.
3. Generar `ci-metrics.json` como artefacto de GitHub Actions.
4. Incluir obligatoriamente:
   - `schema_version`
   - `repository` (formato `owner/repo`)
   - `commit_sha`
   - `workflow_run_id`
   - `status`
   - `total_tests`
   - `failed_tests`
   - `coverage_percentage`
   - `coverage_metric` (por ejemplo, `lines`)
5. Permitir `null` para métricas no disponibles. No convertir datos desconocidos en cero ni inventar porcentajes de cobertura.
6. Obtener las métricas de resultados reales de las herramientas de pruebas y cobertura.
7. Garantizar que los artefactos estén asociados al commit y ejecución correctos.
8. Mantener compatibilidad futura con el frontend y AgenteGestionProyectos mediante este esquema versionado.

**Importante:** documentar claramente que el contrato es `PROVISIONAL — PENDIENTE DE VALIDACIÓN CON AGENTEGESTIONPROYECTOS`.

No modificar `main`, no activar escrituras externas y no imponer todavía el umbral del 80 % como condición bloqueante.

Implementar en una rama desde `develop` y abrir un PR hacia `develop`, sin realizar el merge automáticamente.

L3. Evidence: clean develop aligned with origin/develop, feature branch created after fetch/ff-only. main pinned at 5412744023c4b3961be9cd783609423d12280f64. Local Node v26.9.0 is supported but CI will use 24 LTS. PostgreSQL 16 Docker available. Agent adapter currently always emits null metrics; no artifact ingestion exists; v1 is future interoperability, not implemented integration. No issues currently found in target repo; do not invent approved linkage. Generated .codegraph is exploration metadata, exclude from delivery.

L4. Verified implementation committed as 2e101780f0ba61477486c9b3a2ac77f6e07e1f17. Risk: item5 (CI/environment), independent verification completed; local checks reported above. Whole PR ~1567 authored diff lines (244 tracking lines, 508 test lines); one coherent requested CI/reporting delivery, explicit single-PR strategy. No production/backend functional source changes. Native assessment failed with untracked declaration even for committed-only range. Inspect with exclude worked for workspace, but explicit committed START returned native-start-retained-selection-candidate-mismatch, mutation_performed:false, mutation_outcome:none. No lineage created, approval/consent inferred, reset/recover performed, or native verdict claimed. Stop on unavailable native proof pending human disposition, not extra verification. PR/Actions pending approved issue decision. Frontend confirmed same provisional v1 field definitions; agent validation remains outstanding. Reports and child scratch retained ignored; no fake local Actions metrics published.

L5. User delivery authorization (verbatim):
Autorizo continuar con la entrega bajo las siguientes condiciones:

1. Comprueba si existe una issue aprobada que cubra CI Quality Metrics. Si no existe, autorizo crear una nueva, con alcance, criterios de aceptación y trazabilidad de los commits `2e10178` y `e61ebe2`.

2. Mantén la política de una rama por issue y un único PR. Puedes publicar `feature/ci-quality-metrics` y preparar un PR Draft hacia `develop`, vinculado a la issue correspondiente.

3. La revisión nativa sigue siendo obligatoria. Intenta resolver el bloqueo mediante los mecanismos disponibles. Si no es posible, documenta la limitación y deja el PR explícitamente pendiente de revisión, sin sustituirla por una aprobación simulada.

4. Verifica especialmente el riesgo 5: permisos del workflow, procedencia de artefactos CI, trazabilidad del commit, integridad de evidencias y protección frente a exposición de secretos.

5. Ejecuta CI remoto mediante GitHub Actions y documenta los resultados. No presentes las verificaciones locales como equivalentes a una ejecución remota.

6. Reporta la cobertura del 97,90 % únicamente sobre los seis archivos instrumentados, no como cobertura global del frontend.

7. No realices merge hacia `develop` hasta cumplir los controles de aprobación, revisión y CI. No modifiques `main` ni producción.

Al finalizar, entrega los enlaces de la issue y del PR, los resultados de Actions y los bloqueos pendientes.
