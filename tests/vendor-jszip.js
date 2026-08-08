/* Copy jszip into vendor/jszip.js, which the app loads relatively instead of
   reaching for cdnjs at runtime.
     node tests/vendor-jszip.js

   WHY THIS EXISTS. It was a render-blocking <script> from a third-party origin
   in the head of read.html, index.html and studio.html: a DNS lookup, a TLS
   handshake and a round trip to a host we do not control, before any of those
   pages could paint. And in the reader it is usually not even used — a
   published comic (?read=db:…) never opens a zip.

   NO BUNDLER. Unlike supabase, jszip ships a finished browser build that
   defines a global, which is exactly what the pages want; running it through
   esbuild would only rewrite it into a module none of them can use. So this is
   a copy with a provenance header, not a build.

   The output is committed on purpose: Vercel serves it as a static asset with
   everything else, and deploying still needs no build step. Re-run after
   bumping the version in package.json. */
const fs = require('fs');
const path = require('path');

const pkg = require('jszip/package.json');
const src = require.resolve('jszip/dist/jszip.min.js');
const out = path.join(__dirname, '..', 'vendor', 'jszip.js');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out,
  `/* jszip ${pkg.version} — vendored by tests/vendor-jszip.js. Do not edit. */\n` +
  fs.readFileSync(src, 'utf8'));

console.log(`vendor/jszip.js  <-  jszip ${pkg.version}  ` +
            `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
