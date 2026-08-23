# BUILDLOG — the build's live state

Append-only. This is where every build session records what it did, so **any** Claude
Code session (this chat, another chat, a second agent) can cold-start and continue from
the repo alone. The protocol lives in [`CODEGEN.md`](CODEGEN.md) §0 / §6; the short
version:

- **Start a session:** run the cold-start ritual (read this file, `git log --oneline -8`,
  Supabase MCP `list_migrations` + `list_tables`, `node docs/design/verify.mjs`), then add
  an `IN PROGRESS:` line claiming what you're taking.
- **End a session (green only):** verify → commit → append a `## <date> — <phase.session>`
  entry with **DONE** (commit sha + migration name), **NEXT** (the exact next item), and any
  **GOTCHA** — then clear your `IN PROGRESS` line and push.
- **Ground truth is the DB + git**, not this prose. If `list_migrations` disagrees with the
  committed `schema-*.sql`, reconcile before building on top.

Entry template:
```
## 2026-08-DD — P1.3 channels + policies
IN PROGRESS: (cleared)
DONE: schema-04-channels.sql applied (migration "p1_3_channels") + committed <sha>.
      allow/deny tests pass; get_advisors security clean; types regenerated.
NEXT: P1.4 messages (+ body_tsv, parent_id, tombstones), CANON §E.1/§E.8.
GOTCHA: channels.post_policy='admins' must reject non-admin inserts — test covers it.
```

---

## Current state

**Phase: build. P0 DONE. P1 IN PROGRESS — groups 1–6 of 8 green. NEXT: P1 group 7 (notifications+prefs+saves).**

The spec is hand-off-ready: [`CANON.md`](CANON.md) is the contract (incl. §E.10, the
per-control → backend coverage matrix), the [`design/gallery.html`](design/gallery.html)
gallery is the visual law with `verify.mjs` green, and [`CODEGEN.md`](CODEGEN.md) is the
playbook. The frontend stack is locked (vanilla + signals, no build step; CANON §G).

The app now boots from the root `index.html` (the old design-deliverables index page
is retired — those deliverables still live at their own paths, e.g.
`docs/design/gallery.html`). Deploy target is the **`preview` branch → preview.eski.lol**
(Vercel). Supabase project is **`zidqagrmxeawpasurpwi` ("Eski")** — reachable via the
Supabase MCP.

**Clean slate DONE** (owner authorised 2026-08-23): migration `clean_slate_retired_pivot`
dropped every retired `public` table + function; `list_tables` is empty. Now building the
fresh CANON §E schema in §E.8 order.

**NEXT: P1 group 4** — `channels`/`messages`/reactions/pins/reads/mentions, gated on
`can_view_channel` (built here with channels). Then group 5 (comments+profiles), 6
(DMs+friendships), 7 (notifications+prefs+saves), 8 (moderation+billing), then the P1
wrap (advisors clean, types, commit, BUILDLOG). RPCs/triggers/indexes/realtime are P2.

IN PROGRESS: P1 groups (schema) — this session.

---

## Log

<!-- newest entries at the bottom; append, never edit past entries -->

## 2026-08-23 — P0 Scaffold
IN PROGRESS: (cleared)
DONE: app shell + router + signals + Supabase client + tokens/theme + icon sprite.
  Files: `index.html` (shell + sprite, ported verbatim from the gallery),
  `app/{signals,router,env,supabase,theme,icons,main}.js`,
  `styles/{tokens,base}.css`, `vercel.json` SPA rewrite, `package.json` type:module.
  Verify (headless Chromium smoke, `python3 -m http.server`): every route swaps its
  placeholder with **no full reload**; `match()` resolves all §C.3 routes + params +
  404 fallback; `--r`=3px, `--rail`=58px, `--m1..--m6` all resolve; theme toggle flips
  `--paper` FCFCFC↔0A0A0A and back; sprite mounts 63 `#i-*` symbols and `icon()`
  renders a `<use>`; a `tick` signal advances the DOM without a reload; **zero console
  errors**. (Deep-link-on-hard-refresh is covered by the Vercel rewrite, not testable
  under the plain static server.)
NEXT: P1.1 schema (servers) — but first resolve the clean-slate BLOCKER above.
GOTCHA 1: member hues are **30**, not 6 (owner confirmed 2026-08-23). The 6 static
  `--m1..--m6` in the gallery/skill `:root` were a stale base; the REAL palette is 30
  perceptually-even OKLCH hues **generated in JS** in `gallery.html` (`oklch2hex`,
  `#palette`): `H=(i*12+25)°`, light `L=.585 C=.125`, dark `L=.79 C=.112`. Baked that
  exact output into `styles/tokens.css` as `--m1..--m30` (light + both dark blocks);
  reconciled the `eski-style` skill to describe the generator. `--danger` is its own
  token, NOT a member hue. Regenerate from the formula — never hand-edit a member hex.
GOTCHA 2: `styles/tokens.css` `@import`s `../docs/design/_fonts.css` (single source for
  the base64 Jost faces) — the app depends on `docs/` being deployed. Fine on Vercel
  (whole repo ships); revisit if docs/ is ever split out.
GOTCHA 3: `theme.js` is a CLASSIC blocking script in `<head>` BEFORE the stylesheets —
  it must stay there (and stay non-module) to stamp `data-theme` before first paint.
GOTCHA 4: Vercel rewrite is `/((?!api/|.*\.).*) -> /index.html` — anything with a dot
  (static assets, docs/*.html) or under `/api/` is served directly; everything else
  hits the SPA shell. Adding a real top-level path with a dot in it would bypass the
  shell.
