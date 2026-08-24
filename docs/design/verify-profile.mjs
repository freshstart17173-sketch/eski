// verify-profile.mjs — the P5.10 self-test for the Profile screen. Drives the
// owner self-view from the demo fixture, asserting hero + shelf tabs + grid, shelf
// switching, and ZERO app console errors in both themes. Mirrors verify-feed.mjs.
//
// Run: node docs/design/verify-profile.mjs   (add --shots to also write PNGs)

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8236;
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

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const OUT = normalize(join(fileURLToPath(import.meta.url), ".."));
let fails = 0;

async function run(name, theme, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("eski-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/u/jax?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(350);
  if (SHOTS) await page.screenshot({ path: join(OUT, `prof-${name}.png`) });
  const problems = [];
  const structural = await fn(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

await run("owner-light", "light", async (p) =>
  (await has(p, '.screen[data-screen="profile"] .phero .av.lg', "round avatar")) ||
  (await has(p, ".phero .who h1", "name")) ||
  (await has(p, ".phero .who .handle", "handle")) ||
  (await has(p, ".phero .actions .btn.primary", "POV action")) ||
  ((await count(p, ".ptabs2 .ptab2")) < 4 ? "owner should see Public/Server/Private + Settings" : null) ||
  (await has(p, ".pbody .masonry.even .card", "shelf grid cards")) ||
  ((await count(p, ".ptabs2 .ptab2.on")) !== 1 ? "exactly one shelf tab should be active" : null) ||
  ((await p.$eval(".ptabs2 .ptab2:nth-child(4)", (e) => e.classList.contains("on"))) ? "the Settings tab must not be active" : null) ||
  ((await count(p, ".card .who .uchip")) > 0 ? "profile must NOT use member-hue chips (public)" : null));

await run("owner-dark", "dark", async (p) => has(p, ".ptab2.on", "active shelf tab"));

// switch to the Private shelf and confirm it repaints
await run("shelf-switch", "light", async (p) => {
  const tabs = await p.$$(".ptabs2 .ptab2");
  await tabs[2].click();   // Private
  await p.waitForTimeout(150);
  return (await p.$eval(".ptabs2 .ptab2:nth-child(3)", (e) => e.classList.contains("on"))) ? null : "Private tab should activate";
});

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all profile states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
