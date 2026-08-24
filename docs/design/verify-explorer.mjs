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
  // Save to my files: a real toggle (demo flips optimistically) — Save ⇄ Saved
  const saveBtn = await page.$(".sheet .foot .btn:not(.primary)");
  if (!saveBtn) problems.push("Save to my files button missing");
  else {
    if (!(await saveBtn.textContent()).includes("Save to my files")) problems.push("Save button should read 'Save to my files'");
    await saveBtn.click();
    await page.waitForTimeout(120);
    if (!(await saveBtn.textContent()).includes("Saved to my files")) problems.push("Save button should flip to 'Saved to my files'");
    await saveBtn.click();
    await page.waitForTimeout(120);
    if (!(await saveBtn.textContent()).includes("Save to my files")) problems.push("Save button should toggle back to 'Save to my files'");
  }
  // ⋯ file-actions menu (P5.9d parity) — the same actions the card ⋯ menu offers,
  // reachable from the open viewer. It lives in the info-rail header.
  const moreBtn = await page.$('.sheet .dtop button[aria-haspopup="menu"]');
  if (!moreBtn) problems.push("details ⋯ actions button missing");
  else {
    await moreBtn.click();
    await page.waitForTimeout(120);
    const labels = await page.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
    for (const want of ["Rename", "Move to…", "Delete", "Save to my files"]) {
      if (!labels.some((l) => l.includes(want))) problems.push(`⋯ menu missing "${want}" (got ${JSON.stringify(labels)})`);
    }
    if (!labels.some((l) => /Star|Unstar/.test(l))) problems.push("⋯ menu missing Star/Unstar");
    if (!labels.some((l) => /Hide from library|Show in library/.test(l))) problems.push("⋯ menu missing Hide/Show");
    // Rename in place: the prompt must layer ABOVE the sheet (z-index fix), and on submit
    // the pane's filename updates while the viewer stays open.
    await page.click('.menu.open button:has-text("Rename")');
    await page.waitForTimeout(150);
    const promptZ = await page.$eval(".scrim", (s) => parseInt(getComputedStyle(s).zIndex, 10));
    const sheetZ = await page.$eval(".sheet", (s) => parseInt(getComputedStyle(s).zIndex, 10));
    if (!(promptZ > sheetZ)) problems.push(`Rename prompt (z${promptZ}) must sit above the details sheet (z${sheetZ})`);
    const nameInput = await page.$(".scrim .modal input");
    if (!nameInput) problems.push("Rename prompt input missing");
    else {
      await nameInput.fill("renamed_in_viewer");
      await page.click('.scrim .modal button:has-text("Rename")');
      await page.waitForTimeout(150);
      if (await $(page, ".scrim")) problems.push("Rename prompt should close on submit");
      if (!(await $(page, ".sheet"))) problems.push("details pane should stay open after an in-viewer rename");
      const fn = await page.$eval(".sheet .dtop .dfilename", (n) => n.textContent);
      if (fn !== "renamed_in_viewer") problems.push(`filename should repaint to the new name, got "${fn}"`);
    }
    // Hide flips the menu label in place (pane stays open on the file)
    await page.click('.sheet .dtop button[aria-haspopup="menu"]');
    await page.waitForTimeout(120);
    await page.click('.menu.open button:has-text("Hide from library")');
    await page.waitForTimeout(150);
    if (!(await $(page, ".sheet"))) problems.push("Hide from the viewer should keep the pane open");
    await page.click('.sheet .dtop button[aria-haspopup="menu"]');
    await page.waitForTimeout(120);
    const afterHide = await page.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
    if (!afterHide.some((l) => l.includes("Show in library"))) problems.push("⋯ menu should read 'Show in library' after hiding");
    await page.keyboard.press("Escape");   // close the menu
    await page.waitForTimeout(80);
  }

  // Tags (P5.14) — an editable explorer file shows the add "+" and removable chips; adding
  // via the inline input appends a chip, removing via the chip × drops one (demo-optimistic).
  const tagAdd = await page.$(".sheet .dsec .chips .addtag");
  const tagsBefore = await count(page, ".sheet .dsec .chips .tag");
  if (!tagAdd) problems.push("an editable file should show the add-tag +");
  else if (tagsBefore < 1) problems.push("the demo file should carry tags to test removal");
  else {
    await tagAdd.click();
    await page.waitForTimeout(100);
    const tagInput = await page.$(".sheet .dsec .chips .field input");
    if (!tagInput) problems.push("add-tag should open an inline input");
    else {
      await tagInput.fill("newtag");
      await tagInput.press("Enter");
      await page.waitForTimeout(150);
      const tagsAfter = await count(page, ".sheet .dsec .chips .tag");
      if (tagsAfter !== tagsBefore + 1) problems.push(`adding a tag should append one chip (${tagsBefore} → ${tagsBefore + 1}), got ${tagsAfter}`);
      if (await $(page, ".sheet .dsec .chips .field input")) problems.push("the tag input should close after adding");
    }
    // remove the first tag — its × is hover-revealed (display:none until :hover), so hover
    // the chip first, then click the ×.
    const firstTag = await page.$(".sheet .dsec .chips .tag.rm");
    if (!firstTag) problems.push("editable tags should be removable (.tag.rm)");
    else {
      await firstTag.hover();
      await page.waitForTimeout(80);
      await (await firstTag.$(".x")).click();
      await page.waitForTimeout(150);
      const tagsAfterRm = await count(page, ".sheet .dsec .chips .tag");
      if (tagsAfterRm !== tagsBefore) problems.push(`removing a tag should drop one chip (back to ${tagsBefore}), got ${tagsAfterRm}`);
    }
  }

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

// Multi-select filters — Type unions within the facet, facets intersect, Clear resets.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const grid = '.exview[data-exview="grid"] .card:not(.foldercard)';
  const clickFilter = async (label) => {
    for (const b of await page.$$(".toolbar .btn.exfilter")) { if ((await b.textContent()).trim().startsWith(label)) { await b.click(); await page.waitForTimeout(100); return true; } }
    return false;
  };
  const clickItem = async (text) => {
    for (const it of await page.$$(".menu.open button")) { if ((await it.textContent()).trim() === text || (await it.textContent()).includes(text)) { await it.click(); await page.waitForTimeout(100); return true; } }
    return false;
  };
  if ((await count(page, grid)) !== 4) problems.push("beats should start with 4 files");
  // Type = Audio ∪ Images → f2 (audio) + f3 (image) = 2
  await clickFilter("Type");
  await clickItem("Audio");
  await clickItem("Images");
  if ((await count(page, grid)) !== 2) problems.push(`Type Audio∪Images should leave 2, got ${await count(page, grid)}`);
  // the Type button now reads a count and is active
  const typeText = await page.$$eval(".toolbar .btn.exfilter", (bs) => bs.find((b) => b.textContent.trim().startsWith("Type"))?.textContent || "");
  if (!typeText.includes("2")) problems.push(`Type button should show count 2, got "${typeText}"`);
  const typeOn = await page.$$eval(".toolbar .btn.exfilter", (bs) => bs.find((b) => b.textContent.trim().startsWith("Type"))?.classList.contains("on"));
  if (!typeOn) problems.push("Type button should be active (.on) with selections");
  // add Uploader = rae → intersect: f2+f3 are both rae → still 2
  await clickFilter("Uploader");
  await clickItem("rae");
  if ((await count(page, grid)) !== 2) problems.push(`+Uploader rae should keep 2, got ${await count(page, grid)}`);
  // add Tag = reference → intersect: only f3 → 1
  await clickFilter("Tag");
  await clickItem("reference");
  if ((await count(page, grid)) !== 1) problems.push(`+Tag reference should leave 1, got ${await count(page, grid)}`);
  // Clear the Type facet → f3 still matches rae+reference → still 1, Type no longer active
  await clickFilter("Type");
  await clickItem("Clear");
  if ((await count(page, grid)) !== 1) problems.push(`clearing Type should keep 1, got ${await count(page, grid)}`);
  const typeOn2 = await page.$$eval(".toolbar .btn.exfilter", (bs) => bs.find((b) => b.textContent.trim().startsWith("Type"))?.classList.contains("on"));
  if (typeOn2) problems.push("Type button should be inactive after Clear");
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ multi-filter"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ multi-filter");
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

// Move to folder — select a file in beats, open the picker, choose Root, Move here.
// The moved file leaves the beats view and the selection clears (demo moves optimistically;
// the real path is the move_to_folder RPC / saved_items upsert).
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
  await page.click('.exview[data-exview="grid"] .card:not(.foldercard)');   // select one
  await page.waitForTimeout(120);
  if (!(await $(page, ".selbar.open"))) problems.push("selecting a card should open the bulk bar");
  const moveBtns = await page.$$(".selbar button");
  let opened = false;
  for (const b of moveBtns) { if ((await b.textContent()).includes("Move to folder")) { await b.click(); opened = true; break; } }
  if (!opened) problems.push("bulk bar Move to folder button not found");
  await page.waitForTimeout(150);
  if (!(await $(page, ".scrim .movetree .ftrow"))) problems.push("move picker tree should render");
  const goDisabled0 = await page.$eval(".scrim .modal .btn.primary", (b) => b.disabled).catch(() => null);
  if (goDisabled0 !== true) problems.push("Move here should be disabled before a destination is chosen");
  await page.click(".scrim .movetree .ftrow.lvl0");   // Root
  await page.waitForTimeout(80);
  const goDisabled1 = await page.$eval(".scrim .modal .btn.primary", (b) => b.disabled).catch(() => null);
  if (goDisabled1 !== false) problems.push("Move here should enable once a destination is picked");
  await page.click(".scrim .modal .btn.primary");   // Move here
  await page.waitForTimeout(200);
  if (await $(page, ".scrim .modal")) problems.push("picker should close after Move");
  if (await $(page, ".selbar.open")) problems.push("selection should clear after a move");
  const after = await count(page, '.exview[data-exview="grid"] .card:not(.foldercard)');
  if (after !== before - 1) problems.push(`moved file should leave beats (${before}→${before - 1}), got ${after}`);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ move-to-folder"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ move-to-folder");
  await ctx.close();
}

// Hidden (#55) — Show-hidden reveals the dimmed utility file; the card menu hides a work.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const grid = '.exview[data-exview="grid"] .card:not(.foldercard)';
  const visible = await count(page, grid);   // root shows f7; f8 is hidden
  // Show-hidden reveals the dimmed utility file
  await page.click(".panehd .hdctl .iconbtn");
  await page.waitForTimeout(150);
  if (!(await page.$eval(".panehd .hdctl .iconbtn", (b) => b.classList.contains("on")))) problems.push("Show-hidden toggle should be active");
  if ((await count(page, grid)) !== visible + 1) problems.push(`Show-hidden should reveal one more card (${visible}→${visible + 1}), got ${await count(page, grid)}`);
  if (!(await $(page, ".card.ishidden"))) problems.push("the revealed hidden card should read dimmed (.ishidden)");
  // toggle off → back to the visible-only set
  await page.click(".panehd .hdctl .iconbtn");
  await page.waitForTimeout(150);
  if ((await count(page, grid)) !== visible) problems.push("turning Show-hidden off should hide the utility file again");
  // Hide a visible work from its ⋯ menu → it drops out of the library view
  const first = await page.$(grid);
  await first.hover();
  await (await first.$('.cardacts [data-act="more"]')).click();
  await page.waitForTimeout(120);
  for (const b of await page.$$(".menu.open button")) { if ((await b.textContent()).includes("Hide from library")) { await b.click(); break; } }
  await page.waitForTimeout(150);
  if ((await count(page, grid)) !== visible - 1) problems.push(`hiding a work should drop it from the view (${visible}→${visible - 1}), got ${await count(page, grid)}`);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ hidden"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ hidden");
  await ctx.close();
}

// Card menu — the ⋯ / right-click menu (real actions only) + Rename + menu Delete.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const grid = '.exview[data-exview="grid"] .card:not(.foldercard)';
  const before = await count(page, grid);
  // open the ⋯ menu on the first card
  const first = await page.$(grid);
  await first.hover();
  await page.waitForTimeout(80);
  await (await first.$('.cardacts [data-act="more"]')).click();
  await page.waitForTimeout(120);
  const items = await page.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
  for (const want of ["Star", "Save to my files", "Rename", "Move to…", "Delete"]) {
    if (!items.some((t) => t.includes(want))) problems.push(`card menu missing "${want}" (got ${JSON.stringify(items)})`);
  }
  // Rename → prompt prefilled with the current name → change it → the card title updates
  for (const b of await page.$$(".menu.open button")) { if ((await b.textContent()).includes("Rename")) { await b.click(); break; } }
  await page.waitForTimeout(120);
  const val = await page.$eval(".scrim .modal .field input", (i) => i.value).catch(() => "");
  if (!val.includes("late_bloom")) problems.push(`Rename prompt should prefill the current name, got "${val}"`);
  await page.fill(".scrim .modal .field input", "renamed_take.flp");
  await page.waitForTimeout(60);
  for (const b of await page.$$(".scrim .modal .btn.primary")) { await b.click(); break; }
  await page.waitForTimeout(150);
  if (await $(page, ".scrim .modal")) problems.push("Rename prompt should close after submit");
  const titles = await page.$$eval(".exview[data-exview=\"grid\"] .card .title", (ts) => ts.map((t) => t.textContent));
  if (!titles.some((t) => t.includes("renamed_take.flp"))) problems.push("renamed title should appear on the card");
  // Delete from the menu removes the card from the folder
  const card2 = await page.$(grid);
  await card2.hover();
  await (await card2.$('.cardacts [data-act="more"]')).click();
  await page.waitForTimeout(120);
  for (const b of await page.$$(".menu.open button")) { if ((await b.textContent()).trim() === "Delete") { await b.click(); break; } }
  await page.waitForTimeout(150);
  if ((await count(page, grid)) !== before - 1) problems.push(`menu Delete should remove one card (${before}→${before - 1}), got ${await count(page, grid)}`);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ card-menu"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ card-menu");
  await ctx.close();
}

// Starred — the seeded star badge, the quick-filter flat grid, and starring a card.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const grid = '.exview[data-exview="grid"] .card:not(.foldercard)';
  // beats has one seeded starred file (f3) — its card shows the gold badge
  if ((await count(page, ".card.starred")) !== 1) problems.push(`beats should show 1 starred card, got ${await count(page, ".card.starred")}`);
  if (!(await $(page, ".card.starred .cardstar"))) problems.push("starred card should show the persistent star badge");
  // the Starred quick-filter → flat grid of all starred works (f3 + f5 = 2)
  await page.click(".toolbar .iconbtn.exstar");
  await page.waitForTimeout(150);
  if (!(await page.$eval(".toolbar .iconbtn.exstar", (b) => b.classList.contains("on")))) problems.push("Starred toggle should be active (.on)");
  if ((await count(page, grid)) !== 2) problems.push(`Starred grid should hold 2 starred works, got ${await count(page, grid)}`);
  if ((await count(page, ".card.starred")) !== 2) problems.push("both cards in the Starred grid should be starred");
  // turn the filter off → back to the folder
  await page.click(".toolbar .iconbtn.exstar");
  await page.waitForTimeout(150);
  if (await page.$eval(".toolbar .iconbtn.exstar", (b) => b.classList.contains("on"))) problems.push("Starred toggle should turn off");
  // star a not-yet-starred card via its hover action → beats now shows 2 starred
  const first = await page.$(grid);
  await first.hover();
  await page.waitForTimeout(80);
  const starAct = await first.$('.cardacts [data-act="star"]');
  if (!starAct) problems.push("card should carry a star hover action");
  else {
    await starAct.click();
    await page.waitForTimeout(150);
    if ((await count(page, ".card.starred")) !== 2) problems.push(`starring should raise beats' starred count to 2, got ${await count(page, ".card.starred")}`);
    // unstar it back
    await first.hover();
    await starAct.click();
    await page.waitForTimeout(150);
    if ((await count(page, ".card.starred")) !== 1) problems.push("unstarring should return beats to 1 starred");
  }
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ starred"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ starred");
  await ctx.close();
}

// Trash — Delete→Trash from a folder, then the Trash view: retention notice, days-left
// (one near-expiry warn), Restore, Delete forever, Empty. Demo runs optimistically; the
// real path is the works.deleted_at writes / hard delete in §E.3.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/s/lb/files?demo=1&folder=beats`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const grid = '.exview[data-exview="grid"] .card:not(.foldercard)';
  const before = await count(page, grid);
  // Delete one file → Trash
  await page.click(grid);
  await page.waitForTimeout(120);
  for (const b of await page.$$(".selbar button")) { if ((await b.textContent()).includes("Delete")) { await b.click(); break; } }
  await page.waitForTimeout(200);
  if ((await count(page, grid)) !== before - 1) problems.push(`delete should remove a file from the folder (${before}→${before - 1})`);
  if (await $(page, ".selbar.open")) problems.push("selection should clear after delete");
  // open Trash
  for (const r of await page.$$(".filetree .ftrow")) { if ((await r.textContent()).includes("Trash")) { await r.click(); break; } }
  await page.waitForTimeout(200);
  if (!(await $(page, '.exview[data-exview="trash"] .trashnote'))) problems.push("Trash retention notice missing");
  if (!(await $(page, ".trashnote .btn.danger"))) problems.push("Empty trash now button missing");
  let n = await count(page, ".trrow");
  if (n !== 4) problems.push(`Trash should hold 3 seeded + 1 just-deleted = 4, got ${n}`);
  if (!(await $(page, ".trrow .tleft.warn"))) problems.push("a near-expiry row should show the warn countdown");
  // Restore the first row
  await page.hover(".trrow");
  for (const b of await page.$$(".trrow .tacts button")) { if ((await b.textContent()).includes("Restore")) { await b.click(); break; } }
  await page.waitForTimeout(150);
  if ((await count(page, ".trrow")) !== 3) problems.push(`Restore should drop Trash to 3, got ${await count(page, ".trrow")}`);
  // Delete forever the first row
  await page.hover(".trrow");
  for (const b of await page.$$(".trrow .tacts button")) { if ((await b.textContent()).includes("Delete forever")) { await b.click(); break; } }
  await page.waitForTimeout(150);
  if ((await count(page, ".trrow")) !== 2) problems.push(`Delete forever should drop Trash to 2, got ${await count(page, ".trrow")}`);
  // Empty trash → empty state
  await page.click(".trashnote .btn.danger");
  await page.waitForTimeout(150);
  if ((await count(page, ".trrow")) !== 0) problems.push("Empty should remove all trash rows");
  if (!(await $(page, '.exview[data-exview="trash"] .emptystate'))) problems.push("empty Trash should show the empty state");
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ trash"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ trash");
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all explorer states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
