// signals.js — the thin reactive layer (CANON §G locks "vanilla + a ~2KB signals
// primitive, no framework, no bundler"). This is a minimal hand-rolled subset of
// @preact/signals-core: signal / computed / effect / batch. It is deliberately
// small — enough to bind the DOM to state and re-run on change — not a full
// dependency graph optimiser. If this ever needs to grow, vendor the real
// package rather than bloating this file into a second framework.

let curr = null;          // the effect/computed currently tracking reads
let batching = 0;         // batch depth
const queue = new Set();  // effects to flush when the batch ends

function flush() {
  const run = [...queue];
  queue.clear();
  for (const e of run) e._run();
}

export function batch(fn) {
  batching++;
  try { return fn(); }
  finally { if (--batching === 0) flush(); }
}

export function signal(initial) {
  const subs = new Set();
  const s = {
    get value() {
      if (curr) { subs.add(curr); curr._deps.add(subs); }
      return s._v;
    },
    set value(next) {
      if (Object.is(next, s._v)) return;   // no-op on unchanged value
      s._v = next;
      for (const e of [...subs]) {
        if (batching) queue.add(e); else e._run();
      }
    },
    peek() { return s._v; },                // read without subscribing
    _v: initial,
  };
  return s;
}

// track() wires an effect/computed to whatever signals it reads, clearing stale
// dependencies each run so a conditional branch can't leak an old subscription.
function track(runner) {
  const node = {
    _deps: new Set(),
    _run() {
      // detach from previously-read signals before re-reading
      for (const subs of node._deps) subs.delete(node);
      node._deps.clear();
      const prev = curr;
      curr = node;
      try { return runner(); }
      finally { curr = prev; }
    },
    dispose() {
      for (const subs of node._deps) subs.delete(node);
      node._deps.clear();
    },
  };
  return node;
}

export function effect(fn) {
  const node = track(fn);
  node._run();
  return () => node.dispose();
}

export function computed(fn) {
  const out = signal(undefined);
  effect(() => { out.value = fn(); });
  // expose as a read-only signal-like object
  return { get value() { return out.value; }, peek: () => out.peek() };
}
