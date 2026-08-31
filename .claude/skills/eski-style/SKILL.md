---
name: eski-style
description: The eski visual system AND the token/component source of truth — the are.na-monochrome design language (worked out in docs/design/sandbox.html, ported into gallery.html). This skill replaces the retired styleguide.html: it is the only home for the raw design values. Use whenever applying or changing eski styling: tokens, buttons, dialogs, cards, the details pane, colouring, hover/click states, or a whole screen — or building a new screen/panel. Carries the exact token values, the button archetypes, the hairline/scrim/background-step rules, the colouring rules, a per-screen registry, and the collision-safe porting order. Load it before touching any of those so the work matches the settled direction instead of freestyling.
---

# eski style — the system and how to port it

The direction, settled in `docs/design/sandbox.html` (light + dark, verified by
screenshot): **are.na-flavoured monochrome.** A strict grey ramp, one accent
(the member hue), small mostly-boxless buttons, dialogs split by inset hairlines
instead of grey bars. This skill is the contract — do not re-derive values or
invent components; use what's here. When anything here disagrees with
`docs/CANON.md`, CANON wins (it owns behaviour/data; this owns look).

**This skill is the source of truth** — the only home for the raw design values
(the old `styleguide.html` is retired). `sandbox.html` is the live playground where
a direction is prototyped; `gallery.html` is the LAW — every screen/dialog live,
the critique surface. When applying or porting, **copy values from §1 below** (or
from `gallery.html`, which now consumes them); don't reinvent them.

---

## 0. Prime directives (never violate)

- **Monochrome + one accent.** The greys are the design. The only colour is the
  **member hue** (`--m1…--m30`), and it is **server-scoped** — it renders on member
  names/chips inside a server, and **nowhere on a public profile or the Feed**.
  `--danger` is the member-red reused for destructive UI. No other colour.
- **No hex in components.** Every colour comes from a token. If you're typing `#`
  in a component rule, stop — add/adjust a token instead.
- **Round is avatars + presence dots only.** Radius on all chrome is `--r` (3px).
  Media stays square. No pills, no round badges, no round close buttons. Reaction
  chips, tabs, tags → `--r`. **A person is always round, a server is always square:**
  every avatar/profile picture is round *wherever it appears* — chat, members rail,
  popouts/hovercards, **and the left-rail profile button** (round, bottom-anchored,
  never a square badge like the server icons above it). Square is server icons only.
- **Surfaces separate by background step, not borders.** `paper → surface →
  plate → paper1` are four planes; lay panes/cards/rows on different steps. The
  **only** element that gets a resting border is an interactive **field**
  (`--line2`, for affordance).
- **Modals sit on a scrim, never a drop shadow.** (Menus/toasts/popovers may
  keep a shadow — they float; modals/dialogs darken the backdrop.)
- **Hairlines are inset, never full-width.** A gap on both ends (L/R for a
  horizontal line, T/B for vertical). They replace the grey header/footer bars
  in dialogs and detail-pane rails.
- **Square icon buttons and one close style** (`.iconbtn`, the `#i-x` glyph).
- **One canonical name per concept**; **search before you define**; if a generic
  class name (`.msg`, `.by`, `.tx`, `.foot`, `.meta`, `.card`) is used by more
  than one surface, **scope it** under a root class (`.appshell`, `.arena`, …).
  A leaked `.msg` once broke a whole dialog — see Traps.
- **No pure-black text on a dark surface.** In dark mode text is `--ink/--soft/
  --muted` (all light). Near-black (`--on-ink`) text is allowed **only** on a
  deliberately inverted light chip (primary button, selected tile).
- **Screens are designed on a 1440px canvas.** Judge/screenshot at 1440 — Jost
  renders thin and wrong when squeezed narrower.
- **A port is a RESTYLE, never a content edit — do not delete UI elements.**
  Every screen, control, row, action, icon-button, metadata field, tab, menu item
  and empty/loading/error state that exists must still exist after the port. You
  change *look* (tokens, spacing, colour, hover/click, hairlines vs bars), not
  *inventory*. The **only** removals allowed are ones the owner has explicitly
  decided (currently: the contributors/collaborators field, and the old round
  `.uchip .dot`). If a restyle seems to require dropping an element, stop and ask —
  a silently-deleted button is exactly the regression this project fears. After
  porting a screen, diff the element list against the pre-port version and confirm
  nothing vanished.

---

## 1. Tokens — exact values (port verbatim)

Light `:root`:

```css
--paper:#FCFCFC; --surface:#EFEFEF; --plate:#E1E1E1; --paper1:#D7D7D7;
--ink:#131313; --soft:#363636; --muted:#5C5C5C; --line:#CFCFCF; --line2:#B0B0B0;
--on-ink:#FCFCFC; --tagbg:#DCDCDC; --danger:#C63A28; --railbg:#E4E4E4;
--fs-mi:11px; --fs-xs:12px; --fs-sm:13px; --fs:14.5px; --fs-lg:16px; --fs-xl:20px;
--font:'Jost','Avenir Next','Segoe UI',Arial,sans-serif;
--s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --r:3px; --t:120ms ease;
--hair-inset:14px;         /* the L/R gap on a dialog/rail hairline */
--rail:58px; --chan:232px; --mem:210px;   /* pane widths (workspace/1440) */
```

Dark (`:root[data-theme="dark"]` **and** the `@media (prefers-color-scheme:dark)
:root:not([data-theme="light"])` block — keep both identical):

```css
--paper:#0A0A0A; --surface:#171717; --plate:#242424; --paper1:#2B2B2B;
--ink:#F4F4F4; --soft:#C8C8C8; --muted:#9A9A9A; --line:#303030; --line2:#484848;
--on-ink:#0A0A0A; --tagbg:#2C2C2C; --danger:#F07C63; --railbg:#040404;
```

**Member hues — `--m1…--m30`, generated, not hand-listed.** The palette is **30
perceptually-even hues in OKLCH** (HSL clusters greens/blues; OKLCH holds constant
lightness+chroma so every neighbour is equally distinguishable). The authoritative
generator is in `gallery.html` (`oklch2hex`, the `#palette` section): for `i` in
`0..29`, `H=(i*12+25)°`, **light** `L=0.585 C=0.125`, **dark** `L=0.79 C=0.112`.
The app bakes that same output into `styles/tokens.css` as static `--m1…--m30` (light
`:root` + both dark blocks) so tokens and gallery agree. `--danger` stays its own token
(the destructive red) — it is **not** one of the generated member hues, even though the
old static 6-hue set happened to alias `--m1` to it. Don't hand-edit individual member
hexes — regenerate from the formula so the two never drift.

Notes: the ramp was **deepened** from the old values so adjacent planes read as
distinct (the old ramp blended). `--muted` is intentionally legible (not faint).
The red is punched up from the old `#B0503F/#D98A7A`.

**Tag-type hues — `--tt-bpm`/`--tt-key`/`--tt-genre`/`--tt-mood`/`--tt-instrument`.** A
typed tag (`bpm:142`) reads in its type's fixed colour, same generator as the member
hues (`L=0.585 C=0.125` light / `L=0.79 C=0.112` dark) but hand-picked hues (not the
even 12°-step wheel) so each reads clearly apart: light `#467dc4 #359055 #9a62ab
#ae6916 #009194`, dark `#8abdff #81cf97 #d9a4e9 #edab6b #4fd1d2`. Content metadata, not
member identity — unlike the member hue it may render anywhere (explorer, feed,
details). A **custom** tag type (any `type:value` not in this fixed set) still renders
typed, coloured by a **hashed** hue through the same generator instead of a fixed one.

**Search-modifier colour — `--mod`.** A search modifier (`in:`/`hastag:`/`by:`/…, P27/
P34) needs its own colour so it's never confused with a grey untyped tag or a coloured
typed tag sitting next to it in the search rail. Same generator, `H=338°` (chosen to
maximise RGB distance from all five `--tt-` hues) but at **half the tag chroma**
(`C=0.07` vs `--tt-c`'s `0.125`, dark `C≈0.063` vs `0.112`): light `#976c8a`, dark
`#d6acc9` — a muted dusty mauve, not a vivid magenta (a first pass at full chroma read
as just another saturated tag colour — muting it differentiates by *kind*, not only
hue). Never used on a tag; a tag's chroma stays `--tt-c` even for a custom hashed hue.

**Token roles (what each surface is for):**
`--paper` page/pane ground · `--surface` first raised step (headers, chips,
resting cards-in-chat, rail buttons) · `--plate` second step (selected rows,
cards that must clear a hovered `--surface` row, hover of a `--surface` control)
· `--paper1` deepest step (card hover, media wells, avatars) · `--ink` the CTA /
inverted fill / online dot · `--line` hairlines & dividers · `--line2` field
borders & the faint resting `.outline` border.

Text ladder: `--ink` primary, `--soft` body/secondary, `--muted` tertiary/labels.

---

## 2. Buttons — small; box shrinks, label holds

Base + the **three archetypes** (each with a matching click response). The demo
mirror classes `.s-hover/.s-active` in the sandbox exist only to show states
statically; production uses `:hover/:active`.

```css
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;
  border:1px solid transparent;border-radius:var(--r);
  padding:3px 10px;font:inherit;font-size:var(--fs-xs);font-weight:500;line-height:1.3;
  color:var(--ink);background:none;cursor:pointer;white-space:nowrap;
  transition:background var(--t),color var(--t),border-color var(--t)}
.btn.sm{padding:2px 8px;font-size:11px}
.btn .ic{width:13px;height:13px}

/* (1) COLOUR-CHANGE — the default; the only archetype with a resting box.
      Hover shifts fill; click INVERTS. */
.btn{background:var(--surface);color:var(--ink)}
.btn:hover{background:var(--plate)}
.btn:active{background:var(--ink);color:var(--on-ink)}

/* primary = filled ink anchor (a pre-inverted colour-change button) */
.btn.primary{background:var(--ink);color:var(--on-ink);border-color:var(--ink)}
.btn.primary:hover{background:var(--soft);border-color:var(--soft)}
.btn.primary:active{background:var(--paper);color:var(--ink)}

/* danger = colour-change in member-red */
.btn.danger{background:var(--danger);color:#fff;border-color:var(--danger)}
.btn.danger:hover{background:color-mix(in srgb,var(--danger),#000 12%)}
:root[data-theme="dark"] .btn.danger:hover{background:color-mix(in srgb,var(--danger),#fff 14%)}
.btn.danger:active{background:var(--paper);color:var(--danger)}

/* (2) TEXT-HIGHLIGHT — no box ever; grey label → full ink on hover. Cancels,
      quiet secondaries, inline links. */
.btn.ghost{background:none;color:var(--muted);padding-left:6px;padding-right:6px}
.btn.ghost:hover{background:none;color:var(--ink)}

/* (3) BORDER-ON-HOVER — faint resting border that steps up: hover → --soft,
      click → full --ink. are.na's log-in / sign-up. */
.btn.outline{background:none;color:var(--soft);border-color:var(--line2)}
.btn.outline:hover{border-color:var(--soft);color:var(--ink)}
.btn.outline:active{border-color:var(--ink);color:var(--ink)}

/* icon button — square, boxless at rest; colour-change hover, invert click */
.iconbtn{display:grid;place-items:center;width:26px;height:26px;border-radius:var(--r);
  background:none;color:var(--soft);cursor:pointer;transition:background var(--t),color var(--t)}
.iconbtn:hover{background:var(--surface);color:var(--ink)}
.iconbtn:active{background:var(--ink);color:var(--on-ink)}
```

**When to use which:** primary = the one CTA per surface. ghost = Cancel and
tertiary text actions. outline = a secondary that needs to read as a control
(auth buttons, a bordered pill-free action). plain `.btn` = a normal secondary
with a resting box. danger = destructive confirm. iconbtn = every icon-only
control. **Never** give a control a resting box it doesn't need — boxless is the
default.

**Folder/detail nav arrows follow the colour-change archetype like every other
button: colour-change on hover, INVERT on click.** What's banned is a transform/
opacity *press animation* (the owner called the nudge "too much") — not the
click state. A nav arrow keeps a resting `--paper` fill + `--line` ring so it
reads over media: rest → paper/soft, hover → `--surface`/ink, active → `--ink`/
on-ink (inverted).

---

## 3. Rendering methods (the "how")

**Inset hairline** — replaces every grey header/footer bar. Put `.hair` on the
bar; add `.top` when the line goes on top (footers):
```css
.hair{position:relative}
.hair::after{content:"";position:absolute;left:var(--hair-inset);right:var(--hair-inset);bottom:0;height:1px;background:var(--line)}
.hair.top::after{bottom:auto;top:0}
```
A menu separator is the same idea: `height:1px;background:var(--line);margin:5px var(--hair-inset)` (never full-bleed).

**Scrim** (modal/detail backdrop) — an ink base **plus** a dark overlay, so it
reads as *darkened* in both themes (ink alone goes near-white in dark):
```css
.scrim{background:var(--ink);position:relative}
.scrim::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.34)}
:root[data-theme="dark"] .scrim::before,
:root:not([data-theme="light"]) .scrim::before{background:rgba(0,0,0,.55)}
.scrim>*{position:relative;z-index:1}
```

**Global button reset (mandatory).** Without it an unstyled button falls back to
the browser default black — invisible on dark surfaces. Ship this once:
```css
button{background:none;border:0;color:inherit;font:inherit;cursor:pointer}
```
Still set an explicit `color` on any button-borne label that must not inherit a
dimmed colour (e.g. a file-card filename → `--ink`).

**Background-step layering so nothing blends.** A card/chip that lives inside a
row which highlights to `--surface` on hover must sit **a step above that** —
`--plate` at rest, `--paper1` on its own hover — or it merges into the hovered
row. (This is why chat file cards and reaction chips are `--plate`, not
`--surface`.) General rule: a nested surface is always ≥1 step off whatever can
appear behind it.

**Scope generic component names.** Any block whose selectors use names another
surface also uses (`.msg .by .tx .day .react .card .foot .meta .k .v .cmt`) must
be wrapped: prefix every selector in that block with its root (`.appshell …`,
`.arena …`). Utility classes that are genuinely global (`.u`, `.m1…m6`, `.av`,
`.tag`, `.btn`, `.iconbtn`, `.field`) are defined **once**, unscoped, and reused.

**Colouring.** Member hue only on member text/chips in **social** contexts —
chat bylines, member rail, comments, @mentions — server-scoped, never on public
profile/Feed. **A file-metadata author field ("Posted by / Uploaded by / Made
by") is NOT member-coloured: it's a plain bold `--ink` text link** (are.na's
"By …"), no chip, hover-underline. Online presence dot = `--ink` (monochrome),
offline = `--muted`. `.uchip` (where used, e.g. a chat name chip or a card's
uploader) is **coloured bold text, not a pill** — member colour reads via the
text; the resting chip background is removed (the old round `.dot` is killed too —
CANON #26). The **one** exception is a selected recipient inside an input
(`.collabs .uchip`), a removable token that keeps a subtle `--surface` chip.
Selected/active nav = `--plate` bg + `--ink` text + weight 600; a tab's active
marker is a 2px `--ink` underline (`::after`), tab strip separated by background
step, not a baseline hairline.

**No visible scrollbars** (keep the scroll). Ship globally:
```css
*{scrollbar-width:none}
*::-webkit-scrollbar{width:0;height:0;display:none}
```
Never remove `overflow` — wheel/touch/keyboard scroll must still work.

---

## 4. Component recipes (canonical patterns)

- **Dialog** = flat `--paper` card, `border-radius:var(--r)`, on a `.scrim`. Header
  (`.uhd`) and footer (`.ufoot/.mfoot`) carry **no bg** — an inset `.hair`
  separates them from the body. Title left, square close right. Actions right,
  primary last; Cancel is `.btn.ghost`.
- **Menu/context** = `--paper`, shadow (it floats), **dense** boxless rows
  (`padding:6px 10px` — matching the dense triggers, never a loose 8–10px row),
  colour-change on hover (`--surface`), invert on `:active`; inset separators
  (`margin:5px var(--hair-inset)`, never full-bleed); danger rows in `--danger`. A
  dense trigger that opens a loose menu is a miss — the rows inside are dense too.
- **Field** = the one bordered element: `--line2` at rest → `--ink` on
  `:focus-within`.
- **Card in chat (file card)** = body on `--plate`, icon band a further step, hover
  `--paper1`; filename explicit `--ink`; actions hidden until wrap hover, then a
  small floating `.fcacts` cluster (a ⋯ + at most one or two shortcuts) — **do not
  pile icons on the card**; the full action set lives in the ⋯ menu and in the
  details pane.
- **Reaction chip** = square `--r`, on `--plate` (clears a hovered row).
- **Tag** = **coloured bold text, not a pill** — no `--tagbg` background, no radius,
  no padding; `--soft` weight 600, separated by the container `gap`. (The pill was
  chrome; the word carries it. Status badges that need a chip re-add a background
  under their own scope, e.g. the WIP `· v2` badge.) `--tagbg` remains only for that.
- **Avatar** = round, `--paper1` bg; `.sm` 24px. **Presence dot** = 9px round,
  `--ink` online / `--muted` off, 2px border in the surrounding surface colour.
- **Composer** = `.richcomposer` bordered (`--line2`, → `--ink` focus); toolbar on
  `--surface`; the field borderless inside; send is a muted→ink icon.
- **Toolbar tabs** (chtabs/ntabs/etc.) = background-step strip, active tab `--ink`
  bold + 2px ink underline. **Focus (keyboard) shows the same underline, never a
  full bounding box** — the box duplicates the selection the underline already
  carries (`.chtab:focus-visible{outline:none;box-shadow:inset 0 -2px 0 var(--ink)}`).
- **Dropdown / select** (`.selbtn`) = a **`.btn` colour-change with a trailing
  `#i-chev`** — filled `--surface` at rest, `--plate` hover, invert on click; the
  chevron **rotates 180° while open** (drive it off `aria-expanded` on the trigger,
  reset by `closeMenus`). It is **not** a bordered field pill; a select is denser
  than a `.field` so it never reads as a text input. Its options are a `.menu`
  (checkable `.notlv`/`.loco` rows). A folder/location picker is a `.menu` whose
  rows use the explorer's `.ftrow.lvlN` **indentation** to show nesting, the
  chosen row highlighted (`--plate` + ink) — never a flat list.
- **Option tiles** (`.visopt` — visibility Public/Server/Private, channel Text/
  Voice) = **compact single-line icon+label, no sublabel** (the label carries it),
  equal flex, active inverts to `--ink`. A rare tile grid is not a place for
  explanatory subtext.

---

## 5. Details pane (§C.7) — the flagship overlay

**This is the ONE media viewer** — there is no separate lightbox / "uploaded view"
(retired 2026-08-22); every file opens here. It **closes on ✕, Esc, and a click of
the dimmed backdrop** (the frame around the `.card2` — standard modal behaviour).
In the File explorer a **double-click** opens it (single-click selects); elsewhere a
single click opens it.

Arena layout: a near-full-screen split on a `.scrim`. **Media takes the room**
(left, grows); a fixed **info rail** (`--paper`, ~380px) on the right. Five media
contexts, all the same frame:

- **audio / post (public)** — **transport near-identical to video** (same button
  placement, big centred borderless play, no title): tabular time · seek · time ·
  mute · quality · fullscreen — **audio drops the speed control**, that's the only
  difference. Rail has a public **comment thread** + composer. A *post* draws
  personal storage.
- **video (server file)** — video well; transport: time · seek · time · speed ·
  mute · quality · fullscreen; **no comment thread** (chat handles replies).
- **image (server file)** — the image fills the well (`padding:0`); no transport.
- **other / non-previewable** (`.flp/.zip/.exe`) — a `.dtype` type card **fills the
  well** (`.dmedia .dtype{position:absolute;inset:0}`, content centred), "no preview —
  download to open"; never a fake thumbnail, never a small box anchored top-left (no
  inline `width/height` fighting `inset:0`), and **never a media player** (no
  `.dmbigplay`/transport for a type that can't play — match the media to the file type).
- **folder** — **the only pane with `.navarrow` prev/next over the media** + a
  clickable side **`.flist`** of items; not a work (no tags/comments); Save &
  Download each offer whole-folder or selection (chevron → menu).

Rail structure top→bottom: `.dtop` (filename + Report flag + prev/next chevrons +
close — an **inset hairline** under it) · `.scroll` (h2 title, `.meta` rows, Tags,
and comments for the post) · `.foot` (**inset hairline on top**, then the action
buttons — primary Download, Save; folder adds Open). Transport pinned to the media
foot; big centred borderless play; **no visible skip buttons** (5s skip on ←/→).

**Metadata rows are are.na-style: key left (`--muted`), value RIGHT-aligned to the
panel edge (`--ink`), packed dense** (`gap:var(--s1)`). The author value is a
**neutral bold text link, not a member chip** (see Colouring). Keep it tight — this
rail is reference data, not a form. **`Size` is always the LAST row** (settled owner
call — it never sits above `Location`/`Type`). The value column right-aligns to the
**same ruler as the header controls** (rail horizontal inset `--s4` on `.dtop`,
`.scroll`, `.foot`). The **Location crumb row must not be taller than the others** —
it's the same `.ic.sm`-sized inline crumb, no extra height that nudges rows above it.
The h2 title gets `margin:var(--s4) 0 var(--s3)` so it never hugs the `.dtop` hairline.

**Apply the current decisions when building it:** buttons are the new small
archetypes; the grey `.foot` bar becomes an inset hairline; **the Collaborators
section is dropped** (owner: contributors removed for now); presence/member
colour rules hold. Scope the whole block under `.arena`.

---

## 6. Per-screen registry — port nothing half-way

Every surface to consider (CANON §C.3). For each, the styling touchpoints are the
same primitives above; the notes flag what's easy to miss.

| Screen (`data-screen`) | Styling touchpoints / watch-for |
|---|---|
| **Workspace** `workspace` | rail, channel column (server cover+icon header), `.crow` rows (selected = plate+ink), chat stream `.msg`, file cards, reactions, composer, member rail. Scope `.msg/.by/.tx` under a root. |
| **Feed** `feed` | masonry/even grid of `.card`; **no member colour** here (public). Previewable tiles transparent; audio/file tiles a `--surface` well. |
| **File explorer** `explorer` | filetree (`.ftrow`), toolbar (search field + filter chips + view segmented), list/grid/feed views, breadcrumbs, storage footer. Card hover actions → ⋯ only. |
| **Details pane** *(overlay)* | §5 above. |
| **Profile** `profile` | hero, shelf tabs (2px ink underline), POV variants; **no member hue on public profile**. |
| **Messages (DMs)** `dms` | dm list, add-by-handle field, conversation, group avatars stack. |
| **Friends** `friends` | rows split by inset row-hairlines, add-by-handle, request accept/decline icon buttons. |
| **Upload** *(sheet)* | file + folder variants; visibility segmented tiles (selected inverts — keep subtext legible); "Add details" disclosure; storage-impact line. |
| **Server settings** `settings` | left setnav, panels: general/channels/members/roles/moderation/audit/storage; square checkboxes/toggles; danger box. |
| **User settings** `usersettings` | setrows with square toggle; account switcher; sessions; billing/receipts. |
| **Create server / Join** `create`/`join` | centered card on scrim; starter chips; magic link row. |
| **Notifications** `notifications` | tabs, filter chips, `.nrow` with hover actions, bell dropdown preview. |
| **Search / quick switcher** `search` | scope/type/field/order selectors, result rows, ⌘K palette (selected row inverts). |
| **Auth / onboarding** `auth` | brand, steps, field with `@` prefix, username-state line, `.btn.outline`/primary. |
| **Roles editor / assign / channel perms** *(settings/modals)* | role rows, permission matrix (square `.cbx`), multi-select checklist, allow-list. |
| **Storage & billing** `settings/storage` | usage meter, dynamic GB slider, tier line; over-cap red banner. |
| **404 / dead invite / denied / blocked / pending** *(cards)* | centered card on scrim; empty-state icon+text. |
| **Shared view** `shared` | standalone (no rail); read-only single item. |
| **New server (first-run)** `newserver` | empty channel column + setup checklist. |
| **Global dialogs/menus** | create-channel, invite, forward, report, share, update-visibility, server menu, bell dropdown, message ⋯, DM menu, notification-levels, help/shortcuts, status composer, toast, upload-progress, skeletons, empty states. All: hairline dialogs, small buttons, scrim. |
| **Call** `vc` | **v2 — deferred.** Its own dark theatre chrome; don't restyle for beta. |

---

## 7. Porting procedure (order matters)

1. **Tokens first.** Swap the `:root` + both dark blocks in `gallery.html` (and any
   new page) to §1. This shifts *every* screen at once (intended).
2. **Global primitives.** Ensure the button reset (§3) exists; update `.btn`
   family, `.iconbtn`, `.field`, `.tag`, `.uchip` to §2/§4. Remove any old
   `button:active{transform}`/opacity press animation.
3. **Dialogs & menus.** Convert grey `.uhd/.ufoot/.mfoot/.foot` bars to inset
   hairlines; confirm scrims (not shadows) on modals.
4. **Per-screen sweep, in §6 order.** For each screen: check selected/active
   states use plate+ink, cards clear hovered rows (background-step), no member
   hue on Feed/public profile, no full-width hairline, no round non-avatar.
5. **Search before you edit.** A selector already defined? Edit it in place; never
   add a second one nearby. If a name is shared across surfaces, scope it.
6. **Verify at 1440, both themes, by screenshot.** Light and dark. Look for:
   blended surfaces, invisible dark-mode text, pills, full-width lines, tall
   buttons. Fix before moving on.
7. **Reconcile docs.** Update CANON / this skill / TODO for any decision applied
   (e.g. contributors removed) so the next pass doesn't undo it.

---

## 8. Traps (bugs already hit — don't repeat)

- **`.msg` (or any generic name) leaking across surfaces.** Scope screen/panel
  CSS under a root class. A chat `.msg` once turned a confirm dialog's body into a
  broken flex column (too tall, split text).
- **Missing button colour reset** → file-card / unstyled-button text renders black
  and vanishes in dark. Ship the reset; set explicit `--ink` on key labels.
- **Card same step as its hovered row** → they blend. Nested surface must be ≥1
  step above what can appear behind it.
- **Scrim using `var(--ink)` alone** → light backdrop in dark mode. Use the
  ink-base-plus-dark-overlay pattern (§3).
- **Selected-tile subtext hardcoded white** → invisible on the inverted light tile
  in dark. Use a translucent `--on-ink` (`color-mix(... transparent 20%)`).
- **Full-width hairlines / grey header-footer bars** → the thing this restyle
  exists to remove. Inset every hairline; kill the bars.
