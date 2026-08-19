# P3 — Design-system primitives

15 UI prompts. Build each primitive **once** (a CSS class or set + a small JS
render helper — **not** a React component; see the [README](README.md) stack
note), from [`../design/styleguide.html`](../design/styleguide.html), reused by
every screen. A screen prompt that reinvents one of these is a rejected prompt.
Each is **done when** it matches its styleguide row in **both themes**, covers all
listed states, and uses only tokens (no hex). The operator pastes the matching
styleguide/gallery CSS excerpt into the prompt. Shared guardrails: see
[README](README.md).

Each prompt fills: what it is · variants/options · states · the class it owns.
"Options" are the render helper's parameters, not framework props.

---

### P3.1 [UI] — `Button`
Variants: `primary` (ink fill, on-ink text), `default` (surface), `sm`, `danger`.
Options: `icon?`, `onClick`, `disabled`. States: default/hover/active/disabled/loading.
Owns `.btn` (+ `.primary`/`.sm`/`.danger`). **DONE:** all four variants match the
styleguide; disabled is non-interactive; an icon+label lays out with the icon
leading.

### P3.2 [UI] — `IconButton` + `CloseButton`
Square (`--r`), icon-only. `CloseButton` is `IconButton` with `#i-x`. Options:
`icon`, `title` (tooltip/aria-label). States: default/hover/active. Owns
`.iconbtn`. **DONE:** square corners, matches the established pattern; no second
close style is introduced; has an accessible label.

### P3.3 [UI] — `Field`
Text input with the one `--line2` affordance border, optional leading icon.
Options: `icon?`, `placeholder`, `value`, `onChange`, `type`. States:
default/focus/error/disabled. Owns `.field`. **DONE:** the border is the only
bordered surface type; focus is visible; error shows the error token.

### P3.4 [UI] — `Modal`
Centered card over a **scrim** (darkened background), **no drop shadow**. Options:
`title`, `onClose`, `footer?`, `size` (default/wide). Slots: header (title +
`CloseButton`), body, footer. Traps focus; Esc closes; click-scrim closes. Owns
`.modal` (+ `.wide`) and the scrim. **DONE:** scrim dims the background, card has
no shadow, focus is trapped, Esc and scrim-click both close.

### P3.5 [UI] — `Menu` + `MenuItem`
Floating menu (right-click/⋯/dropdown). Parts: `.mlabel` header, `MenuItem`
(icon + label, optional `danger`), `.sep`. Positions to its anchor, closes on
outside-click/Esc, keyboard-navigable. Owns `.menu`. **DONE:** items are
keyboard-navigable; a danger item reads danger; it closes correctly and never
overflows the viewport.

### P3.6 [UI] — `Avatar` + `PresenceDot`
`Avatar` is **round** (the one round exception), initials or image, sizes
`sm/md/lg`. `PresenceDot` (round) states: online/idle/dnd/offline. Options:
`colorIdx?` (member hue — **only** on server surfaces). **DONE:** round, sizes
correct, presence states distinct; the hue is applied only when a `colorIdx` is
passed (never defaulted on public surfaces).

### P3.7 [UI] — `Tag` + `Chip`
`Tag` = a freeform content tag (square, `--r`). `Chip`/`uchip` = a member chip
(dot + name) that **carries the member hue** — server surfaces only. States:
default, removable (× on hover). Owns `.tag`, `.uchip`. **DONE:** tag is neutral;
uchip shows the member dot+hue; removable variant exposes a square remove control.

### P3.8 [UI] — `Toggle`
The switch (round knob is allowed — it's a control affordance, per styleguide).
Options: `on`, `onChange`, `disabled`. Owns `.tgl` (+ `.on`). **DONE:** on/off states
animate; matches the styleguide; disabled is inert.

### P3.9 [UI] — `Checkbox`
Square (`--r`) check box, `.cbx` (+ `.on` = ink fill with `#i-check`). Options:
`checked`, `onChange`, `disabled`. **DONE:** unchecked shows an outlined square,
checked fills ink with the check; never round.

### P3.10 [UI] — `UsageBar`
The storage/quota bar: a track with a fill `%`. Options: `pct`, `tone?`. Owns `.bar`
+ `.bar i`. **DONE:** fill width tracks `pct`; reads correctly at 0/50/100.

### P3.11 [UI] — `Toast`
Transient confirmation (copied/saved/sent), auto-dismiss, optional `Undo`. Options:
`message`, `action?`, `duration`. Ink background, on-ink text. **DONE:** appears,
auto-dismisses after `duration`, Undo fires its callback; stacks don't overlap.

### P3.12 [UI] — `Tabs`
Underline-active tab row (`.nav`/`.ptab` family). Options: `items`, `active`,
`onChange`, per-item `count?`. **DONE:** active tab shows the inset underline; a
count renders inline; keyboard-navigable.

### P3.13 [UI] — `SegmentedControl`
The visibility segmented control: Public (`#i-globe`) / Server (`#i-server`) /
Private (`#i-lock`). Options: `value`, `onChange`, `options`. Owns `.seg`. **DONE:**
one option active at a time; the **Server** option uses `#i-server` (not the
members icon); matches the styleguide.

### P3.14 [UI] — `SelectPill` / `Dropdown`
The pill-style selector (`.selpill`/`.selbtn`) that opens a `Menu`. Options: `label`,
`options`, `value`, `onChange`. States: closed/open. **DONE:** the pill shows the
current value + chevron; opening shows the menu; selection updates the label. Not
round — square `--r`.

### P3.15 [UI] — `MediaPlayer` (audio + video, real controls)
The one player used by the details pane (P5.6) and inline cards. **Build it once
with a full, working transport** — the
previous build only played and couldn't pause or skip; that's the bug this
primitive exists to kill. Wraps a native `<audio>`/`<video>` element and drives it.
- **Controls:** big **play/pause toggle** (icon swaps `#i-play`⇄`#i-pause` with
  state), **skip-back / skip-forward** (`#i-rewind`/`#i-ff`, ±10s), a **seek track**
  (click to seek, drag the knob to scrub → sets `currentTime`), **current / total
  time** (tabular), **volume/mute** toggle (`#i-volume`/`#i-mute`), and for
  **video** a **fullscreen** button (`#i-expand`). Owns `.dmtransport`/`.tbtn`/
  `.track`/`.dmbigplay`.
- **Wiring (this is the acceptance):** play/pause reflects and controls
  `media.paused`; the scrubber fill + knob follow `timeupdate`; clicking/dragging
  the track sets `currentTime`; skip ± moves `currentTime` by 10s clamped to
  `[0,duration]`; volume toggles `muted`; keys: space = play/pause, ←/→ = skip.
Options: `src`, `kind` ('audio'|'video'), `poster?`.
**DONE WHEN.** With a real src: play starts it and the button shows pause; pause
stops it and shows play; skip-back/forward move the position 10s and the time +
scrubber follow; dragging the knob seeks; mute silences and the icon reflects it;
on video, fullscreen works. **No control is decorative — every one drives the
element.**

---

**End of P3.** With the primitives built — including a player that actually pauses
and seeks — P4 assembles the three-pane shell and the Workspace from them.
