// Run REA analyze-javascript-application on each split chunk in parallel.
// Usage: node analyze-chunks.mjs <splitDir> <outDir> [concurrency=5] [skip-file ...]
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REA = "C:/Users/aditya.jha/Desktop/rea/rea-tool/scripts/rea.mjs";
const [splitDir, outDir, conc = "5", ...skip] = process.argv.slice(2);
const dir = resolve(splitDir);
const manifest = JSON.parse(readFileSync(join(dir, "split-manifest.json"), "utf8"));
const queue = manifest.chunks.map((c) => c.file).filter((f) => !skip.includes(f));
mkdirSync(outDir, { recursive: true });

const results = {};
const runOne = (file) =>
  new Promise((done) => {
    const started = Date.now();
    const out = openSync(join(outDir, `${file}.json`), "w");
    const err = openSync(join(outDir, `${file}.err`), "w");
    const child = spawn(
      process.execPath,
      [REA, "analyze-javascript-application", dir, "--source-path", file,
        "--max-heap-mb", "4096", "--analysis-timeout-ms", "900000", "--format", "json"],
      { stdio: ["ignore", out, err] },
    );
    child.on("close", (code) => {
      closeSync(out), closeSync(err);
      results[file] = { exit: code, seconds: Math.round((Date.now() - started) / 1000) };
      console.log(`${file}: exit=${code} in ${results[file].seconds}s (${Object.keys(results).length}/${queue.length})`);
      done();
    });
  });

const workers = Array.from({ length: Number(conc) }, async () => {
  while (queue.length) await runOne(queue.shift());
});
await Promise.all(workers);
writeFileSync(join(outDir, "run-summary.json"), JSON.stringify(results, null, 2));
