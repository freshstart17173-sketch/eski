---
name: google-docs-style
description: >-
  Write or edit product/feature documentation in the style of Google's
  developer documentation style guide — conversational second-person voice,
  active present tense, task-based structure, one term per concept, accessible
  headings and link text. Use whenever you're writing user- or developer-facing
  docs, reference pages, how-to guides, release/QA checklists, or feature specs
  meant to be read (README sections, docs/*.md, a functional spec), or when the
  user asks for documentation "in Google's style" or that reads clearly for a
  global audience. Not for marketing copy or in-code comments.
---

# Writing docs in Google's developer-documentation style

This skill codifies the parts of the [Google developer documentation style
guide](https://developers.google.com/style) that matter most for writing clear,
consistent, task-focused documentation. Follow it when authoring or revising any
prose document meant to be *read as documentation* — a feature reference, a
how-to, an onboarding guide, a QA/release checklist, a functional spec.

When it conflicts with a project's own house rules (a `CLAUDE.md`, a canon file,
an existing doc's established conventions), **the project wins** — this skill is
the default, not an override. In this repo specifically, `docs/CANON.md` is the
source of truth for *what is true*; this skill governs *how you write it down*.

## The workflow

1. **Know the reader and the job.** Before writing a section, state to yourself
   who reads it and what they're trying to do. Documentation is task-based:
   organize around what the reader wants to accomplish, not around how the system
   is built internally.
2. **Find the existing name before you invent one.** Every concept has exactly
   one canonical term. Search the codebase and existing docs for it and reuse it
   verbatim. Introducing a synonym is a defect (see [Terminology](#terminology)).
3. **Draft against the checklists below** — voice, structure, procedures,
   formatting, accessibility.
4. **Self-edit with the word list.** Do a pass specifically for the banned and
   preferred words in [Word choices](#word-choices).
5. **Read it once as the reader.** Cut anything that doesn't help them do the
   job.

## Voice and tone

- **Second person.** Address the reader as "you." Don't use "we" for the reader's
  actions ("we then click save" → "click **Save**"). Reserve "we"/"the team" for
  genuine authorial statements, and prefer to avoid it.
- **Active voice.** Make the actor the subject. "The server validates the token,"
  not "the token is validated." Passive voice hides who does what — the single
  most common clarity bug in specs.
- **Present tense.** "The upload starts," not "the upload will start." Reserve
  future tense for things that genuinely happen later.
- **Imperative for instructions.** Steps begin with a verb: "Select," "Enter,"
  "Confirm." Don't pad with "you should" or "you can" when you mean "do this."
- **Conversational but not padded.** Friendly and plain. Cut throat-clearing
  ("It's worth noting that," "As you can see," "Simply," "Basically").
- **Neutral, factual claims.** Describe what the product does, not how great it
  is. No "powerful," "seamless," "robust," "blazing-fast."

## Clarity and structure

- **Descriptive headings, sentence case.** Headings say what the section is about
  ("Uploading a file," "How visibility works"), not "Introduction." Capitalize
  only the first word and proper nouns.
- **Front-load.** Put the most important sentence first, in the paragraph and in
  the section. Readers scan; don't bury the answer.
- **One idea per paragraph.** Short paragraphs. Break a wall of text into a list
  or a table.
- **Lists:** numbered for sequential steps or ranked items; bulleted for
  unordered sets. Keep list items parallel in grammar (all start with a verb, or
  all noun phrases). Introduce a list with a lead-in sentence ending in a colon.
- **Tables for reference.** When you're mapping many items across the same few
  attributes (element → behavior → data → states), use a table with a clear
  header row. Keep cells terse.
- **Define before you use.** Expand an acronym or introduce a term on first use,
  then use it consistently.
- **Cross-reference by descriptive link text.** Never "click [here]" or "see
  [this]." The link text names the target: "see [How visibility works]." This is
  both a style rule and an accessibility rule.

## Terminology

- **One canonical term per concept**, identical in UI copy, code, and docs. If a
  term already exists, edit it where it lives; don't coin a near-synonym nearby.
  A second name for one thing is the prose version of a duplicated definition —
  the reader can't tell whether two words mean two things.
- **Kill aliases explicitly** when a doc's job is to be a contract: name the words
  you're *not* using so a later writer doesn't reintroduce them.
- **Consistent capitalization** of product nouns and UI labels. If the button
  says **Save**, write it **Save** — match the interface's own casing.

## Writing procedures

Document a task as a numbered procedure the reader can follow start to finish:

- State any **prerequisites** first ("You need admin permission to…").
- One action per step. If a step has a visible result worth confirming, state it
  ("The file appears in the current folder.").
- Name UI elements in **bold** and use the exact label.
- Note the outcome at the end, and where relevant the **empty / error / disabled**
  states — a good functional doc says what happens when the happy path doesn't.
- For behavior that branches by role or state, use a table or an explicit
  "If X, then Y" rather than nested prose.

## Formatting conventions

- **Bold** for UI labels and element names the reader acts on.
- `Code font` for literals: table/column names, API routes, enum values, file
  names, code identifiers. Never style a normal English word as code for emphasis.
- Sentence case in prose and headings. Let the product's own style guide govern
  the casing *inside* UI copy.
- Use real Markdown structure (headings, lists, tables) so the document is
  navigable and accessible, not one long scroll.

## Accessibility

- Descriptive headings and link text (above) — screen-reader users navigate by
  them.
- Don't rely on direction or color alone ("the button on the right," "the red
  text"). Name the thing.
- Provide alt text / captions for any image or diagram, describing its content.
- Keep sentences short and plain for readers translating or reading in a second
  language: avoid idioms, cultural references, and figures of speech.

## Word choices

Prefer the plain, specific word. Common fixes:

| Avoid | Use |
|---|---|
| simply, just, easy, obviously, of course | (delete — if it's easy, saying so doesn't help; if it isn't, it's wrong) |
| please (in instructions) | (delete — instructions are direct, not requests) |
| in order to | to |
| utilize, leverage (as a verb) | use |
| allows you to, enables you to | you can / lets you |
| powerful, seamless, robust, rich, blazing-fast | (delete — describe the actual behavior) |
| will (habitual) | present tense: "opens," not "will open" |
| e.g. / i.e. (in running prose) | for example / that is |
| and/or | pick one, or "A, B, or both" |
| he / she (generic) | they, or rewrite |
| whitelist / blacklist | allowlist / denylist (or allow-list / deny-list) |
| kill (a feature, in user-facing prose) | remove, retire (internal contract docs may keep "kill") |

Keep sentences under ~25 words where you can. Split a sentence with two "and"s
or a semicolon into two sentences.

## Quick self-check before finishing

- [ ] Second person, active voice, present tense throughout.
- [ ] Every heading is descriptive and in sentence case.
- [ ] Each concept uses its one canonical name; no stray synonyms.
- [ ] Procedures are numbered, one action per step, UI labels in bold.
- [ ] Link text describes its target; nothing says "here."
- [ ] No banned words (simply, just, please, powerful, in order to, …).
- [ ] Reference-heavy material is in tables, not prose.
- [ ] Error / empty / disabled states are documented, not only the happy path.
