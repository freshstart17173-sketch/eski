# Deterministic gallery — the plan

**Status: BUILT (2026-08-22).** The system below is implemented in `gallery.html`
+ `verify.mjs` + `STATES.md` + `assets/`. This doc is kept as the rationale; the
running checklist is [`STATES.md`](STATES.md) and the gate is
[`verify.mjs`](verify.mjs). What remains is the **Phase-D** state-coverage
backlog (the last table in `STATES.md`).

This was the design for making `gallery.html` a *deterministic* source of truth —
one where every state the codegen model builds against is actually rendered,
reviewable at a stable URL, and machine-verified to be wired correctly. Web-only
(desktop with sensible scaling); the mobile gallery track is dropped, replaced by
an explicit min/max-width scaling contract (see §6).

Read [`gallery-todo.md`](gallery-todo.md) for the feature backlog and
[`CODEGEN.md`](../CODEGEN.md) for the build hand-off this plan feeds.

---

## 1. The problem, precisely

The gallery today keeps **three parallel representations of "what exists" that
can silently drift**, and it renders several whole classes of state in **exactly
zero reviewable places**. Both are the repo's stated #1 failure mode — a correct
decision silently undone — but at the level of the tool that's supposed to
*prevent* it.

Concretely, five gaps:

### Gap 1 — Screens render one state each; the build contract needs all of them
Each `.screen[data-screen]` composes a **single** state. The alternates exist
only as:
- **time-based** — the folder skeleton is a `setTimeout(…, 650)` that reveals the
  grid and is gone; you cannot screenshot it deterministically;
- **interaction-gated** — a dialog is absent from the DOM until you click its
  trigger; empty-trash appears only after "Empty now"; the offline banner only
  when `navigator.onLine` is false;
- **mutually exclusive** — populated Feed vs empty Feed occupy the same slot; the
  gallery shows one, the other lives in prose or a different `.exview`.

[`CODEGEN.md`](../CODEGEN.md) §0 makes every `[UI]` prompt enumerate
`default/hover/active/empty/loading/error/disabled`, and gates acceptance on *"a
Playwright screenshot diff vs the gallery panel."* For most non-default states
**there is no pixel to diff against**, so that gate silently can't fire and the
codegen model invents the state.

### Gap 2 — Dialogs are invisible until triggered, and the catalog copies already drifted
There are **21 `.umodal` + 11 `.menu` real nodes**, opened by a ~700-line
hand-wired JS block. To *see* one you must be in app mode, on the right screen,
and perform the exact trigger. The §⑥ "exploded" catalog (35 `.stage` panels) was
meant to fix this — but it is a **hand-authored second copy** of each dialog, and
the copies **have already diverged**: the Create-channel catalog panel shows a
plain "Default save folder" field, while the real `#channelModal` has a Category
selector plus an "Advanced" disclosure (private toggle / default folder / allowed
types). That is precisely the "selector defined twice, source-order wins"
bug CLAUDE.md forbids — applied to whole dialogs — and it's also **incomplete**
(~10 of ~30 wired dialogs backfilled). This is the "I still don't know about the
dialogues" worry, and it's justified: the catalog can't be trusted to match what
ships.

### Gap 3 — The inventory (§⑤) is a hand-typed claim, not a derived fact
§⑤ is a **102-row JS array** with `MOCKUP / AUTHORED / TO BUILD` statuses. Nothing
checks that a `MOCKUP` row has a live node, that an `AUTHORED` row has a standalone
panel, or that a `TO BUILD` row isn't secretly already built. [`CODEGEN.md`](../CODEGEN.md)
§5.4 makes this array **load-bearing for the build burn-down** ("every prompt ends
by updating the gallery inventory status") — yet it is unverifiable and can lie.

### Gap 4 — "Works correctly with everything else" is verified only by hand
The whole app-mode script is one IIFE. A single thrown error aborts the rest of
init — they've **already hit this** (the guard comment at the `.pin` loop exists
because one bad node silently killed later handlers). There is no automated check
that every trigger opens its dialog, every dialog closes, every `data-s` maps to a
real screen, no console errors fire, and no menu is orphaned. Every pass is
"verified by screenshot in both themes, wire-tested" — **by hand, each time.**

### Gap 5 — Flows ("screen orders") aren't represented
`auth → claim-handle → workspace` and `create → new-server first-run → workspace`
exist only as JS transitions. No artifact lays a flow out as an ordered set of
reviewable frames, so the *order* and the *between* states can't be reviewed or
diffed.

---

## 2. The goal

Make the gallery satisfy three properties, mechanically:

1. **Complete** — every state the build must produce is rendered *somewhere the
   eye can reach it*, not described in prose.
2. **Addressable & deterministic** — every state has a stable URL that forces
   exactly that frame, in either theme and at a chosen width, with no timeout and
   no click-path. (This is what "fast and complete visual control" means: you type
   a URL, you see the thing; you edit the markup, the URL still shows it.)
3. **Self-verifying** — a machine check proves the wiring is intact and the
   inventory is true, on every change — replacing the by-hand "wire-tested" pass.

One rule underpins all of it, and it's the repo's own: **one definition per thing,
rendered in many contexts by the same node — never a second copy.**

---

## 3. The system — four mechanisms + one doc

### ① The state-driver: every state is a URL
Extend the existing hash router (which already does `?app=1#explorer` and
`&theme=dark|light`). Add:

- **a state segment** — `#explorer/empty`, `#explorer/loading`, `#feed/empty`,
  `#workspace/timedout`, `#workspace/offline`;
- **a dialog form** — `#dialog/channelModal`, `#menu/cardMenu`;
- **a width knob** — `&w=1024` / `&w=1440` (see §6).

Driven by a **STATES registry** (plain data, not scattered code): `screen → [state
names]`, and each state name → the single DOM mutation that forces it (add a class,
unhide a node, shim `navigator.onLine`, stop the skeleton auto-revealing and hold
it). The mutation is **synchronous and sticky** — a state URL renders the exact
frame and keeps it. This is the keystone; ②–④ build on it.

*Payoff:* you review any unshown state by opening a URL; CODEGEN gets one stable,
screenshottable URL per `STATES:` entry — the exact artifact its acceptance gate
was missing.

### ② Single-definition dialogs, auto-cataloged
Delete the 35 hand-copied §⑥ panels. Tag each **real** dialog node
`data-dialog="channelModal"` (menus `data-menu="cardMenu"`). The §⑥ catalog is then
**generated**: on load, find every `[data-dialog]`/`[data-menu]`, clone it into a
labelled stage in its forced-open state. The standalone panel is now guaranteed
identical to what the app opens — **drift becomes structurally impossible**, the
backfill completes itself, and it stays complete as dialogs are added.

### ③ The inventory is derived from the DOM
Replace the 102-row hand array with a **scan**. Each screen/dialog/state node
carries its own metadata as data-attributes (`data-trigger="smNewChannel addChannel"`,
`data-db="channels · #53/#54"`). The §⑤ table is rendered from the scan, and
**status is computed, not typed**: `wired` iff the self-test actually opened it;
`cataloged` iff a standalone panel was generated for it; `to-build` otherwise. The
inventory can no longer disagree with reality.

### ④ The wiring self-test (the determinism harness)
A headless script (Node + Playwright; Chromium is already wired in this env) loads
the gallery and asserts:
- every `data-s="X"` resolves to a `.screen[data-screen="X"]`;
- every state URL in the registry renders with **zero console errors**, both themes;
- every `[data-dialog]`/`[data-menu]` has ≥1 trigger, the trigger opens **exactly**
  that node, and both Esc and scrim-click close it;
- no orphan modal/menu (a node no trigger opens);
- every derived-inventory row maps to a live node.

Output: a pass/fail report + the burn-down counts. This is the "works correctly
with everything else" guarantee, run on every change instead of once by hand.

### ⑤ The state matrix — `docs/design/STATES.md`
Per screen, the full column of states that must exist
(`default/hover/active/empty/loading/error/disabled` + the screen-specific ones),
each row linking its **state-URL** and its **CODEGEN prompt id**. This is the
checklist the build reads and the single page where you review the whole surface at
once. It's generated from / checked against the registry, so it can't drift from
the gallery either.

---

## 4. How the pieces reinforce each other

```
STATES registry ──drives──▶ ① state-driver ──renders──▶ every state at a URL
      │                                                        │
      ├──generates──▶ ② §⑥ catalog (clones, never copies)      │
      ├──generates──▶ ③ §⑤ inventory (derived, not typed)       │
      ├──generates──▶ ⑤ STATES.md (the review checklist)        │
      └──────────────▶ ④ self-test ──asserts──▶ wiring + status ◀┘
```

The registry is the **one** new source of truth. Everything visible (catalog,
inventory, matrix) is generated from it, and the self-test proves the generated
views match the live DOM. Add a dialog once, tag it, add its registry row — and it
appears in the app, the catalog, the inventory, and the matrix, verified, with no
second copy to keep in sync.

---

## 5. Phasing (each phase lands independently; A is pure-additive, zero risk)

- **Phase A — keystone (additive, non-destructive).** Build the STATES registry +
  ① state-driver + a skeleton ④ self-test. Existing content is untouched; the new
  URLs simply light up states that already exist. Nothing can regress because
  nothing old changes.
- **Phase B — single-definition dialogs.** Tag the 21 modals + 11 menus with
  `data-dialog`/`data-menu`; generate §⑥ ②; **delete the 35 hand copies.** Net
  line reduction; drift eliminated.
- **Phase C — derived inventory.** Move the §⑤ metadata onto the nodes; render ③
  from the scan; wire status to the self-test result.
- **Phase D — close state coverage.** For every screen, ensure each matrix state
  has a registry entry *and* a real node (build the few that only exist in prose
  today); write `STATES.md` ⑤. This is where "fully populated UI, alternate states,
  unshown dialogs" all become concretely present.
- **Phase E — point the build at it.** Edit [`CODEGEN.md`](../CODEGEN.md) so each
  `[UI]` `DONE WHEN` names its **state-URL** as the diff target, and §5.4's
  "update inventory status" becomes automatic (③ computes it). The contract now
  references deterministic frames, not "the gallery panel" in the abstract.

Order rationale: A gives immediate value and can't break anything; B removes the
biggest active liability (drifting copies); C makes the burn-down honest; D is the
bulk content work, now with tooling to verify it; E connects it to the build.

---

## 6. Web-only scaling contract (replaces the mobile track)

No mobile gallery. Instead, make desktop scaling explicit and *verified at both
ends*:

- **Canvas:** 1440px cap, centred with the hairline gutter, modals sized to the
  canvas (already in CANON §C.2 / CODEGEN P4.1 — this just holds the file to it).
- **Fluid range:** down to a **~1024px** minimum; the three-pane shell stays
  three-pane, panes flex, nothing collapses to tabs.
- **Verification:** the state-driver's `&w=` knob renders any state at the min and
  max width, and ④ screenshots both — so "scaling that makes sense" is a checked
  assertion, not a hope. Below 1024 is explicitly out of scope for the beta.

CANON §C.2's mobile spec and the `gallery-mobile.html` item in `gallery-todo.md`
are marked **deferred (post-beta)** when this lands, so the contract doesn't
promise a layout the gallery no longer demonstrates.

---

## 7. What this explicitly does *not* do

- No visual redesign — this is meta-structure; every pixel of every screen stays as
  authored. (A separate deep alignment pass is still open in `gallery-todo.md`.)
- No new framework — the gallery stays one vanilla HTML file; the registry and
  driver are ~a few hundred lines of the same plain JS already there.
- No change to CANON's contract *content* — only CODEGEN's acceptance targets
  (Phase E) point at the new URLs.

---

## 8. Decisions taken (were open calls)

1. **URL grammar** — **hash**: `#screen/state`, `#dialog/id`, `&theme=`, `&w=`.
   Keeps the existing iframe-embed scheme working.
2. **Self-test runner** — **standalone** `docs/design/verify.mjs` (Node +
   Playwright), self-contained; can be promoted into a repo-level test setup later.
3. **Registry location** — **inline** in `gallery.html` (`STATES={…}`); the gallery
   stays one file, no build step.
4. **DOM diff weight** — **one signal, not the verdict** (owner's call). Hard fails
   are JS errors / dead nav / unreachable states / dialogs that won't open-close;
   the DOM diff and orphan checks are surfaced for a human/vision pass to rule on.
5. **Mobile** — **out of the beta**; web-only scaling contract (§6).
