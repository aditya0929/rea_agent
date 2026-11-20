// Split one large minified ES-module bundle into parseable chunks for REA.
// Usage: node split-bundle.mjs <bundle.js> <outDir> [targetKB=120]
// Cuts only at top-level statement boundaries; every chunk re-declares the
// bundle's import statements so cross-module bindings stay resolvable.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";

const require = createRequire("C:/Users/aditya.jha/Desktop/rea/rea-tool/package.json");
const { parseSync } = require("oxc-parser");

const [bundlePath, outDir, kb = "120"] = process.argv.slice(2);
if (!bundlePath || !outDir) throw new Error("usage: split-bundle.mjs <bundle.js> <outDir> [targetKB]");
if (existsSync(outDir)) throw new Error(`output directory already exists: ${outDir}`);
const target = Number(kb) * 1024;

const src = readFileSync(bundlePath, "utf8");
const { program, errors } = parseSync(basename(bundlePath), src, { sourceType: "module" });
if (errors.length) throw new Error(`parse errors: ${errors.map((e) => e.message).join("; ")}`);

// oxc reports UTF-16 offsets, which match JS string indices.
const imports = program.body.filter((s) => s.type === "ImportDeclaration");
const importText = imports.map((s) => src.slice(s.start, s.end)).join("\n");
const body = program.body.filter((s) => s.type !== "ImportDeclaration");

// Statements larger than the target get a chunk of their own (flagged `oversized`),
// so a single vendor runtime or data blob cannot inflate a neighbouring chunk.
const chunks = [];
let cur = null;
for (const s of body) {
  if (s.end - s.start >= target) {
    if (cur) chunks.push(cur), (cur = null);
    chunks.push({ start: s.start, end: s.end, statements: 1, oversized: true, head: src.slice(s.start, s.start + 80) });
    continue;
  }
  if (!cur) cur = { start: s.start, end: s.end, statements: 0 };
  cur.end = s.end;
  cur.statements++;
  if (cur.end - cur.start >= target) chunks.push(cur), (cur = null);
}
if (cur) chunks.push(cur);

mkdirSync(outDir, { recursive: true });
const pad = String(chunks.length).length;
const manifest = {
  source: bundlePath,
  source_sha256: createHash("sha256").update(src).digest("hex"),
  source_chars: src.length,
  import_statements: imports.length,
  top_level_statements: body.length,
  target_chunk_bytes: target,
  chunks: [],
};
chunks.forEach((c, i) => {
  const name = `chunk-${String(i).padStart(pad, "0")}${c.oversized ? "-big" : ""}.js`;
  const text = `${importText}\n${src.slice(c.start, c.end)}\n`;
  const check = parseSync(name, text, { sourceType: "module" });
  writeFileSync(join(outDir, name), text);
  manifest.chunks.push({
    file: name,
    original_start: c.start,
    original_end: c.end,
    statements: c.statements,
    oversized: !!c.oversized,
    head: c.head,
    bytes: Buffer.byteLength(text),
    parse_errors: check.errors.length,
  });
});
writeFileSync(join(outDir, "split-manifest.json"), JSON.stringify(manifest, null, 2));
const bad = manifest.chunks.filter((c) => c.parse_errors).length;
console.log(`${chunks.length} chunks, ${body.length} statements, ${imports.length} imports, ${bad} chunks with parse errors`);
