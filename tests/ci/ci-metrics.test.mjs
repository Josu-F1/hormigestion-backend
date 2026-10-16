import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateCiMetrics } from "../../scripts/ci-metrics.mjs";

const thisFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(thisFile), "../..");
const cliPath = resolve(repositoryRoot, "scripts/ci-metrics.mjs");
const schemaPath = resolve(repositoryRoot, "schemas/ci-metrics.v1.schema.json");
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const goodEnvironment = {
  GITHUB_REPOSITORY: "example/hormigestion-backend",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_RUN_ID: "123456789",
  CI_STATUS: "success",
};

function suiteReport({ tests = 2, failed = 0, passed = tests - failed, skipped = 0, todo = 0, cancelled = 0, success = failed === 0, coverage = null } = {}) {
  return {
    schema_version: "ci-suite-summary.v1",
    counts: { tests, failed, passed, cancelled, skipped, todo, success },
    coverage,
    coverage_basis: coverage
      ? "Node.js test-runner coverage for loaded files matching --test-coverage-include=src/**/*.ts; --test-coverage-include-all disabled."
      : "Not collected (integration reporter runs without test coverage).",
  };
}

function lineCoverage(coveredLineCount, totalLineCount) {
  const percentage = totalLineCount === 0 ? null : (coveredLineCount / totalLineCount) * 100;
  return {
    metric: "lines",
    coveredLineCount,
    totalLineCount,
    lineCoverage: percentage,
    coveredBranchCount: 0,
    totalBranchCount: 0,
    branchCoverage: null,
    coveredFunctionCount: 0,
    totalFunctionCount: 0,
    functionCoverage: null,
    files: [{
      path: "src/domain/example.ts",
      coveredLineCount,
      totalLineCount,
      lineCoverage: percentage,
      coveredBranchCount: 0,
      totalBranchCount: 0,
      branchCoverage: null,
      coveredFunctionCount: 0,
      totalFunctionCount: 0,
      functionCoverage: null,
    }],
  };
}

async function makeReports(t, { unit, integration } = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "ci-metrics-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reports = resolve(directory, "reports");
  await mkdir(reports);
  if (unit !== undefined) await writeFile(resolve(reports, "unit-summary.json"), JSON.stringify(unit));
  if (integration !== undefined) await writeFile(resolve(reports, "integration-summary.json"), JSON.stringify(integration));
  return directory;
}

function runCli(directory, overrides = {}, args = []) {
  const environment = { ...goodEnvironment, ...overrides };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete environment[key];
  }
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: directory,
    env: environment,
    encoding: "utf8",
    timeout: 30_000,
  });
}

async function outputMetrics(directory) {
  return JSON.parse(await readFile(resolve(directory, "reports/ci-metrics.json"), "utf8"));
}

async function preserveExistingArtifact(directory) {
  const outputPath = resolve(directory, "reports/ci-metrics.json");
  const sentinel = "pre-existing artifact must survive rejected input\n";
  await writeFile(outputPath, sentinel);
  return { outputPath, sentinel };
}

test("--help describes the required identity and status inputs", async (t) => {
  const directory = await makeReports(t);
  const result = runCli(directory, {}, ["--help"]);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GITHUB_REPOSITORY/);
  assert.match(result.stdout, /GITHUB_SHA/);
  assert.match(result.stdout, /GITHUB_RUN_ID/);
  assert.match(result.stdout, /CI_STATUS/);
});

test("writes schema-valid metrics from both suite reports and unit-only line coverage", async (t) => {
  const directory = await makeReports(t, {
    unit: suiteReport({ tests: 3, passed: 2, skipped: 1, coverage: lineCoverage(1, 2) }),
    integration: suiteReport({ tests: 4 }),
  });
  const result = runCli(directory, { GITHUB_RUN_ATTEMPT: "2" });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);

  const metrics = await outputMetrics(directory);
  assert.deepEqual(validateCiMetrics(metrics, schema), []);
  assert.equal(metrics.schema_version, "v1");
  assert.equal(metrics.repository, "example/hormigestion-backend");
  assert.equal(metrics.commit_sha, "a".repeat(40));
  assert.equal(metrics.workflow_run_id, "123456789");
  assert.equal(metrics.workflow_run_attempt, "2");
  assert.equal(metrics.status, "success");
  assert.equal(metrics.total_tests, 7);
  assert.equal(metrics.failed_tests, 0);
  assert.equal(metrics.coverage_percentage, 50);
  assert.equal(metrics.coverage_metric, "lines");
  assert.match(metrics.coverage_basis, /unit suite only.*src\/\*\*\/\*\.ts/i);
  assert.deepEqual(metrics.test_suites.unit, {
    tests: 3, failed: 0, passed: 2, cancelled: 0, skipped: 1, todo: 0, success: true,
  });
  assert.equal(metrics.test_suites.integration.tests, 4);
});

test("binds metrics to the explicitly captured source SHA instead of a PR merge default", async (t) => {
  const directory = await makeReports(t, { unit: suiteReport(), integration: suiteReport() });
  const sourceSha = "b".repeat(40);
  const result = runCli(directory, { CI_COMMIT_SHA: sourceSha });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal((await outputMetrics(directory)).commit_sha, sourceSha);

  const { outputPath, sentinel } = await preserveExistingArtifact(directory);
  const invalid = runCli(directory, { CI_COMMIT_SHA: "invalid-source-sha" });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.equal(invalid.stderr, "ci-metrics: CI_COMMIT_SHA must be a full 40-character commit SHA\n");
  assert.equal(await readFile(outputPath, "utf8"), sentinel);
});

test("keeps genuine zero counts and zero-percent coverage distinct from unavailable metrics", async (t) => {
  const zeroDirectory = await makeReports(t, {
    unit: suiteReport({ tests: 1, passed: 1, coverage: lineCoverage(0, 5) }),
    integration: suiteReport({ tests: 0, passed: 0 }),
  });
  const zeroResult = runCli(zeroDirectory);
  assert.equal(zeroResult.status, 0, zeroResult.stderr);
  const zeroMetrics = await outputMetrics(zeroDirectory);
  assert.equal(zeroMetrics.total_tests, 1);
  assert.equal(zeroMetrics.failed_tests, 0);
  assert.equal(zeroMetrics.coverage_percentage, 0);
  assert.equal(zeroMetrics.coverage_metric, "lines");

  const unknownDirectory = await makeReports(t, {
    unit: suiteReport({ tests: 0, passed: 0 }),
    integration: suiteReport({ tests: 0, passed: 0 }),
  });
  const unknownResult = runCli(unknownDirectory);
  assert.equal(unknownResult.status, 0, unknownResult.stderr);
  const unknownMetrics = await outputMetrics(unknownDirectory);
  assert.equal(unknownMetrics.total_tests, 0);
  assert.equal(unknownMetrics.failed_tests, 0);
  assert.equal(unknownMetrics.coverage_percentage, null);
  assert.equal(unknownMetrics.coverage_metric, null);
});

test("allows missing reports on failed pipelines and preserves unknowns as null", async (t) => {
  const directory = await makeReports(t);
  const result = runCli(directory, { CI_STATUS: "failure" });
  assert.equal(result.status, 0, result.stderr);
  const metrics = await outputMetrics(directory);
  assert.equal(metrics.status, "failure");
  assert.equal(metrics.total_tests, null);
  assert.equal(metrics.failed_tests, null);
  assert.equal(metrics.coverage_percentage, null);
  assert.equal(metrics.coverage_metric, null);
  assert.deepEqual(metrics.test_suites, { unit: null, integration: null });

  const cancelled = runCli(directory, { CI_STATUS: "cancelled" });
  assert.equal(cancelled.status, 0, cancelled.stderr);
  const cancelledMetrics = await outputMetrics(directory);
  assert.equal(cancelledMetrics.status, "cancelled");
  assert.equal(cancelledMetrics.total_tests, null);
  assert.equal(cancelledMetrics.failed_tests, null);
});

test("preserves failure status for passing and failing suite reports", async (t) => {
  const directory = await makeReports(t, {
    unit: suiteReport(),
    integration: suiteReport({ tests: 1, passed: 1 }),
  });
  const passing = runCli(directory, { CI_STATUS: "failure" });
  assert.equal(passing.status, 0, passing.stderr);
  const passingMetrics = await outputMetrics(directory);
  assert.equal(passingMetrics.status, "failure");
  assert.equal(passingMetrics.total_tests, 3);
  assert.equal(passingMetrics.failed_tests, 0);

  await writeFile(resolve(directory, "reports/unit-summary.json"), JSON.stringify(suiteReport({ tests: 2, failed: 1, passed: 1, success: false })));
  const failing = runCli(directory, { CI_STATUS: "failure" });
  assert.equal(failing.status, 0, failing.stderr);
  const failingMetrics = await outputMetrics(directory);
  assert.equal(failingMetrics.status, "failure");
  assert.equal(failingMetrics.total_tests, 3);
  assert.equal(failingMetrics.failed_tests, 1);
  assert.equal(failingMetrics.test_suites.unit.success, false);
});

test("preserves null counts in an incomplete report without aggregating partial suites", async (t) => {
  const unit = suiteReport();
  unit.counts = { ...unit.counts, tests: null, failed: null, success: null };
  const directory = await makeReports(t, {
    unit,
    integration: suiteReport({ tests: 4, passed: 4 }),
  });
  const result = runCli(directory, { CI_STATUS: "failure" });
  assert.equal(result.status, 0, result.stderr);
  const metrics = await outputMetrics(directory);
  assert.equal(metrics.total_tests, null);
  assert.equal(metrics.failed_tests, null);
  assert.equal(metrics.test_suites.unit.tests, null);
  assert.equal(metrics.test_suites.unit.failed, null);
  assert.equal(metrics.test_suites.unit.passed, 2);
  assert.equal(metrics.test_suites.unit.success, null);
  assert.equal(metrics.test_suites.integration.tests, 4);
});

test("fails closed on successful status with missing or failed reports without changing output", async (t) => {
  const directory = await makeReports(t);
  const { outputPath, sentinel } = await preserveExistingArtifact(directory);
  const missing = runCli(directory);
  assert.notEqual(missing.status, 0);
  assert.equal(await readFile(outputPath, "utf8"), sentinel);

  await writeFile(resolve(directory, "reports/unit-summary.json"), JSON.stringify(suiteReport({ tests: 2, failed: 1, passed: 1, success: false })));
  await writeFile(resolve(directory, "reports/integration-summary.json"), JSON.stringify(suiteReport()));
  const failed = runCli(directory);
  assert.notEqual(failed.status, 0);
  assert.equal(await readFile(outputPath, "utf8"), sentinel);
});

test("rejects invalid identities and malformed suite reports without overwriting artifacts", async (t) => {
  const directory = await makeReports(t, {
    unit: suiteReport(),
    integration: suiteReport(),
  });
  const { outputPath, sentinel } = await preserveExistingArtifact(directory);
  const invalidEnvironments = [
    { GITHUB_REPOSITORY: undefined },
    { GITHUB_REPOSITORY: "owner" },
    { GITHUB_SHA: undefined },
    { GITHUB_SHA: "abc" },
    { GITHUB_RUN_ID: undefined },
    { GITHUB_RUN_ID: "run-7" },
    { CI_STATUS: "success-ish" },
    { GITHUB_RUN_ATTEMPT: "0" },
  ];
  for (const override of invalidEnvironments) {
    const result = runCli(directory, override);
    assert.notEqual(result.status, 0, JSON.stringify(override));
    assert.equal(await readFile(outputPath, "utf8"), sentinel);
  }

  await writeFile(resolve(directory, "reports/unit-summary.json"), "{malformed json");
  const malformed = runCli(directory, { CI_STATUS: "failure" });
  assert.notEqual(malformed.status, 0);
  assert.equal(await readFile(outputPath, "utf8"), sentinel);

  await writeFile(resolve(directory, "reports/unit-summary.json"), JSON.stringify({ ...suiteReport(), unsupported: true }));
  const malformedShape = runCli(directory, { CI_STATUS: "failure" });
  assert.notEqual(malformedShape.status, 0);
  assert.equal(await readFile(outputPath, "utf8"), sentinel);
});

test("validates schema enum, types, required fields, and additional properties", async (t) => {
  const directory = await makeReports(t, {
    unit: suiteReport(),
    integration: suiteReport(),
  });
  const result = runCli(directory);
  assert.equal(result.status, 0, result.stderr);
  const metrics = await outputMetrics(directory);
  assert.deepEqual(validateCiMetrics(metrics, schema), []);

  const wrongType = { ...metrics, total_tests: "2" };
  assert.ok(validateCiMetrics(wrongType, schema).some((error) => error.includes("total_tests")));
  const wrongEnum = { ...metrics, status: "unknown" };
  assert.ok(validateCiMetrics(wrongEnum, schema).some((error) => error.includes("status")));
  const missingRequired = { ...metrics };
  delete missingRequired.commit_sha;
  assert.ok(validateCiMetrics(missingRequired, schema).some((error) => error.includes("commit_sha")));
  const nestedAdditional = {
    ...metrics,
    test_suites: { ...metrics.test_suites, unit: { ...metrics.test_suites.unit, invented: true } },
  };
  assert.ok(validateCiMetrics(nestedAdditional, schema).some((error) => error.includes("invented")));
  const frontendExtension = {
    ...metrics,
    e2e_status: "not_implemented",
    coverage_basis: "Frontend-only loaded TypeScript component files; E2E coverage is not implemented.",
  };
  delete frontendExtension.test_suites;
  assert.deepEqual(validateCiMetrics(frontendExtension, schema), []);
  assert.equal(Object.hasOwn(metrics, "e2e_status"), false);
  const emptyBasis = { ...frontendExtension, coverage_basis: "" };
  assert.ok(validateCiMetrics(emptyBasis, schema).some((error) => error.includes("coverage_basis")));
  const invalidFrontendExtension = { ...frontendExtension, e2e_status: "passed" };
  assert.ok(validateCiMetrics(invalidFrontendExtension, schema).some((error) => error.includes("e2e_status")));
  const badPattern = { ...metrics, commit_sha: "not-a-full-sha" };
  assert.ok(validateCiMetrics(badPattern, schema).some((error) => error.includes("commit_sha")));
  const belowMinimum = { ...metrics, total_tests: -1 };
  assert.ok(validateCiMetrics(belowMinimum, schema).some((error) => error.includes("total_tests")));
  const aboveMaximum = { ...metrics, coverage_percentage: 100.1 };
  assert.ok(validateCiMetrics(aboveMaximum, schema).some((error) => error.includes("coverage_percentage")));
});
