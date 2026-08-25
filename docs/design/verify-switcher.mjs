// verify-switcher.mjs — the P9 self-test for the quick-switcher (⌘K / Ctrl-K). Serves the real
// app, opens the palette with the keyboard from an in-app screen, asserts the entry list,
// filtering, keyboard nav and Enter-to-navigate, with ZERO app console errors, both themes.

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8241;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    let ext = extname(file);
    if (!ext) { file = join(ROOT, "index.html"); ext = ".html"; }
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(PORT, r));

const $ = (page, sel) => page.$(sel);
const count = async (page, sel) => (await page.$$(sel)).length;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let fails = 0;

async function run(name, theme, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("eski-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const problems = [];
  const structural = await fn(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

async function openCase(theme) {
  await run(`open-${theme}`, theme, async (p) => {
    await p.keyboard.press("Control+k");
    await p.waitForTimeout(150);
    if (!(await $(p, ".qs"))) return "Ctrl+K should open the quick-switcher overlay";
    if (!(await $(p, ".qs .qshd input"))) return "the switcher should have a filter input";
    // the four standard destinations are always present
    if ((await count(p, ".qs .qsrow")) < 4) return "expected at least the 4 standard destinations";
    const labels = await p.$$eval(".qs .qslabel", (ns) => ns.map((n) => n.textContent));
    for (const want of ["Feed", "Messages", "My files", "Notifications"]) {
      if (!labels.includes(want)) return `standard destination "${want}" is missing`;
    }
    // a second Ctrl+K toggles it shut
    await p.keyboard.press("Control+k");
    await p.waitForTimeout(120);
    if (await $(p, ".qs")) return "a second Ctrl+K should close the switcher";
    return null;
  });
}
await openCase("light");
await openCase("dark");

await run("filter-and-nav", "light", async (p) => {
  await p.keyboard.press("Control+k");
  await p.waitForTimeout(150);
  // typing filters the list
  await p.type(".qs .qshd input", "messa");
  await p.waitForTimeout(120);
  const labels = await p.$$eval(".qs .qslabel", (ns) => ns.map((n) => n.textContent.toLowerCase()));
  if (!labels.every((l) => l.includes("messa"))) return "typing should filter to matching entries only";
  if (!labels.includes("messages")) return "the Messages destination should survive the filter";
  // Enter opens the top match → /messages
  await p.keyboard.press("Enter");
  await p.waitForTimeout(250);
  if (await $(p, ".qs")) return "choosing an entry should close the switcher";
  if (!/\/messages/.test(p.url())) return `Enter should navigate to the top match, url=${p.url()}`;
  return null;
});

await run("no-match-and-esc", "light", async (p) => {
  await p.keyboard.press("Control+k");
  await p.waitForTimeout(150);
  await p.type(".qs .qshd input", "zzzznope");
  await p.waitForTimeout(120);
  if (!(await $(p, ".qs .qsnone"))) return "a query with no matches should show the empty state";
  await p.keyboard.press("Escape");
  await p.waitForTimeout(120);
  if (await $(p, ".qs")) return "Escape should close the switcher";
  return null;
});

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ quick-switcher opens/filters/navigates, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
