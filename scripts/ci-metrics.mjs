import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const suiteSummaryVersion = "ci-suite-summary.v1";
const countKeys = ["tests", "failed", "passed", "cancelled", "skipped", "todo"];
const suiteCountKeys = [...countKeys, "success"];
const metricCountKeys = [
  "coveredLineCount",
  "totalLineCount",
  "coveredBranchCount",
  "totalBranchCount",
  "coveredFunctionCount",
  "totalFunctionCount",
];
const coverageValueKeys = ["lineCoverage", "branchCoverage", "functionCoverage"];
const coverageBasis = "Node.js line coverage, unit suite only, for loaded files matching src/**/*.ts, using --experimental-test-coverage and --test-coverage-include=src/**/*.ts with --test-coverage-include-all disabled. Integration coverage and tooling tests are excluded; null means unavailable.";
const schemaUrl = new URL("../schemas/ci-metrics.v1.schema.json", import.meta.url);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertExactKeys(value, expectedKeys, label) {
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new Error(`${label} contains unsupported property ${key}`);
  }
}

function validateCoveragePercentage(value, label) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)) {
    throw new Error(`${label} must be a percentage from 0 to 100 or null`);
  }
}

function validateCoverage(coverage, label) {
  if (coverage === null) return;
  if (!isObject(coverage)) throw new Error(`${label} must be an object or null`);
  const expectedKeys = ["metric", ...metricCountKeys, ...coverageValueKeys, "files"];
  assertExactKeys(coverage, expectedKeys, label);
  if (coverage.metric !== "lines") throw new Error(`${label}.metric must be lines`);
  for (const key of metricCountKeys) {
    if (coverage[key] !== null && !isCount(coverage[key])) throw new Error(`${label}.${key} must be a non-negative integer or null`);
  }
  for (const key of coverageValueKeys) validateCoveragePercentage(coverage[key], `${label}.${key}`);
  if (!Array.isArray(coverage.files)) throw new Error(`${label}.files must be an array`);
  for (const [index, file] of coverage.files.entries()) {
    const fileLabel = `${label}.files[${index}]`;
    if (!isObject(file)) throw new Error(`${fileLabel} must be an object`);
    assertExactKeys(file, ["path", ...metricCountKeys, ...coverageValueKeys], fileLabel);
    if (typeof file.path !== "string" || !/^src\/.+\.ts$/.test(file.path) || file.path.includes("\\")) {
      throw new Error(`${fileLabel}.path must be a relative src/**/*.ts path`);
    }
    for (const key of metricCountKeys) {
      if (file[key] !== null && !isCount(file[key])) throw new Error(`${fileLabel}.${key} must be a non-negative integer or null`);
    }
    for (const key of coverageValueKeys) validateCoveragePercentage(file[key], `${fileLabel}.${key}`);
  }
  if (coverage.files.length === 0) throw new Error(`${label}.files must contain at least one measured source file`);
}

function validateSuiteReport(value, label) {
  if (!isObject(value)) throw new Error(`${label} must contain a JSON object`);
  assertExactKeys(value, ["schema_version", "counts", "coverage", "coverage_basis"], label);
  if (value.schema_version !== suiteSummaryVersion) throw new Error(`${label}.schema_version must be ${suiteSummaryVersion}`);
  if (typeof value.coverage_basis !== "string" || value.coverage_basis.length === 0) {
    throw new Error(`${label}.coverage_basis must be a non-empty string`);
  }
  if (value.counts !== null) {
    if (!isObject(value.counts)) throw new Error(`${label}.counts must be an object or null`);
    assertExactKeys(value.counts, suiteCountKeys, `${label}.counts`);
    for (const key of countKeys) {
      if (value.counts[key] !== null && !isCount(value.counts[key])) {
        throw new Error(`${label}.counts.${key} must be a non-negative integer or null`);
      }
    }
    if (value.counts.success !== null && typeof value.counts.success !== "boolean") {
      throw new Error(`${label}.counts.success must be a boolean or null`);
    }
    if (isCount(value.counts.failed) && isCount(value.counts.tests) && value.counts.failed > value.counts.tests) {
      throw new Error(`${label}.counts.failed cannot exceed tests`);
    }
    if (countKeys.every((key) => isCount(value.counts[key]))) {
      const classifiedTests = ["failed", "passed", "cancelled", "skipped", "todo"]
        .reduce((total, key) => safeSum(total, value.counts[key], `${label}.counts`), 0);
      if (classifiedTests !== value.counts.tests) throw new Error(`${label}.counts outcome totals do not equal tests`);
    }
    if (value.counts.success === true && value.counts.failed > 0) {
      throw new Error(`${label} reports success with failed tests`);
    }
  }
  validateCoverage(value.coverage, `${label}.coverage`);
  return value;
}

function completeCounts(report) {
  const counts = report?.counts;
  return isObject(counts)
    && countKeys.every((key) => isCount(counts[key]))
    && typeof counts.success === "boolean";
}

async function readSuiteReport(path, status) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" && status !== "success") return null;
    if (error?.code === "ENOENT") throw new Error(`Missing required ${basename(path)} for successful CI status`);
    throw error;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${basename(path)} is not valid JSON: ${error.message}`);
  }
  return validateSuiteReport(value, basename(path));
}

function validateIdentity(environment) {
  const repository = environment.GITHUB_REPOSITORY;
  const commitSha = environment.GITHUB_SHA;
  const runId = environment.GITHUB_RUN_ID;
  const status = environment.CI_STATUS;
  const runAttempt = environment.GITHUB_RUN_ATTEMPT;

  if (typeof repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY is required and must be owner/repo");
  }
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error("GITHUB_SHA is required and must be a full 40-character commit SHA");
  }
  if (typeof runId !== "string" || !/^[1-9][0-9]*$/.test(runId)) {
    throw new Error("GITHUB_RUN_ID is required and must be a positive decimal string");
  }
  if (!["success", "failure", "cancelled"].includes(status)) {
    throw new Error("CI_STATUS is required and must be success, failure, or cancelled");
  }
  if (runAttempt !== undefined && !/^[1-9][0-9]*$/.test(runAttempt)) {
    throw new Error("GITHUB_RUN_ATTEMPT, when set, must be a positive decimal string");
  }
  return { repository, commitSha, runId, runAttempt, status };
}

function metricCounts(report) {
  return isObject(report?.counts) ? { ...report.counts } : null;
}

function safeSum(left, right, label) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw new Error(`${label} exceeds the safe integer range`);
  return sum;
}

function buildMetrics(identity, unit, integration) {
  if (identity.status === "success") {
    if (!completeCounts(unit) || !completeCounts(integration)) {
      throw new Error("Successful CI status requires complete unit and integration test summaries");
    }
    for (const [name, report] of [["unit", unit], ["integration", integration]]) {
      if (!report.counts.success || report.counts.failed !== 0) {
        throw new Error(`Successful CI status conflicts with ${name} test results`);
      }
    }
  }

  const complete = completeCounts(unit) && completeCounts(integration);
  const totalTests = complete
    ? safeSum(unit.counts.tests, integration.counts.tests, "total_tests")
    : null;
  const failedTests = complete
    ? safeSum(unit.counts.failed, integration.counts.failed, "failed_tests")
    : null;
  const lineCoverage = unit?.coverage;
  const coveragePercentage = lineCoverage
    && isCount(lineCoverage.coveredLineCount)
    && isCount(lineCoverage.totalLineCount)
    && lineCoverage.totalLineCount > 0
    ? Math.round((lineCoverage.coveredLineCount / lineCoverage.totalLineCount) * 10_000) / 100
    : null;

  const metrics = {
    schema_version: "v1",
    repository: identity.repository,
    commit_sha: identity.commitSha,
    workflow_run_id: identity.runId,
    status: identity.status,
    total_tests: totalTests,
    failed_tests: failedTests,
    coverage_percentage: coveragePercentage,
    coverage_metric: coveragePercentage === null ? null : "lines",
    coverage_basis: coverageBasis,
    test_suites: {
      unit: metricCounts(unit),
      integration: metricCounts(integration),
    },
  };
  if (identity.runAttempt !== undefined) metrics.workflow_run_attempt = identity.runAttempt;
  return metrics;
}

function matchesType(value, type) {
  switch (type) {
    case "null": return value === null;
    case "object": return isObject(value);
    case "array": return Array.isArray(value);
    case "integer": return Number.isSafeInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    default: return false;
  }
}

/** Validate the documented JSON Schema subset used by the v1 contract. */
export function validateCiMetrics(value, schema) {
  const errors = [];
  const visit = (candidate, rule, path) => {
    if (!isObject(rule)) {
      errors.push(`${path}: invalid schema rule`);
      return;
    }
    if (Object.hasOwn(rule, "const") && candidate !== rule.const) errors.push(`${path}: must equal ${JSON.stringify(rule.const)}`);
    if (Array.isArray(rule.enum) && !rule.enum.some((entry) => entry === candidate)) {
      errors.push(`${path}: must be one of ${JSON.stringify(rule.enum)}`);
    }
    if (rule.type !== undefined) {
      const types = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!types.some((type) => matchesType(candidate, type))) {
        errors.push(`${path}: must have type ${types.join(" or ")}`);
        return;
      }
    }
    if (typeof candidate === "string" && typeof rule.pattern === "string" && !new RegExp(rule.pattern).test(candidate)) {
      errors.push(`${path}: does not match ${rule.pattern}`);
    }
    if (typeof candidate === "string" && Number.isInteger(rule.minLength) && candidate.length < rule.minLength) {
      errors.push(`${path}: must have at least ${rule.minLength} characters`);
    }
    if (typeof candidate === "number") {
      if (typeof rule.minimum === "number" && candidate < rule.minimum) errors.push(`${path}: must be >= ${rule.minimum}`);
      if (typeof rule.maximum === "number" && candidate > rule.maximum) errors.push(`${path}: must be <= ${rule.maximum}`);
    }
    if (!isObject(candidate)) return;
    if (Array.isArray(rule.required)) {
      for (const key of rule.required) {
        if (!Object.hasOwn(candidate, key)) errors.push(`${path}.${key}: is required`);
      }
    }
    if (rule.properties && isObject(rule.properties)) {
      for (const [key, propertyRule] of Object.entries(rule.properties)) {
        if (Object.hasOwn(candidate, key)) visit(candidate[key], propertyRule, `${path}.${key}`);
      }
    }
    if (rule.additionalProperties === false && rule.properties && isObject(rule.properties)) {
      const allowed = new Set(Object.keys(rule.properties));
      for (const key of Object.keys(candidate)) {
        if (!allowed.has(key)) errors.push(`${path}.${key}: additional property is not allowed`);
      }
    }
  };

  visit(value, schema, "$");
  return errors;
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write("Usage: node scripts/ci-metrics.mjs\n\nReads reports/unit-summary.json and reports/integration-summary.json; validates and writes reports/ci-metrics.json.\nRequired environment: GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID, CI_STATUS (success|failure|cancelled).\nOptional environment: GITHUB_RUN_ATTEMPT.\n");
    return;
  }
  if (args.length > 0) throw new Error("Unsupported arguments; use --help for usage");

  const identity = validateIdentity(process.env);
  const reportsDirectory = resolve(process.cwd(), "reports");
  const [unit, integration, schemaText] = await Promise.all([
    readSuiteReport(resolve(reportsDirectory, "unit-summary.json"), identity.status),
    readSuiteReport(resolve(reportsDirectory, "integration-summary.json"), identity.status),
    readFile(schemaUrl, "utf8"),
  ]);
  let schema;
  try {
    schema = JSON.parse(schemaText);
  } catch (error) {
    throw new Error(`The v1 metrics schema is not valid JSON: ${error.message}`);
  }
  const metrics = buildMetrics(identity, unit, integration);
  const errors = validateCiMetrics(metrics, schema);
  if (errors.length > 0) throw new Error(`Generated metrics failed schema validation: ${errors.join("; ")}`);

  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(resolve(reportsDirectory, "ci-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`ci-metrics: ${error.message}\n`);
    process.exitCode = 1;
  });
}
