// verify-feed.mjs — the P5.1 self-test for the home Feed. Serves the real app and
// drives the Feed from the demo fixture (?demo=1), asserting structure + ZERO app
// console errors in both themes. Mirrors verify-explorer.mjs.
//
// Run: node docs/design/verify-feed.mjs   (add --shots to also write PNGs)

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8235;
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
  ["feed-light", "/?demo=1", "light", async (p) =>
    (await has(p, '.screen[data-screen="feed"]', "feed screen")) ||
    (await has(p, ".panehd .wm", "wordmark")) ||
    (await has(p, ".panehd nav .nav.on", "active Feed nav")) ||
    (await has(p, ".toolbar .field input", "search field")) ||
    (await has(p, ".panebody .masonry.even .card", "post cards")) ||
    ((await count(p, ".card .who .uchip")) > 0 ? "Feed must NOT use member-hue chips (public)" : null)],
  ["feed-dark", "/?demo=1", "dark", async (p) => has(p, ".panebody .masonry .card .title", "post titles")],
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
  if (SHOTS) await page.screenshot({ path: join(OUT, `feed-${name}.png`) });
  const problems = [];
  const structural = await assert(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

// open a post -> Details pane as a PUBLIC POST (comment thread, no Location row)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  await page.click(".panebody .masonry .card");
  await page.waitForTimeout(200);
  const problems = [];
  if (!(await $(page, ".sheet .dinfo"))) problems.push("post details rail missing");
  if (!(await $(page, ".sheet .dsec .lb"))) problems.push("post should show a Comments section");
  const ks = await page.$$eval(".sheet .meta .row .k", (n) => n.map((e) => e.textContent));
  if (ks.includes("Location")) problems.push("a feed post should not show a Location row");
  if (!ks.includes("Posted by")) problems.push("a feed post should show Posted by");
  // comment thread (P5.13): the first demo post (q1) carries 2 seeded comments, and the
  // names must be NEUTRAL — the member hue is server-scoped, forbidden on the Feed.
  await page.waitForTimeout(150);   // let loadComments resolve
  const nComments = await count(page, ".sheet .cmtlist .cmt");
  if (nComments < 2) problems.push(`q1 should load its 2 seeded comments, got ${nComments}`);
  const hued = await page.$$eval(".sheet .cmt .by .u", (ns) => ns.filter((n) => /\bm\d\b/.test(n.className) || /color:/.test(n.getAttribute("style") || "")).length);
  if (hued) problems.push("comment author names must be neutral (no member hue) in the public Feed");
  // posting appends optimistically (demo write path)
  const input = await page.$(".sheet .dsec .field input");
  if (!input) problems.push("comment input missing");
  else {
    await input.fill("clean low end on this one");
    await input.press("Enter");
    await page.waitForTimeout(150);
    const after = await count(page, ".sheet .cmtlist .cmt");
    if (after !== nComments + 1) problems.push(`posting should append a comment (${nComments} → ${nComments + 1}), got ${after}`);
    if ((await input.inputValue()) !== "") problems.push("comment input should clear after posting");
    // delete-own-comment (P5.13b): only your own rows carry a .cdel; deleting removes the row.
    const delBtns = await count(page, ".sheet .cmtlist .cmt .cdel");
    if (delBtns < 1) problems.push("your own comment should carry a delete affordance");
    const othersDel = await page.$$eval(".sheet .cmtlist .cmt", (rows) => rows.filter((r) => !r.querySelector(".cdel")).length);
    if (othersDel < 1) problems.push("others' comments must NOT carry a delete affordance");
    await page.click(".sheet .cmtlist .cmt .cdel");
    await page.waitForTimeout(150);
    const afterDel = await count(page, ".sheet .cmtlist .cmt");
    if (afterDel !== after - 1) problems.push(`deleting should remove one comment (${after} → ${after - 1}), got ${afterDel}`);
  }
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log("✗ post-details"); problems.forEach((p) => console.log("    " + p)); }
  else console.log("✓ post-details");
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all feed states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
