#!/usr/bin/env node
// scripts/typecheck.mjs — ratchet gate for `tsc --checkJs` (OPTIMIZATION.md §2's "free
// determinism, zero runtime cost" recommendation — written down back then, never actually wired
// up until 2026-09-01, per docs/CANON.md's rebuild-in-progress history).
//
// eski's ~11k lines of vanilla JS had never been type-checked. A clean-slate "must be zero
// errors" gate on day one would just get the check disabled the first time it's inconvenient.
// Instead this counts tsc's current error total and fails ONLY if the count goes UP versus the
// committed baseline (typecheck-baseline.txt) — a change can't introduce a NEW type bug, but the
// existing backlog isn't a blocker either; pay it down opportunistically.
//
// This isn't theoretical: the very first real run of this pass (2026-09-01) caught a genuine
// ReferenceError in screens/explorer.js's live search path (a `repaintBody()` call reaching out
// of its defining scope) — the root cause of a real "search doesn't work" bug, silent until now
// because it only threw inside a fire-and-forget async call whose rejection nobody awaited.
//
// Usage:
//   node scripts/typecheck.mjs            run the gate (exit 1 if errors > baseline)
//   node scripts/typecheck.mjs --update   lock in the CURRENT count as the new baseline
//     (only ever do this after confirming the errors right now are pre-existing/acceptable —
//     never to silence a check that just went red on your own change)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL("../typecheck-baseline.txt", import.meta.url));
const UPDATE = process.argv.includes("--update");

let output = "";
try {
  output = execSync("npx tsc -p tsconfig.json", { cwd: ROOT, encoding: "utf8" });
} catch (e) {
  output = (e.stdout || "") + (e.stderr || "");
}
const count = (output.match(/error TS\d+:/g) || []).length;

if (UPDATE) {
  writeFileSync(BASELINE_PATH, String(count) + "\n");
  console.log(`tsc --checkJs: ${count} error(s). Baseline updated.`);
  process.exit(0);
}

const baseline = parseInt(readFileSync(BASELINE_PATH, "utf8").trim(), 10) || 0;
console.log(`tsc --checkJs: ${count} error(s) (baseline: ${baseline})`);

if (count > baseline) {
  console.error(output);
  console.error(`\nFAIL: ${count} > baseline ${baseline} — this change introduced a new type error (see above). Fix it, or if it's a false positive, add a narrow JSDoc annotation rather than widening the baseline.`);
  process.exit(1);
}
if (count < baseline) {
  console.log(`Below baseline (was ${baseline}) — run 'node scripts/typecheck.mjs --update' to lock in the improvement.`);
}
process.exit(0);
