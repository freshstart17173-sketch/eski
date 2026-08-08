# eski — the master spec

A comic and everything you hear over it, in one file.

This is the document the rest of the project answers to. `spec.html` is the
published version of the file format alone; where the two disagree, this one is
right and `spec.html` is behind. Design work lives in `docs/design/final/`, and
every surface there is built against the model described here.

---

## 1. What eski is

A comic that has been scored and voiced by people who did not draw it.

An author finishes the art and publishes it with a transcript. Composers lay
sound under it. Voice actors read the characters. A reader picks which of those
performances they want and reads the comic with them playing. Nothing is
exclusive: a character can be voiced by twenty people, a comic can carry a dozen
scores, and the reader chooses.

Three things follow from that, and they constrain everything below.

**Contributions stack, they do not replace.** Two people voicing the same
character are not in competition for a slot. The format has to hold all of it
and the reader has to be able to choose between them.

**A part is never taken.** No surface tells anyone that a character is already
voiced or that a comic already has a score. That framing kills the second
contribution, which is the one that makes the catalogue worth browsing.

**Credit is the currency.** Every performance carries its performer. The
manifest names them, the detail page lists them, and the reader sees who they
picked.

---

## 2. The three studios

The studio is not one surface. The three jobs share a shell and almost nothing
else, so they are three pages fit for their own purpose.

| | Author studio | Composer studio | Voiceover studio |
|---|---|---|---|
| File | `studios/author.html` | `studios/score.html` | `studios/voice.html` |
| Who | the person who drew it | a composer or sound designer | a voice actor |
| Makes | pages, cast, transcript | layers of sound over page ranges | one character's lines |
| Shape | page beside its script | page ruler with stacked lanes | page beside its lines |
| Unit of work | the page | the page range | the line |

### 2.1 Author studio

Imports finished art, writes the cast, transcribes the pages. Nothing else — the
author is not scoring and not casting.

**Pages.** Dropped in, ordered by filename with numeric awareness, shown as a
strip. Page order is the reading order and is the spine everything else hangs
from.

**Cast.** Each character carries a name, a kind (`lead`, `supporting`,
`narration`), a description of who they are, and a note on how they sound —
register, accent, pace, mannerisms. Those last two fields are not flavour text:
they are what a stranger reads in *voiceover needed* before deciding to take the
part, so the studio edits them against a live copy of that row. If the row reads
badly there, it reads badly to every performer who might have taken it.

**Transcript.** Each line carries a page, a character, the text, and a
**direction** — `sad`, `worried`, `choking`, `flat, reading aloud`. The direction
is the author's instruction to the performer and is the difference between a
reading that fits the panel and one that does not. It is set as a parenthetical,
which is what it is.

### 2.2 Composer studio

The one idea this surface exists to express: **audio stacks.**

A layer is a lane. A lane runs the length of the comic. Lanes play at the same
time. Rain can run pages 1–47 on one lane while a piece of music owns pages
12–19 on the lane above it and a door slams on page 14 on the lane above that.

So the primary view is a page ruler with lanes under it, because the composer's
real question is never "what is this file" — it is *"what is playing on page 14,
and where does it stop"*. A clip is dragged in from the bay and given a page
range; the range is the object, and there is no waveform timeline underneath to
disagree with it.

- Overlapping clips on one layer stack into visible sub-rows. A layer that is
  two deep says so.
- A page preview shows the page you have selected and, under it, everything
  audible on that page in playing order.
- The voice layer is present and read-only: the composer cannot move what a
  performer turned in, but has to be able to see where the talking is in order
  to duck around it.
- Publishing reports the pages with nothing under them rather than blocking.

### 2.3 Voiceover studio

One character at a time, one page at a time.

Every character in the chapter is offered on the way in, however many people have
already read it. No performer is named anywhere on the surface: a reading you can
play is labelled a reference, not an attribution.

Other characters' lines stay on the page in grey, because a line is unreadable
without the line before it, and can be played back as reference where a reading
exists.

Recording in the browser and dropping a file in are the same act — both land in
the bay, and a line takes audio from there. Every take carries in and out points;
autotrim moves them to the first and last sound, manual trim drags them. What
falls outside the points is dimmed, never cut.

---

## 3. The audio model

**This section supersedes the "ownership rule" in `spec.html`.** That rule —
one track owns a page range, tracks sort by trigger page, the next trigger ends
the previous one — described a single sequence of music. It cannot express a
rain bed running under a changing score, which is the thing this model exists
to allow.

### 3.1 Layers

A **layer** is a stack of audio that plays simultaneously with every other layer.
A layer has a kind, and the kind sets what its clips mean:

| kind | what it is | clips | ends when |
|---|---|---|---|
| `bed` | ambience that runs under everything — rain, room tone, a city | own page ranges, usually long, usually looping | its range ends |
| `score` | the soundtrack proper | own page ranges | its range ends |
| `oneshot` | effects and stings fired on a page | one page each (`from === to`) | the sound ends |
| `voice` | a performance of one character | one page each, anchored to a line | the line ends |

Layers are ordered in the manifest. Order is presentation only: what a reader
sees in the mix picker, not a mixing precedence.

### 3.2 Clips

A **clip** is one piece of audio with a page range.

```
clip = { id, title, file, from, to, start, end, gain, loop, fade }
```

- `from` and `to` are inclusive 1-indexed page numbers. `to` may equal `from`.
- Ranges are explicit. A clip ends where it says it ends, not where the next one
  begins. Silence between two clips on a layer is silence, and needs no
  `silence` track to express it — which retires that v2 concept.
- Two clips on one layer may overlap. They play together. The studio stacks them
  visually so the author of the score can see it.
- `loop` means the clip repeats until its range ends. Without it the clip plays
  once and the layer goes quiet for the rest of the range.
- `start` and `end` are in and out points into the audio file, in seconds. This
  is what the voiceover studio's trim writes, and it is why trimming is not
  destructive: the file is untouched and the points can be moved again.

### 3.3 What plays on a page

For each page, for each layer, take the clips whose range covers it. That is the
whole rule. A page's sound is the union of every layer's answer, which is what
the composer studio's page preview lists.

### 3.4 Ducking

Ducking stays a property of what is playing over the top, not of the thing being
ducked. A voice clip ducks the `score` and `bed` layers by the amount its layer
declares. A bed should not be ducked by an effect — an ambient wash getting
shoved aside by a door slam is the artefact this model has to avoid — so `duck`
is per layer and beds usually set it `off`.

### 3.5 The script

The transcript is part of the file, not a side-car. Voice clips reference it.

```
script = {
  characters: [ { id, name, kind, description, voice } ],
  lines:      [ { id, page, character, text, direction } ]
}
```

`description` and `voice` are what *voiceover needed* lists. `direction` is the
author's instruction for how a line is read. A line with no voice clip pointing
at it is an open part, and that — not a flag, not a status — is what the browse
surface counts.

---

## 4. Manifest v3

```json
{
  "version": 3,
  "created": "2026-08-05T12:00:00Z",
  "app": "eski",

  "meta": {
    "title": "the second dark",
    "creator": "okonkwo & lai",
    "description": "A village agrees to one night without light.",
    "direction": "ltr",
    "cover": "001.jpg",
    "tags": ["horror", "folk horror", "village", "winter"]
  },

  "player": {
    "volume": 80, "crossfade": 2.0,
    "playbackMode": "sync", "readingMode": "pages",
    "oneshotLoop": false
  },

  "layers": [
    { "id": "L1", "title": "rain", "kind": "bed", "volume": 45, "duck": "off",
      "clips": [
        { "id": "c1", "title": "rain, continuous", "file": "audio/rain.opus",
          "from": 1, "to": 47, "loop": true, "gain": -6 }
      ] },

    { "id": "L2", "title": "score", "kind": "score", "volume": 100, "duck": "medium",
      "by": "kit lundgren",
      "clips": [
        { "id": "c2", "title": "one night without light", "file": "audio/01.opus",
          "from": 1, "to": 11, "loop": true, "gain": 0 },
        { "id": "c3", "title": "the counting", "file": "audio/02.opus",
          "from": 12, "to": 19, "loop": true, "gain": -2 }
      ] },

    { "id": "L3", "title": "effects", "kind": "oneshot", "volume": 100, "duck": "light",
      "clips": [
        { "id": "c7", "title": "door", "file": "audio/sfx-door.opus",
          "from": 14, "to": 14, "gain": 0 }
      ] },

    { "id": "L4", "title": "gwen", "kind": "voice", "character": "gwen",
      "by": "imogen ash", "volume": 100, "duck": "strong",
      "clips": [
        { "id": "v1", "title": "line 12", "file": "audio/vo-gwen-012.opus",
          "from": 3, "to": 3, "line": "l12", "start": 0.3, "end": 2.2, "gain": 0 }
      ] }
  ],

  "script": {
    "characters": [
      { "id": "gwen", "name": "gwen", "kind": "lead",
        "description": "The one who agreed to count.",
        "voice": "Village accent, careful with numbers. Never shouts." }
    ],
    "lines": [
      { "id": "l12", "page": 3, "character": "gwen",
        "text": "Forty-one. That's everyone.", "direction": "" }
    ]
  },

  "pages": { "count": 47, "naming": "auto" }
}
```

### Field notes

- `layers[].by` names the contributor of that layer. A comic with four scores
  has four `score` layers, each with its own `by`, and the reader picks one.
- `layers[].character` on a `voice` layer is the character id from `script`.
  Several `voice` layers may name the same character. That is the point.
- `clips[].line` ties a voice clip to the line it reads.
- `gain` stays decibels, clamped -24..+12, and never re-encodes the audio.
- The zip layout is unchanged: pages at the root, audio under `audio/`,
  `.eski/manifest.json`, and a plain cbz reader still opens it as a silent
  comic.

### Reading a v2 file

1. Wrap every `music` track in one `score` layer, in manifest order.
2. Turn the ownership rule into explicit ranges: `from` is the track's
   `sync.from`, `to` is the page before the next trigger, and the last track
   runs to the final page.
3. A `silence` track sets the end of the previous clip and is then discarded.
4. Wrap all `oneshot` tracks in one `oneshot` layer with `from === to`.
5. There is no script and no voice layer. The comic opens with its music intact
   and every character listed as needing a voice.

A v3 reader must read v2. A v2 reader shown a v3 file should refuse it rather
than play the first layer and call it the score.

---

## 5. Surfaces

Two styles, one for each half of the product. **Broadsheet** dresses everything
you read — hairline rules, micro caps, square corners, art at comic proportions,
and a ground and accent the reader picks
(`docs/design/final/broadsheet.css`, colour in `palettes.css`; the full rules
are in `docs/design/STYLE.md`). **Workbench** dresses the three studios:
the same palette and square corners, but hierarchy from surfaces rather than
hairlines, and colour that means something — four kinds of sound, four hues, one
legend (`docs/design/final/studios/studio.css`, geometry in `base.css`).

| surface | file | what it is |
|---|---|---|
| home | `home.html` | new eskis, people you follow, roles that need a voice |
| browse | `home.html#browse` | three modes, always named: **eskis**, **roles that need a voice**, **eskis with no score** |
| details | `home.html` | the eski, its tags, and the mix picker |
| profile | `home.html#profile` | reading, read, parts performed, settings — the shelf lives here |
| studio | three pages | see §2 |

**The mix.** Voices and score are picked together in the details pane. Every
voiceover for a character is listed with its performer and a preview; every
score is listed with its composer and a preview. The default is the first of
each, which is what a reader who never opens the pane gets.

---

## 6. Open

- **soundtrack needed.** The sibling of *voiceover needed*: comics with no
  score, same dense row, same search, sort and filter. The two names stay
  parallel because home carries a rail for each.
- **Layer precedence.** Order is presentation only today. If two `score` layers
  are ever audible at once, something has to decide, and right now nothing does.
- **Ducking across contributors.** A voice layer ducks the score by its own
  declared amount, which lets a performer's choice quietly reshape somebody
  else's mix.
- **Loudness.** v2 measured `gainDb` per track at export. With layers stacking,
  the measurement wants to be per layer as well, or a bed and a score will not
  sit together predictably.
- **Page ranges under a reordered comic.** If an author inserts a page after a
  score exists, every clip range after it is wrong. Ranges probably need to
  anchor to page ids rather than page numbers.
