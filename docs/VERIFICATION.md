# VERIFICATION — how we actually prove eski works

This file exists because of a real, recurring failure: tests that pass but don't
correlate with the live site, and a harness that reported **the same insert as
FAIL and then PASS on identical inputs**. An unreliable test is worse than no
test — it burns trust and hides real bugs. This document is the method for
verifying eski **reliably**, the traps that produce false results, and the
dated catalogue of what is actually proven.

**If you are a new agent: read the "Backend method" section before you run a
single RLS/write test. The `auth.uid()` trap below will lie to you otherwise.**

---

## The two halves of the problem

- **Backend** (Supabase Postgres: schema, constraints, triggers, RLS, RPCs) —
  verifiable *from this sandbox* via the Supabase MCP (`execute_sql`), **if** you
  avoid the trap below. This is the reliable half.
- **Frontend** (the vanilla-JS SPA rendering + wiring against the live API) —
  **not** reachable from the sandbox (egress is blocked to `preview.eski.lol`).
  The demo path (`?demo=1`) renders fixtures with no network, so a demo
  screenshot proves *layout*, never *live data flow*. The live-only gaps need
  the owner (or the frontend-visualqa tool) to run against the deployed site.

---

## Backend method (Supabase MCP) — USE THIS, ALWAYS

### Simulating an authenticated user under RLS

To run a statement as a specific signed-in user with RLS enforced (not as the
service role, which bypasses RLS):

```sql
perform set_config('request.jwt.claims',
  json_build_object('sub', <user-uuid>, 'role','authenticated')::text, true);
set local role authenticated;
-- ... the statement under test ...
reset role;
```

`auth.uid()` reads `request.jwt.claims->>'sub'`, so this makes the session *be*
that user. `member_of()`, `has_perm()`, `can_read_work()` etc. all resolve
correctly under it. **Always `reset role` in the exception handler too** — the
MCP connection is pooled and leaks role/GUC state between calls (see trap #2).

### ⚠️ TRAP #1 — the `auth.uid()` InitPlan is non-deterministic here (the big one)

**An RLS `INSERT ... WITH CHECK` whose predicate compares a column to inline
`auth.uid()` (e.g. `author_id = (select auth.uid())`) will return `42501`
sometimes and succeed other times — on identical inputs — over the MCP
connection.** This is NOT a bug in the app. It is plpgsql/PostgREST plan-caching
of the `(select auth.uid())` InitPlan across the pooled connection: the cached
plan can carry a *stale/empty* auth.uid, so the check evaluates against `NULL`
and fails. Proven exhaustively (2026-08-29):

- `works.insert public` **passed** in an isolated block, **failed** in the full
  harness, on the exact same row.
- In one single block, `works.insert private` **passed** while `public` and
  `server` **failed** — same policy path, same user.
- A stripped temp table with only `with check (author_id = (select auth.uid()))`
  **failed** in one MCP call and **passed** in the next.
- Meanwhile the predicate evaluated to `TRUE` every time when computed by hand
  in the same authenticated context (`author_id = uid` ✓, `member_of` ✓,
  `has_perm` ✓).

> ### 🚨 CORRECTION (2026-08-29) — this trap masked a REAL, total upload failure
> The "don't trust a 42501 on `works.insert`" rule above is dangerous when read as
> "the write path is fine." It was **not** fine: on the live preview build **every**
> `works` INSERT failed with 42501 and **zero work rows had ever been created for any
> user** — uploads were completely broken while pfp/banner (a profile `UPDATE`, which
> is a silent 0-row no-op under RLS, not an error) *looked* like they worked. The
> inline `col = auth.uid()` INSERT check is unreliable **live**, not only over MCP.
> **The lesson:** a role-sim 42501 is inconclusive, but a live 42501 **plus a
> production row count of 0** (`select count(*) from works`) is a real, confirmed
> bug — always check the actual table, not just the harness. **The fix:** the upload
> write is now the atomic `SECURITY DEFINER` RPC `create_work` (schema-23), the
> reliable path in the table below — do the same for any other load-bearing inline-uid
> INSERT rather than trusting that it "should" pass.

**What is reliable vs not:**

| Policy shape | Reliable over MCP? | Why |
|---|---|---|
| Gated by a `SECURITY DEFINER` helper (`can_post_channel`, `can_write_work`, `member_of`, `has_perm`, `can_read_work`) | ✅ deterministic | the function reads `auth.uid()` at call-time, not as a cached InitPlan |
| A `SECURITY DEFINER` RPC (`pin_message`, `toggle_reaction`, `create_folder`, `mark_channel_read`, `add_tag`, `add_friend`, …) | ✅ deterministic | same reason |
| Pure inline `col = auth.uid()` INSERT check (`works`, `placement`, `content_tags`, `saved_items`, `starred_items`, `share_links`, `comments`) | ❌ **flaky — do not trust a 42501** | cached InitPlan trap |

**How to verify the flaky ones instead (do all three):**

1. **Static analysis.** Read the `WITH CHECK` (`select ... from pg_policies`).
   Confirm it is satisfiable for the actor the app uses. The app always sets the
   ownership column to the session user (`author_id: me.id`, `placed_by: me.id`,
   `user_id: user.id`), so `col = auth.uid()` is tautologically satisfied. The
   only non-trivial parts are the `SECURITY DEFINER` gates — test *those*
   directly (they're reliable).
2. **Service-role schema check.** Insert the *exact row shape the frontend
   sends* as the service role (`reset role`). RLS is bypassed, but every
   constraint, trigger, FK, and side-effect trigger still fires — so this
   proves the row is well-formed (right columns, valid enum/check values, blob
   FK satisfied, storage meter bumps). This is deterministic. Roll it back.
3. **The live PostgREST path is the ground truth.** Real uploads through the
   deployed site exercise the real RLS with a real JWT (no InitPlan caching
   trap). When the owner reports an upload works, that's the authoritative
   signal for these policies.

### ⚠️ TRAP #2 — the MCP `execute_sql` connection is pooled; state leaks

`set local role` / `set_config(..., true)` are transaction-local, but the
connection is reused across calls and prior state can bleed in. Always:
`reset role` first thing and in every exception handler; keep a whole test in
**one** `do $$ ... $$` block; don't rely on a GUC set in a previous call.

### ⚠️ TRAP #3 — cascading nulls fake failures

If test A captures an id (`returning id into wid`) and A fails, every later test
using `wid` fails too — with misleading errors (`23502 null value in work_id`,
or a `42501` on `can_read_work(NULL)`). Those are **not** independent results.
Give each test its own valid prerequisites, or read the earlier failure first
and discount everything downstream of it. Use `EXECUTE format(...)` for inline
inserts (an uncached plan dodges trap #1 *more often* but not reliably — still
apply the three-way method above).

### Rolling back / not polluting live data

The live DB currently holds only real accounts and their servers (0 works, 0
blobs — keep it that way). Wrap the whole harness in a `do $$ ... $$` block that
ends with `raise exception E'RESULTS:%', res;` — the exception rolls the
transaction back, so nothing persists, and the results come back in the error
message. Never leave test rows behind. If you ever insert blobs outside a
rollback, clean orphans: `delete from media_blobs mb where not exists (select 1
from works w where w.blob_sha = mb.sha256);`

---

## Backend catalogue — verified 2026-08-29 (dexter, owner of "test server")

Reliable results (SECURITY DEFINER-gated live tests + service-role schema
checks + static analysis of the inline policies):

| Path | Method | Result |
|---|---|---|
| `register_blob(sha,bytes)` rpc | live authenticated | ✅ PASS |
| `works` insert public / private / server | service-role shape + static | ✅ row accepted; check constraint allows `public/personal/private/server` (post-p12) |
| `placement` (server file → channel) | service-role chain | ✅ accepted |
| `content_tags`, `saved_items`, `starred_items`, `share_links` | service-role chain | ✅ accepted |
| `comments` insert | service-role + schema | ✅ `context` defaults to `'public'` (check constraint requires exactly `'public'`); frontend omits it → correct |
| `messages` insert (own channel) | live authenticated (`can_post_channel` gate) | ✅ PASS |
| `pin_message()` / `toggle_reaction()` | live authenticated rpc | ✅ PASS |
| `mark_channel_read()` | live authenticated rpc | ✅ PASS |
| `create_folder()` | live authenticated rpc | ✅ PASS (returns a `folders` row — call with `perform`, not `:= uuid`) |
| `post_comment()` (K8) | live authenticated rpc | ✅ PASS — author of a readable work may comment; a non-member/non-friend is refused. Replaces the direct `comments` insert (its `cmt_insert` check is a complex inline-uid friend/author gate, the works-class risk). |
| `profiles.update` (own) | live authenticated | ✅ PASS |
| `save_folders` insert | live authenticated | ✅ PASS |
| `works_blob_meter` trigger | service-role side-effect | ✅ storage_meters bumped (user & server) on insert |

Inline `col = auth.uid()` INSERT policies (`works`, `placement`,
`content_tags`, `saved_items`, `starred_items`, `share_links`, `comments`):
**verified by static analysis + service-role shape check + live upload, NOT by
live-insert simulation** (trap #1). Any `42501` these produce under
`set local role` simulation is a harness artifact — reproduce it three times and
compute the predicate by hand before you ever call it a bug.

Schema facts worth remembering (caught while building this):
- `works.visibility` check allows `public / personal / private / server`
  (`personal` is the retained legacy alias; `private` is the canonical value
  post-migration p12).
- `comments.context` must equal `'public'` (defaulted); it is not a free field.
- `works.blob_sha` → `media_blobs.sha256` FK; the blob must be registered
  (`register_blob`) before the works insert, or the insert fails the FK. This
  was the original "silent upload failure" root cause.

---

## Frontend method

### Demo path (`?demo=1`) — what a green screenshot does and does NOT prove

`?demo=1` renders every screen from in-memory fixtures with **no network**. A
Playwright screenshot of it (headless Chromium at
`/opt/node22/lib/node_modules/playwright`, served over a local `http.server`)
proves: the route renders, the layout/tokens/alignment are right, no JS throws
on that path. It proves **nothing** about live data: not that a fetch is wired,
not that a write reaches Supabase, not that Realtime updates, not that RLS lets
the real user see the row. Do not present a demo screenshot as "feature X
works". Say "screen X renders".

### Live-only gaps (must be checked on the deployed site)

These cannot be verified from the sandbox and have historically been where real
bugs hid (pfp not propagating to the rail, uploads failing silently, drag-drop
never firing):

- pfp/handle propagation to **every** surface (rail, composer, member list),
  after a settings change, **without a reload**.
- Upload end-to-end (pick file → R2 PUT via `api/sign.mjs` → `register_blob` →
  `works` insert → appears in library/channel) for public/private/server.
- Drag-and-drop of **files and folders** onto the explorer and channels
  (folder drop needs `webkitGetAsEntry`, not just `dataTransfer.files`).
- Realtime: a second client sees new messages/posts without reload.
- Account isolation: two accounts do not see each other's private/server data.

### frontend-visualqa (owner-run) — the plan

`https://github.com/yutori-ai/frontend-visualqa` drives a real browser against a
live URL and checks visual/functional claims. The sandbox can't reach the live
site, so the **owner runs it**; the agent's job is to maintain the *claims list*
it checks. Keep that list in `docs/QA-CHECKLIST.md` (owner-facing) — each claim
must be a live-observable assertion ("after changing my avatar in Settings, the
rail avatar updates without reload"), not "the screen renders". When the owner
reports a claim fails, that is a real bug; reproduce its backend half with the
reliable method above, fix, and re-list the claim.

---

## Rules for the next agent (don't relearn these the hard way)

1. **Never trust a single `42501` from an inline-`auth.uid()` INSERT test.**
   It flips between runs. Verify via static analysis + service-role shape +
   the live path (trap #1).
2. **`reset role` first, and in every exception handler.** The connection is
   pooled (trap #2).
3. **Keep a test in one `do $$ … $$` block; roll back with `raise exception`.**
   Never leave rows in the live DB.
4. **A demo screenshot proves layout, not function.** Say so honestly.
5. **When you report "verified", name the method.** "service-role shape check",
   "live authenticated rpc", "static policy analysis" — not a bare "works".
6. **A flaky test is worse than none.** If a result won't reproduce three times,
   it isn't a result yet — find out why before you act on it.
