# P0 — Scaffold

Four glue prompts that stand the app up. After P0 the app boots, tokens resolve,
the icon sprite renders, and auth session state is available. No product screens
yet. Shared guardrails: see [README](README.md).

---

### P0.1 [GL] — App shell, routing, screen manifest

**CONTEXT.** New repo. Stack: **vanilla HTML + CSS + JS, no framework** (see the
[README](README.md) stack section). Optionally a tiny esbuild bundle. The route
set is the CANON §C.3 manifest.

**BUILD.** The app shell (`index.html` + a `router.js` module) and a hash/History
router only. Each route swaps a `.screen` container in the main `<div id="stage">`
(the gallery's own app-mode pattern) to a placeholder that renders just the
screen's name centered. Routes: `/` (Feed), `/messages` (DMs),
`/s/:serverId` (Workspace), `/s/:serverId/c/:channelId`,
`/s/:serverId/settings`, `/s/:serverId/files` (File explorer), `/u/:handle`
(Profile), `/upload` (modal route), `/notifications`, `/create`, `/join/:code`,
`/search`, `/signin`, and a catch-all (404). Vercel rewrites (`vercel.json`) send
`/u/:handle` and `/s/:id` deep links to the shell.

**DATA.** None yet.

**STATES.** Each placeholder shows its route name; the catch-all shows "404".

**DONE WHEN.** Every route swaps in its placeholder with no console error and no
full-page reload; the catch-all renders for an unknown path; a deep link (e.g.
`/u/rae`) resolves via the rewrite. No framework is used; no JSX/TS. No visual
styling is judged here.

---

### P0.2 [GL] — Supabase client + session module

**CONTEXT.** Supabase project already exists (public URL + anon key, embedded in a
config script the way `platform.js` carries them — public by design). Use
`@supabase/supabase-js` v2 (vendored or ESM import; no bundler required).

**BUILD.** A shared `platform.js`-style module exposing a singleton client and a
session API: `session()` (current user or null), `ready` (a promise that resolves
once the first session loads), `signInWithOtp(email)`, `signOut()`, and a
`onChange(cb)` subscription. Hydrate from `supabase.auth.getSession()` and
subscribe to `onAuthStateChange`; every page waits on `ready` before reading
`session()` (the pivot's ESK-1005 pattern).

**DATA.** Supabase Auth only. No table reads.

**STATES.** Before `ready`: unknown. After: `session()` is null (signed out) or the
auth user.

**DONE WHEN.** With no session, `session()` is null after `ready`; `signInWithOtp`
with a valid email triggers the magic-link request without throwing; a mocked
auth-state change fires `onChange` and flips `session()`; signOut clears it. Only
the anon key is referenced client-side — never the secret.

---

### P0.3 [GL] — Design tokens + theme system

**CONTEXT.** The token and primitive source of truth is
[`../design/styleguide.html`](../design/styleguide.html); the values also live at
the top of [`../design/gallery.html`](../design/gallery.html) as `:root` custom
properties. Theme is three-state (explicit `data-theme="light"`/`"dark"` on the
root, or system via `prefers-color-scheme`).

**BUILD.** `tokens.css` + `theme.js`. The stylesheet (a) imports the Jost faces
from `../design/_fonts.css`, (b) declares the **complete light palette** as tokens
on bare `:root` (spacing `--s1..s6`, radius `--r:3px`, type scale, `--ink`,
`--paper`, `--surface`, `--plate`, `--line`/`--line2`, `--muted`/`--soft`,
`--on-ink`, and the 30 member hues `--m1..m30`), (c) redefines only the changed
tokens under `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) }`
and again under `:root[data-theme="dark"]`. `theme.js` is a tiny classic script
that stamps `data-theme` **before the stylesheets load** (the pivot's `palette.js`
pattern — avoids the flash) and toggles light → dark → system.

**DATA.** None.

**STATES.** Light (default / `[data-theme="light"]`), dark (system-dark or
`[data-theme="dark"]`).

**DONE WHEN.** `getComputedStyle(document.documentElement).getPropertyValue('--r')`
is `3px`; `--m1`..`--m30` all resolve; the toggle flips `--ink`/`--paper` and back;
nothing paints a default theme then repaints (theme is stamped before first
paint). Copy the exact token values from the styleguide — do not invent any.

---

### P0.4 [GL] — Icon sprite + `<Icon>` wrapper

**CONTEXT.** The gallery embeds an inline SVG sprite of `<symbol id="i-*">`
definitions (Feather-style, 24×24 viewBox, stroke, round joins). The full set:
`i-arrow i-at i-bell i-camera i-check i-chev i-clip i-clock
i-comment i-copy i-download i-drag i-expand i-file i-folder i-globe i-grid i-hand
i-hash i-home i-image i-leave i-link i-lock i-mail i-mic i-more i-move i-pause
i-pen i-phone i-pin i-play i-plus i-refresh i-reply i-save i-screen i-scribble
i-search i-send i-server i-settings i-smile i-square i-trash i-type i-undo i-user
i-users i-video i-voice i-x` (the cut canvas/board/version screens' `i-board
i-canvas i-version` glyphs may stay in the sprite unused or be dropped).

**BUILD.** Mount the sprite once in the shell (copy the `<svg width="0" height="0">…</svg>`
block from the gallery). A tiny helper `icon(name, size)` returning the markup
string `<svg class="ic {size}"><use href="#i-{name}"/></svg>` (or an element), with
a dev-time `console.warn` if `name` isn't in the known set (makes a typo loud —
prevents the "icon that doesn't make sense" class of bug).

**DATA.** None.

**STATES.** `md` (default), `sm`.

**DONE WHEN.** `icon('server')` and `icon('server','sm')` produce the right glyph
at the right size; an unknown name warns in dev; `currentColor` drives the stroke
so an icon inherits its parent's colour.
