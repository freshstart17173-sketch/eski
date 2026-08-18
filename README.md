# eski

**Discord for creatives.** Servers you're invited into (studios), user-created
channels, persistent chat, kanban boards, a review **canvas** for annotating and
commenting on media, numbered versions, friends and DMs, and three visibility
layers — public / server / private.

**This is a rebuild, and it's in the planning-and-design phase — nothing is live
yet.** eski used to be a single-page "pivot" product (a portfolio feed with
versioning and collections). That product is **retired**; its pages still sit in
the repo root and are being removed. What's being built now is the collaboration
app above, and the backend is a **true clean slate** — the schema is designed
fresh for this product, not inherited from the pivot.

Solo project, one user, no staging: `main` is production, and Vercel deploys it
directly. The design gallery is viewable at
**eski.lol/docs/design/gallery.html**.

---

## Read this before doing anything

The work right now is a *contract* a code-generation model will build against.
Four documents, in order:

| File | What it is |
|---|---|
| [`docs/CANON.md`](docs/CANON.md) | **The build contract — the single source of truth.** §A canonical vocabulary, §B roles & permissions mapped to the RLS/RPC that enforces them, §C the per-screen UI element registry (behaviour → database → desktop/mobile), §D added scope (granular roles, PAYG storage, storage source, utility screens), §E canvas mechanics. **When anything disagrees with CANON, CANON wins.** |
| [`docs/COLLAB.md`](docs/COLLAB.md) | The narrative spec: the why behind every feature, the data-model sketch, the two end-to-end workflows, and §7 the hand-off-ready backend plan (tables, RPCs, triggers, Realtime, migration order). *Predates the terminology streamline — where its names differ from CANON, use CANON's.* |
| [`docs/design/`](docs/design/) | The design sources. **`gallery.html` is law** — every one of the ~21 screens embedded live, plus every dialog, menu and modal as a standalone panel, plus the member-colour palette; it's the critique surface. `styleguide.html` is the token & component source of truth. `_fonts.css` is the extracted Jost faces. |
| [`docs/CODEGEN.md`](docs/CODEGEN.md) | The build plan: the whole app sliced into ~133 individually-testable micro-prompts across 10 phases (scaffold → schema/RLS → RPCs → primitives → shell → content → canvas → boards/DMs/notifs → admin → utility), each tagged `[BE]`/`[UI]`/`[GL]` with its own definition-of-done, plus the DeepSeek V4 Flash token budget. |

---

## The design rules that must not be relitigated

This project's failure mode is a correct decision being silently undone, or a new
element quietly breaking an established pattern. So:

- **Search for the thing before you define it.** If a token, selector, component,
  or name already exists, edit it where it lives — never add a second one nearby.
- **One canonical name per concept** — the name in UI copy, code, and docs is
  identical (CANON §A). A synonym is the same failure mode as a duplicate
  selector, in words.
- **Every colour comes from the tokens.** No hex literals in a component. The
  member-identity hue is the **only** colour, it is **server-scoped**, and it
  renders nowhere on a public profile or the Feed.
- **Radius is `--r` (3px) on chrome; media stays square.** Round is reserved for
  **avatars and presence dots only** — no new circular elements.
- **Square icon buttons and square close buttons** (`.iconbtn`, `#i-x`). Modals
  **darken the background (a scrim) — no drop shadows.**
- **Mobile is its own layout**, not a squeezed desktop — the three-pane shell
  collapses to one pane + bottom tabs (CANON §C.2).

Full text of these lives in [`CLAUDE.md`](CLAUDE.md) and
[`docs/design/STYLE.md`](docs/design/STYLE.md).

---

## Planned stack

Unchanged from the pivot at the service level; the schema is new.

- **Supabase** (Postgres + Auth + Realtime) — **RLS is the fence; the UI is only
  the signpost.** Every table ships with RLS. Presence, live message changes,
  typing, the notification bell and live canvas all ride Realtime (COLLAB §7.4).
- **Cloudflare R2** — media behind `api/sign.mjs` (the one existing Vercel
  function, content-agnostic presigned uploads); the browser uploads straight to
  R2. Storage is a **dynamic per-GB slider** (10 GB free; price/GB drops as you buy
  more) whose GB you **allocate** to your personal space and to servers — no feature
  tiers, no pooling (CANON §D.2).
- **Vercel** — the app plus serverless functions; deploys `main` directly.
- **No build step, no framework** in the pivot; the collab build's framework is a
  P0 decision in `CODEGEN.md`.

---

## What's in the repo right now

- **`docs/`** — the live work: `CANON.md`, `COLLAB.md`, `CODEGEN.md`, and
  `design/` (the gallery, styleguide, fonts, `STYLE.md`).
- **Retired pivot, still in the tree, being removed:** `index.html`,
  `profile.html`, `admin.html`, `onboarding.html`, `legal.html`, `artboard.html`,
  and the pivot runtime (`pivot.js`, `pivot.css`, `platform.js`, `palette.js`,
  `palettes.css`, `tokens.css`, `schema-quota.sql`). These backed the old
  single-page product; **don't build new work on them** — they exist only until
  the cleanup pass finishes.
- `ARCHITECTURE.md` and `ERRORS.txt` also describe the retired pivot; treat them
  as historical until rewritten for the collab direction.

There is no issue tracker. Work is tracked in `docs/CANON.md`, `docs/COLLAB.md`,
and in conversation.

---

## Running it

There is no dev server yet — the current deliverable is documents and the design
gallery. To view the gallery locally, serve the repo with any static server and
open `docs/design/gallery.html` (a `file://` open breaks the embedded screens):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/docs/design/gallery.html
```

`?app=1#<screen>` on that URL switches the gallery from catalog mode into a
single live screen.
