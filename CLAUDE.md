Solo project, one user. There's no staging — changes go straight to `main` and straight to prod (Vercel deploys `main` directly). No issue tracker, no triage labels, no wayfinder maps: work is tracked in `ROADMAP.md` and in conversation, not GitHub Issues.

## Read this before editing

**[`ARCHITECTURE.md`](ARCHITECTURE.md) says what each file owns.** Read it
first. There is no build step and every page holds its own behaviour inline,
so nothing mechanically stops you from defining the same thing twice — the
discipline has to come from knowing where a thing already lives.

The failure mode this project actually has is **not** broken features. It is a
correct fix being silently undone. `.btn.p:hover` was defined near the top of
`broadsheet.css` and again 330 lines later with a different value; source order
decided it, the later one won, and it was "fixed" twice with no visible change
either time. Assume that trap is still out there in some other form.

So, before you change something:

- **Search for the thing you are about to define.** If a selector, a token, an
  ESK code or a helper already exists, edit it where it is rather than adding
  a second one nearby.
- **Colour and hover for shared controls live in one place** — the interaction
  section at the foot of `broadsheet.css`. Never in a page's own `<style>`.
- **Every colour comes from `palettes.css`.** A hex literal in a page is how
  the green scrim survived eighteen themes.
- **A new failure needs an `ESK-####` and a line in `ERRORS.txt`.** The file
  is what stops two features claiming one number.

## Before you say it's done

```
node tests/structure.js    # nothing runs it for you; it is the one that
node tests/cache.js        # catches a fix being overwritten
node tests/loudness.js
node tests/smoke.js
node tests/errors.js
node tests/recording.js
node tests/onboarding.js
node tests/viewer-fit.js   # needs the folder served on :8940
```

Anything visual also wants `node tests/shots.js` and the **`eski-ui-audit`**
skill, which knows which surface × state × theme combinations hide bugs. A
screenshot of a page at rest in the default theme is the easy half.

## Writing style

Comments explain **why**, especially why an obvious alternative is wrong —
that is what stops the next pass from "simplifying" a deliberate choice back
into a bug. Sentence case in prose; the UI's own case rules are in
`docs/design/STYLE.md`.
