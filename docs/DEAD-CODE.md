# Dead / now-unused code — reading list for the next agent

Small file, one job: track code that is **no longer used but deliberately left in place**, so the
next agent doesn't (a) waste time wiring it back up, or (b) delete it without knowing why it was
kept. If you remove one of these, delete its row here too. Newest first.

## 2026-08-29 — upload rewrite (`create_work` RPC)

### 1. `register_blob(p_sha, p_bytes)` RPC — unused by the app now
- **Where:** `schema-19-register-blob.sql`, live migration `p10_register_blob`. Function still
  exists in the DB and still granted to `authenticated`.
- **Why unused:** the upload write moved to the atomic `create_work` RPC
  (`schema-23-create-work-rpc.sql`), which does its **own** `insert into media_blobs … on conflict
  do nothing`. Nothing in `app/` calls `register_blob` anymore (grep confirms zero callers).
- **Why kept, not dropped:** it's harmless (idempotent, SECURITY DEFINER, no side effects beyond a
  blob row) and dropping it means another migration + a schema-file edit for zero user benefit.
  Leave it unless you're doing a deliberate schema cleanup. If you drop it: remove the function,
  add a migration, delete `schema-19-register-blob.sql`, and delete this row.

### 2. `app/screens/upload.js doPost` still carries its own inline hash→sign→PUT — duplicates `app/upload-r2.js uploadBlobs`
- **Where:** `app/screens/upload.js` — the `sha256Hex` helper + the `/api/sign` fetch + the R2 `PUT`
  loop inside `doPost`. The shared primitive `uploadBlobs()` in `app/upload-r2.js` does the exact
  same three steps and is what the profile photo/banner + server icon/cover paths use.
- **Why it's still duplicated:** `app/upload-r2.js`'s own header note said not to fold the upload
  sheet onto it "until uploads are confirmed live end-to-end." Uploads were **totally broken** until
  the 2026-08-29 `create_work` fix, and that fix was already a big change to the load-bearing path —
  refactoring the sign/PUT half in the same pass was too much risk at once. So `doPost` keeps its
  copy for now; `create_work` only replaced the **DB-write** half (register+works+placement+tags).
- **Next step (cleanup, not urgent):** once the owner confirms the live R2 round-trip works (QA
  §12), fold `doPost`'s hash/sign/PUT block onto `uploadBlobs()` and delete the duplicate. Keep
  `doPost`'s folder-tree build + the per-file `create_work` calls. Then delete this row.

### 3. `KIND` map in `upload.js` — repurposed, NOT dead (note the semantics change)
- It used to be an **allowlist** (an ext not in it was rejected). As of "accept every file type,"
  it is **only a render hint** (image/audio/video/text; anything else → `other`). Don't "restore"
  rejection by re-reading it as an allowlist. The signer (`api/sign.mjs`) now validates ext **shape**
  (`EXT_RE = /^[a-z0-9]{1,16}$/`), which is the real security boundary — the old `EXT` Set is gone.

### 4. `visToDb` — no longer imported by `upload.js`, still used elsewhere
- `app/data.js` still uses/exports `visToDb` (e.g. `setVisibility`). It was only removed from
  `upload.js`'s import because `create_work` normalizes visibility server-side. **Not dead.**

---

## Notes on the biggest open trap (not dead code, but read before touching writes)

The `works` table's direct `INSERT` fails live with `42501` even though its RLS `WITH CHECK`
evaluates TRUE — see `docs/VERIFICATION.md` "🚨 CORRECTION (2026-08-29)" and `docs/TODO.md` K8. The
root mechanism is still unexplained; the workaround is a `SECURITY DEFINER` RPC. **Don't reintroduce
a direct client `INSERT into works`** — route new writes through `create_work` or a new RPC.
