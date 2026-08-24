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

// Edit profile (P5.10b) — open the modal from the owner's Edit-profile action, change the
// name + bio, save, and confirm the hero repaints in place (demo write is optimistic).
await run("edit-profile", "light", async (p) => {
  await p.click(".phero .actions .btn.primary");   // Edit profile (owner POV)
  await p.waitForTimeout(200);
  const inModal = await p.$(".scrim .modal");
  if (!inModal) return "Edit-profile modal should open";
  // avatar upload (P5.19): the avatar starts as initials; picking an image (demo previews it
  // locally, no R2) turns it into an <img>.
  if (await p.$(".scrim .modal .epavrow .av img")) return "avatar should start as initials (no photo yet)";
  if (!(await p.$('.scrim .modal .epavrow input[type="file"]'))) return "Change photo should be a real file picker, not a stub";
  await p.setInputFiles('.scrim .modal .epavrow input[type="file"]', join(ROOT, "eski_logo.png"));
  await p.waitForTimeout(200);
  if (!(await p.$(".scrim .modal .epavrow .av img"))) return "picking a photo should render it in the avatar";
  if (!(await p.$('.scrim .modal input[aria-label="Handle"]'))) return "handle field missing";
  if (!(await p.$('.scrim .modal .svnote'))) return "handle-change note missing";
  await p.fill('.scrim .modal input[aria-label="Display name"]', "jax okonkwo");
  await p.fill('.scrim .modal input[aria-label="Bio"]', "producer, engineer, and now with a longer bio.");
  await p.click('.scrim .modal button:has-text("Save profile")');
  await p.waitForTimeout(200);
  if (await p.$(".scrim .modal")) return "modal should close on save";
  const name = await p.$eval(".phero .who h1", (e) => e.textContent);
  if (name !== "jax okonkwo") return `hero name should repaint to the new name, got "${name}"`;
  const bio = await p.$eval(".phero .who .bio", (e) => e.textContent).catch(() => null);
  if (!bio || !bio.includes("longer bio")) return "hero bio should repaint to the new bio";
  // invalid handle is rejected (the modal stays open, a toast fires)
  await p.click(".phero .actions .btn.primary");
  await p.waitForTimeout(150);
  await p.fill('.scrim .modal input[aria-label="Handle"]', "no spaces!");
  await p.click('.scrim .modal button:has-text("Save profile")');
  await p.waitForTimeout(150);
  if (!(await p.$(".scrim .modal"))) return "an invalid handle should keep the modal open";
  return null;
});

// Search profile (P5.15) — the search toggle reveals an inline filter over the visible
// shelf; a matching query narrows the grid, a non-matching one shows the no-results state,
// and clearing (Esc) restores the full shelf.
await run("profile-search", "light", async (p) => {
  const total = await count(p, ".pbody .masonry .card");
  if (total < 2) return "the Public shelf needs ≥2 cards to test filtering";
  await p.click(".ptabs2 .iconbtn");   // the search toggle
  await p.waitForTimeout(120);
  const field = await p.$(".ptabs2 .psearch");
  if (!field || await field.isHidden()) return "search field should reveal on toggle";
  // a demo public title contains "bloom" (pub2 cover art, pub3 single) — filter to it
  await p.fill(".ptabs2 .psearch input", "bloom");
  await p.waitForTimeout(150);
  const filtered = await count(p, ".pbody .masonry .card");
  if (!(filtered > 0 && filtered < total)) return `filter should narrow the grid (was ${total}, got ${filtered})`;
  // a nonsense query → the no-results empty state
  await p.fill(".ptabs2 .psearch input", "zzzznotathing");
  await p.waitForTimeout(150);
  if (!(await p.$(".pbody .emptystate"))) return "a non-matching query should show the no-results state";
  // Esc clears + restores the full shelf
  await p.press(".ptabs2 .psearch input", "Escape");
  await p.waitForTimeout(150);
  const restored = await count(p, ".pbody .masonry .card");
  if (restored !== total) return `Esc should restore the full shelf (${total}), got ${restored}`;
  return null;
});

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all profile states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
