import { mkdir } from "node:fs/promises";

// Opt-in reporting preserves the default local integration invocation.
export async function testReportArgs(suite, { directory, coverage = false } = {}) {
  if (!directory) return [];
  await mkdir(directory, { recursive: true });
  return [
    ...(coverage ? ["--experimental-test-coverage", "--test-coverage-include=src/**/*.ts"] : []),
    "--test-reporter=spec", "--test-reporter-destination=stdout",
    "--test-reporter=junit", `--test-reporter-destination=${directory}/${suite}-junit.xml`,
    "--test-reporter=./scripts/ci-reporter.mjs", `--test-reporter-destination=${directory}/${suite}-summary.json`,
    ...(coverage ? ["--test-reporter=lcov", `--test-reporter-destination=${directory}/${suite}-lcov.info`] : []),
  ];
}
