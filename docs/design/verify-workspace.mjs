// verify-workspace.mjs — the P4 self-test. Serves the real app over HTTP, drives
// the Workspace screen through its states (populated via ?demo=1, plus each edge
// state via ?ws=), and asserts each renders with the right structure and ZERO app
// console errors / unknown-icon warnings, in both themes. Mirrors verify.mjs
// (gallery) and verify-primitives.mjs (P3): HARD FAILS exit 1.
//
// Run: node docs/design/verify-workspace.mjs   (add --shots to also write PNGs)
//
// Network noise is expected and ignored: the sandboxed browser can't reach the
// Supabase project, so getSession()/fetch errors are filtered out — they don't
// touch the rendered UI (boot is resilient; the empty path is a real state).

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));   // repo root
const PORT = 8231;
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

// [name, url, theme, assert(page)->Promise<string|null error>]
const $ = (page, sel) => page.$(sel);
const has = async (page, sel, label) => (await $(page, sel)) ? null : `missing ${label} (${sel})`;
const CASES = [
  ["default-light", "/s/lb/c/beats?demo=1", "light", async (p) =>
    (await has(p, '.screen[data-screen="workspace"]', "workspace screen")) ||
    (await has(p, ".rail .railbtn.user", "server rail")) ||
    (await has(p, "nav.chan .srvbar", "channel column")) ||
    (await has(p, ".chtabs .chtab.on", "channel header tab")) ||
    (await has(p, ".stream .msg", "message rows")) ||
    (await has(p, ".mem .mrow", "members rail")) ||
    (await has(p, ".composer .richcomposer .field input", "composer"))],
  ["default-dark", "/s/lb/c/beats?demo=1", "dark", async (p) => has(p, ".stream .msg .u", "member-hue byline")],
  ["reactions", "/s/lb/c/beats?demo=1", "light", async (p) => {
    // toggling a demo reaction chip adds mine (+1, .on); toggling again removes it
    const chip = await p.$(".stream .msg .reactions .react");
    if (!chip) return "a demo message should show reaction chips";
    const nBefore = Number(await chip.$eval(".n", (e) => e.textContent));
    await chip.click();
    await p.waitForTimeout(120);
    const first = await p.$(".stream .msg .reactions .react");
    const nAfter = Number(await first.$eval(".n", (e) => e.textContent));
    if (nAfter !== nBefore + 1) return `toggling a reaction should add mine (${nBefore}→${nBefore + 1}), got ${nAfter}`;
    if (!(await first.evaluate((e) => e.classList.contains("on")))) return "my reaction chip should show active (.on)";
    // add a new emoji via the smile React picker
    const msg = await p.$(".stream .msg");
    await msg.hover();
    await p.waitForTimeout(80);
    const before = (await msg.$$(".reactions .react")).length;
    await (await msg.$(".hoveracts button")).click();   // the smile (React) hover action
    await p.waitForTimeout(120);
    await p.click(".menu.open button");                 // pick the first emoji
    await p.waitForTimeout(120);
    const after = (await (await p.$(".stream .msg")).$$(".reactions .react")).length;
    if (after <= before) return "adding an emoji should append a reaction chip";
    return null;
  }],
  ["msg-menu", "/s/lb/c/beats?demo=1", "light", async (p) => {
    const msg = await p.$(".stream .msg");
    await msg.hover();
    await p.waitForTimeout(80);
    const acts = await msg.$$(".hoveracts button");
    await acts[acts.length - 1].click();   // the ⋯ (More) hover action
    await p.waitForTimeout(120);
    const items = await p.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
    if (!items.some((t) => t.includes("Pin to channel"))) return "message menu missing Pin to channel";
    if (!items.some((t) => t.includes("Copy link"))) return "message menu missing Copy link";
    // Pin fires without error (demo no-ops; the toast confirms wiring)
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Pin to channel")) { await b.click(); break; } }
    await p.waitForTimeout(100);
    return null;
  }],
  ["moderation", "/s/lb/c/beats?demo=1", "light", async (p) => {
    // click a non-me member row → the admin moderation menu opens
    const rows = await p.$$(".mem .mrow");
    let target = null;
    for (const r of rows) { const nm = await r.$eval(".nm", (e) => e.textContent).catch(() => ""); if (nm && nm.trim() !== "jax") { target = r; break; } }
    if (!target) return "no manageable member row found";
    await target.click();
    await p.waitForTimeout(120);
    const items = await p.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
    for (const w of ["Timeout", "Kick from server", "Ban from server"]) if (!items.some((t) => t.includes(w))) return `member menu missing "${w}" (got ${JSON.stringify(items)})`;
    // Manage roles → a checklist of the 3 demo roles opens and saves
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Manage roles")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    if ((await p.$$(".scrim .modal .rolelist .rolerow")).length !== 3) return "Manage roles should list the 3 server roles";
    await p.click(".scrim .modal .rolerow input");   // toggle a role
    await p.click('.scrim .modal button:has-text("Save roles")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "saving roles should close the modal";
    // re-open the member menu for the Kick flow below
    await target.click();
    await p.waitForTimeout(120);
    // Kick → confirm modal → confirming drops the member row
    const before = (await p.$$(".mem .mrow")).length;
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Kick")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal"))) return "Kick should open a confirm modal";
    await p.click('.scrim .modal button:has-text("Kick")');
    await p.waitForTimeout(150);
    if ((await p.$$(".mem .mrow")).length !== before - 1) return "confirming Kick should drop the member row";
    return null;
  }],
  ["server-create-join", "/s/lb/c/beats?demo=1", "light", async (p) => {
    await p.click('.rail .railbtn[title="Create or join a server"]');
    await p.waitForTimeout(120);
    const items = await p.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
    for (const w of ["Create server", "Join by link"]) if (!items.some((t) => t.includes(w))) return `+ menu missing "${w}"`;
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Create server")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (!(await $(p, '.scrim .modal input[aria-label="Server name"]'))) return "Create server modal should open";
    await p.fill('.scrim .modal input[aria-label="Server name"]', "Test Studio");
    await p.click('.scrim .modal button:has-text("Create server")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "creating should close the modal (demo toasts)";
    // Join by link
    await p.click('.rail .railbtn[title="Create or join a server"]');
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Join by link")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (!(await $(p, '.scrim .modal input[aria-label="Invite link"]'))) return "Join modal should open";
    await p.fill('.scrim .modal input[aria-label="Invite link"]', "join.eski.lol/late-bloom-77");
    await p.click('.scrim .modal button:has-text("Join")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "joining should close the modal (demo toasts)";
    return null;
  }],
  ["notif-settings", "/s/lb/c/beats?demo=1", "light", async (p) => {
    await p.click("nav.chan .srvbar");
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Notification settings")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal .selbtn"))) return "notif settings should open with a level selector";
    if (!(await $(p, '.scrim .modal input[aria-label="Suppress @everyone"]'))) return "suppress-@everyone toggle missing";
    await p.click('.scrim .modal input[aria-label="Suppress @everyone"]');
    await p.click('.scrim .modal button:has-text("Save")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "saving notif settings should close the modal";
    return null;
  }],
  ["invite", "/s/lb/c/beats?demo=1", "light", async (p) => {
    await p.click("nav.chan .srvbar");
    await p.waitForTimeout(120);
    const items = await p.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
    if (!items.some((t) => t.includes("Invite people"))) return "server menu missing Invite people";
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Invite people")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal .sharelinks"))) return "Invite should open the invite-management modal";
    // the 2 demo invite links list, each with its usage/expiry meta line
    if ((await p.$$(".scrim .modal .sharelinks .invitem")).length !== 2) return "expected the 2 demo invite links";
    if (!(await $(p, ".scrim .modal .sharelinks .invmeta"))) return "each invite should show a usage/expiry line";
    // expiry + max-uses selectors present
    if ((await p.$$(".scrim .modal .selbtn")).length < 2) return "expiry + max-uses selectors expected";
    // create a new link → a third row appears + a toast confirms
    await p.click('.scrim .modal button:has-text("Create link")');
    await p.waitForTimeout(150);
    if ((await p.$$(".scrim .modal .sharelinks .invitem")).length !== 3) return "Create link should append an invite row";
    const toastText = await p.$eval(".toaststack", (t) => t.textContent).catch(() => "");
    if (!/invite|join\/|copied/i.test(toastText)) return `Create link should surface a toast, got "${toastText}"`;
    // revoke the first link → the row drops
    await p.click('.scrim .modal .sharelinks .invitem:first-child button:has-text("Revoke")');
    await p.waitForTimeout(150);
    if ((await p.$$(".scrim .modal .sharelinks .invitem")).length !== 2) return "Revoke should drop the invite row";
    await p.click('.scrim .modal button:has-text("Done")');
    await p.waitForTimeout(120);
    if (await $(p, ".scrim .modal")) return "Done should close the invite modal";
    return null;
  }],
  ["server-settings", "/s/lb/c/beats?demo=1", "light", async (p) => {
    await p.click("nav.chan .srvbar");
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).trim() === "Server settings") { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal"))) return "Server settings should open a modal";
    if (!(await $(p, '.scrim .modal input[aria-label="Server name"]'))) return "name field missing";
    if (!(await $(p, ".scrim .modal .coverpick .cv.icon"))) return "square icon preview missing";
    if ((await p.$$(".scrim .modal .coverpick")).length !== 2) return "expected an icon + a cover picker";
    // picking an image previews it locally (demo blob URL) → the icon preview becomes an <img>
    const px = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000100ff9a2c0d0000000049454e44ae426082", "hex");
    await p.setInputFiles('.scrim .modal .coverpick:first-of-type input[type=file]', { name: "icon.png", mimeType: "image/png", buffer: px });
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal .coverpick .cv.icon img"))) return "picking an icon should preview it as an image";
    // rename + Save closes
    await p.fill('.scrim .modal input[aria-label="Server name"]', "Late Bloom Sessions");
    await p.click('.scrim .modal button:has-text("Save")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "saving should close the modal";
    return null;
  }],
  ["delete-server", "/s/lb/c/beats?demo=1", "light", async (p) => {
    // demo jax owns Late Bloom → the menu offers Delete server (type-to-confirm)
    await p.click("nav.chan .srvbar");
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Delete server")) { await b.click(); break; } }
    await p.waitForTimeout(150);
    const del = await p.$('.scrim .modal button:has-text("Delete server")');
    if (!del) return "Delete server should open a type-to-confirm modal";
    if (!(await del.isDisabled())) return "Delete should be disabled until the name is typed";
    await p.fill('.scrim .modal input[aria-label="Type the server name"]', "Late Bloom LP");
    await p.waitForTimeout(80);
    if (await (await p.$('.scrim .modal button:has-text("Delete server")')).isDisabled()) return "typing the exact name should enable Delete";
    await p.click('.scrim .modal button:has-text("Delete server")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "confirming Delete should close the modal (demo toasts)";
    return null;
  }],
  ["channel-settings", "/s/lb/c/beats?demo=1", "light", async (p) => {
    const row = await p.$("nav.chan .crow");
    await row.hover();
    await p.waitForTimeout(60);
    const gear = await p.$("nav.chan .crow .cgear");
    if (!gear) return "channel edit gear missing for admin";
    await gear.click();
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal"))) return "channel settings modal should open";
    if ((await p.$$(".scrim .modal .selbtn")).length < 2) return "slow-mode + post-policy selectors expected";
    await p.fill('.scrim .modal input[aria-label="Channel name"]', "renamed-chan");
    await p.click('.scrim .modal button:has-text("Save channel")');
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "saving should close the modal";
    return null;
  }],
  ["create-channel", "/s/lb/c/beats?demo=1", "light", async (p) => {
    const add = await p.$("nav.chan .cgadd");
    if (!add) return "the channel-group + (create channel) is missing";
    await add.click();
    await p.waitForTimeout(150);
    if (!(await $(p, ".scrim .modal"))) return "Create channel should open a name modal";
    await p.fill(".scrim .modal .field input", "renders");
    await p.press(".scrim .modal .field input", "Enter");
    await p.waitForTimeout(150);
    if (await $(p, ".scrim .modal")) return "creating should close the modal (demo toasts)";
    return null;
  }],
  ["msg-edit", "/s/lb/c/beats?demo=1", "light", async (p) => {
    // the own (jax) message m6 gets Edit/Delete; inline-edit its body, then delete it
    const own = await p.$('.stream .msg[data-mid="m6"]');
    if (!own) return "the demo stream should include an own message (m6)";
    await own.hover();
    await p.waitForTimeout(80);
    await (await own.$(".hoveracts button:last-child")).click();   // ⋯
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Edit message")) { await b.click(); break; } }
    await p.waitForTimeout(120);
    const input = await p.$('.msg[data-mid="m6"] .editinput');
    if (!input) return "Edit should swap the body for an input";
    await input.fill("re-cut done, new bounce is up");
    await input.press("Enter");
    await p.waitForTimeout(150);
    const tx = await p.$eval('.msg[data-mid="m6"] .tx', (e) => e.textContent);
    if (!tx.includes("re-cut done")) return `the edited body should render, got "${tx}"`;
    if (!(await $(p, '.msg[data-mid="m6"] .tx .edited'))) return "an edited message should show the (edited) marker";
    // delete it
    await p.hover('.msg[data-mid="m6"]');
    await p.waitForTimeout(60);
    await p.click('.msg[data-mid="m6"] .hoveracts button:last-child');
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).trim() === "Delete message") { await b.click(); break; } }
    await p.waitForTimeout(150);
    if (await $(p, '.msg[data-mid="m6"]')) return "deleting should remove the message row";
    return null;
  }],
  ["thread", "/s/lb/c/beats?demo=1&ws=thread", "light", async (p) =>
    (await has(p, ".threadpane .tpbody .msg", "thread pane")) ||
    (await has(p, ".threadpane .alsosend", "also-to-channel toggle")) ||
    ((await $(p, ".mem")) && !(await p.$eval(".mem", (e) => e.hasAttribute("hidden"))) ? "members rail should hide when thread is open" : null)],
  ["pins", "/s/lb/c/beats?demo=1&ws=pins", "light", async (p) =>
    ((await p.$eval('.chpanel[data-chview="pins"]', (e) => e.hidden)) ? "pins panel should be visible" : null) ||
    (await has(p, '.chpanel[data-chview="pins"] .pinrow', "pin rows"))],
  ["files", "/s/lb/c/beats?demo=1&ws=files", "light", async (p) =>
    ((await p.$eval('.chpanel[data-chview="files"]', (e) => e.hidden)) ? "files panel should be visible" : null) ||
    (await has(p, '.chpanel[data-chview="files"] .card .media', "file cards"))],
  ["loading", "/s/lb/c/beats?demo=1&ws=loading", "light", async (p) => has(p, ".stream .skelmsg .skel", "loading skeleton")],
  ["timedout", "/s/lb/c/beats?demo=1&ws=timedout", "light", async (p) =>
    ((await p.$eval(".composernote", (e) => e.hidden)) ? "timed-out notice should be visible" : null) ||
    ((await $(p, ".composer.disabled")) ? null : "composer should be disabled")],
  ["reconnecting", "/s/lb/c/beats?demo=1&ws=reconnecting", "dark", async (p) =>
    (await p.$eval("#offlineBar", (e) => e.hidden)) ? "reconnecting banner should be visible" : null],
  ["empty-server", "/s/lb?demo=1&ws=empty", "light", async (p) => has(p, ".emptystate h3", "no-channels empty state")],
  ["signed-out", "/s/lb/c/beats", "light", async (p) => has(p, ".authcard .field input", "sign-in prompt when signed out")],
  ["permalink-arrival", "/s/lb/c/beats?demo=1&m=m3", "light", async (p) =>
    // arriving with ?m=<id> flashes that message (the class lingers ~1.7s, past the 400ms wait)
    has(p, '.stream .msg[data-mid="m3"].flash', "flashed permalink target")],
  ["copy-link", "/s/lb/c/beats?demo=1", "light", async (p) => {
    const msg = await p.$('.stream .msg[data-mid="m3"]');
    await msg.hover();
    await p.waitForTimeout(80);
    await (await msg.$(".hoveracts button:last-child")).click();   // ⋯
    await p.waitForTimeout(120);
    for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Copy link")) { await b.click(); break; } }
    await p.waitForTimeout(120);
    // clipboard write may be blocked headless → the fallback toasts the URL itself; either
    // path surfaces a toast that proves the permalink (…?m=m3) was built.
    const toastText = await p.$eval(".toaststack", (t) => t.textContent).catch(() => "");
    if (!/m=m3|Message link copied/.test(toastText)) return `Copy link should surface the permalink toast, got "${toastText}"`;
    return null;
  }],
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
  if (SHOTS) await page.screenshot({ path: join(OUT, `ws-${name}.png`) });

  const problems = [];
  const structural = await assert(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);

  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all workspace states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
