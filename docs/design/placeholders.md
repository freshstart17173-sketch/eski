# Placeholder inventory — content art the gallery fakes

Captured 2026-08-21. Answers gallery todo **#28** ("list every image, video, and
audio placeholder so a suitable one can be provided for each"). Pairs with
**#29** (previewable thumbnails sit in a *transparent* container — the real art
fills it, no opaque tile behind) and **#13/#36** (audio uses the music icon on
cards; a generated waveform only in the expanded/inline player).

Today `gallery.html` fakes all media with CSS gradients (`.shot`, `.tile.img`,
`.vreel`, `.imstage`, `.jcover`, `.ppbanner`, inline `.dmedia` gradients) and
JS-drawn waveforms (`.wave`). Everything below is one fictional music-production
project ("**late_bloom**") so the mockup reads as a real studio. To make the
gallery photographic, drop a real asset into each slot; **audio waveforms are
generated from the supplied audio**, so audio needs a source clip, not a picture.

## Images — need a real image (fills a transparent square, #29)

| Asset | Subject | Appears as |
|---|---|---|
| `cover_bloom.png` | single/release cover art | feed post cover, filecard cover, release header (`.jcover`) |
| `ref_drums.png` | drum reference / moodboard | explorer card (`.shot`), details pane, DM media |
| `ref_board.png` | reference board (pinned images) | explorer card, folder grid |
| **profile avatar** | a face/logo | circular avatar everywhere (todo #1) — falls back to initials |
| **profile banner** | wide header image | profile pop banner (`.ppbanner`) |
| **server cover** | wide server art | server header/cover (todo #34) — falls back to default server icon (B7) |
| **server icon** | square server mark | rail badge, server header — falls back to initials/default (B7) |

Generic explorer thumbnails use three tonal variants (`.shot`, `.shot.b`,
`.shot.c`) and the details stage uses cool/warm scenes (`.tile.img` /
`.tile.img.warm`). Any real image can back these; they are tone slots, not
distinct subjects.

## Video — need a poster still (+ short clip for the player)

| Asset | Subject | Appears as |
|---|---|---|
| `sh040_comp.mp4` / `.mov` | a comp/edit video | video card, `.vreel`, details player |
| `booth_2min.mp4` | a booth take (talking-head) | explorer card, details player |

Each needs a **poster frame** (the still shown before play) and a short clip so
the player controls (todo #37/#38) have something to scrub.

## Audio — need a source clip (waveform is generated from it)

Full tracks: `late_bloom_master.wav`, `bloom_mix_rough.wav`, `bounce_v2.wav`.
One-shots / loops: `kick_punchy.wav`, `snare_tight.wav`, `hat_loop_142.wav`,
`break_chop.wav`, `texture_vinyl.wav`.
Vocal: `bridge_scratch_rae.wav`.

On a **card** these show the music icon on a square tile (#13); in the
**expanded/inline player** they show a high-res waveform generated from the clip
(#12/#36). One representative clip per row (a full track, a one-shot, a vocal) is
enough to exercise every audio surface.

## Unpreviewable — no art, use the single unpreviewable-file icon (#21 / brand B6)

`late_bloom_beat.flp`, `drum_bus.flp` (FL Studio) · `bloom_master.als`
(Ableton) · `stems_sh040.zip` (archive). These never get a thumbnail; they use
the one consistent unpreviewable-file icon (gallery todo #21, drawn as brand
asset B6).

## Hand-off note

Supplying **one asset per row above** (≈3 images, 2 videos, 3 audio clips) makes
the whole gallery photographic. Until then the gradient/waveform fakes stay as
labelled placeholders. The unpreviewable set needs no art — only the #21/B6 icon.
