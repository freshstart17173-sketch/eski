// verify-live.mjs — the P4.10/P4.11 self-test. Drives TWO signed-in browser
// sessions (the demo users dev@ and rae@seed.eski.lol) against the seeded "Late
// Bloom LP" server and asserts the live spine end-to-end:
//   P4.10 — a message sent by rae appears in dev's stream live; typing broadcast
//           shows in dev's view; mark_channel_read writes a read row on view.
//   P4.11 — dev's members rail shows rae online via presence.
//
// Needs the seed (docs/seed-late-bloom.sql) + the demo-user passwords set on the
// preview Supabase project. Runs against a local static server; the app exposes
// the public client on localhost (supabase.js) so the harness can sign in.
//
// Run: node docs/design/verify-live.mjs

import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const PORT = 8242;
const PWD = "eski-demo-preview-2026";
const SERVER = "11111111-1111-1111-1111-111111111111";
const BEATS = "c0000000-0000-4000-8000-000000000002";
const RAE = "0a000000-0000-4000-8000-000000000003";
const WS = `http://localhost:${PORT}/s/${SERVER}/c/${BEATS}`;
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
// Outbound HTTPS (Supabase auth/REST/Realtime) goes through the agent proxy; the
// app served on localhost must bypass it (loopback via the proxy returns 405).
// Set through explicit Chromium args — Playwright's proxy.bypass didn't take here.
// ignoreHTTPSErrors accepts the proxy's MITM cert (test-only).
const pxArgs = process.env.HTTPS_PROXY
  ? [`--proxy-server=${process.env.HTTPS_PROXY.replace(/^https?:\/\//, "")}`, "--proxy-bypass-list=127.0.0.1;localhost"]
  : [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: pxArgs });

const results = [];
const ok = (name) => { results.push([true, name]); console.log("✓ " + name); };
const bad = (name, e) => { results.push([false, name]); console.log("✗ " + name + (e ? " — " + e : "")); };

async function signInAndOpen(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sb, null, { timeout: 15000 });
  const err = await page.evaluate(async ({ email, PWD }) => {
    const { error } = await window.__sb.auth.signInWithPassword({ email, password: PWD });
    return error ? error.message : null;
  }, { email, PWD });
  if (err) throw new Error(`sign-in ${email}: ${err}`);
  await page.goto(WS, { waitUntil: "load" });
  await page.waitForSelector(".stream .msg, .emptystate", { timeout: 20000 });
  page._errs = errs;
  return page;
}

try {
  const dev = await signInAndOpen("dev@seed.eski.lol");
  const rae = await signInAndOpen("rae@seed.eski.lol");

  // ── initial live read renders the seeded channel ──────────────────────────
  const n = await dev.$$eval(".stream .msg", (e) => e.length);
  n >= 5 ? ok(`live read: dev sees ${n} seeded messages in #beats`) : bad("live read", `only ${n} messages`);
  await rae.waitForSelector(".composer .richcomposer .field input");

  // ── P4.11 presence: dev's rail shows rae online ───────────────────────────
  try {
    await dev.waitForFunction((u) => { const r = document.querySelector(`.mrow[data-uid="${u}"]`); return r && !r.classList.contains("off"); }, RAE, { timeout: 12000 });
    ok("presence: rae shows online in dev's members rail");
  } catch (e) { bad("presence", "rae never went online in dev's rail"); }

  // ── P4.10 typing: rae types → dev sees the indicator ──────────────────────
  try {
    await rae.fill(".composer .richcomposer .field input", "working on the bridge");
    await dev.waitForSelector(".typing:not([hidden])", { timeout: 8000 });
    const txt = await dev.$eval(".typing", (e) => e.textContent);
    txt.toLowerCase().includes("rae") ? ok("typing: dev sees 'rae is typing'") : bad("typing", `indicator text was "${txt}"`);
  } catch (e) { bad("typing", "dev never saw the typing indicator"); }

  // ── P4.10 live message: rae sends → dev's stream shows it ─────────────────
  const token = "live-check-" + Date.now();
  try {
    await rae.fill(".composer .richcomposer .field input", token);
    await rae.click(".composer .richcomposer .field .snd");
    await dev.waitForFunction((t) => [...document.querySelectorAll(".stream .msg .tx")].some((n) => n.textContent.includes(t)), token, { timeout: 12000 });
    ok("live message: rae's message arrives in dev's stream");
  } catch (e) { bad("live message", "dev never received rae's message"); }

  // rae's own stream also shows it (echo, deduped — no double)
  try {
    const dupes = await rae.$$eval(".stream .msg .tx", (els, t) => els.filter((n) => n.textContent.includes(t)).length, token);
    dupes === 1 ? ok("echo dedupe: sender sees exactly one copy") : bad("echo dedupe", `${dupes} copies`);
  } catch (e) { bad("echo dedupe", String(e.message)); }

  // ── P4.10 mark_channel_read: viewing wrote a read row for dev ─────────────
  try {
    const reads = await dev.evaluate(async (cid) => { const { data } = await window.__sb.from("channel_reads").select("channel_id").eq("channel_id", cid); return (data || []).length; }, BEATS);
    reads >= 1 ? ok("mark_channel_read: a read row exists for dev in #beats") : bad("mark_channel_read", "no read row");
  } catch (e) { bad("mark_channel_read", String(e.message)); }

  // ── no app console/page errors in either session ──────────────────────────
  const allErrs = [...(dev._errs || []), ...(rae._errs || [])].filter((e) => !/supabase|getSession|fetch|net::ERR|Failed to load/i.test(e));
  allErrs.length ? bad("no page errors", allErrs.join(" | ")) : ok("no page errors in either session");
} catch (e) {
  bad("harness", e.message);
}

await browser.close();
server.close();
const fails = results.filter((r) => !r[0]).length;
console.log(fails ? `\n✗ ${fails} FAIL` : "\n✓ P4.10/P4.11 live spine verified across two sessions");
process.exit(fails ? 1 : 0);
