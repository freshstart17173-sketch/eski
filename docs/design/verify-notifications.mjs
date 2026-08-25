// verify-notifications.mjs — the P7.3 self-test for the Notifications screen. Serves the real
// app, drives the demo fixture, asserts the list + tabs + mark-read behaviour with ZERO app
// console errors, both themes. Mirrors verify-profile.

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8238;
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
  await page.goto(`http://localhost:${PORT}/notifications?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
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

async function listCase(theme) {
  await run(`list-${theme}`, theme, async (p) => {
    if (!(await $(p, ".notif .notifhd"))) return "the notifications header is missing";
    if ((await count(p, ".notif .nrow")) !== 5) return "expected the 5 demo notifications";
    if ((await count(p, ".notif .nrow.unread")) !== 3) return "expected 3 unread";
    if (!(await $(p, ".notif .nrow .quote"))) return "an excerpt should render as a quote";
    return null;
  });
}
await listCase("light");
await listCase("dark");

await run("read-flow", "light", async (p) => {
  // Mentions tab → only the mention rows (1). Re-query each time: paintTabs re-renders the
  // tab strip, so held element handles go stale.
  await p.click('.notif .ntab:has-text("Mentions")');
  await p.waitForTimeout(120);
  if ((await count(p, ".notif .nrow")) !== 1) return "the Mentions tab should show only mentions";
  await p.click('.notif .ntab:has-text("All")');
  await p.waitForTimeout(120);
  // mark one read via its ✓ (hover-revealed; stopPropagation → no navigate)
  const beforeUnread = await count(p, ".notif .nrow.unread");
  const row = await p.$(".notif .nrow.unread");
  await row.hover();
  await p.waitForTimeout(80);
  await (await row.$(".donebtn")).click();
  await p.waitForTimeout(120);
  if ((await count(p, ".notif .nrow.unread")) !== beforeUnread - 1) return "the ✓ should mark a row read";
  // Mark all read → zero unread
  await p.click(".notif .notifhd .mark");
  await p.waitForTimeout(120);
  if ((await count(p, ".notif .nrow.unread")) !== 0) return "Mark all read should clear every unread dot";
  // clicking a row navigates to its target (n1 → /s/lb)
  await p.click(".notif .nrow");
  await p.waitForTimeout(200);
  if (!/\/s\/lb/.test(p.url())) return `clicking a notification should navigate to its target, url=${p.url()}`;
  return null;
});

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all Notifications states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
