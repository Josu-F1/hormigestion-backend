import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { testReportArgs } from "./test-report-options.mjs";

if (process.argv.includes("--help")) {
  console.log("Usage: npm run test:coverage\nRuns unit tests with Node native coverage (loaded src/**/*.ts only).\nReports: reports/unit-{junit.xml,lcov.info,summary.json}. No coverage threshold.");
} else {
  const directory = "reports";
  for (const filename of ["unit-junit.xml", "unit-lcov.info", "unit-summary.json"]) {
    await rm(join(directory, filename), { force: true });
  }
  const files = (await readdir("tests/unit")).filter((file) => file.endsWith(".test.ts")).sort();
  const child = spawn(process.execPath, [
    "--import", "tsx", "--test", "--test-isolation=none",
    ...await testReportArgs("unit", { directory, coverage: true }),
    ...files.map((file) => join("tests/unit", file)),
  ], { stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
