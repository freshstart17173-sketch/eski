// verify-dms.mjs — the P7.1 self-test for the Messages screen (DM list + Friends panel).
// Serves the real app, drives the demo fixture, asserts structure + the friends flow (add /
// accept / decline, tab counts) with ZERO app console errors, both themes. Mirrors verify-profile.

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8237;
const SHOTS = process.argv.includes("--shots");
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
const OUT = normalize(join(fileURLToPath(import.meta.url), ".."));
let fails = 0;

async function run(name, theme, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("eski-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/messages?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: join(OUT, `dms-${name}.png`) });
  const problems = [];
  const structural = await fn(page).catch((e) => `assert threw: ${e.message}`);
  if (structural) problems.push(structural);
  const appErrs = errs.filter((e) => !/Failed to load resource|net::ERR|supabase|getSession|fetch|401|403|Access-Control/i.test(e));
  if (appErrs.length) problems.push(...appErrs);
  if (problems.length) { fails++; console.log(`✗ ${name}`); problems.forEach((p) => console.log("    " + p)); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

// the thread list renders (pinned + direct), with the Friends toggle carrying a pending count
async function listCase(theme) {
  await run(`list-${theme}`, theme, async (p) => {
    if (!(await $(p, ".dmlist"))) return "the DM list column is missing";
    if ((await count(p, ".dmrow")) < 4) return "expected the 4 demo threads";
    if (!(await $(p, ".dmrow.group .gav"))) return "the group thread should show stacked avatars";
    if (!(await $(p, ".dmfriends .ct"))) return "the Friends toggle should show a pending count";
    return null;
  });
}
await listCase("light");
await listCase("dark");

// the Friends flow: All (3 accepted) / Pending (1 incoming + 1 outgoing); accept moves a
// request into All; adding a friend grows the outgoing list.
await run("friends-flow", "light", async (p) => {
  await p.click(".dmfriends");
  await p.waitForTimeout(150);
  if (!(await $(p, ".friends .frbody"))) return "the Friends panel should open";
  const allTabN = await p.$eval(".friends .frtab.on .ct", (e) => e.textContent).catch(() => "");
  if (allTabN !== "3") return `All tab should count 3 accepted, got "${allTabN}"`;
  if ((await count(p, ".friends .frrow")) !== 3) return "All should list the 3 friends";
  if (!(await $(p, ".friends .frrow .rbtn"))) return "a friend row should carry a Message action";
  // Pending tab: 1 incoming (accept/decline) + 1 outgoing (pending label)
  const tabs = await p.$$(".friends .frtab");
  await tabs[1].click();
  await p.waitForTimeout(150);
  if (!(await $(p, ".friends .frrow .rbtn.ok"))) return "an incoming request needs an Accept button";
  if (!(await $(p, ".friends .pendlbl"))) return "an outgoing request needs a pending label";
  // accept the incoming request → it leaves Pending
  const beforePending = await count(p, ".friends .frrow");
  await p.click(".friends .frrow .rbtn.ok");
  await p.waitForTimeout(150);
  if ((await count(p, ".friends .frrow")) !== beforePending - 1) return "accepting should remove the incoming row from Pending";
  // back to All → now 4 friends
  const tabs2 = await p.$$(".friends .frtab");
  await tabs2[0].click();
  await p.waitForTimeout(150);
  if ((await count(p, ".friends .frrow")) !== 4) return "the accepted friend should now appear in All (4)";
  // add a friend by handle → the outgoing list grows under Pending
  await p.fill(".friends .fradd input", "newpal");
  await p.click('.friends .fradd button:has-text("Send request")');
  await p.waitForTimeout(150);
  const tabs3 = await p.$$(".friends .frtab");
  await tabs3[1].click();
  await p.waitForTimeout(150);
  const outLabels = await p.$$eval(".friends .frrow .info b", (ns) => ns.map((n) => n.textContent));
  if (!outLabels.includes("newpal")) return "the sent request should appear under Outgoing";
  return null;
});

// the DM conversation (P7.2): opening a thread loads its messages; the composer sends and
// appends; the friend Message button opens a fresh conversation.
await run("conversation", "light", async (p) => {
  await p.click(".dmrow");   // the pinned mira thread (d1)
  await p.waitForTimeout(200);
  if (!(await $(p, ".dmmain .stream"))) return "opening a thread should show the conversation";
  const before = await count(p, ".dmmain .stream .msg");
  if (before < 3) return `mira's demo thread should load 3 messages, got ${before}`;
  if (!(await $(p, ".dmmain .composer input"))) return "the composer is missing";
  await p.fill(".dmmain .composer input", "hey from the test");
  await p.press(".dmmain .composer input", "Enter");
  await p.waitForTimeout(150);
  if ((await count(p, ".dmmain .stream .msg")) !== before + 1) return "sending should append a message";
  if ((await p.$eval(".dmmain .composer input", (i) => i.value)) !== "") return "the composer should clear after sending";
  // open a conversation from the Friends panel Message button
  await p.click(".dmfriends");
  await p.waitForTimeout(150);
  await p.click(".friends .frrow .rbtn");   // Message the first friend
  await p.waitForTimeout(200);
  if (!(await $(p, ".dmmain .composer input"))) return "the Message button should open a conversation with a composer";
  return null;
});

// DM row actions (P7.1b): the ⋯ menu offers Pin / Mute / Hide; hiding drops the row, and
// pinning moves a row into the Pinned section (it gains a pin marker).
await run("dm-actions", "light", async (p) => {
  const before = await count(p, ".dmrow");
  const mores = await p.$$(".dmrow .more2");
  await mores[mores.length - 1].click();   // the last (unpinned) thread
  await p.waitForTimeout(120);
  const items = await p.$$eval(".menu.open button", (bs) => bs.map((b) => b.textContent.trim()));
  for (const w of ["Pin", "Mute", "Hide conversation"]) if (!items.some((t) => t.includes(w))) return `DM menu missing "${w}" (got ${JSON.stringify(items)})`;
  for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).includes("Hide")) { await b.click(); break; } }
  await p.waitForTimeout(150);
  if ((await count(p, ".dmrow")) !== before - 1) return "Hide should remove the conversation from the list";
  // pin the last remaining direct row → a second pin marker appears in the list
  const pinsBefore = await p.$$eval(".dmrow .dmtrail .ic", (ns) => ns.filter((n) => (n.querySelector("use") || {}).getAttribute?.("href") === "#i-pin").length);
  const mores2 = await p.$$(".dmrow .more2");
  await mores2[mores2.length - 1].click();
  await p.waitForTimeout(120);
  for (const b of await p.$$(".menu.open button")) { if ((await b.textContent()).trim() === "Pin") { await b.click(); break; } }
  await p.waitForTimeout(150);
  const pinsAfter = await p.$$eval(".dmrow .dmtrail .ic", (ns) => ns.filter((n) => (n.querySelector("use") || {}).getAttribute?.("href") === "#i-pin").length);
  if (pinsAfter !== pinsBefore + 1) return `pinning should add a pin marker (${pinsBefore} → ${pinsBefore + 1}), got ${pinsAfter}`;
  return null;
});

// New message (P7.1c): the pen opens a friend picker; picking one and starting opens a
// conversation with a composer.
await run("new-message", "light", async (p) => {
  await p.click('.dmlist .hd .iconbtn');   // the "New message" pen
  await p.waitForTimeout(150);
  if (!(await $(p, ".scrim .modal .nmlist"))) return "the New message picker should open with the friends list";
  if ((await count(p, ".scrim .modal .nmrow")) !== 3) return "the picker should list the 3 friends";
  await p.click(".scrim .modal .nmrow input");   // pick the first friend
  await p.waitForTimeout(80);
  await p.click('.scrim .modal button:has-text("Start conversation")');
  await p.waitForTimeout(200);
  if (await $(p, ".scrim .modal")) return "starting should close the picker";
  if (!(await $(p, ".dmmain .composer input"))) return "starting should open a conversation with a composer";
  return null;
});

await browser.close();
server.close();
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ all Messages/Friends states render, zero app console errors, both themes");
process.exit(fails ? 1 : 0);
