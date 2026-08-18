# P0 — Scaffold

Four glue prompts that stand the app up. After P0 the app boots, tokens resolve,
the icon sprite renders, and auth session state is available. No product screens
yet. Shared guardrails: see [README](README.md).

---

### P0.1 [GL] — App shell, routing, screen manifest

**CONTEXT.** New repo. Stack: **Vite + React + TypeScript** (function components,
hooks; no class components). No CSS framework — the design system arrives in P0.3.
The route set is the CANON §C.3 manifest.

**BUILD.** The app skeleton and client-side router only. Routes, each mounting a
placeholder that renders just the screen's name centered:
`/` (Feed), `/messages` (DMs), `/s/:serverId` (Workspace), `/s/:serverId/c/:channelId`,
`/s/:serverId/canvas/:canvasId`, `/s/:serverId/board/:boardId`,
`/s/:serverId/settings`, `/explore/:serverId` (Media explorer), `/u/:handle`
(Profile), `/upload` (modal route), `/notifications`, `/create`, `/join/:code`,
`/search`, `/signin`, and a catch-all `*` (404).

**DATA.** None yet.

**STATES.** Each placeholder shows its route name; the catch-all shows "404".

**DONE WHEN.** Every route mounts its placeholder with no console error;
navigating between two routes swaps the placeholder without a full reload; the
catch-all renders for an unknown path. No visual styling is judged here.

---

### P0.2 [GL] — Supabase client + auth session

**CONTEXT.** Supabase project already exists (URL + anon key via env:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Use `@supabase/supabase-js` v2.

**BUILD.** A singleton Supabase client module, and a `SessionProvider` (React
context) exposing `{ session, user, loading, signInWithOtp(email), signOut() }`.
A `useSession()` hook reads it. On mount, hydrate from
`supabase.auth.getSession()` and subscribe to `onAuthStateChange`.

**DATA.** Supabase Auth only. No table reads.

**STATES.** `loading` true until the first session resolves; `user` null when
signed out, the auth user when signed in.

**DONE WHEN.** With no session, `useSession().user` is null and `loading` settles
to false; calling `signInWithOtp` with a valid email triggers the magic-link
request without throwing; a mocked auth-state change flips `user` and a signOut
clears it. No secret key is ever referenced client-side (anon key only).

---

### P0.3 [GL] — Design tokens + theme system

**CONTEXT.** The token and primitive source of truth is
[`../design/styleguide.html`](../design/styleguide.html); the values also live at
the top of [`../design/gallery.html`](../design/gallery.html) as `:root` custom
properties. Theme is three-state (explicit `data-theme="light"`/`"dark"` on the
root, or system via `prefers-color-scheme`).

**BUILD.** A single global stylesheet that (a) imports the Jost faces from
`../design/_fonts.css`, (b) declares the **complete light palette** as tokens on
bare `:root` (spacing `--s1..s6`, radius `--r:3px`, type scale, `--ink`,
`--paper`, `--surface`, `--plate`, `--line`/`--line2`, `--muted`/`--soft`,
`--on-ink`, and the 30 member hues `--m1..m30`), (c) redefines only the changed
tokens under `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) }`
and again under `:root[data-theme="dark"]`. Plus a `useTheme()` hook that reads
and stamps `data-theme`, cycling light → dark → system.

**DATA.** None.

**STATES.** Light (default / `[data-theme="light"]`), dark (system-dark or
`[data-theme="dark"]`).

**DONE WHEN.** `getComputedStyle(document.documentElement).getPropertyValue('--r')`
is `3px`; `--m1`..`--m30` all resolve; toggling `useTheme()` to dark changes
`--ink`/`--paper` and back; nothing paints a default theme then repaints (tokens
are present before first paint). Copy the exact token values from the styleguide —
do not invent any.

---

### P0.4 [GL] — Icon sprite + `<Icon>` wrapper

**CONTEXT.** The gallery embeds an inline SVG sprite of `<symbol id="i-*">`
definitions (Feather-style, 24×24 viewBox, stroke, round joins). The full set:
`i-arrow i-at i-bell i-board i-camera i-canvas i-check i-chev i-clip i-clock
i-comment i-copy i-download i-drag i-expand i-file i-folder i-globe i-grid i-hand
i-hash i-home i-image i-leave i-link i-lock i-mail i-mic i-more i-move i-pause
i-pen i-phone i-pin i-play i-plus i-refresh i-reply i-save i-screen i-scribble
i-search i-send i-server i-settings i-smile i-square i-trash i-type i-undo i-user
i-users i-version i-video i-voice i-x`.

**BUILD.** Mount the sprite once at app root (copy the `<svg width="0" height="0">…</svg>`
block from the gallery). An `<Icon name="x" size?="sm|md" />` component rendering
`<svg class="ic {size}"><use href="#i-{name}"/></svg>`, with a dev-time warning if
`name` isn't in the known set (prevents the "icon that doesn't make sense" class
of bug by making a typo loud).

**DATA.** None.

**STATES.** `md` (default), `sm`.

**DONE WHEN.** `<Icon name="canvas"/>` and `<Icon name="server" size="sm"/>`
render the right glyph at the right size; an unknown name warns in dev; `currentColor`
drives the stroke so an icon inherits its parent's colour.
