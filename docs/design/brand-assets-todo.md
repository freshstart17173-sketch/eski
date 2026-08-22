# Brand assets to make — personal list (Inkscape)

Static brand/graphic assets I (Dexter) draw by hand — **not** gallery.html/codegen
work, and **not** the desktop/Tauri icon set (that's parked with the desktop version).
Authority for style is the **eski-brand** guide (Gnomon display, Jost workhorse, sage
monochrome, flat blocks, pops of pure white/black). Captured 2026-08-19.

- [ ] **B1. Logo** — the primary mark.
- [ ] **B2. Wordmark** — a locked "eski" lockup. (Today it's just live Gnomon text on
  the auth screen; decide if that stays or becomes a fixed lockup.)
- [ ] **B3. Brandmark / glyph** — a compact icon form of the logo that reduces cleanly
  to ~16px (the rail icon and the favicon can't use the wordmark).
- [ ] **B4. Favicon set** — from B3: `.ico`, 32px, 180px apple-touch, 512px maskable
  (PWA). Web only.
- [ ] **B5. Social / OG share-card template** — the link-preview image for shared files
  and profiles. Load-bearing now that the Share dialog + shared-view exist
  (gallery todo #39/#40); without it a shared link previews as nothing.
- [x] ~~**B6. Unpreviewable-file icon**~~ — **not needed (2026-08-22).** Unpreviewable
  files just use the existing `#i-file` icon; no custom-drawn glyph. (gallery #21
  already uses `#i-file` as the single unpreviewable icon.)
- [ ] **B7. Default server icon** — fallback art when a server has no cover uploaded.
  (Avatars already fall back to initials; servers have no fallback.)
- [ ] **B8. (Optional) Empty-state illustrations** — only if we want spot art instead
  of icon-plus-text for the empty states (gallery todo #50). Decide art vs. no-art
  first; skip if staying minimal.

_Deferred with the desktop version: the Tauri app-icon set (`.icns` macOS, `.ico`
Windows, Linux PNGs)._
