#!/usr/bin/env node
/* verify-primitives.mjs — the P3 acceptance harness. Serves the repo over HTTP,
 * loads docs/design/primitives.html in headless Chromium, and proves: every
 * primitive renders with zero console errors / unknown icons on BOTH themes, and
 * the interactive ones actually behave (Modal Esc, Menu, Toggle/Checkbox, Toast,
 * Tabs, Segmented, SelectPill, and the MediaPlayer transport — play/pause/skip/
 * seek/mute). Same runner shape as verify.mjs.
 *
 *   node verify-primitives.mjs
 */
import { createRequire } from "module";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname } from "path";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".wav": "audio/wav" };

const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split("?")[0]));
  let file = join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  } else { res.writeHead(404).end("not found"); }
});

const fails = [];
const T = async (name, fn) => { try { await fn(); console.log("  ✓ " + name); } catch (e) { fails.push(name + " — " + e.message); console.log("  ✗ " + name + " — " + e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });

for (const theme of ["light", "dark"]) {
  console.log(`\n— theme: ${theme} —`);
  const page = await browser.newPage();
  const errs = [];
  page.on("console", (m) => { const t = m.text(); if (m.type() === "error" || /\[icon\] unknown/.test(t)) errs.push(t); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`${base}/docs/design/primitives.html`, { waitUntil: "networkidle" });
  await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
  await page.waitForSelector("#mp .dmtransport");

  await T("all 15 primitive sections rendered", async () => {
    const n = await page.$$eval(".pdemo", (s) => s.length);
    assert(n >= 15, `only ${n} sections`);
  });
  await T("zero console errors / unknown icons", async () => {
    assert(errs.length === 0, errs.join(" | "));
  });
  await T("tokens resolve (btn has a computed bg)", async () => {
    const bg = await page.$eval(".btn.primary", (b) => getComputedStyle(b).backgroundColor);
    assert(bg && bg !== "rgba(0, 0, 0, 0)", "primary btn has no bg");
  });

  // — interactions (theme-independent, but re-run per theme is cheap) —
  await T("Modal: opens on scrim, Esc closes", async () => {
    await page.click("#open-modal");
    assert(await page.$(".scrim"), "scrim did not appear");
    const shadow = await page.$eval(".modal", (m) => getComputedStyle(m).boxShadow);
    assert(shadow === "none", "modal must have no drop shadow");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".scrim", { state: "detached" });
  });
  await T("Menu: opens and Esc closes", async () => {
    await page.click("#open-menu");
    await page.waitForSelector(".menu.open");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".menu.open", { state: "detached" });
  });
  await T("Toggle flips aria-checked", async () => {
    const before = await page.$eval("#tgl", (t) => t.getAttribute("aria-checked"));
    await page.click("#tgl");
    const after = await page.$eval("#tgl", (t) => t.getAttribute("aria-checked"));
    assert(before !== after, "toggle did not flip");
  });
  await T("Checkbox flips + fills ink", async () => {
    await page.click("#cbx");
    assert(await page.$eval("#cbx", (c) => c.classList.contains("on")), "checkbox not on");
  });
  await T("Toast appears then can dismiss", async () => {
    await page.click("#toast-btn");
    await page.waitForSelector(".toast");
    await page.click(".toast .tclose");
    await page.waitForSelector(".toast", { state: "detached" });
  });
  await T("Tabs: selecting moves the active underline", async () => {
    await page.$$eval("#tabs .nav", (ts) => ts[1].click());
    const sel = await page.$$eval("#tabs .nav", (ts) => ts.map((t) => t.getAttribute("aria-selected")));
    assert(sel[1] === "true" && sel[0] === "false", "active tab did not move");
  });
  await T("Segmented: one active at a time; Server uses #i-server", async () => {
    const usesServer = await page.$$eval("#seg .o", (os) => os[1].querySelector("use")?.getAttribute("href"));
    assert(usesServer === "#i-server", "Server option must use #i-server");
    await page.$$eval("#seg .o", (os) => os[2].click());
    const ons = await page.$$eval("#seg .o", (os) => os.map((o) => o.classList.contains("on")));
    assert(ons.filter(Boolean).length === 1 && ons[2], "exactly one (Private) should be active");
  });
  await T("SelectPill: opens menu, selection updates label", async () => {
    await page.click("#sel");
    await page.waitForSelector(".menu.open");
    await page.$$eval(".menu.open button", (bs) => bs[1].click());   // pick "Name"
    await page.waitForSelector(".menu.open", { state: "detached" });
    const label = await page.$eval("#sel", (b) => b.textContent);
    assert(/Name/.test(label), "label did not update to Name");
  });

  await T("MediaPlayer: play/pause toggle reflects paused", async () => {
    await page.waitForFunction(() => document.querySelector("#mp").media.duration > 0);
    await page.click("#mp .dmbigplay");
    await page.waitForFunction(() => document.querySelector("#mp").media.paused === false);
    const lbl = await page.$eval("#mp .dmbigplay", (b) => b.getAttribute("aria-label"));
    assert(lbl === "Pause", "big button should read Pause while playing");
    await page.click("#mp .dmbigplay");
    await page.waitForFunction(() => document.querySelector("#mp").media.paused === true);
  });
  await T("MediaPlayer: seek by clicking the track (~50%)", async () => {
    const bb = await page.$eval("#mp .track", (t) => { const r = t.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.click(bb.x + bb.w * 0.5, bb.y + bb.h / 2);
    const ct = await page.$eval("#mp", (p) => p.media.currentTime);
    const dur = await page.$eval("#mp", (p) => p.media.duration);
    assert(Math.abs(ct - dur * 0.5) < dur * 0.08, `seek off: ct=${ct} dur=${dur}`);
  });
  await T("MediaPlayer: skip ±10s clamped, time + scrubber follow", async () => {
    const t0 = await page.$eval("#mp", (p) => p.media.currentTime);
    await page.click("#mp .tbtn[aria-label='Back 10 seconds']");
    const t1 = await page.$eval("#mp", (p) => p.media.currentTime);
    assert(Math.abs(t1 - Math.max(0, t0 - 10)) < 0.5, `rewind wrong: ${t0}->${t1}`);
    await page.click("#mp .tbtn[aria-label='Forward 10 seconds']");
    const t2 = await page.$eval("#mp", (p) => p.media.currentTime);
    assert(t2 > t1, "ff did not advance");
    const fillW = await page.$eval("#mp .track i", (i) => i.style.width);
    assert(fillW && fillW !== "0%", "scrubber fill did not follow");
  });
  await T("MediaPlayer: mute toggles + icon reflects", async () => {
    await page.click("#mp .tbtn[aria-label='Mute']");
    assert(await page.$eval("#mp", (p) => p.media.muted), "not muted");
    const href = await page.$eval("#mp .tbtn[aria-label='Unmute'] use", (u) => u.getAttribute("href"));
    assert(href === "#i-mute", "mute icon did not swap");
  });

  await page.close();
}

await browser.close();
server.close();
console.log(`\n${fails.length ? "✗ " + fails.length + " FAIL" : "✓ all primitive checks pass (both themes)"}`);
process.exit(fails.length ? 1 : 0);
