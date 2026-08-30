Solo project, one user. There's no staging — changes go straight to `main` and
straight to prod (Vercel deploys `main` directly). No issue tracker: work is
tracked in `docs/CANON.md`, and in conversation, not GitHub Issues.

## What this is right now

eski is mid-**rebuild** into a collaboration app — "Discord for creatives":
**servers** (studios you're invited into), user-created channels, persistent
chat, a shared media library (File explorer), public posts, friends/DMs, and
three visibility layers (public / server / private). Think **Discord + Google
Drive**. (Public-post **commenting** was cut from the beta on 2026-08-30 — the
posts stay, the comment thread is deferred to post-beta; see CANON TODO D1.) The old single-page "pivot" product is **retired and its code removed
from the repo.** **Nothing is live yet — this is the planning-and-design
phase**, producing the contract a code-generation model will build against.
(The review canvas, kanban boards, and numbered versions were cut from the beta
on 2026-08-18 to keep the mental model simple; they may return post-beta.)

## Read this before doing anything

Two things, in this order:

1. **[`docs/CANON.md`](docs/CANON.md) — the single source of truth.** The
   contract *and* the plan: §A the canonical vocabulary (one name per concept,
   aliases we kill), §B roles & permissions mapped to the RLS/RPC that enforces
   them, §C the per-screen UI element registry (behaviour → database →
   desktop/mobile), §D the added scope (granular roles, dynamic-slider storage,
   the placement model, utility screens), §E the backend & data model (schema,
   RPCs, Realtime, migration order), §F the two end-to-end workflows, §G open
   owner decisions. **When anything disagrees with CANON, CANON wins.**
2. **The design sources in [`docs/design/`](docs/design/):**
   - **`gallery.html` — LAW.** Every screen embedded live (~21 surfaces) **plus**
     every dialog, menu and modal as a standalone panel, and the member-colour
     palette. The measured target for what each screen looks like *and* the
     critique surface. Do not deviate from it without a reason.
   - **The [`eski-style`](.claude/skills/eski-style/SKILL.md) skill — the token &
     component source of truth** (the are.na-monochrome design language; replaces
     the retired `styleguide.html`). Load it before any styling work. `_fonts.css`
     is the extracted Jost faces.

## Design rules (durable — enforce them, don't relitigate them)

The failure mode this project has is **not** broken features — it's a correct
decision being silently undone, or a new element quietly breaking an
established pattern. So:

- **Search for the thing before you define it.** If a token, selector,
  component, or name already exists, edit it where it lives — never add a second
  one nearby. (A selector defined twice, source-order deciding the winner, is a
  real bug this repo has shipped.)
- **One canonical name per concept** — the name in the UI copy, the code, and
  the docs is identical (CANON §A). Adding a synonym is the same failure mode as
  a duplicate selector, in words.
- **Every colour comes from the tokens.** No hex literals in a component. The
  member-identity hue is the **only** colour, it is **server-scoped**, and it
  renders nowhere on a public profile or the Feed.
- **Radius is `--r` (3px) on chrome; media stays square.** Round is reserved for
  **avatars and presence dots only** — do not introduce new circular elements
  (no pill tabs, no round badges, no round close buttons).
- **Square icon buttons and square close buttons** (`.iconbtn`, `#i-x`) — the
  established pattern. Continue it; don't invent a second close style.
- **Modals darken the background (a scrim) — no drop shadows.** Dialogs sit on a
  dark backdrop, not a floating shadow.
- **Be exacting about alignment, balance, borders, type hierarchy (size *and*
  colour), and aspect ratio.** No super-tall buttons, no super-wide bars,
  nothing wonky. Surfaces separate by **background step**, not borders; the one
  exception is an interactive **field**, which gets a `--line2` border for
  affordance.
- **Mobile is its own layout**, not a squeezed desktop — the three-pane shell
  collapses to one pane + bottom tabs (CANON §C.2).

## Backend

Supabase (Postgres + Auth + Realtime) · R2 for media behind `api/sign.mjs` ·
Vercel. **The RLS policy is the fence; the UI is only the signpost.** Every
table ships with RLS. Backend is a **true clean slate** — design the schema
fresh for this product, don't inherit the retired one.

**Before you verify anything (RLS, a write path, "does feature X work"), read
[`docs/VERIFICATION.md`](docs/VERIFICATION.md) and use its method — literally
always.** It exists because tests here have lied: an RLS `INSERT` whose check is
inline `col = auth.uid()` (works, placement, content_tags, saved/starred_items,
share_links, comments) returns `42501` on some MCP runs and succeeds on others,
on identical input — a pooled-connection plan-cache artifact, **not** a bug.
Never call one of those a bug from a single failed simulation; verify it the way
the doc says (static analysis + service-role shape check + the live path).
`SECURITY DEFINER`-gated policies and RPCs test reliably. A demo screenshot
proves layout, not function.

## Writing style

Comments explain **why**, especially why an obvious alternative is wrong — that
is what stops the next pass from "simplifying" a deliberate choice back into a
bug. Sentence case in prose; the UI's own case rules live in the `eski-style` skill.
