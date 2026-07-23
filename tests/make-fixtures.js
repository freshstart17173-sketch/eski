/* builds test fixtures: test.eski, test.cbz, test.pdf, loose wavs/pngs */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const JSZip = require('jszip');

const OUT = path.join(__dirname, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  return zlib.crc32 ? zlib.crc32(buf) >>> 0 : (() => { throw new Error('need node 20.15+'); })();
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      // vertical gradient so pages are visually distinct
      raw[o] = r; raw[o + 1] = Math.min(255, g + ((y / h) * 80) | 0); raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}
function wav(seconds, freq) {
  const sr = 8000, n = Math.round(sr * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 12000), i * 2);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * 2, 28);
  hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  return Buffer.concat([hdr, data]);
}
function pdf2pages() {
  // minimal 2-page pdf with a correct xref table
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]/Resources<<>>>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]/Resources<<>>>>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += String(o).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

(async () => {
  const colors = [
    [200, 80, 80], [80, 140, 200], [90, 180, 90],
    [220, 180, 60], [170, 90, 190], [90, 190, 180]
  ];
  const pages = colors.map((c, i) => png(100, 140, c));
  const wav1 = wav(1.0, 440), wav2 = wav(1.5, 660);
  fs.writeFileSync(path.join(OUT, 'a.wav'), wav1);
  fs.writeFileSync(path.join(OUT, 'b.wav'), wav2);
  pages.forEach((p, i) => fs.writeFileSync(path.join(OUT, `p${i + 1}.png`), p));
  fs.writeFileSync(path.join(OUT, 'test.pdf'), pdf2pages());

  // test.eski: 6 pages, 2 music tracks (p1, p4)
  const ez = new JSZip();
  pages.forEach((p, i) => ez.file(String(i + 1).padStart(3, '0') + '.png', p));
  ez.file('audio/01-a.wav', wav1);
  ez.file('audio/02-b.wav', wav2);
  ez.file('.eski/manifest.json', JSON.stringify({
    version: 2, created: new Date().toISOString(), app: 'eski',
    meta: { title: 'test comic', creator: 'fixture', description: null,
      direction: 'ltr', cover: '001.png' },
    player: { volume: 80, crossfade: 0.2, loopMode: 'next',
      playbackMode: 'sync', readingMode: 'pages' },
    tracks: [
      { id: 't1', title: 'first song', source: 'local', file: 'audio/01-a.wav',
        type: 'music', volume: 100, sync: { from: 1, start: 0 } },
      { id: 't2', title: 'second song', source: 'local', file: 'audio/02-b.wav',
        type: 'music', volume: 100, sync: { from: 4, start: 0 } }
    ],
    pages: { count: 6, naming: 'auto' }
  }, null, 2));
  fs.writeFileSync(path.join(OUT, 'test.eski'),
    await ez.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

  // queue.eski: two tracks share page 1 (a queue), first has an out point
  const qz = new JSZip();
  pages.slice(0, 3).forEach((p, i) => qz.file(String(i + 1).padStart(3, '0') + '.png', p));
  qz.file('audio/01-a.wav', wav1);
  qz.file('audio/02-b.wav', wav2);
  qz.file('.eski/manifest.json', JSON.stringify({
    version: 2, created: new Date().toISOString(), app: 'eski',
    meta: { title: 'queue comic', creator: 'fixture', description: null,
      direction: 'ltr', cover: '001.png' },
    player: { volume: 80, crossfade: 0.2, loopMode: 'next',
      playbackMode: 'sync', readingMode: 'pages' },
    tracks: [
      { id: 'q1', title: 'first song', source: 'local', file: 'audio/01-a.wav',
        type: 'music', volume: 100, sync: { from: 1, start: 0, end: 0.5 } },
      { id: 'q2', title: 'second song', source: 'local', file: 'audio/02-b.wav',
        type: 'music', volume: 100, sync: { from: 1, start: 0 } }
    ],
    pages: { count: 3, naming: 'auto' }
  }, null, 2));
  fs.writeFileSync(path.join(OUT, 'queue.eski'),
    await qz.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

  // big.eski: tall pages, to catch the reader fit/overflow regression
  const bz = new JSZip();
  [[200,80,80],[80,140,200],[90,180,90]].forEach((c,i)=>bz.file(String(i+1).padStart(3,'0')+'.png', png(1000,1500,c)));
  bz.file('.eski/manifest.json', JSON.stringify({
    version: 2, app: 'eski', meta: { title: 'big comic', cover: '001.png', direction: 'ltr' },
    player: { volume: 80, crossfade: 1, loopMode: 'loop', playbackMode: 'sync', readingMode: 'pages' },
    tracks: [], pages: { count: 3, naming: 'auto' }
  }));
  fs.writeFileSync(path.join(OUT, 'big.eski'), await bz.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

  // oneshots.eski: bg music on p1 + two one-shots on p2 (for dubbing/sfx)
  const oz = new JSZip();
  [[200,80,80],[80,140,200],[90,180,90]].forEach((c,i)=>oz.file(String(i+1).padStart(3,'0')+'.png', png(120,170,c)));
  oz.file('audio/01-bg.wav', wav(2.0, 300));
  oz.file('audio/02-o1.wav', wav(0.4, 600));
  oz.file('audio/03-o2.wav', wav(0.4, 800));
  oz.file('.eski/manifest.json', JSON.stringify({
    version: 2, app: 'eski', meta: { title: 'dub comic', cover: '001.png', direction: 'ltr' },
    player: { volume: 80, crossfade: 0.2, loopMode: 'loop', playbackMode: 'sync',
      readingMode: 'pages', oneshotLoop: false },
    tracks: [
      { id: 'm1', title: 'bg', source: 'local', file: 'audio/01-bg.wav', type: 'music', volume: 100, sync: { from: 1, start: 0 } },
      { id: 'o1', title: 'line one', source: 'local', file: 'audio/02-o1.wav', type: 'oneshot', volume: 100, sync: { from: 2, start: 0 } },
      { id: 'o2', title: 'line two', source: 'local', file: 'audio/03-o2.wav', type: 'oneshot', volume: 100, sync: { from: 2, start: 0 } }
    ], pages: { count: 3, naming: 'auto' }
  }));
  fs.writeFileSync(path.join(OUT, 'oneshots.eski'), await oz.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

  // a library/ folder with a couple of eskis to read covers from
  const libDir = path.join(OUT, 'library');
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(path.join(OUT, 'test.eski'), path.join(libDir, 'test-comic.eski'));
  fs.copyFileSync(path.join(OUT, 'queue.eski'), path.join(libDir, 'queue-comic.eski'));

  // test.cbz: 3 pages, no manifest
  const cz = new JSZip();
  pages.slice(0, 3).forEach((p, i) => cz.file(`page-${i + 1}.png`, p));
  fs.writeFileSync(path.join(OUT, 'test.cbz'),
    await cz.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

  console.log('fixtures ok:', fs.readdirSync(OUT).join(', '));
})();
