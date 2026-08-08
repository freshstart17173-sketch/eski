# One contribution studio, and how dialogue overlaps

Two designs, written down because they decided the shape of the studio before
it was built. The DECIDED blocks are answers, not proposals; everything else is
the reasoning that got there, kept so the same ideas do not get re-proposed.

**Status: built.** `contribute.html` is the studio, `schema-sfx.sql` is the
migration (applied), the after/with/over control is live in the author studio,
and takes can be recorded in the browser as well as attached — measured for
loudness either way (`loudness.js`, roadmap 9c).

**The reader now hears the timing.** A page's cues are scheduled from
`after` / `with` / `over` rather than all firing at the page turn, on a pool
of elements so several can sound at once. Durations are measured first,
because `over` is a percentage of whatever take is selected.

What is still NOT built: a reader cannot yet CHOOSE between published parts
mid-read — one score plays, and a contributed voice or effects part is only
audible if the link that opened the comic already named it. That is roadmap
item 13, and it is the last thing standing between a published part and
somebody actually hearing it.

---

## Part 1 — collapsing the voiceover and composer studios

### What is there now

Three studios were designed: **composer** (score), **voiceover** (dialogue),
**author** (script and cast). The v3 mockups sit in
`docs/design/final/studios/` and were never wired to anything.

Composer and voiceover are **one contribution studio** now — `contribute.html`
— with a stance chosen on the way in. There are three:

| Stance | What you write | Everything else |
|---|---|---|
| Voice actor | one character's lines | read-only, and audible |
| Composer | the score | read-only, and audible |
| Sound effects | the effects layer | read-only, and audible |

**Sound effects are their own stance, not a corner of the other two.** A voice
actor or a composer can pick it — it is open to anyone, the way voicing is —
but what they produce is a separate part, and a reader chooses it the same way
they choose a score.

### Why one screen rather than two

The two studios were about to be the same screen twice. Both open a comic you
do not own, both download its pages, both place audio against a page range,
both export a `part` row, and both need to hear what is already there to place
anything sensibly. The only real difference is which column you are allowed to
write into. That is a permission, not a product.

Merging also fixes something the split could not: a voice actor could not hear
the score they were performing over, and a composer could not hear the
dialogue they were scoring around. On one screen both are simply there, greyed
but audible. That is why nothing is ever filtered OUT of the slot list — only
made dead — and it is what `smoke.js` asserts under all three stances.

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

**Stance decides which single column is live.** Everything else stays visible
and audible, drawn at label weight rather than ink weight, and refuses a drop.

- As a voice actor who claimed AKI: the AKI column is yours. Everything else
  plays and cannot be edited.
- As a composer: SCORE is yours.
- As a sound designer: SFX is yours.

Exactly one column is ever writable, which is the same sentence for all three
stances. That is worth more than it looks — it means the grid has one rule
rather than a rule per stance, and a contributor never has to work out which
of two columns they are allowed to be in.

The scene-launch control on each page row fires that whole page as a reader
will hear it — every column, yours and not — which is the only honest way to
judge a level.

**Why effects are their own stance rather than a corner of the other two.**
An effect is not a performance and not a score; it is a thing that happens on
a page, and a door slam belongs to whoever noticed the door. But "open to
both" and "part of both" are different claims, and only the first one was
wanted. Made a stance of its own it stays open to anyone — a voice actor or a
composer picks it the same way they pick voicing — while what comes out is a
layer with one owner that a reader selects on its own.

### The four ways in

Each has a different pair of "known" facts, and that is what the entry screen
has to resolve. **Comic** and **stance** — the studio needs both, and it
should never ask for one it can already infer.

| From | Comic | Stance | What it asks for |
|---|---|---|---|
| A comic page → CONTRIBUTE TO IT | known | — | which of the three, then the character if voice |
| A role in browse / the contribute hub | known | known, character too | nothing — straight in |
| The hub → "no effects yet" | known | effects | nothing — straight in |
| The studio, cold | — | — | pick a comic open to contributions, then stance |
| Profile → an unpublished part | known | known | nothing — reopen where you left it |

Only the fourth is a real picker, and it is a list of comics whose author has
opened them to contributions — which is the contribute hub, so it should be
that page rather than a second list.

The button on the comic page said VOICE OR SCORE IT, which named two of what
are now three things. **CONTRIBUTE TO IT**, and the sheet behind it offers
whichever stances that comic is open to.

### What the database already supports

More than you would expect. `parts.kind` is already `'vo' | 'soundtrack'` —
that **is** the stance, persisted, and it means a part's stance is fixed at
creation and does not need a second column. `parts.character_key` scopes a
voice part to a character. `comics.voice_consent` / `music_consent` already
gate whether either stance is offered at all, and the policy enforcing them
is live.

Effects need `parts.kind` to gain `'sfx'`, and that is very nearly the whole
schema change: an effects part has an owner, a title, a status and a comic,
which is what a part already is, and it has no `character_key`, which is
already nullable. The reader's mix picker gains a third list beside voices
and score, built from the same query.

The one real question it raised was **consent**, and `sfx_consent` is the
answer: a third column rather than a reuse of `music_consent`, because an
author happy to be scored has not thereby agreed to gunshots. It is applied,
`eski_part_allowed` reads all three axes, and it now fails CLOSED on an
unrecognised kind — the old two-armed CASE returned the music answer for
anything that was not 'vo'.

### DECIDED

**One character per part.** `parts.character_key` stands as it is, and no join
table is needed. Voicing three characters is three parts, exported and
published separately, and a reader picks each one independently.

**Stance is fixed per part.** `parts.kind` already holds it. Doing both for
one comic means two parts open. This is what keeps every layer owned by
exactly one person, which is the invariant the rest of this rests on.

**Sound effects are a third STANCE**, open to anyone, producing a part of its
own that the reader picks like a score.

This replaced a version where effects lived inside both the voice and the
score part. That version needed a precedence rule to decide who was heard when
two contributors had both noticed the same door — the composer, even when
their effects layer was empty — and it still had a case with no good answer:
three voice parts selected, all three having added the obvious effects, and
the reader hears the slam three times. Every fix for that was a second
invariant bolted next to the first.

Making it a part kind deletes the whole problem rather than answering it. A
reader picks **one** effects part or none, exactly as they pick one score or
none. There is nothing to arbitrate, because two effects layers can no more be
selected at once than two scores can.

What it buys, beyond the simplification:

- effects are **findable work**. "This comic has no effects yet" is a role
  somebody can take, listed in the contribute hub next to the uncast
  characters. Buried inside a voice part it was invisible.
- a person who only wants to do foley has a way in that does not require them
  to voice a character or write a score first.
- effects are **creditable**. A part kind has an owner, a title and a profile
  row; a corner of somebody else's part does not.
- read a comic with **no score at all** and still hear effects and dialogue,
  or swap the effects without touching the score, or the score without losing
  the effects. Every layer became independent of every other, which is the
  premise of the whole product applied one level down.

The cost is one more thing in the mix picker, and one more decision for a
reader who did not want to make it. That is answered the way the score already
answers it: a default that plays unless you say otherwise.

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

**And this is where the effects part kind pays off a second time.** The author
studio already writes three kinds of entry — dialogue, narration and
**sound effect** (`l.role === 'sfx'`). So the author is already describing
*where* an effect goes without recording one, exactly as they describe a
character's line without voicing it.

Which makes the whole model one sentence: **the author writes the script; each
kind of entry is filled by whoever took that stance.** A voice actor fills one
character's lines. A sound designer fills the sfx entries. A composer fills
the space between them. The link field belongs to the *entry*, so it is
authored once, by the author, and every contributor's take inherits the timing
relationship whether or not they ever meet.

An effects part with an empty entry filled is the same visible gap as an
uncast character — which is what makes "this comic has no effects yet" a
listable role in the contribute hub rather than a thing somebody has to think
of unprompted.

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
