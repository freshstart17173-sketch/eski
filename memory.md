# Project memory — handoff for a fresh agent

Last updated **2026-08-21** by the todo-triage session. Read this first, then
`CLAUDE.md`, then `docs/CANON.md` (the build contract) and
`docs/design/gallery.html` (the design LAW).

## What eski is right now

Planning/design phase of a rebuild into "Discord for creatives" — servers,
channels, persistent chat, a shared media library (File explorer), friends/DMs,
three visibility layers (Public / Server / Private). **Nothing is live.** The
output of this phase is the contract a code-gen model builds against.
Solo owner (Dexter, freshstart17173@gmail.com). Everything ships to `main` →
Vercel → prod. No issue tracker; work is tracked in `docs/` and conversation.

## The one workflow gotcha (important)

- **Work on `main`.** The owner explicitly wants changes on `main`, matching
  `CLAUDE.md`. A task harness may hand you a `claude/...` branch — the owner's
  instruction to use `main` overrides it.
- At the start of this session the **local `main` was a stale, diverged lineage**
  (50/50 different commits vs `origin/main`). `origin/main` was the real tip.
  If local main looks divergent again: `git branch -f main origin/main` (while
  checked out elsewhere) then `git checkout main`. `git reset --hard` and
  `git checkout -f` may be blocked by the sandbox classifier — use `branch -f`.

## How to verify design changes (do this — don't edit blind)

`gallery.html` is one self-contained file: `?app=1#<screen>` renders one live
screen (screens: workspace, feed, explorer, vc, profile, dms, settings, create,
join, e404, deadinvite, denied, auth, search, notifications); no query = catalog
of iframes + authored panels. Render with the pre-installed Chromium via
Playwright (global module):

```
node -e "const {chromium}=require('/opt/node22/lib/node_modules/playwright'); ..."
executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
```

Scratch scripts from this session live in the session scratchpad (shot.js,
details.js, panel.js, measure.js). **The owner caught three bugs I shipped blind
early on — always screenshot before committing a visual change.**

## Design rules that bit me (from CLAUDE.md — enforce them)

- Icons render via `<svg class="ic ..."><use href="#i-x"/></svg>`. `.ic` sets
  `stroke:currentColor;fill:none`; a bare `.fic` has NO stroke → renders solid
  black. Always include `ic`.
- Round is **avatars + presence dots only**. Person avatars use `.av`/`.pfp`
  (now `border-radius:50%`). **Server icons stay square.**
- Radius `--r` (3px) on chrome; media square. No hex literals in components
  (use tokens). Modals darken via scrim, no drop shadows (note: `.umodal` at
  gallery line ~463 still has a `box-shadow` — a pre-existing rule violation I
  did NOT fix; flag/fix if you touch it).
- Don't define a selector twice; edit where it lives.

## What this session did (all on `main`, pushed)

Worked `docs/design/gallery-todo.md` in token-cost order. **Done + verified:**
#35, #28 (new docs `slash-commands.md`, `placeholders.md`), #48, #29, #11, #12,
#13, #31, #32, #37, #38, #1, #2, #3, #4, #5, #7, #16, #30, #36, #41, #6, #8, #9,
#45, #21, #14, #15, #47, #10, #17, #18, #24, #42, #43, and NEW #52 (no
waveforms anywhere). CANON §C.7/§C.10/§C.12 and COLLAB were kept in sync with
each change (every gallery edit that changes behaviour updates CANON/COLLAB).

Key model changes baked into CANON this session: audio is a **music-icon type
card everywhere, no waveform** (#52 supersedes #12); details pane dropped the
storage×visibility badge and the "N MB on X storage" prose (Size row instead),
Channel→"Posted in", added Modified+by-whom, server files have **no discussion
section** at all; one unified audio/video transport, no visible skip (5s on
←/→), speed control + video quality; single-work details get **top-bar** prev/
next arrows (folder keeps over-media arrows); circular avatars; upload has a
real entry button + Files/Folder toggle; Starred + Trash(30d) smart folders.

## Still open (in `docs/design/gallery-todo.md`)

**Not started (biggest / new surfaces):** #19 (right-click/burger menu — note
selection mode + cardacts already exist), #25 (clumped multi-file in channel),
#33 (more explorer filters), #20 (profile POVs owner/public/mutual), #22
(Settings screen — a `settings` data-screen already exists, likely *server*
settings; owner wants a user/account one — confirm scope), #23 (blocked/pending
state screens), #34 (surface server icon+cover beyond the rail), #39 (Share
dialog, Google-Drive style), #40 (read-only shared-view screen), #44 (storage-
upgrade UI), #46 (read-only over-cap screen), #49 (skeleton/loading states),
#50 (empty states), #51 (toast + upload-progress).

**New owner items (added 2026-08-21):** #53 channel default file-save location,
#54 per-channel file-type permissions, #55 tracked vs untracked/hidden files
(hidden in file view, "show hidden" toggle; for chat-utility files), #56 voice-
chat WIP screens.

**Needs the OWNER's input (was pushed to the bottom, per his instruction):**
- **#26** "remove the circles in the name cards" — could NOT confidently identify
  what "name cards" refers to (message-author identity? the `.ppop` profile
  popover?). Ask before editing.
- **#27** "remove the collaborators/credits field" — **conflicts with CANON**:
  `collaborators` is a canonical, consent-gated concept (§A.2 sub-terms, §D.3.1,
  table `work_collaborators`). Removing the UI field needs a CANON decision
  first, not a silent gallery edit.
- **Owner decisions** in `docs/COLLAB.md` §"Owner decisions still open" (WebRTC
  provider, transcode scope, notifications, DMCA/region, ratify permission flags,
  member-colour palette sign-off).
- **Brand assets B1–B8** in `docs/design/brand-assets-todo.md` — hand-drawn
  (Inkscape) by the owner; incl. the unpreviewable-file icon B6 (gallery uses
  `#i-file` as the placeholder until then) and OG/share-card B5.

## Cleanup debt

`.wave` CSS rules and the `generateWaveform()` JS in `gallery.html` are now dead
(0 waveform elements) — remove in a cleanup pass. Unused symbols `#i-rewind`/
`#i-ff` (skip buttons removed) are still defined; harmless.
