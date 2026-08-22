#!/usr/bin/env node
/* verify.mjs — the gallery determinism harness.
 *
 * Loads gallery.html in headless Chromium and proves the wiring is intact and
 * every declared state is reachable and renders clean. This is the machine that
 * replaces the by-hand "wire-tested, both themes" pass — and it is the SAME
 * runner the codegen acceptance gate reuses (a built screen is diffed against
 * the state-URL it was built from).
 *
 * Two tiers of result, deliberately separated:
 *   HARD FAILS (exit 1) — a JS error, dead nav, an unreachable/undeclared
 *     state, or a dialog that won't open or close. These are correctness.
 *   SIGNALS (never fail the run on their own) — the DOM-diff vs the baseline
 *     and orphan-dialog detection. Per the owner: the DOM diff is ONE input to
 *     judging a build, not the end-all gate. It flags drift for a human/vision
 *     pass to rule on; it does not by itself say pass or fail.
 *
 * Usage:
 *   node verify.mjs                 run all checks, print report
 *   node verify.mjs --update        (re)write the DOM baseline from current state
 *   node verify.mjs --shots         also write a PNG per state to ./shots/
 *   node verify.mjs --theme dark    run the state sweep in dark (default light)
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const GALLERY = 'file://' + join(HERE, 'gallery.html');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASELINE = join(HERE, 'verify.baseline.json');
const SHOTS = join(HERE, 'shots');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const SHOOT = args.includes('--shots');
const THEME = (args[args.indexOf('--theme') + 1]) || 'light';

// A console error is a HARD fail unless it's an expected local-asset 404 (the
// asset system is opt-in via assets/manifest.js; an empty manifest makes no
// requests, but a half-filled one legitimately may). Everything else counts.
const benign = (t) => /ERR_FILE_NOT_FOUND/.test(t) && /assets\//.test(t);

const hard = [];      // {url, kind, detail}
const signals = [];   // {url, kind, detail}
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const fresh = {};

function fp(sig) { // structural fingerprint → stable string for diffing
  return Object.entries(sig).sort().map(([k, v]) => k + ':' + v).join('|');
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errs.push('console: ' + m.text()); });
page.on('console', (m) => { if (m.type() === 'warning' && /no such (state|dialog)/.test(m.text())) errs.push('warn: ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

async function visit(url) { errs = []; await page.goto(GALLERY + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(180); return errs.slice(); }

// ── enumerate the surface from the live DOM (no hand list to drift) ──────────
await visit('?app=1&theme=' + THEME + '#workspace');
const meta = await page.evaluate(() => ({
  screens: [...document.querySelectorAll('.screen[data-screen]')].map((s) => s.dataset.screen),
  navTargets: [...document.querySelectorAll('[data-s]')].map((n) => n.dataset.s),
  dialogs: [...document.querySelectorAll('.umodal[id], .menu[id]')].map((n) => n.id),
  states: Object.fromEntries(Object.entries(window.__gallery.STATES).map(([k, v]) => [k, Object.keys(v)])),
}));

// H1 — no dead nav: every data-s target resolves to a screen.
[...new Set(meta.navTargets)].forEach((t) => {
  if (!meta.screens.includes(t)) hard.push({ url: '(nav)', kind: 'dead-nav', detail: 'data-s="' + t + '" has no screen' });
});

// Build the URL sweep: every screen default + every declared state + every dialog.
const urls = [];
meta.screens.forEach((s) => urls.push({ url: '?app=1&theme=' + THEME + '#' + s, key: s }));
Object.entries(meta.states).forEach(([s, list]) => list.forEach((st) =>
  urls.push({ url: '?app=1&theme=' + THEME + '#' + s + '/' + st, key: s + '/' + st })));
meta.dialogs.forEach((d) => urls.push({ url: '?app=1&theme=' + THEME + '#dialog/' + d, key: 'dialog/' + d, dialog: d }));

if (SHOOT && !existsSync(SHOTS)) mkdirSync(SHOTS);

// H2/H3 + signal capture across the whole sweep.
for (const u of urls) {
  const e = await visit(u.url);
  e.forEach((msg) => hard.push({ url: u.key, kind: 'runtime', detail: msg }));

  if (u.dialog) {
    // H3 — the dialog actually opened, and closeAllOverlays hides it again.
    const open = await page.evaluate((id) => { const n = document.getElementById(id);
      return !!n && (n.classList.contains('menu') ? n.classList.contains('open') : n.hidden === false); }, u.dialog);
    if (!open) hard.push({ url: u.key, kind: 'dialog-open', detail: u.dialog + ' did not open' });
    const closed = await page.evaluate((id) => { window.__gallery.closeAllOverlays();
      const n = document.getElementById(id); return n.classList.contains('menu') ? !n.classList.contains('open') : n.hidden === true; }, u.dialog);
    if (!closed) hard.push({ url: u.key, kind: 'dialog-close', detail: u.dialog + ' did not close' });
  }

  // Signal: structural fingerprint of the active surface (screen or dialog).
  const sig = await page.evaluate((dlg) => {
    const root = dlg ? document.getElementById(dlg)
      : [...document.querySelectorAll('.screen')].find((s) => !s.hidden) || document.body;
    const count = {};
    if (root) root.querySelectorAll('*').forEach((el) => {
      const k = el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '');
      count[k] = (count[k] || 0) + 1;
    });
    return count;
  }, u.dialog || null);
  fresh[u.key] = fp(sig);

  if (SHOOT) await page.screenshot({ path: join(SHOTS, u.key.replace(/[\/]/g, '__') + '.png') });
}

// Signal: DOM-diff vs baseline (drift, not a verdict).
if (!UPDATE) {
  Object.keys(fresh).forEach((k) => {
    if (baseline[k] === undefined) signals.push({ url: k, kind: 'new-state', detail: 'no baseline yet' });
    else if (baseline[k] !== fresh[k]) signals.push({ url: k, kind: 'dom-diff', detail: 'structure changed vs baseline' });
  });
}

// Signal: orphan dialogs — an id that appears only at its definition in the
// source (no opener/reference) is probably unreachable in the real UI.
const src = readFileSync(join(HERE, 'gallery.html'), 'utf8');
meta.dialogs.forEach((d) => {
  const n = (src.match(new RegExp('\\b' + d + '\\b', 'g')) || []).length;
  if (n <= 1) signals.push({ url: 'dialog/' + d, kind: 'orphan', detail: d + ' referenced ' + n + '× (no trigger?)' });
});

await browser.close();

if (UPDATE) { writeFileSync(BASELINE, JSON.stringify(fresh, null, 0)); console.log('baseline written:', Object.keys(fresh).length, 'states →', BASELINE); process.exit(0); }

// ── report ───────────────────────────────────────────────────────────────
const N = urls.length;
console.log(`\n  gallery verify — ${meta.screens.length} screens · ${Object.values(meta.states).flat().length} states · ${meta.dialogs.length} dialogs · ${N} URLs (theme=${THEME})\n`);
if (signals.length) {
  console.log(`  SIGNALS (${signals.length}) — review, not a verdict:`);
  signals.forEach((s) => console.log(`    ~ [${s.kind}] ${s.url} — ${s.detail}`));
  console.log('');
}
if (hard.length) {
  console.log(`  HARD FAILS (${hard.length}):`);
  hard.forEach((h) => console.log(`    ✗ [${h.kind}] ${h.url} — ${h.detail}`));
  console.log('');
  process.exit(1);
}
console.log('  ✓ all hard checks pass — every state reachable, every dialog opens & closes, zero JS errors.\n');
