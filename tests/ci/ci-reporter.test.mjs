import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { test } from "node:test";
import ciReporter from "../../scripts/ci-reporter.mjs";

const thisFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(thisFile), "../..");

if (process.env.CI_REPORTER_NODE_FIXTURE === "1") {
  test("passing fixture", () => {});
  test("skipped fixture", { skip: true }, () => {});
  test.todo("todo fixture");
} else {
  test("emits one machine summary using the last summary and relative coverage files", async () => {
    const workingDirectory = "/virtual/checkout";
    const events = [
      {
        type: "test:summary",
        data: {
          success: true,
          counts: { tests: 1, failed: 0, passed: 1, cancelled: 0, skipped: 0, todo: 0 },
        },
      },
      {
        type: "test:summary",
        data: {
          success: false,
          counts: { tests: 3, failed: 1, passed: 1, cancelled: 0, skipped: 1, todo: 0 },
        },
      },
      {
        type: "test:coverage",
        data: {
          summary: {
            workingDirectory,
            files: [
              {
                path: join(workingDirectory, "src/domain/one.ts"),
                coveredLineCount: 2,
                totalLineCount: 4,
                coveredBranchCount: 1,
                totalBranchCount: 2,
                coveredFunctionCount: 1,
                totalFunctionCount: 1,
              },
              {
                path: "src/application/two.ts",
                coveredLineCount: 1,
                totalLineCount: 2,
                coveredBranchCount: 0,
                totalBranchCount: 1,
                coveredFunctionCount: 0,
                totalFunctionCount: 1,
              },
              {
                path: "tests/outside.ts",
                coveredLineCount: 99,
                totalLineCount: 100,
                coveredBranchCount: 0,
                totalBranchCount: 0,
                coveredFunctionCount: 0,
                totalFunctionCount: 0,
              },
            ],
          },
        },
      },
    ];
    const chunks = [];
    for await (const chunk of ciReporter(Readable.from(events))) chunks.push(String(chunk));

    assert.equal(chunks.length, 1);
    const output = chunks.join("");
    assert.match(output, /^\{[^\n]+\}\n$/);
    const report = JSON.parse(output);
    assert.equal(report.schema_version, "ci-suite-summary.v1");
    assert.deepEqual(report.counts, {
      tests: 3,
      failed: 1,
      passed: 1,
      cancelled: 0,
      skipped: 1,
      todo: 0,
      success: false,
    });
    assert.deepEqual(report.coverage.files.map(({ path }) => path), [
      "src/domain/one.ts",
      "src/application/two.ts",
    ]);
    assert.equal(report.coverage.coveredLineCount, 3);
    assert.equal(report.coverage.totalLineCount, 6);
    assert.equal(report.coverage.lineCoverage, 50);
    assert.match(report.coverage_basis, /src\/\*\*\/\*\.ts/);
    assert.match(report.coverage_basis, /include-all.*disabled/i);
    assert.equal(output.includes(workingDirectory), false);
    assert.equal(output.includes("outside.ts"), false);
  });

  test("leaves absent summaries and coverage unknown rather than inventing zeroes", async () => {
    const chunks = [];
    for await (const chunk of ciReporter(Readable.from([{ type: "test:diagnostic", data: {} }]))) {
      chunks.push(String(chunk));
    }
    assert.equal(chunks.length, 1);
    const report = JSON.parse(chunks[0]);
    assert.equal(report.counts, null);
    assert.equal(report.coverage, null);
    assert.match(report.coverage_basis, /not collected/i);
  });

  test("consumes real test:summary events from node:test without human output", () => {
    const child = spawnSync(process.execPath, [
      "--test",
      "--test-reporter=./scripts/ci-reporter.mjs",
      "--test-reporter-destination=stdout",
      thisFile,
    ], {
      cwd: repositoryRoot,
      env: { CI_REPORTER_NODE_FIXTURE: "1", NODE_DISABLE_COLORS: "1" },
      encoding: "utf8",
      timeout: 30_000,
    });

    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, "");
    const report = JSON.parse(child.stdout);
    assert.equal(report.schema_version, "ci-suite-summary.v1");
    assert.equal(report.counts.tests, 3);
    assert.equal(report.counts.passed, 1);
    assert.equal(report.counts.failed, 0);
    assert.equal(report.counts.skipped, 1);
    assert.equal(report.counts.todo, 1);
    assert.equal(report.counts.success, true);
    assert.equal(report.coverage, null);
    assert.match(report.coverage_basis, /not collected/i);
  });

  test("consumes real test:coverage events with only loaded src TypeScript files", () => {
    const child = spawnSync(process.execPath, [
      "--import=tsx",
      "--experimental-test-coverage",
      "--test-coverage-include=src/**/*.ts",
      "--test",
      "--test-reporter=./scripts/ci-reporter.mjs",
      "--test-reporter-destination=stdout",
      "tests/unit/cotizacion.test.ts",
    ], {
      cwd: repositoryRoot,
      env: { NODE_DISABLE_COLORS: "1" },
      encoding: "utf8",
      timeout: 60_000,
    });

    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, "");
    const report = JSON.parse(child.stdout);
    assert.equal(report.counts.success, true);
    assert.ok(report.coverage.totalLineCount > 0);
    assert.ok(report.coverage.coveredLineCount > 0);
    assert.ok(report.coverage.files.length > 0);
    assert.ok(report.coverage.files.every(({ path }) => /^src\/.+\.ts$/.test(path)));
    assert.match(report.coverage_basis, /src\/\*\*\/\*\.ts/);
  });
}
