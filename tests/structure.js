/* Can a second person — or a second agent — change this codebase without
   silently undoing a fix?

   THIS FILE EXISTS BECAUSE THE SAME BUG HAPPENED TWICE. `.btn.p:hover` was
   defined near the top of broadsheet.css and again 330 lines later with a
   different value. Same specificity, so source order decided it, and the
   later one won. A pass fixed the top one, shipped, and nothing changed on
   screen. A later pass fixed it again. Neither review caught it, because
   reading 480 lines of CSS and remembering what was set on line 137 is not
   something review does reliably.

   A test does it reliably. Everything here is mechanical: no judgement, no
   style opinions, just "is this codebase still shaped the way it says it is".

   Run it with `node tests/structure.js`. It needs nothing. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let bad = 0;
const ok = (cond, what, extra = '') => {
  console.log((cond ? '  ok  ' : '  FAIL  ') + what + (cond ? '' : '\n        ' + extra));
  if (!cond) bad++;
};

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = ['docs/design/final/broadsheet.css', 'tokens.css', 'palettes.css'];
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

/* Rules inside @media / @supports are SUPPOSED to override the base — that is
   what a breakpoint is. Only same-context declarations collide, so the
   at-rule bodies come out before anything is compared. */
function baseRules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < css.length) {
    if (css.startsWith('@media', i) || css.startsWith('@supports', i)) {
      let j = css.indexOf('{', i), d = 1; j++;
      while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
      i = j; continue;
    }
    out += css[i]; i++;
  }
  return [...out.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => [m[1].replace(/\s+/g, ' ').trim(), m[2]])
    .filter(([sel]) => sel && !sel.startsWith('@'));
}

/* THE PROPERTIES WHERE A SILENT OVERRIDE IS A BUG RATHER THAN A REFINEMENT.
   Two rules both setting `padding` on one selector is usually someone adding
   a breakpoint's worth of nuance. Two rules both setting `color` is a fight
   about what something looks like, and one of them is losing without knowing
   it — which is exactly the hover bug. */
const OWNED = ['color', 'background', 'background-color', 'border-color', 'box-shadow'];

console.log('one selector, one colour, one place');
for (const file of CSS) {
  const seen = new Map();
  for (const [sel, body] of baseRules(read(file))) {
    for (const one of sel.split(',').map(s => s.trim()).filter(Boolean)) {
      for (const decl of body.split(';')) {
        const c = decl.indexOf(':');
        if (c < 0) continue;
        const prop = decl.slice(0, c).trim();
        if (!OWNED.includes(prop)) continue;
        const key = one + ' :: ' + prop;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(decl.slice(c + 1).trim());
      }
    }
  }
  const clash = [...seen.entries()].filter(([, v]) => new Set(v).size > 1);
  ok(clash.length === 0,
    `${file} decides each selector's colour exactly once`,
    clash.map(([k, v]) => `${k}  ${v.join('  ->  ')}`).join('\n        '));
}

console.log('colour comes from the palette, not from hex');
/* A literal hex outside the palette is how the green scrim survived every
   theme change: the palette recoloured everything that asked it to, and the
   one value that did not ask stayed sage. Two files are allowed to hold raw
   colour, because they are where colour is defined. */
const SAGE = /#(0C130F|14221B|8FC0A4|ABC4B8|354D41|D1E1D9)\b/i;
for (const file of [...PAGES, 'docs/design/final/broadsheet.css']) {
  const src = read(file);
  ok(!SAGE.test(src), `${file} has no leftover sage`,
    (src.match(SAGE) || []).join(', '));
}
/* the entry-kind spines in the two studios are a deliberate exception and say
   so in a comment; everything else that paints must go through a token */
const HEX = /(?<!&)#[0-9a-fA-F]{3,8}\b/g;
for (const file of PAGES) {
  const style = (read(file).match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const hexes = [...new Set((style.match(HEX) || []))]
    .filter(h => !/^#(2F5FD0|7A3EA1|B26A00|1F7A6B|8FB0F2|C79BE4|E0A24A|6FC7B6)$/i.test(h));
  ok(hexes.length === 0, `${file} styles through tokens rather than literals`,
    hexes.join(', '));
}

console.log('every ESK code is unique and registered');
const errs = read('ERRORS.txt');
const registered = new Set([...errs.matchAll(/^ESK-(\d{4})/gm)].map(m => m[1]));
const dupReg = [...errs.matchAll(/^ESK-(\d{4})/gm)].map(m => m[1]);
ok(dupReg.length === registered.size, 'ERRORS.txt lists each code once',
  dupReg.filter((c, i) => dupReg.indexOf(c) !== i).join(', '));

const used = new Map();
for (const f of [...PAGES, 'platform.js', 'comments.js', 'api/sign.mjs', 'api/comic.mjs']) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  for (const m of read(f).matchAll(/ESK-(\d{4})/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(f);
  }
}
const unregistered = [...used.keys()].filter(c => !registered.has(c));
ok(unregistered.length === 0, 'every code raised in the app is in ERRORS.txt',
  unregistered.map(c => `ESK-${c} (${[...used.get(c)].join(', ')})`).join('\n        '));

/* A CODE MEANS ONE FAILURE, so ERRORS.txt describing it once is the whole
   guard — and that is the check above.

   There was a stricter check here that failed a code raised from more than
   one page, on the theory that a shared number means a collision. It was
   wrong, and usefully so: ESK-1005 is "platform.js did not boot", which every
   page raises because every page boots the platform, and the signer's 3xxx
   codes are shared by both upload paths on purpose. Sharing a code for the
   SAME condition is correct; the collision that actually happened — the
   contribution studio claiming 5060-5068 while comments already owned
   5060-5063 — is two DIFFERENT failures on one number, and no static check
   can tell those apart. Registering both in ERRORS.txt is what catches it,
   because the file cannot describe one number twice. */

console.log('the load order is the same on every page');
/* palette.js must run before the stylesheets paint or the page flashes the
   default theme; platform.js is a module and therefore always deferred, which
   is why nothing may read window.eski at parse time. Getting this wrong on
   one page is invisible until someone loads that page cold. */
for (const f of PAGES) {
  const src = read(f);
  if (!src.includes('palettes.css')) continue;
  const pal = src.indexOf('palette.js');
  const sheets = src.indexOf('palettes.css');
  ok(pal > -1 && pal < sheets, `${f} loads palette.js before palettes.css`);
}

console.log('nothing references a file that is not there');
for (const f of PAGES) {
  const src = read(f);
  const missing = [...src.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)]
    .map(m => m[1].split(/[?#]/)[0])
    /* A URL BUILT AT RUNTIME IS NOT A BROKEN LINK. Every page writes markup
       from template literals, so `src="${esc(c.cover)}"` appears in the
       source as an href that resolves to no file on disk — and it is not
       meant to. Only literal paths are checkable, which is still the ones
       that go stale: a stylesheet renamed, a script moved. */
    /* A POSITIVE FILTER, not a pile of exclusions. The source also contains
       regexes that MATCH hrefs — `/href="([^"]+)"/` reads as an href called
       `([^` — so listing things to skip is a losing game. Only strings shaped
       like an actual relative file path are checked. */
    .filter(u => /^[\w.\-]+(\/[\w.\-]+)*\.[a-z0-9]{2,5}$/i.test(u))
    .filter(u => !fs.existsSync(path.join(ROOT, u)))
    /* a rewrite target is a route, not a file */
    .filter(u => !/^(c|u)\//.test(u));
  ok(missing.length === 0, `${f} links only to files that exist`, missing.join(', '));
}

console.log('the map is current');
/* ARCHITECTURE.md is the first thing another agent reads. A map that has
   drifted is worse than none, so every top-level source file has to appear
   in it — which is a nudge to write a line about anything new. */
const arch = read('ARCHITECTURE.md');
const sources = [...PAGES, ...fs.readdirSync(ROOT).filter(f => /\.(js|css)$/.test(f))]
  .filter(f => f !== 'sw.js');
const unmapped = sources.filter(f => !arch.includes(f));
ok(unmapped.length === 0, 'every source file is described in ARCHITECTURE.md',
  unmapped.join(', '));

console.log(bad ? `\n${bad} FAILURES` : '\nstructure: all checks passed');
process.exit(bad ? 1 : 0);
