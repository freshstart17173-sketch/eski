// app/hash.js — streaming SHA-256 for large-file uploads (K11).
//
// WHY THIS EXISTS (do not "simplify" it back to crypto.subtle.digest): WebCrypto has
// no incremental digest — no update()/finalize() — so crypto.subtle.digest("SHA-256", …)
// needs the WHOLE file as one ArrayBuffer in memory. `await file.arrayBuffer()` on a
// multi-GB file allocates the entire file on the JS heap: a folder of stems or a DAW
// bounce freezes the tab and can OOM it. So we hash the file in chunks with a pure-JS
// incremental SHA-256 — read file.slice(off, off+CHUNK) one slice at a time, update the
// running state, drop the slice — so live memory is ~one chunk, not the whole file.
//
// The digest is byte-identical to crypto.subtle's SHA-256 (verified against the FIPS
// "abc" vector and random buffers cross-checked with crypto.subtle in a node harness),
// so an already-uploaded blob still dedups by the exact same `<sha>.<ext>` R2 key — the
// signer derives the key from this hash, so a mismatch would double-store every file.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// Incremental SHA-256. Feed bytes with update(Uint8Array) any number of times, then read
// the lowercase hex digest ONCE with hex() — hex() writes the padding, so it is single-use.
class Sha256 {
  constructor() {
    this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    this.buf = new Uint8Array(64);   // partial (<64B) block carried between updates
    this.bufLen = 0;
    this.bytes = 0;                  // total message bytes, for the length pad
    this.w = new Uint32Array(64);    // message-schedule scratch (reused every block)
  }
  // Process one 64-byte block at offset p of data (a Uint8Array).
  _block(data, p) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++) w[i] = (data[p + i * 4] << 24) | (data[p + i * 4 + 1] << 16) | (data[p + i * 4 + 2] << 8) | data[p + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  update(data) {
    this.bytes += data.length;
    let off = 0;
    // Top up a carried partial block first.
    if (this.bufLen) {
      while (off < data.length && this.bufLen < 64) this.buf[this.bufLen++] = data[off++];
      if (this.bufLen === 64) { this._block(this.buf, 0); this.bufLen = 0; }
    }
    // Process full 64-byte blocks straight out of data (no copy).
    while (off + 64 <= data.length) { this._block(data, off); off += 64; }
    // Carry the remainder for next time.
    while (off < data.length) this.buf[this.bufLen++] = data[off++];
  }
  hex() {
    // Append 0x80, zero-pad so the length lands at 56 mod 64, then the 64-bit BE bit length.
    const bitLen = this.bytes * 8;                       // exact to 2^53 — far beyond any file size
    const pad = this.bufLen < 56 ? 56 - this.bufLen : 120 - this.bufLen;
    const tail = new Uint8Array(pad + 8);
    tail[0] = 0x80;
    const hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    tail[pad] = (hi >>> 24) & 0xff; tail[pad + 1] = (hi >>> 16) & 0xff; tail[pad + 2] = (hi >>> 8) & 0xff; tail[pad + 3] = hi & 0xff;
    tail[pad + 4] = (lo >>> 24) & 0xff; tail[pad + 5] = (lo >>> 16) & 0xff; tail[pad + 6] = (lo >>> 8) & 0xff; tail[pad + 7] = lo & 0xff;
    this.update(tail);                                   // flushes the final block(s)
    let out = "";
    for (let i = 0; i < 8; i++) out += (this.h[i] >>> 0).toString(16).padStart(8, "0");
    return out;
  }
}

// Hash a File/Blob in CHUNK-sized slices — never the whole file at once. onProgress(bytesRead)
// fires after each slice so the caller can drive the progress bar during the (slow, for a big
// file) hashing phase. Returns the lowercase hex SHA-256.
export async function sha256File(file, onProgress) {
  const CHUNK = 8 * 1024 * 1024;   // 8 MB — throughput-friendly, but a small, bounded heap cost
  const h = new Sha256();
  let off = 0;
  while (off < file.size) {
    const end = Math.min(off + CHUNK, file.size);
    // slice() is a cheap view; arrayBuffer() materialises just this window. `buf` goes out of
    // scope each iteration, so the GC reclaims the chunk before the next slice is read.
    const buf = new Uint8Array(await file.slice(off, end).arrayBuffer());
    h.update(buf);
    off = end;
    onProgress && onProgress(off);
  }
  return h.hex();
}

// Run fn over items with at most `limit` in flight at once, preserving result order. Used to cap
// how many files hash / PUT simultaneously — Promise.all over a whole folder would start every
// file at once (unbounded memory + connections). fn receives (item, index).
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker));
  return results;
}
