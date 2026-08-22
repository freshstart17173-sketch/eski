# Placeholder / asset manifest — the exact shopping list

> **Now wired (2026-08-22).** The gallery loads real media from
> [`assets/`](assets/) — drop the files below into that folder and list them in
> `assets/manifest.js` and the gradients are replaced automatically (5 images
> rotate to fill the whole card grid). How-to + a regenerate one-liner:
> [`assets/README.md`](assets/README.md). This page stays the subject-by-subject
> shopping list; `assets/README.md` is the mechanics.


Captured 2026-08-21. Answers gallery todo **#28** and the owner's follow-up: *how
many unique assets to make the gallery fully functional (audio + video actually
play) with **no duplicated images***. Audited from `gallery.html`; each distinct
**work** is one asset, and a work reused across surfaces (explorer + details +
feed) is the **same file**, not a duplicate.

**Post-#52 note:** there are **no waveforms anywhere** — audio always renders as
the music icon + file type. So audio no longer needs a source clip *for a
waveform*; it needs a clip only so the **player actually plays** (owner wants
everything functional). Video needs a real clip **and** a poster still.

Today the gallery fakes images with CSS gradients (`.shot`, `.tile.img`,
`.jcover`, `.ppbanner`, inline `.dmedia` gradients). Drop a real asset per row
below and the gallery becomes photographic and functional. The fictional project
is "**late_bloom**"; keep the filenames so nothing else has to change.

## Images — 5 unique (each previewable image thumbnail)

| Asset | Subject | Appears in |
|---|---|---|
| `cover_bloom.png` | single/release cover art | profile ("cover art, bloom"), feed cover, details header |
| `ref_drums.png` | drum reference / moodboard | explorer, workspace chat, search |
| `ref_board.png` | reference board | folder side-list (Drum picks) |
| `cover_studies_warm.png` | "cover art studies, warm set" — warm-toned study | feed |
| `keyframe_study.png` | "keyframe study, the falling sequence" — a still | feed |

Generic explorer tone-variants (`.shot` / `.shot.b/.c`, cool/warm detail scenes)
are **not** distinct subjects — they're backed by the 5 above; no extra art.

## Video — 4 unique (real clip **+** poster still each)

| Asset | Subject | Appears in |
|---|---|---|
| `sh040_comp.mp4` (+`.mov`) | comp/edit reel ("q3 comp reel, first pass") | explorer, feed, details player |
| `booth_2min.mp4` | booth take (talking head) | explorer |
| `lyric_visual.mp4` | "lyric visual" — motion piece | profile |
| `title_sequence_draft.mp4` | "title sequence, draft" | feed |

> Ambiguity: "title sequence, draft" is rendered as **video** in the feed. If you
> meant it as a still, move it to Images and video drops to **3**.

## Audio — 13 unique (real clip each, for playback)

**One-shots / loops (the "Drum picks" folder), 5:** `kick_punchy.wav`,
`snare_tight.wav`, `hat_loop_142.wav`, `break_chop.wav`, `texture_vinyl.wav`.

**Tracks / takes, 3:** `bridge_scratch_rae.wav` (vocal scratch), `bounce_v2.wav`,
`late_bloom_master.wav` (the "late bloom" master).

**Titled feed/profile works, 5:** "bloom, single", "low ceilings, the finished
verse", "low ceilings, verse idea", "drum one-shots, vol 2", "back half rework,
drums finally sit right".

> Two judgement calls: "verse idea" vs "the finished verse" may be **two takes of
> one song** (→ 12 audio if you share a clip) or two works; and "drum one-shots,
> vol 2" reads as a **pack** — if you populate that folder fully it's several
> clips, not one. Folders also show "+5 more" hidden items; fully populating every
> folder pushes audio higher than what's on screen.

**Optional (upload-sheet examples only, not gallery works):**
`bloom_mix_rough.wav`, `late_bloom_beat.wav` — only shown as "picked files" in the
Upload sheet. Supply clips only if you want that example to be a real upload.

## Unpreviewable files — 0 art (icon only)

`late_bloom_beat.flp`, `drum_bus.flp`, `bloom_master.als`, `stems_sh040.zip`,
"session backup, aug" (zip). They render `#i-file` + ext (brand icon B6 later).
Supply the actual files only if you want **Download** to hand back a real file.

## Identity art — optional (everything has a fallback today)

| Slot | Count | Fallback if omitted |
|---|---|---|
| People avatars | ~9 (dev, jax, mira, nel, rae, sol, tomo, kofi, you…) | initials |
| Server icons | 3 (Late Bloom LP, Specter, Blueshift) | initials / default server icon (brand B7) |
| Server covers | 3 (same servers) | flat colour |
| Profile banner | 1+ | flat colour |

## Totals

| Type | Unique assets | Needs |
|---|---|---|
| **Images** | **5** | one image each |
| **Video** | **4** (3 if "title sequence" is a still) | clip **+** poster still each |
| **Audio** | **13** (12 if the two "low ceilings" share a take) | clip each (for playback) |
| Unpreviewable | 5 files | 0 art (real file only if Download must work) |
| Identity (optional) | ~9 avatars · 3 icons · 3 covers · 1 banner | all have fallbacks |

**Minimum for a photographic, fully-playable gallery with no duplicated images:
5 images + 4 video (clip+poster) + 13 audio clips.** Identity art and the real
unpreviewable/download files are optional on top.
