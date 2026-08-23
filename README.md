# eski

**Discord for creatives.** Servers you're invited into (studios), user-created
channels, persistent chat, a shared media library, post comments, friends and DMs,
and three visibility layers — public / server / private. Think **Discord + Google
Drive**.

**This is a rebuild, and it's in the planning-and-design phase — nothing is live
yet.** eski used to be a single-page "pivot" product; that product is **retired
and its code has been removed from the repo.** What's being built now is the
collaboration app above, on
a backend that is a **true clean slate** — the schema is designed fresh for this
product, not inherited from the pivot.

Solo project, one user, no staging: `main` is production, and Vercel deploys it
directly. The design gallery is viewable at
**eski.lol/docs/design/gallery.html**.

---

## Read this before doing anything

The work right now is a *contract* a code-generation model will build against.
Three sources, in order:

| File | What it is |
|---|---|
| [`docs/CANON.md`](docs/CANON.md) | **The single source of truth — the contract *and* the plan.** §A canonical vocabulary, §B roles & permissions mapped to the RLS/RPC that enforces them, §C the per-screen UI element registry (behaviour → database → desktop/mobile), §D added scope (granular roles, dynamic-slider storage, the placement model, utility screens), §E the backend & data model (tables + RLS, RPCs, Realtime, migration order), §F the two end-to-end workflows, §G open owner decisions. **When anything disagrees with CANON, CANON wins.** |
| [`docs/design/`](docs/design/) | The design sources. **`gallery.html` is law** — every screen embedded live, plus every dialog, menu and modal as a standalone panel, plus the member-colour palette; it's the critique surface. the `eski-style` skill is the token & component source of truth. `_fonts.css` is the extracted Jost faces. |
| [`docs/CODEGEN.md`](docs/CODEGEN.md) | **The Claude Code build playbook** — how one agent (Opus 4.8, or Sonnet 5 where mechanical) builds eski across nine phases (scaffold → schema/RLS → RPCs → primitives → shell → content → DMs/notifs → admin → utility): the Supabase-MCP backend workflow, RLS-first verification, gallery-as-acceptance UI ports, and — crucially — **resumable sessions** that checkpoint to git + `BUILDLOG.md` so the build survives context/usage limits and can hand off between agents/chats. The per-surface checklist lives in [`docs/prompts/`](docs/prompts/). |

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

Full text of these lives in [`CLAUDE.md`](CLAUDE.md); the token & component values
they reference live in the [`eski-style`](.claude/skills/eski-style/SKILL.md) skill.

---

## Planned stack

- **Supabase** (Postgres + Auth + Realtime) — **RLS is the fence; the UI is only
  the signpost.** Every table ships with RLS. Presence, live message changes,
  typing and the notification bell all ride Realtime (CANON §E.4).
- **Cloudflare R2** — media behind [`api/sign.mjs`](api/sign.mjs) (the one existing
  Vercel function, content-agnostic presigned uploads); the browser uploads
  straight to R2. Storage is a **dynamic per-GB slider** (10 GB free; price/GB drops
  as you buy more) — no feature tiers and no pooling: a user funds their own slider,
  a server funds its own, two independent single-payer accounts (CANON §D.2).
- **Vercel** — the app plus serverless functions; deploys `main` directly, no
  staging.
- **Frontend: vanilla HTML + CSS + JS plus a thin reactive layer** (locked, CANON
  §G) — no meta-framework, no bundler, no build step. A small signals primitive
  (reference: `@preact/signals-core`, ~2 KB) drives the live surfaces so Realtime
  updates patch the DOM through reactive bindings, not hand-rolled diffing; a real
  component model (`preact`+`htm`, no build) is used only where it earns its keep
  (the shared explorer/feed component, §C.6). Total runtime deps stay a few KB.

---

## What's in the repo

- **`docs/`** — the live work: `CANON.md`, `CODEGEN.md`, `prompts/`, and
  `design/` (the gallery, sandbox, fonts, and the gallery TODO).
- **The one existing serverless function** — [`api/sign.mjs`](api/sign.mjs), the R2
  presigning signer, carried into the collab build unchanged. Its upload-quota
  migration is `schema-quota.sql`; the vendored Supabase client it boots is
  `vendor/supabase.js`. (CANON §D.2's storage schema will replace the quota backing
  when the build lands.)
- **Config** — `vercel.json`, `.env.example` (Supabase + R2 + mail), `r2-cors.json`,
  `package.json`/`package-lock.json` (just `aws4fetch`, which the signer needs).
- **`index.html`** — a small static index at the site root linking to the docs and
  the design gallery (the app itself isn't built yet).

There is no issue tracker. Work is tracked in `docs/CANON.md`
and in conversation.

---

## Running it

There is no dev server yet — the current deliverable is documents and the design
gallery. Serve the repo with any static server and open the root `index.html` for
a link index, or go straight to `docs/design/gallery.html` (a `file://` open breaks
the embedded screens):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/  (or /docs/design/gallery.html)
```

`?app=1#<screen>` on that URL switches the gallery from catalog mode into a
single live screen.
