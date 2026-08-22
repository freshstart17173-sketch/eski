# Project memory — handoff for a fresh agent

Last updated **2026-08-22** (determinism-system session). Read this first, then
`CLAUDE.md`, then `docs/CANON.md` (the build contract) and
`docs/design/gallery.html` (the design LAW). `index.html` links everything.

## What eski is right now

Planning/design phase of a rebuild into "Discord for creatives" — servers,
channels, persistent chat, a shared media library (File explorer), friends/DMs,
three visibility layers (Public / Server / Private). **Nothing is live.** The
output of this phase is the contract a code-gen model builds against. Solo owner
(Dexter, dexterekayu@gmail.com). **Beta is web-only** — mobile is deferred
post-beta (CANON §C.2).

## Branch reality (read this)

`CLAUDE.md` says the owner works on `main`. The task harness for the determinism
work put it on **`claude/gallery-control-hidden-elements-eus2di`** (the designated
branch for that session), and everything below was committed and pushed there —
**not merged to `main` yet.** A future session should either continue on that
branch or, once the owner approves, merge it to `main` (Vercel deploys `main`).
Don't assume `main` has this work.

## The determinism system (built 2026-08-22) — the gallery is now self-verifying

The gallery was made deterministic so every state the codegen model builds
against is rendered, addressable, and machine-checked. Four mechanisms — design
rationale in [`docs/design/gallery-determinism-plan.md`](docs/design/gallery-determinism-plan.md),
review checklist in [`docs/design/STATES.md`](docs/design/STATES.md):

1. **State-driver (URLs).** Every state is a URL, forced synchronously (no
   timers): `?app=1#<screen>`, `#<screen>/<state>`, `#dialog/<id>`, plus
   `&theme=dark|light` and `&w=1024|1440`. The `STATES` registry in `gallery.html`
   (search `STATES={`) maps each state to the *existing* switch — never a second
   copy. `window.__gallery` exposes it for the harness.
2. **Generated §⑥ catalog.** The exploded dialog catalog is **cloned from the real
   `.umodal[id]/.menu[id]` nodes** at load (search `generate the exploded`), not
   hand-copied — so it can't drift and completes itself when a dialog is added.
   (The 35 old hand-panels were deleted; they had already drifted.)
3. **Asset system.** Drop real media in `docs/design/assets/` + list it in
   `assets/manifest.js` and the resolver (foot of `gallery.html`, search `asset
   resolver`) swaps the gradient fakes for real images/video. Empty manifest =
   zero requests, gradients stay. Shopping list: `assets/README.md`.
4. **Self-test harness.** `node docs/design/verify.mjs` — enumerates the surface
   from the live DOM (21 screens · 29 states · 32 dialogs · 82 URLs) and splits
   results: **HARD FAILS** (JS error, dead nav, unreachable state, dialog won't
   open/close) exit 1; **SIGNALS** (DOM-diff vs `verify.baseline.json`, orphan
   dialogs) never fail alone — the DOM diff is *one* input, not the verdict.
   `--update` re-baselines, `--shots` writes PNGs, `--theme dark` sweeps dark.
   **Run this before committing any gallery change.**

## How to verify design changes (do this — don't edit blind)

Fastest: `node docs/design/verify.mjs` (all hard checks must pass). For a visual
look, screenshot a state URL with the pre-installed Chromium via Playwright:

```
node -e 'const {chromium}=require("/opt/node22/lib/node_modules/playwright");…'
executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
```

The owner has caught bugs shipped blind — **always screenshot (or at least run
verify.mjs) before committing a visual change.**

## Design rules that bite (from CLAUDE.md — enforce them)

- Icons: `<svg class="ic ..."><use href="#i-x"/></svg>`. `.ic` sets
  `stroke:currentColor;fill:none`. Always include `ic`.
- Round is **avatars + presence dots only**. `.av`/`.pfp` are 50%; **server icons
  stay square**. Radius `--r` (3px) on chrome; media square.
- No hex literals in components (use tokens). **Modals darken via scrim, no drop
  shadow** — the `.umodal` box-shadow violation is now **fixed**.
- Don't define a selector twice; edit where it lives. Don't hand-copy a dialog —
  the catalog clones the real node (see mechanism 2).

## What's open

- **Gallery todo** ([`docs/design/gallery-todo.md`](docs/design/gallery-todo.md)) —
  all #1–#61 done; **Phase-D state coverage done** (44 states, both themes). What's
  left: optional state nice-to-haves (foot of `STATES.md`) and the deep alignment &
  spacing pass.
- **Owner input** — CANON §G open decisions; brand assets B1–B8
  (`docs/design/brand-assets-todo.md`).
- **Cleanup still available (optional):** the v2 **voice-call** visuals
  (`.vtile/.vcshare/.vreel`) are dead now (voice is a WIP placeholder) but were
  *kept* as the v2 reference — sweep them only if you're sure v2 will rebuild from
  spec. `schema-quota.sql` may be retired-product backend (verify before touching;
  `api/sign.mjs` is a live deploy requirement — keep).

## What the last session did (all on the branch above, pushed)

Built the whole determinism system (1–4 above), the asset system, `STATES.md`,
the plan doc, and swept ~115 lines of retired review-canvas dead CSS/JS +
unused icons + fixed the `.umodal` box-shadow. Updated CANON §C.2 (web-only),
`gallery-todo.md`, `index.html`, `CODEGEN.md` (§Phase E now points prompts at
state-URLs), `placeholders.md`; removed the superseded `gaps.md`. Every step
verified with `verify.mjs` (all hard checks pass) before commit.
