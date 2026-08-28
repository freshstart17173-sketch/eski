// perf.js — an opt-in performance HUD + timing capture. The sandbox that builds eski can't
// reach the live site, so performance has to be measured IN the running app and sent back.
// This module is disabled by default and costs nothing until turned on (Appearance settings,
// ?perf=1, or Ctrl/⌘+Shift+P). When on it shows a small overlay with the real timings and a
// "Copy report" button that puts a plain-text summary on the clipboard to paste to the builder.

const KEY = "eski:perf";
const marks = [];          // app-instrumented read timings: { label, ms, at }
let hud = null;

export function isPerfEnabled() {
  try { return localStorage.getItem(KEY) === "1" || new URLSearchParams(location.search).get("perf") === "1"; }
  catch { return false; }
}
export function setPerfEnabled(on) {
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {}
  if (on) renderHud(); else unmountHud();
}

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

// Wrap an async load with a timing. Records the duration and returns the awaited value, so it
// drops in around any read: `await time("workspace", loadWorkspace(...))`. Always records (so a
// later "Copy report" has data even if the HUD was off during the load).
export async function time(label, promise) {
  const t0 = now();
  try { return await promise; }
  finally {
    marks.push({ label, ms: Math.round(now() - t0), at: Date.now() });
    if (marks.length > 50) marks.shift();
    if (isPerfEnabled()) renderHud();
  }
}

// ── the report (what gets copied) ────────────────────────────────────────────
function navTiming() {
  try {
    const [n] = performance.getEntriesByType("navigation");
    if (!n) return null;
    return {
      dns: Math.round(n.domainLookupEnd - n.domainLookupStart),
      connect: Math.round(n.connectEnd - n.connectStart),
      ttfb: Math.round(n.responseStart - n.requestStart),
      domInteractive: Math.round(n.domInteractive),
      domComplete: Math.round(n.domComplete),
      load: Math.round(n.loadEventEnd || n.duration),
    };
  } catch { return null; }
}
// The slowest resource loads — images from the CDN are the usual "pops in after a few seconds".
function slowResources(limit = 8) {
  try {
    return performance.getEntriesByType("resource")
      .map((r) => ({ name: r.name.replace(/^https?:\/\//, ""), ms: Math.round(r.duration), kind: r.initiatorType }))
      .filter((r) => r.ms > 0)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, limit);
  } catch { return []; }
}

export function perfReport() {
  const nav = navTiming();
  const lines = [];
  lines.push("eski performance report — " + new Date().toISOString());
  lines.push("url: " + location.pathname + location.search);
  lines.push("ua: " + (navigator.userAgent || "?"));
  lines.push("");
  if (nav) {
    lines.push("navigation (ms):");
    lines.push(`  dns ${nav.dns} · connect ${nav.connect} · ttfb ${nav.ttfb} · domInteractive ${nav.domInteractive} · domComplete ${nav.domComplete} · load ${nav.load}`);
    lines.push("");
  }
  if (marks.length) {
    lines.push("app data reads (ms, most recent last):");
    for (const m of marks.slice(-16)) lines.push(`  ${m.label.padEnd(16)} ${m.ms}`);
    lines.push("");
  }
  const res = slowResources();
  if (res.length) {
    lines.push("slowest resources (ms):");
    for (const r of res) lines.push(`  ${String(r.ms).padStart(6)}  ${r.kind.padEnd(6)} ${r.name.slice(0, 80)}`);
  }
  return lines.join("\n");
}

export async function copyPerfReport() {
  const text = perfReport();
  try { await navigator.clipboard.writeText(text); alert("Performance report copied — paste it to Claude."); }
  catch { window.prompt("Copy this performance report and paste it to Claude:", text); }
}

// ── the on-screen HUD ─────────────────────────────────────────────────────────
function renderHud() {
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "eski-perf-hud";
    hud.setAttribute("style", [
      "position:fixed", "right:10px", "bottom:10px", "z-index:99999", "max-width:340px",
      "font:11px/1.45 ui-monospace,Menlo,monospace", "background:rgba(0,0,0,.82)", "color:#eee",
      "border:1px solid rgba(255,255,255,.18)", "border-radius:6px", "padding:8px 10px",
      "backdrop-filter:blur(3px)", "pointer-events:auto",
    ].join(";"));
    document.body.appendChild(hud);
  }
  const nav = navTiming();
  const recent = marks.slice(-6).map((m) => `${m.label} ${m.ms}ms`).join(" · ");
  const res = slowResources(3).map((r) => `${r.ms}ms ${r.name.split("/").pop().slice(0, 22)}`).join("<br>");
  hud.innerHTML =
    `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px">
       <b style="color:#7fd1a6">perf</b>
       <span><a href="#" data-a="copy" style="color:#8ab4ff;text-decoration:none">copy</a> · <a href="#" data-a="off" style="color:#f0a">off</a></span>
     </div>` +
    (nav ? `<div>load ${nav.load}ms · ttfb ${nav.ttfb}ms · domInteractive ${nav.domInteractive}ms</div>` : "") +
    (recent ? `<div style="margin-top:3px;color:#cfe">${recent}</div>` : "") +
    (res ? `<div style="margin-top:4px;color:#ffd8a8">slow:<br>${res}</div>` : "");
  hud.querySelector('[data-a="copy"]').onclick = (e) => { e.preventDefault(); copyPerfReport(); };
  hud.querySelector('[data-a="off"]').onclick = (e) => { e.preventDefault(); setPerfEnabled(false); };
}
function unmountHud() { if (hud) { hud.remove(); hud = null; } }

// Ctrl/⌘+Shift+P toggles the HUD anywhere, and ?perf=1 / a stored flag mounts it on load.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "P" || e.key === "p")) {
      e.preventDefault(); setPerfEnabled(!isPerfEnabled());
    }
  });
  window.addEventListener("DOMContentLoaded", () => { if (isPerfEnabled()) renderHud(); });
  // also mount now if the module loads after DOMContentLoaded
  if (isPerfEnabled() && document.readyState !== "loading") setTimeout(renderHud, 0);
}
