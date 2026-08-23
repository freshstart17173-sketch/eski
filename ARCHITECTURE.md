# How eski is put together

**Read this before changing anything.** It says where each decision lives, so a
change lands in one place instead of next to the thing that already does it.

**eski is mid-rebuild into a collaboration app and nothing is built yet** — this
is the planning-and-design phase (see [`README.md`](README.md) and
[`CLAUDE.md`](CLAUDE.md)). So this document is in two halves:

1. **The architecture of the work as it stands now** — a spec, a design system,
   and a build plan. This is what actually exists in the repo today.
2. **The architecture the build will have** — the shape the code-generation model
   is being pointed at. Decided, written down, not yet code.

The retired single-page "pivot" product has been **removed from the repo**; only
its one carried-forward serverless function survives (below).

---

## The rule that matters most (carries across every era of this project)

**One thing is decided in one place.**

The bug this codebase keeps producing is not a broken feature — it is a correct
decision that gets silently undone. A selector defined twice with source-order
deciding the winner; a fix applied twice while the page never changed; a second
name quietly minted for a concept that already had one. Everything below exists
to make that failure mode hard.

Concretely, for the rebuild:

- **Every colour comes from a token.** the [`eski-style`](.claude/skills/eski-style/SKILL.md) skill
  holds the values; a component references them and never carries a hex literal.
  The member-identity hue is the only colour, it is **server-scoped**, and it
  appears nowhere on a public profile or the Feed.
- **One canonical name per concept** — the name in UI copy, in code, and in the
  docs is identical. The register of names is [`docs/CANON.md`](docs/CANON.md) §A;
  adding a synonym is the same failure mode as a duplicate selector, in words.
- **Search for the thing before you define it.** If a token, selector, component,
  or name already exists, edit it where it lives.
- **The RLS policy is the fence; the UI is only the signpost.** A control the UI
  hides is not access control — the row-level policy is where a refusal actually
  happens. Every table ships with RLS.

---

## Part 1 — what exists now: the contract

The whole deliverable at this phase is a set of documents precise enough that a
code-generation model builds the app from them with a tiny failure surface. They
have a strict hierarchy — **when they disagree, the one higher in this list
wins.**

| Artifact | Owns | Authority |
|---|---|---|
| [`docs/CANON.md`](docs/CANON.md) | The single source of truth — contract *and* plan. §A vocabulary · §B roles/permissions → the RLS/RPC that enforces them · §C the per-screen UI element registry (behaviour → database → desktop/mobile) · §D added scope (granular roles, dynamic-slider storage, the placement model, utility screens) · §E the backend & data model (tables + RLS, RPCs, triggers, Realtime, indexes, migration order) · §F end-to-end workflows · §G open owner decisions. | **Top. CANON wins over everything, including this file.** |
| [`docs/design/gallery.html`](docs/design/gallery.html) | The pixels. ~21 screens embedded live, plus every dialog/menu/modal as a standalone panel, plus the member palette and a build-status inventory. The visual law. | Wins over prose on anything visual. |
| the [`eski-style`](.claude/skills/eski-style/SKILL.md) skill | The token & component source of truth — the values the built pages consume. `_fonts.css` holds the extracted Jost faces. | The only home for raw design values. |
| [`docs/CODEGEN.md`](docs/CODEGEN.md) | The **Claude Code build playbook**: one agent builds it across nine phases via the Supabase MCP (RLS-first) and gallery-as-acceptance UI ports, in **resumable sessions** that checkpoint to git + `BUILDLOG.md` (survive context/usage limits; hand off between agents). Per-surface checklist in [`docs/prompts/`](docs/prompts/). | How the above becomes code. |

The context-crossover audit that fed §D is resolved and folded into CANON (its
⚑DECIDE rows are now locked decisions there); the standalone audit doc has been
removed.

**Why the gallery is one file.** It was two (a mockup plus a gallery) and they
drifted — a screen got updated in one and not the other. They were merged so
there is a single visual source. The file self-iframes its own screens in catalog
mode and renders one screen in app mode (`?app=1#<screen>`); that mode-gating is
why the app screens and the catalog can coexist without two files or a JS
collision.

---

## Part 2 — the architecture the build will have

Decided at the level the prompts need. The front-end stack is now locked (CANON
§G): **vanilla HTML + CSS + JS plus a thin signals reactive layer** — no
meta-framework, no bundler, no build step. P0 implements that scaffold; it no
longer chooses it.

### The stack

- **Supabase** (Postgres + Auth + Realtime). Postgres is where ownership,
  visibility and consent are decided — via RLS and `security definer` RPCs, not
  application code. Realtime carries four channels (CANON §E.4): `server:{id}`
  presence, `channel:{id}` live messages, `channel:{id}:typing`, and `user:{id}`
  the notification bell.
- **Cloudflare R2** for media, behind `api/sign.mjs` — the one existing serverless
  function, content-agnostic presigned uploads; the browser uploads straight to
  R2, nothing streams through Vercel. Storage is a **dynamic per-GB slider** (10 GB
  free; price/GB drops as you buy more), two **independent single-payer** accounts
  (your own, and a server's own — no pooling), content-addressed with **dedup**;
  a trigger meters distinct owned blobs per account (CANON §D.2).
- **Vercel** hosts the app plus serverless functions and deploys `main` directly.
  No staging.
- **Front end: vanilla HTML + CSS + JS plus a thin reactive layer** (CANON §G) —
  no meta-framework, no bundler, no build step. A small signals primitive
  (reference `@preact/signals-core`, ~2 KB) drives the live surfaces so the four
  Realtime channels patch the DOM through reactive bindings, not hand-rolled
  diffing; a real component model (`preact`+`htm`, still no build) is reserved for
  the one shared explorer/feed component (§C.6). The live app fills the viewport;
  1440 is only the prototyping canvas (CANON §C.2).

### The backend is a true clean slate

The schema is designed fresh for this product — **the pivot's schema is not
inherited.** The plan of record is CANON §E (the tables, RPCs, triggers,
migration order), which carries the CANON §D architecture as its baseline:

- **Granular roles replace the flat role enum** (CANON §D.1): `roles` carry a
  permission bitmask, `member_roles` join members to roles (a member holds
  several; power is the OR of their roles), `channel_roles` is the v1
  private-channel allow-list. Two RLS helpers, `has_perm(server_id, flag)` and
  `can_view_channel(channel_id)`, join `member_of`/`is_server_admin`, and
  channel-scoped reads gate on `can_view_channel`. The layout is written to the
  future full-overwrite grain so v2 is additive, no reshape (LOCKED D-i).
- **The placement model** (CANON §D.3) replaces the earlier storage-source idea: a
  `work` has one **home** (owner + storage) and its own tags/collaborators;
  lightweight `placement` rows put it onto a surface (feed / server / dm), and
  discussion + audience attach to the placement. A crosspost is just a placement —
  the file's bytes stay on the owner's storage; members read it via the placement.
  This closes the old dead-end where a personal work shared into a server was
  owner-only.
- **Dynamic-slider storage** (CANON §D.2): `media_blobs` is the content-addressed
  dedup store, `works` carries `owner_type`/`owner_id`/`blob_sha`, and
  `storage_meters`/`storage_balance` back the two independent single-payer sliders
  (a user's own, a server's own — no pooling).

Voice/video **calls stay a v2 deferral** — the enum reserves a `voice` channel
kind and CANON §E keys a LiveKit room per channel/DM, but nothing there is built for
the beta.

### The one function that survives the rebuild

`api/sign.mjs` is carried forward unchanged: content-agnostic R2 presigning, the
only thing standing between a signed-in user and the bucket. It verifies the
caller's Supabase token, enforces the upload ceiling (`claim_upload_quota` from
`schema-quota.sql`), and signs against the R2 S3 endpoint. CANON §D.2's storage
schema (`storage_balance`/`storage_meters`) will replace the quota backing when
the build reaches it; the signer's role — check remaining quota before issuing a
PUT — is unchanged.

### The front end

- **The design system is authored, the app is not.** the `eski-style` skill is the
  token/primitive source; `gallery.html` is every screen and dialog. The build
  (P3 in `CODEGEN.md`) turns the eski-style primitives into components **once**,
  then assembles screens from them — a screen that reinvents a button is a
  rejected prompt.
- **Mobile is its own layout**, not a squeezed desktop: the three-pane shell
  (server rail · channel column · main · members rail) collapses to one pane +
  bottom tabs (CANON §C.2).
- **Durable visual invariants** (CANON / eski-style skill, non-negotiable): radius
  `--r` (3px) on chrome and media stays square; round is avatars and presence
  dots only; square icon and close buttons (`.iconbtn`, `#i-x`); modals darken
  the background with a scrim and carry no drop shadow; surfaces separate by
  background step, not borders, except an interactive field which gets a
  `--line2` border for affordance.

---

## Where a change goes

| If you are changing… | It goes in |
|---|---|
| A concept's name | `docs/CANON.md` §A first — then everywhere, identically |
| Who may do what | the RLS policy / RPC (CANON §B, §D.1) first; the UI signpost second |
| What a screen or dialog looks like | `docs/design/gallery.html` (and the token in the `eski-style` skill) |
| A design value — colour, spacing, type, radius | the `eski-style` skill; never a literal in a component |
| The shape of a feature or the data model | `docs/CANON.md` (§C UI registry, §E data model) |
| How the build is sliced or sequenced | `docs/CODEGEN.md` and `docs/prompts/` |
| Anything at all | keep the docs consistent — never let the code become a third source of truth |
