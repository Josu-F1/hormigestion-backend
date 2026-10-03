# Skills instaladas para HormiGestión

Instalación y revisión: 3 de octubre de 2026. Solicitadas por el usuario para preparar backend y frontend. Son instrucciones de asistencia para Codex, no librerías de la aplicación ni garantías de cumplimiento funcional.

## 1. Selección y uso

| Skill instalada | Procedencia | Uso en el proyecto |
| --- | --- | --- |
| `nodejs-backend-patterns` | [wshobson/agents: comunidad](https://github.com/wshobson/agents/tree/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/javascript-typescript/skills/nodejs-backend-patterns) | Estructura Node.js/TypeScript, Express/Fastify, errores, validación, conexión PostgreSQL, transacciones y apagado ordenado |
| `supabase-postgres-best-practices` | [Supabase: mantenedor](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | Diseño de PostgreSQL, migraciones, consultas, índices, conexiones y concurrencia; aplicable a PostgreSQL local |
| `vercel-react-best-practices` | [Vercel: mantenedor](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | React, carga de datos, tamaño del bundle y renderizado; aplicar reglas pertinentes a React 19 + Vite |
| `security-best-practices` | [Catálogo curado de OpenAI](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices) | Escritura segura y revisión solicitada: referencias específicas para Express y React/TypeScript |
| `security-threat-model` | [Catálogo curado de OpenAI](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-threat-model) | Modelado de amenazas cuando se solicite; cotizaciones públicas, datos personales, acceso por conductor y automatizaciones |
| `playwright` | [Catálogo curado de OpenAI](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/playwright) | Comprobación de flujos en navegador: cotización, acceso, agenda, monitor y calidad; requiere una aplicación disponible |

Las seis están instaladas bajo `/home/saimoljimenez/.codex/skills/` con esos nombres. Estarán disponibles para selección normal de Codex en el siguiente turno, según el comportamiento documentado del instalador.

## 2. Adaptación al stack y alcance

- La skill de PostgreSQL no obliga a contratar Supabase ni migrar autenticación. Usar PostgreSQL 16 y verificar las características contra esa versión.
- La skill de Vercel incluye reglas de Next.js y componentes de servidor. En este frontend Vite se usan únicamente las recomendaciones aplicables a React cliente; la instalación no propone cambiar de framework ni alojamiento.
- La skill de Node.js es comunitaria y sus fragmentos son ejemplos. La revisión detectó que el ejemplo de `update` construye columnas con `Object.keys(updates)` sin una lista explícita permitida. Al implementar, validar el DTO en ejecución y mapear campos permitidos; parametrizar valores no protege nombres de columnas. No copiar ese fragmento literalmente.
- La skill de seguridad aporta referencias para Express y React. Autorización y propiedad del recurso se verifican en backend; un rol elegido en la interfaz no concede permisos.
- La skill de amenazas se instala para una revisión específica futura; esta investigación no constituye un modelo de amenazas terminado.
- La skill de Playwright incluye un wrapper que puede obtener `@playwright/cli` mediante `npx` cuando se utilice. Aquí se revisó el script, pero no se ejecutó ni se descargaron navegadores o dependencias de aplicación.

No se añadieron skills de otros frameworks o proveedores de despliegue: la selección corresponde a Node.js/PostgreSQL y React/Vite del proyecto. Las skills existentes de PDF ya cubren la revisión documental.

## 3. Verificación y reproducción

Se utilizó el instalador oficial de skills de Codex. Primero se descargaron copias para revisión en `/tmp/hormigestion-skills-review`; después se instalaron las mismas revisiones de GitHub, fijadas por commit. Se verificó igualdad SHA-256 de **todos los archivos** entre la copia revisada y la instalación: 142 archivos en seis skills.

El [manifiesto de instalación](skills-instaladas.json) registra nombre, repositorio, ruta original, commit completo, destino, hash de `SKILL.md` y cantidad de archivos verificados. Las revisiones instaladas no se actualizarán automáticamente por modificar el manifiesto.

La instalación no modifica `package.json`, lockfiles, código, configuración global de permisos ni las reglas comerciales del proyecto. No ejecuta código de ejemplo ni demuestra que un servidor esté probado.

## 4. Correspondencia con la implementación

| Trabajo siguiente | Skills útiles y evidencia esperada |
| --- | --- |
| Base técnica y acceso | Node.js + seguridad: arranque, errores y denegación de identidad inválida/acceso ajeno |
| Migraciones y reservas | PostgreSQL + Node.js: integridad, transacciones y conflicto concurrente de recursos |
| Cotización | Node.js + seguridad: cálculo del servidor, precios históricos, solicitud persistida e idempotencia |
| Integración de pantallas | React + seguridad: estados de carga/error, datos reales y navegación por permisos |
| Aceptación del usuario | Playwright: flujos públicos y privados sobre implementación real, con evidencia de los escenarios del acta |
| Revisión específica de amenazas | Modelado de amenazas: activos, límites de confianza y mitigaciones basadas en el código que exista |

Las pruebas de reglas y transacciones requieren herramientas de pruebas del proyecto además del navegador. Playwright no reemplaza la verificación de cálculos, volúmenes y concurrencia de PostgreSQL.
