# gallery assets — drop real media here to populate the UI

The gallery fakes every image and video with a CSS gradient so it works with an
empty repo. To populate it:

1. **Drop your files** into this folder (`docs/design/assets/`) using the exact
   filenames below.
2. **List them in `manifest.js`** — the gallery loads *only* what the manifest
   names, so it never requests a file that isn't there (deterministic, no console
   noise). Regenerate the list in one line:

   ```sh
   cd docs/design/assets
   printf 'window.__eskiAssets = [\n%s\n];\n' \
     "$(ls | grep -viE '^(README\.md|manifest\.js)$' | sed 's/.*/  "&",/')" > manifest.js
   ```

Any file you don't provide keeps its gradient fallback, so partial sets are fine.
The resolver lives at the foot of `gallery.html` (search `asset resolver`) and
runs in the app, the catalog, and every embedded screen iframe.

## How it decides what goes where

- **Explicit** — any element with `data-asset="<file>"` loads that exact file.
  Add `data-poster="<img>"` on a video node for its still.
- **Generic image cards** — every `.shot` card with no explicit asset is filled
  from the **image pool** below, rotating in order. This is why five images make
  the whole grid photographic: the generic explorer/feed tone-variants aren't
  distinct subjects (see `../placeholders.md`).
- **Covers** — profile/feed covers (`.jcover`), server covers (`.srvcover`) and
  the profile-popover banner (`.ppbanner`) use `cover_bloom.png`.

## The shopping list (from `../placeholders.md`)

### Images — 5 (image pool; any card can show any of them)
| File | Subject |
|---|---|
| `cover_bloom.png` | single/release cover art (also the default cover/banner) |
| `ref_drums.png` | drum reference / moodboard |
| `ref_board.png` | reference board |
| `cover_studies_warm.png` | warm-toned cover study |
| `keyframe_study.png` | a still from the falling sequence |

Any `.png`/`.jpg`/`.jpeg`/`.webp`/`.avif` works; keep the base name, change the
extension freely (the resolver tries the name as written first).

### Video — up to 4 (clip + optional poster still each)
Tag a node `data-asset="<clip>.mp4" data-poster="<still>.png"`. Shipped tags:
| File | Poster | Where it's wired |
|---|---|---|
| `sh040_comp.mp4` | `sh040_comp.png` | details pane (server video file) + feed |

Add more by tagging other `.dmedia` / video-card nodes the same way.

### Audio — optional (playback only)
Audio always renders as the music-icon type card (no waveform, CANON #52), so no
image is needed. Drop a clip only if you later wire the player to play it; the
resolver leaves audio cards alone.

### Unpreviewable files — none
`.flp/.zip/.als` etc. render as an icon + extension type-card; no asset needed.

## Formats & size
Keep clips short and web-encoded (H.264 `.mp4`, or `.webm`); posters are ordinary
images. Nothing here is committed to prod — this is design-review media only.
