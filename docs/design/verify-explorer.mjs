// verify-explorer.mjs — the P5.4 self-test for the File explorer. Serves the real
// app over HTTP, drives the explorer through its states from the demo fixture
// (?demo=1, plus ?folder= and ?view=), and asserts each renders with the right
// structure and ZERO app console errors, in both themes. Mirrors verify-workspace.mjs.
//
// Run: node docs/design/verify-explorer.mjs   (add --shots to also write PNGs)
//
// Network noise is expected and ignored: the sandboxed browser can't reach the
// Supabase project. The demo path renders with no network, so this exercises the
// real render code without any live data.

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8232;
const SHOTS = process.argv.includes("--shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    let ext = extname(file);
    if (!ext) { file = join(ROOT, "index.html"); ext = ".html"; }
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(PORT, r));

const $ = (page, sel) => page.$(sel);
const has = async (page, sel, label) => (await $(page, sel)) ? null : `missing ${label} (${sel})`;
const count = async (page, sel) => (await page.$$(sel)).length;

const CASES = [
  ["grid-root-light", "/s/lb/files?demo=1", "light", async (p) =>
    (await has(p, '.screen[data-screen="explorer"]', "explorer screen")) ||
    (await has(p, "nav.chan .crow.on .nm", "Files highlighted in channel column")) ||
    (await has(p, ".explayout .filetree .ftrow", "folder tree rows")) ||
    (await has(p, ".filetree .ftfoot .bar i", "storage footer bar")) ||
    (await has(p, ".crumbs .crumbroot", "breadcrumb root")) ||
    (await has(p, ".toolbar .field input", "search field")) ||
    (await has(p, '.exview[data-exview="grid"] .masonry .card', "grid cards")) ||
    (await count(p, ".foldercard")) < 1 ? "expected subfolder cards at root" : null],
  ["grid-root-dark", "/s/lb/files?demo=1", "dark", async (p) =>
    has(p, ".card .who .uchip .dot", "member-hue uploader chip")],
  ["folder-deeplink", "/s/lb/files?demo=1&folder=beats", "light", async (p) =>
    (await has(p, ".crumbs b", "current-folder breadcrumb")) ||
    ((await p.$eval(".crumbs b", (e) => e.textContent)) !== "beats" ? "breadcrumb should read beats" : null) ||
    (await count(p, '.exview[data-exview="grid"] .card:not(.foldercard)')) < 4 ? "expected the 4 files in beats" : null],
  ["list-view", "/s/lb/files?demo=1&view=list", "light", async (p) =>
    (await has(p, '.exview[data-exview="list"] .flrow.flhd', "list header row")) ||
    (await has(p, '.exview[data-exview="list"] .flrow .flnm', "list file rows"))],
  // feed view: flattened previewable subtree + inline comments; project files hidden
  ["feed-view", "/s/lb/files?demo=1&folder=beats&view=feed", "light", async (p) =>
    (await has(p, '.exview[data-exview="feed"] .ffnote', "feed note")) ||
    (await has(p, ".filefeed .ffitem .ffmedia", "feed media items")) ||
    (await has(p, ".filefeed .ffitem .ffcmts .cmt", "inline comments")) ||
    ((await count(p, ".filefeed .ffitem")) !== 2 ? `beats has 2 previewable (wav+png), got ${await count(p, ".filefeed .ffitem")}` : null)],
  ["locked-folder", "/s/lb/files?demo=1", "light", async (p) =>
    has(p, ".ftrow .ftlock", "locked-folder lock icon")],
  ["empty-folder", "/s/lb/files?demo=1&folder=verses", "light", async (p) =>
    has(p, ".panebody .emptystate h3", "empty-folder state")],
  // personal My-files mount: no channel column, "My files" root, "Your storage" foot
  ["personal-light", "/files?demo=1", "light", async (p) =>
    ((await $(p, "nav.chan")) ? "personal mount must NOT show the channel column" : null) ||
    (await has(p, '.explayout[data-source="personal"] .filetree', "personal tree")) ||
    ((await p.$eval(".filetree .fthd", (e) => e.textContent.trim())).startsWith("My files") ? null : "tree header should read My files") ||
    ((await p.$eval(".ftfoot", (e) => e.textContent)).includes("Your storage") ? null : "footer should read Your storage") ||
    (await has(p, '.exview[data-exview="grid"] .card', "personal grid cards"))],
  ["personal-folder", "/files?demo=1&folder=bounces", "light", async (p) =>
    ((await p.$eval(".crumbs b", (e) => e.textContent)) !== "Bounces" ? "breadcrumb should read Bounces" : null)],
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const OUT = normalize(join(fileURLToPath(import.meta.url), ".."));
let fails = 0;

for (const [name, url, theme, assert] of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("eski-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: join(OUT, `ex-${name}.png`) });

  const problems = [];
  const structural = await assert(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);

  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

// details pane — open a card, inspect the arena, navigate, close
async function detailsCase(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("eski-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  // single click SELECTS (Drive model), it must not open the details pane
  await page.click('.exview[data-exview="grid"] .card:not(.foldercard)');
  await page.waitForTimeout(120);
  if (await $(page, ".sheet")) problems.push("single click must select, not open details");
  if (!(await $(page, ".card.sel"))) problems.push("single click should select the card");
  if (!(await $(page, ".selbar.open"))) problems.push("selection should open the bulk bar");
  // a double click OPENS the details pane
  await page.dblclick('.exview[data-exview="grid"] .card:not(.foldercard)');
  await page.waitForTimeout(200);
  if (!(await $(page, ".sheet .card2 .dmedia"))) problems.push("details media well missing");
  if (!(await $(page, ".sheet .dinfo .dtop .dfilename"))) problems.push("info-rail filename missing");
  if ((await count(page, ".sheet .meta .row")) < 4) problems.push("expected ≥4 metadata rows");
  if (!(await $(page, ".sheet .meta .loccrumb button"))) problems.push("Location breadcrumb missing");
  if (!(await $(page, ".sheet .dsec .chips .tag"))) problems.push("tags section missing");
  if (await $(page, ".sheet .dsec .cmt")) problems.push("server file should have NO comments");
  if (!(await $(page, ".sheet .foot .btn.primary"))) problems.push("Download action missing");
  // Size row must be last (eski-style §5)
  const lastKey = await page.$$eval(".sheet .meta .row .k", (ks) => ks[ks.length - 1]?.textContent);
  if (lastKey !== "Size") problems.push(`Size must be the last meta row, got "${lastKey}"`);
  // Esc closes
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  if (await $(page, ".sheet")) problems.push("Esc should close the details pane");
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log(`✗ details-${theme}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ details-${theme}`);
  await ctx.close();
}
await detailsCase("light");
await detailsCase("dark");

// Type filter — pick Audio, only audio cards remain (beats has 1 wav of 4 files)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const before = await count(page, '.exview[data-exview="grid"] .card:not(.foldercard)');
  if (before !== 4) problems.push(`beats should have 4 files, got ${before}`);
  // open the Type dropdown (first .exfilter) and click "Audio"
  await page.click(".toolbar .btn.exfilter");
  await page.waitForTimeout(120);
  const items = await page.$$(".menu.open button");
  let clicked = false;
  for (const it of items) { if ((await it.textContent()).includes("Audio")) { await it.click(); clicked = true; break; } }
  if (!clicked) problems.push("Audio option not found in Type menu");
  await page.waitForTimeout(150);
  const after = await count(page, '.exview[data-exview="grid"] .card:not(.foldercard)');
  if (after !== 1) problems.push(`Type=Audio should leave 1 file, got ${after}`);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ type-filter"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ type-filter");
  await ctx.close();
}

// search-as-you-type (driven through the input, not the URL)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  await page.fill(".toolbar .field input", "moodboard");
  await page.waitForTimeout(200);
  const problems = [];
  if (!(await $(page, ".exsearchstate"))) problems.push("search-results indicator should appear");
  const n = await count(page, '.exview[data-exview="grid"] .card:not(.foldercard)');
  if (n !== 1) problems.push(`search should surface 1 match, got ${n}`);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ search"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ search");
  await ctx.close();
}

// New folder — open the prompt, Create disabled until named, then the new subfolder
// appears in view (demo mode inserts optimistically; the real path is the create_folder
// RPC / save_folders insert). Created under beats, so it shows as a beats subfolder card.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const before = await count(page, ".exview .foldercard");
  await page.click(".toolbar .btn.newFolderBtn");
  await page.waitForTimeout(150);
  if (!(await $(page, ".scrim .modal .field input"))) problems.push("New-folder prompt should open");
  const disabled0 = await page.$eval(".scrim .modal .btn.primary", (b) => b.disabled).catch(() => null);
  if (disabled0 !== true) problems.push("Create should be disabled with an empty name");
  await page.fill(".scrim .modal .field input", "Field notes");
  await page.waitForTimeout(80);
  const disabled1 = await page.$eval(".scrim .modal .btn.primary", (b) => b.disabled).catch(() => null);
  if (disabled1 !== false) problems.push("Create should enable once a name is typed");
  await page.click(".scrim .modal .btn.primary");
  await page.waitForTimeout(200);
  if (await $(page, ".scrim .modal")) problems.push("prompt should close after Create");
  const after = await count(page, ".exview .foldercard");
  if (after !== before + 1) problems.push(`expected one new subfolder card (${before}→${before + 1}), got ${after}`);
  const names = await page.$$eval(".exview .foldercard", (cs) => cs.map((c) => c.textContent));
  if (!names.some((t) => t.includes("Field notes"))) problems.push('new folder "Field notes" not shown');
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ new-folder"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ new-folder");
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all explorer states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
