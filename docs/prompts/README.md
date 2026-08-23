# Codegen prompts

The runnable prompts, expanded from the queue in [`../CODEGEN.md`](../CODEGEN.md).
One file per phase; one `###` heading per prompt. Run them **in order** — a `[UI]`
prompt asserts against data a `[BE]` prompt created.

Each prompt is self-contained on purpose: the table columns, RLS, or the gallery
panel it must match are restated inline so the model never has to go read another
file mid-task (that's the tiny-failure-surface rule). Where a prompt says "match
gallery panel X", the operator pastes that panel's HTML/CSS excerpt from
[`../design/gallery.html`](../design/gallery.html) into the prompt.

## The stack (applies to every UI/GL prompt)

**Vanilla HTML + CSS + JavaScript plus a thin reactive layer. No meta-framework,
no bundler, no build step, no JSX, no TypeScript.** This matches the repo's real
approach (ARCHITECTURE.md, CANON §E.6, §G): every screen is an HTML file that
loads a few shared classic scripts and holds its own behaviour in one `<script>`;
shared runtime (Supabase client, session, `mediaUrl()`, the card/detail
renderers) lives in a small module. The one addition (CANON §G) is a **thin
signals reactive layer** — a small primitive (reference `@preact/signals-core`,
~2 KB, vendored / from CDN) that live surfaces bind to, so Realtime changes patch
the DOM through reactive bindings instead of hand-rolled diffing. State is plain
DOM + signals + a couple of module-level objects; there is no virtual DOM (a real
component model — `preact`+`htm`, still no build step — is used only where it
earns its keep, chiefly the shared explorer/feed component, §C.6).

**"Component" in these prompts means** a CSS class (or small set) plus a JS render
helper — e.g. `function messageRow(msg){…returns an element}` — not a React
component. **"Hook" means** a shared function/module (e.g. `session()`,
`hasPerm(serverId, flag)`), not a React hook.

**Buy a library only where DIY is a real time-sink** (CANON §E.6), loaded as a
plain script/ESM — no build-time framework:
- **SortableJS** — drag-reorder (channels).
- **emoji-mart** — the emoji picker data + search.
- **marked** — render message markdown (the composer inserts markdown by hand).
- **nanoid** — collision-safe short invite codes.
- **JSZip** — client-side export zips.
- **@supabase/supabase-js** — the client (auth, Postgres, Realtime).
- **ffmpeg-static** — audio transcode (server-side only).
- Waveform, mentions autocomplete, quick-switcher, local time — **build**, they're
  small.

**Legend.** These are the per-surface checklist inside each phase of the Claude Code
playbook ([`../CODEGEN.md`](../CODEGEN.md)) — Claude Code builds all three, not a
separate model. `[BE]` backend (SQL/RLS/RPC — authored here, applied + tested via the
Supabase MCP). `[UI]` front-end (one rendered screen/state/dialog, ported against the
gallery). `[GL]` glue (a shared data function, a Realtime subscription, a signing call).

**Every prompt carries the same guardrails** (`DO NOT`), so they're stated once
here instead of in each:

> Tokens only — no hex in a component. `--r` (3px) on chrome; media stays square;
> round is avatars + presence dots only. Square icon/close buttons (`.iconbtn`,
> `#i-x`). Modals darken the background with a scrim — no drop shadows. The member
> hue is the only colour, server-scoped, and never on a public profile or the
> Feed. Mobile is its own layout (three-pane → one pane + bottom tabs), not a
> squeezed desktop. Reuse the primitive/token/name that exists — never mint a
> second one. The RLS policy is the fence; a UI gate is only the signpost.

| Phase | File | Prompts | Tag |
|---|---|---:|---|
| P0 | [P0-scaffold.md](P0-scaffold.md) | 4 | GL |
| P1 | [P1-schema.md](P1-schema.md) | 21 | BE |
| P2 | [P2-rpcs.md](P2-rpcs.md) | 14 | BE |
| P3 | [P3-primitives.md](P3-primitives.md) | 15 | UI |
| P4 | [P4-shell-workspace.md](P4-shell-workspace.md) | 11 | UI+GL |
| P5 | [P5-content.md](P5-content.md) | 12 | UI+GL |
| P7 | [P7-boards-dms-notifs.md](P7-boards-dms-notifs.md) | 6 | UI+GL |
| P8 | [P8-admin.md](P8-admin.md) | 14 | UI+GL |
| P9 | [P9-utility.md](P9-utility.md) | 9 | UI |

**Nine phases, ~106 prompts** (P0–P9; **P6 canvas is cut**, and the board/version
prompts are removed from P1/P2/P5/P7 — 2026-08-18e beta scope). Run them in order;
flip the gallery inventory status (`t`→`a`→`m`) as each lands so the burn-down stays
visible.
