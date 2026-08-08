# One contribution studio, and how dialogue overlaps

Two designs, written down because they decide the shape of the studio that
has not been built yet — and building it before they were settled would have
been building the wrong screen. **Nothing here is implemented.** The DECIDED
blocks are answers, not proposals; everything else is the reasoning that got
there, kept so the same ideas do not get re-proposed.

---

## Part 1 — collapsing the voiceover and composer studios

### What is there now

Three studios were designed: **composer** (score), **voiceover** (dialogue),
**author** (script and cast). Only the author studio and the v2 composer
exist. The v3 designs sit unbuilt in `docs/design/final/studios/`.

The proposal is to merge composer and voiceover into **one contribution
studio** with a stance chosen on the way in:

| Stance | Dialogue | Score | Sound effects |
|---|---|---|---|
| Voice actor | only the characters you claimed | read-only | **yes** |
| Composer | read-only | yes | **yes** |

### Why one screen rather than two

The two studios were about to be the same screen twice. Both open a comic you
do not own, both download its pages, both place audio against a page range,
both export a `part` row, and both need to hear what is already there to place
anything sensibly. The only real difference is which column you are allowed to
write into. That is a permission, not a product.

Merging also fixes something the split could not: a voice actor cannot
currently hear the score they are performing over, and a composer cannot hear
the dialogue they are scoring around. On one screen both are simply there,
greyed but audible.

### The shape

Same three regions the `eski-session` skill describes — rail, grid,
inspector — and the grid is the whole idea. **Rows are pages. Columns are
layers.**

```
        │ SCORE │ NARRATOR │ AKI │ MOMOKO │ SFX │
  p.1   │   ▓   │          │  ▓  │        │  ▓  │
  p.2   │   │   │    ▓     │     │   ▓    │     │
  p.3   │   │   │          │  ▓  │   ▓    │  ▓  │
```

**Stance decides which columns are live.** Everything else stays visible and
audible, drawn at label weight rather than ink weight, and refuses a drop.

- As a voice actor who claimed AKI: the AKI and SFX columns are yours. SCORE,
  NARRATOR and MOMOKO play, and cannot be edited.
- As a composer: SCORE and SFX are yours. Every dialogue column plays, and
  cannot be edited.

The scene-launch control on each page row fires that whole page as a reader
will hear it — every column, yours and not — which is the only honest way to
judge a level.

**Why sound effects are open to both.** An effect is not a performance and
not a score; it is a thing that happens on a page. A door slam belongs to
whoever noticed the door. Making it a third permission nobody holds would
mean nobody adds any. Who is *heard* when two people both noticed is settled
under DECIDED below.

### The four ways in

Each has a different pair of "known" facts, and that is what the entry screen
has to resolve. **Comic** and **stance** — the studio needs both, and it
should never ask for one it can already infer.

| From | Comic | Stance | What it asks for |
|---|---|---|---|
| A comic page → VOICE OR SCORE IT | known | — | stance, then characters if voice |
| A role in browse / the contribute hub | known | voice, and the character too | nothing — straight in |
| The studio, cold | — | — | pick a comic open to contributions, then stance |
| Profile → an unpublished part | known | known | nothing — reopen where you left it |

Only the third one is a real picker, and it is a list of comics whose author
has opened them to contributions — which is the contribute hub, so it should
be that page rather than a second list.

### What the database already supports

More than you would expect. `parts.kind` is already `'vo' | 'soundtrack'` —
that **is** the stance, persisted, and it means a part's stance is fixed at
creation and does not need a second column. `parts.character_key` scopes a
voice part to a character. `comics.voice_consent` / `music_consent` already
gate whether either stance is offered at all, and the policy enforcing them
is live.

What is missing: nothing for sfx (a third `kind`, or a track-level type on
both), and nothing that lets one part claim more than one character.

### DECIDED

**One character per part.** `parts.character_key` stands as it is, and no join
table is needed. Voicing three characters is three parts, exported and
published separately, and a reader picks each one independently.

**Stance is fixed per part.** `parts.kind` already holds it. Doing both for
one comic means two parts open. This is what keeps every layer owned by
exactly one person, which is the invariant the rest of this rests on.

**Sound effects travel with the part**, and this turns out to be the
interesting one, because it makes the effects layer a thing a reader can
choose rather than something they are stuck with:

- read a comic with **no score at all**, and still hear effects and dialogue
- read it with a composer's score **and** that composer's effects
- read it with just the voice actors' effects, if no composer is picked

**The effects layer has exactly one owner at play time**, and the composer
wins. If the reader has selected a composer's part, that part's effects layer
is authoritative **even when it is empty** — picking a composer is picking
their whole sound design, including their decision that a scene wants no door
slam. A voice actor may still author effects; they are heard when no composer
part is selected.

> **Still open, and small:** with no composer selected and three voice parts
> chosen, three people may each have added the obvious effects and the reader
> hears the door slam three times. One character per part makes this more
> likely, not less. The rule that follows from everything above is that the
> effects layer keeps exactly one owner: take it from the selected voice
> parts in cast order, the first that has an effects layer at all. It is
> arbitrary between two contributors, but it is never doubled, and the grid
> shows a contributor what is already there before they add to it.

---

## Part 2 — overlapping dialogue

### The problem

Today a one-shot is triggered **by a page**. Everything on a page fires at the
page turn. That is fine for a single line and useless for a conversation:
a character starts talking, and other lines are meant to land while they are
still talking — an interruption, two people over each other, a crowd.

There is no way to say "this line starts while that one is still going",
and no way to link a sound effect to a moment inside a line.

### The proposal: a cue is relative to the cue before it

The author studio already holds an **ordered list of lines per page** — that
is what transcription produces. So the link is between adjacent entries in a
list that exists, and it is one field:

| Link | Means | Use |
|---|---|---|
| `after` | starts when the previous entry ends | ordinary back-and-forth. The default |
| `with` | starts at the same instant as the previous | two people at once, a crowd, a chorus |
| `over` | starts partway through the previous | an interruption, talking across someone |

`over` carries one number: **a fraction of the previous entry**, not a
millisecond offset. That is the whole trick, and it is why this survives
contact with the site's actual model.

### Why a fraction rather than a time

Because the audio does not exist when the author writes this, and when it does
exist there is more than one of it. A line is voiced by however many people
choose to, and their takes are different lengths — one VA's "GET OUT" is 0.6s
and another's is 2.4s. An absolute offset authored against the first take is
wrong for every other take, and silently wrong: it does not error, it just
stops landing where it was written to land.

A fraction is authored against the **line**, which is text, which is the same
for everybody. "Interrupt at 70%" is true of every take of it. The reader
resolves it at play time against the take actually selected:

```
start(n) = start(n-1) + duration(n-1)                  // after
         = start(n-1)                                   // with
         = start(n-1) + duration(n-1) * fraction        // over
```

Three lines of arithmetic, evaluated per page turn against whatever mix the
reader has picked, and it composes: a group of five entries chains from the
first one's start.

### The same mechanism carries sound effects

An effect is an entry in the same per-page list, so it links the same way. A
door slam is `with` the line "get out"; a distant siren is `over` at 20% of
the narration. Nothing new to learn, nothing new to build, and it answers
"same with sound effects" without a second design.

### In the author studio

The lines on a page are already a list of rows. Each row after the first grows
one control: **AFTER · WITH · OVER**, and choosing `over` reveals a single
slider from 1 to 99%. Choosing anything but `after` draws a bracket down the
left of the linked rows, so a group reads as a group at a glance — the same
way a soundtrack run reads as a bracket in the page grid.

That is the entire interface. No timeline, no waveform, no scrubbing: the
author is describing the *shape* of the conversation, and the shape is
ordinal, not temporal.

### What it costs

Two columns on the lines table (`link` enum default `'after'`, `over_pct`
smallint null) and a scheduler in the reader that walks a page's entries once
at page turn instead of firing them all at zero. The manifest gains the same
two fields per cue so an exported `.eski` carries it.

### DECIDED: cut on the turn

A linked group still playing when the reader turns the page is **cut**, group
and all. It loses the end of a sentence, and that is the right trade: the page
is what the reader is looking at, and audio from the page before it arguing
with the page in front of them is worse than a clean stop. It also means a
page turn always costs the same thing, which is nothing.

Holding the turn was never an option — nothing may block a page turn.
