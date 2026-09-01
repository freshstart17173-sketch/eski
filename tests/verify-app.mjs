#!/usr/bin/env node
// tests/verify-app.mjs — the live-app smoke test.
//
// docs/VERIFICATION.md is explicit about a real gap: "Frontend (the vanilla-JS SPA rendering +
// wiring against the live API) — not reachable from the sandbox... The demo path (?demo=1)
// renders fixtures with no network, so a demo screenshot proves layout, never live data flow."
// That's true of a SCREENSHOT. It is not true of driving the real app — main.js, data.js,
// screens/*.js, all the actual code that ships — through real clicks, drags, and keystrokes with
// no Supabase credentials required. This won't catch a live-RLS-only bug (that's still
// VERIFICATION.md's backend method's job), but it catches the class of bug this file exists
// because of: a dead click, a wiring break, a ReferenceError that only fires once someone
// actually DOES the thing. (docs/design/verify.mjs plays the same role for gallery.html, the
// static design mockup — this is the same idea pointed at the real app instead.)
//
// Usage: node tests/verify-app.mjs [--port 8935] [--headed]
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf("--port") + 1]) || 8935;
const HEADED = args.includes("--headed");

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".ts": "text/plain",
};

// A minimal static file server for this buildless app — no framework, matches the project's own
// "open index.html, zero tooling" dev model (OPTIMIZATION.md §0). SPA fallback: any path with no
// file extension serves index.html so client-side routes (e.g. /files) resolve.
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let fp = normalize(join(ROOT, urlPath));
    if (!fp.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let st;
    try { st = await stat(fp); } catch { st = null; }
    if (!st || st.isDirectory() || !extname(fp)) fp = join(ROOT, "index.html");
    const body = await readFile(fp);
    res.writeHead(200, { "content-type": MIME[extname(fp)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));
const base = `http://localhost:${PORT}`;

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

const results = [];
async function step(name, fn) {
  errs = [];
  try { await fn(); }
  catch (e) {
    const extra = errs.length ? ` (console/page errors during this step: ${errs.join(" | ")})` : "";
    try { await page.screenshot({ path: `/tmp/verify-app-fail-${results.length}.png` }); } catch {}
    results.push({ name, ok: false, detail: "threw: " + e.message + extra });
    return;
  }
  if (errs.length) results.push({ name, ok: false, detail: errs.join(" | ") });
  else results.push({ name, ok: true });
}

// Each step that needs a clean explorer view re-navigates fresh rather than chaining off the
// previous step's history state — browser back-navigation through the SPA's own pushState/
// replaceState dance (main.js's "/" → "/files?demo=1" redirect included) is real but async, and
// chaining steps off it just made the harness itself flaky, not the app under test.
async function freshExplorer() {
  await page.goto(base + "/?demo=1", { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector('[data-screen="explorer"]', { timeout: 8000 });
}

await step("boot: explorer loads (?demo=1, no backend)", freshExplorer);

await step("folder nav: open a folder, back to root", async () => {
  await freshExplorer();
  const folder = page.locator("[data-folder-id]").first();
  if (await folder.count()) {
    await folder.dblclick();
    await page.waitForTimeout(200);
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-screen="explorer"]', { timeout: 8000 });
  }
});

await step("group-by: Kind, then collapse a group", async () => {
  await freshExplorer();
  // The toolbar button relabels itself to the active group's name once one is set (e.g. "Kind"
  // instead of "Group") — so it's only ever addressed by that text ONCE, before selecting
  // anything. Every other step below calls freshExplorer() itself, so there's nothing to reset.
  await page.click('button:has-text("Group")');
  await page.click(".menu >> text=Kind");
  await page.waitForTimeout(150);
  const caret = page.locator(".egcaret").first();
  if (await caret.count()) await caret.click();
});

await step("selection: click a card, right-click for its menu", async () => {
  await freshExplorer();
  const card = page.locator("[data-id]").first();
  if (await card.count()) {
    await card.click();
    await card.click({ button: "right" });
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
  }
});

await step("marquee drag selects without freezing", async () => {
  await freshExplorer();
  const pane = page.locator(".panebody").first();
  const box = await pane.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 160, { steps: 12 });
    await page.mouse.up();
  }
});

await step("search: type + Enter, then clear", async () => {
  await freshExplorer();
  const input = page.locator('input[placeholder*="Search"]').first();
  if (await input.count()) {
    await input.fill("verse");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await input.fill("");
    await page.keyboard.press("Enter");
  }
});

await step("upload: gates on sign-in in demo (no session)", async () => {
  await freshExplorer();
  const btn = page.locator("button").filter({ hasText: /^Upload$/ }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(200); }
});

for (const route of ["/dms?demo=1", "/notifications?demo=1", "/search?demo=1", "/settings?demo=1"]) {
  await step(`route loads: ${route}`, async () => {
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 15000 });
  });
}

await browser.close();
server.close();

console.log("");
for (const r of results) console.log((r.ok ? "ok  " : "FAIL") + "  " + r.name + (r.ok ? "" : "\n      " + r.detail));
const failed = results.filter((r) => !r.ok);
console.log("");
if (failed.length) {
  console.error(`${failed.length}/${results.length} step(s) failed.`);
  process.exit(1);
}
console.log(`${results.length}/${results.length} step(s) clean.`);
process.exit(0);
