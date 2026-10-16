import assert from "node:assert/strict";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { testReportArgs } from "../../scripts/test-report-options.mjs";

test("reporting is opt-in and leaves the existing test invocation unchanged", async () => {
  assert.deepEqual(await testReportArgs("integration", { directory: undefined }), []);
});

test("reports pair each standard and machine reporter with its suite destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "hormi-report-"));
  const directory = join(root, "reports");
  try {
    const args = await testReportArgs("unit", { directory, coverage: true });
    assert.deepEqual(args, [
      "--experimental-test-coverage", "--test-coverage-include=src/**/*.ts",
      "--test-reporter=spec", "--test-reporter-destination=stdout",
      "--test-reporter=junit", `--test-reporter-destination=${directory}/unit-junit.xml`,
      "--test-reporter=./scripts/ci-reporter.mjs", `--test-reporter-destination=${directory}/unit-summary.json`,
      "--test-reporter=lcov", `--test-reporter-destination=${directory}/unit-lcov.info`,
    ]);
    assert.equal((await stat(directory)).isDirectory(), true);
    const integration = await testReportArgs("integration", { directory });
    assert.equal(integration.includes("--experimental-test-coverage"), false);
    assert.equal(integration.includes(`--test-reporter-destination=${directory}/integration-junit.xml`), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
