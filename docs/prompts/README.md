# Codegen prompts

The runnable prompts, expanded from the queue in [`../CODEGEN.md`](../CODEGEN.md).
One file per phase; one `###` heading per prompt. Run them **in order** — a `[UI]`
prompt asserts against data a `[BE]` prompt created.

Each prompt is self-contained on purpose: the table columns, RLS, or the gallery
panel it must match are restated inline so the model never has to go read another
file mid-task (that's the tiny-failure-surface rule). Where a prompt says "match
gallery panel X", the operator pastes that panel's HTML/CSS excerpt from
[`../design/gallery.html`](../design/gallery.html) into the prompt.

**Legend.** `[BE]` backend (SQL/RLS/RPC — applied via Supabase, no model tokens).
`[UI]` front-end component/state/dialog (the DeepSeek spend). `[GL]` glue (a data
hook, a Realtime subscription, a signing call).

**Every prompt carries the same guardrails** (`DO NOT`), so they're stated once
here instead of in all 132:

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
| P1 | [P1-schema.md](P1-schema.md) | 24 | BE |
| P2 | [P2-rpcs.md](P2-rpcs.md) | 16 | BE |
| P3 | [P3-primitives.md](P3-primitives.md) | 14 | UI |
| P4 | [P4-shell-workspace.md](P4-shell-workspace.md) | 11 | UI+GL |
| P5 | [P5-content.md](P5-content.md) | 13 | UI+GL |
| P6 | [P6-canvas.md](P6-canvas.md) | 16 | UI+GL |
| P7 | [P7-boards-dms-notifs.md](P7-boards-dms-notifs.md) | 11 | UI+GL |
| P8 | [P8-admin.md](P8-admin.md) | 14 | UI+GL |
| P9 | [P9-utility.md](P9-utility.md) | 9 | UI |

**All ten phases written (P0–P9, ~132 prompts).** Run them in order; flip the
gallery inventory status (`t`→`a`→`m`) as each lands so the burn-down stays
visible.
