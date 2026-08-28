// verify-onboard.mjs — the create-profile onboarding self-test. A fresh account has no
// `profiles` row (no signup trigger), so main.js gates every in-app route behind
// needsProfileSetup() and renders screens/onboard.js until a username is set. Onboarding
// needs a real session to reach through the shell, which the sandbox can't create — so this
// mounts renderCreateProfile() directly and asserts its structure + ZERO app console errors
// in both themes. HARD FAILS exit 1. Mirrors the other verify-*.mjs.
//
// Run: node docs/design/verify-onboard.mjs   (add --shots to write PNGs)

import { createRequire } from "module";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, normalize, extname } from "path";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ROOT = normalize(join(new URL(".", import.meta.url).pathname, "..", ".."));
const SHOTS = process.argv.includes("--shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

const server = createServer((q, s) => {
  let p = normalize(decodeURIComponent(q.url.split("?")[0])); let f = join(ROOT, p);
  if (!/\.[a-z0-9]+$/i.test(p) && !p.startsWith("/api/")) f = join(ROOT, "index.html");
  if (existsSync(f) && statSync(f).isFile()) { s.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); s.end(readFileSync(f)); }
  else s.writeHead(404).end("nf");
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: CHROME });
let fail = 0;
const ok = (m) => console.log("✓ " + m);
const bad = (m) => { console.error("✗ " + m); fail++; };

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, colorScheme: theme });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || /unknown icon/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/signin`, { waitUntil: "networkidle" });   // boot app + sprite

  const res = await page.evaluate(async () => {
    const mod = await import("/app/screens/onboard.js");
    let done = false;
    const scr = mod.renderCreateProfile(() => { done = true; });
    document.getElementById("stage").replaceChildren(scr);
    return {
      hasAt: !!scr.querySelector(".authcard .field .at"),          // the @ marks the username field
      inputs: scr.querySelectorAll(".authcard .field input").length,
      btn: (scr.querySelector(".authcard button.btn") || {}).textContent?.trim() || "",
      wordmark: !!scr.querySelector(".wordmark"),
    };
  });
  if (res.wordmark) ok(`[${theme}] wordmark renders`); else bad(`[${theme}] missing wordmark`);
  if (res.inputs === 2) ok(`[${theme}] display-name + username fields`); else bad(`[${theme}] expected 2 fields, got ${res.inputs}`);
  if (res.hasAt) ok(`[${theme}] username field has the @ prefix`); else bad(`[${theme}] username @ prefix missing`);
  if (/create profile/i.test(res.btn)) ok(`[${theme}] Create profile button`); else bad(`[${theme}] button label was "${res.btn}"`);

  // an empty username can't submit (the field flags an error, no throw)
  await page.evaluate(() => document.querySelector(".authcard button.btn").click());
  await page.waitForTimeout(60);
  const flagged = await page.$eval(".authcard .field.err", () => true).catch(() => false);
  if (flagged) ok(`[${theme}] empty username is blocked with an error`); else bad(`[${theme}] empty username should flag the field`);

  if (SHOTS) await page.screenshot({ path: join(ROOT, "docs/design/assets", `onboard-${theme}.png`) });
  if (errs.length) bad(`[${theme}] console errors: ${errs.join("; ")}`);
  else ok(`[${theme}] zero app console errors`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(fail ? "\nONBOARD VERIFY FAILED" : "\n✓ onboarding renders + validates, zero app console errors, both themes");
process.exit(fail ? 1 : 0);
