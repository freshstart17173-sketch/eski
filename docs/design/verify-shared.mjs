// verify-shared.mjs — the P5.16 self-test for the read-only shared-link viewer
// (/shared/:token). Serves the real app, drives the demo fixture (a normal token → a
// shared file; the token "expired" → the dead-link state), and asserts each renders with
// the right structure and ZERO app console errors, in both themes. Mirrors verify-feed.mjs.
//
// Run: node docs/design/verify-shared.mjs   (add --shots to also write PNGs)

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8236;
const SHOTS = process.argv.includes("--shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    let ext = extname(file);
    if (!ext) { file = join(ROOT, "index.html"); ext = ".html"; }
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" }).end(buf);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(PORT, r));

const $ = (page, sel) => page.$(sel);
const count = async (page, sel) => (await page.$$(sel)).length;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const OUT = normalize(join(fileURLToPath(import.meta.url), ".."));
let fails = 0;

async function run(name, url, theme, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("eski-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: join(OUT, `shared-${name}.png`) });
  const problems = [];
  const structural = await fn(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

// a live shared file — the standalone read-only viewer, no shell/rail, no navigation
async function file(theme) {
  await run(`file-${theme}`, "/shared/tok123?demo=1", theme, async (p) => {
    if (await $(p, ".rail")) return "the shared viewer must NOT render the app shell/rail";
    if (!(await $(p, ".sharedview .svhd .brand"))) return "brand missing";
    if (!(await $(p, ".sharedview .svmedia"))) return "media well missing";
    if (!(await $(p, ".sharedview .svmeta h1"))) return "title missing";
    const ks = await p.$$eval(".sharedview .meta .row .k", (n) => n.map((e) => e.textContent));
    for (const want of ["Shared by", "Size", "Access"]) if (!ks.includes(want)) return `meta should include "${want}" (got ${JSON.stringify(ks)})`;
    if ((await count(p, ".sharedview .dsec .chips .tag")) < 1) return "tags should render";
    if (!(await $(p, ".sharedview .svnote"))) return "the read-only lock note is missing";
    if (!(await $(p, ".sharedview .svacts .btn.primary"))) return "Download action missing";
    // NO member hue in an anon/out-of-server context — the sharer name is plain text
    const hued = await p.$$eval(".sharedview .svhd b, .sharedview .meta .v", (ns) => ns.filter((n) => /\bm\d\b/.test(n.className) || /color:/.test(n.getAttribute("style") || "")).length);
    if (hued) return "the shared viewer must not use member hue";
    return null;
  });
}
await file("light");
await file("dark");

// the dead-link state (revoked / expired / invalid) — token "expired" in the demo fixture
await run("expired", "/shared/expired?demo=1", "light", async (p) => {
  if (!(await $(p, ".sharedview .svbody.svexpired .deadshare"))) return "expired token should show the dead-link state";
  if (await $(p, ".sharedview .svmedia")) return "a dead link must not render the media/meta";
  if (!(await $(p, ".sharedview .deadshare .deadicon"))) return "dead-link icon missing";
  return null;
});

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all shared-link states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
