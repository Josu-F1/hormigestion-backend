import { isAbsolute, relative, resolve, sep } from "node:path";

const countNames = [
  "tests",
  "failed",
  "passed",
  "cancelled",
  "skipped",
  "todo",
];
const coverageCountNames = [
  "coveredLineCount",
  "totalLineCount",
  "coveredBranchCount",
  "totalBranchCount",
  "coveredFunctionCount",
  "totalFunctionCount",
];
const measuredCoverageBasis = "Node.js test-runner coverage for loaded files matched by --test-coverage-include=src/**/*.ts; --test-coverage-include-all disabled.";

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function percentage(covered, total) {
  if (!nonNegativeSafeInteger(covered) || !nonNegativeSafeInteger(total) || total === 0) return null;
  return Math.round((covered / total) * 10_000) / 100;
}

function normalizeCounts(data) {
  const source = data?.counts;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;

  const counts = Object.fromEntries(countNames.map((name) => [
    name,
    nonNegativeSafeInteger(source[name]) ? source[name] : null,
  ]));
  counts.success = typeof data.success === "boolean" ? data.success : null;
  return counts;
}

function relativeSourcePath(rawPath, workingDirectory) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const absoluteWorkingDirectory = resolve(workingDirectory);
  const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(absoluteWorkingDirectory, rawPath);
  const relativePath = relative(absoluteWorkingDirectory, absolutePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return null;
  const posixPath = relativePath.split(sep).join("/");
  return /^src\/.+\.ts$/.test(posixPath) ? posixPath : null;
}

function aggregateCoverageFiles(files) {
  const total = Object.fromEntries(coverageCountNames.map((name) => [name, 0]));
  for (const file of files) {
    for (const name of coverageCountNames) {
      if (!nonNegativeSafeInteger(file[name]) || !nonNegativeSafeInteger(total[name] + file[name])) {
        total[name] = null;
      } else if (total[name] !== null) {
        total[name] += file[name];
      }
    }
  }
  return total;
}

function normalizeCoverage(event) {
  const summary = event?.data?.summary;
  if (!summary || typeof summary !== "object" || !Array.isArray(summary.files)) return null;
  const workingDirectory = typeof summary.workingDirectory === "string" && summary.workingDirectory.length > 0
    ? summary.workingDirectory
    : process.cwd();
  const files = summary.files.flatMap((file) => {
    const path = relativeSourcePath(file?.path, workingDirectory);
    if (!path) return [];
    const normalized = { path };
    for (const name of coverageCountNames) {
      normalized[name] = nonNegativeSafeInteger(file[name]) ? file[name] : null;
    }
    normalized.lineCoverage = percentage(normalized.coveredLineCount, normalized.totalLineCount);
    normalized.branchCoverage = percentage(normalized.coveredBranchCount, normalized.totalBranchCount);
    normalized.functionCoverage = percentage(normalized.coveredFunctionCount, normalized.totalFunctionCount);
    return [normalized];
  });
  if (files.length === 0) return null;

  const totals = aggregateCoverageFiles(files);
  return {
    metric: "lines",
    ...totals,
    lineCoverage: percentage(totals.coveredLineCount, totals.totalLineCount),
    branchCoverage: percentage(totals.coveredBranchCount, totals.totalBranchCount),
    functionCoverage: percentage(totals.coveredFunctionCount, totals.totalFunctionCount),
    files,
  };
}

/** Node.js test-runner custom reporter. It emits one JSON document at stream end. */
export default async function* ciReporter(source) {
  let counts = null;
  let coverage = null;
  let sawCoverageEvent = false;

  for await (const event of source) {
    if (event?.type === "test:summary") counts = normalizeCounts(event.data);
    if (event?.type === "test:coverage") {
      sawCoverageEvent = true;
      coverage = normalizeCoverage(event);
    }
  }

  const coverageBasis = coverage
    ? measuredCoverageBasis
    : sawCoverageEvent
      ? "Coverage ran, but no loaded file matched src/**/*.ts; no line metric is available."
      : "Not collected (no test:coverage event; integration reporter runs without test coverage).";

  yield `${JSON.stringify({
    schema_version: "ci-suite-summary.v1",
    counts,
    coverage,
    coverage_basis: coverageBasis,
  })}\n`;
}
