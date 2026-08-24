// upload-r2.js — the browser→R2 upload primitive (hash → presign → PUT), shared by
// small-file uploads (profile photo/banner, P5.19). Content-addressed: the object KEY is
// derived from the sha256, and api/sign.mjs re-derives it server-side (never trusts the
// client), so a caller can only ever write <sha>.<ext> — no path choice, no escape.
//
// NOTE — intentional split: app/screens/upload.js (the multi-file post sheet) still carries
// its own inline copy of this exact flow. That path is load-bearing and hasn't been R2
// round-trip-verified on preview yet, so this helper does NOT refactor it — destabilising the
// primary upload to save one duplication is the wrong trade right now. Once uploads are
// confirmed live end-to-end, fold upload.js's doPost onto uploadBlobs() and delete its copy.

import { rawSession } from "./supabase.js";

export async function sha256Hex(file) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
// the stored object key (what mediaUrl/avatarUrl prefix with the R2 public base)
export function keyFor(hash, ext) { return `${hash.slice(0, 2)}/${hash}.${ext}`; }

// Upload one or more File objects to R2. Returns [{ file, hash, ext, bytes, key }]. Throws
// with a human message on a signer or PUT failure (the same errors the upload sheet shows).
export async function uploadBlobs(files, { onProgress } = {}) {
  onProgress?.("Hashing…");
  const hashed = await Promise.all([...files].map(async (f) => ({ file: f, hash: await sha256Hex(f), ext: extOf(f.name), bytes: f.size })));
  onProgress?.("Getting upload URLs…");
  const token = rawSession()?.access_token;
  const signRes = await fetch("/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ files: hashed.map((h) => ({ hash: h.hash, ext: h.ext })) }),
  });
  const signJson = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(signJson.error || `signer said ${signRes.status}`);
  onProgress?.("Uploading…");
  await Promise.all(hashed.map((h, i) => fetch(signJson.files[i].url, {
    method: "PUT", body: h.file, headers: { "content-type": h.file.type || "application/octet-stream" },
  }).then((r) => { if (!r.ok) throw new Error(`R2 PUT failed (${r.status}) — is the bucket CORS set?`); })));
  return hashed.map((h) => ({ file: h.file, hash: h.hash, ext: h.ext, bytes: h.bytes, key: keyFor(h.hash, h.ext) }));
}
