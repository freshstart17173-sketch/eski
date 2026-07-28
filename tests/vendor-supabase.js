/* Bundle the supabase client into vendor/supabase.js, which the app imports
   relatively instead of reaching for a cdn at runtime.
     node tests/vendor-supabase.js

   WHY THIS EXISTS: https://esm.sh/@supabase/supabase-js@2 answers with a 458
   byte re-export that points at the real bundle, and jsdelivr's +esm build
   fans out into five more sub-imports. Either way every page that touches data
   waited on two or more chained requests to a host we do not control before it
   could run its first query, and platform.js gates the whole app behind that.
   That is why home was slow with one comic on it.

   The output is committed on purpose: Vercel then serves it as a plain static
   asset with everything else, and deploying still needs no build step. Re-run
   this after bumping the version in package.json. */
const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, '..', 'vendor', 'supabase.js');
fs.mkdirSync(path.dirname(out), { recursive: true });

/* bundle a re-export rather than require.resolve()'s entry: that resolves to
   the CJS build, and bundling it produced a module whose createClient was
   undefined. an esm entry lets esbuild pick the package's module field and
   keeps the named export. */
const entry = path.join(__dirname, '.supabase-entry.mjs');
fs.writeFileSync(entry, "export { createClient } from '@supabase/supabase-js';\n");

build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  outfile: out
}).then(async () => {
  fs.unlinkSync(entry);
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  const src = fs.readFileSync(out, 'utf8');
  // a bundle that still imports something is not a bundle
  const remaining = [...src.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map(m => m[1]);
  if (remaining.length) {
    console.error('NOT self-contained, still imports:', [...new Set(remaining)]);
    process.exit(1);
  }
  // and a bundle without the export is worse than no bundle, because it fails
  // silently as "signed out" rather than as an error
  const mod = await import('file://' + out.replace(/\\/g, '/'));
  if (typeof mod.createClient !== 'function') {
    console.error('bundled, but createClient is', typeof mod.createClient);
    process.exit(1);
  }
  console.log(`vendor/supabase.js: ${kb} KB, self-contained, createClient ok`);
}).catch(e => { console.error(e); process.exit(1); });
