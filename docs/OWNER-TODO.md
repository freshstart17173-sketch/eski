# eski — owner todo

Your action items (the things Claude can't do — external dashboards + accounts) and a
snapshot of where the build is. Claude tracks the *code* build in
[`BUILDLOG.md`](BUILDLOG.md); this file is **your** list.

_Last updated: 2026-08-23 (after P4 UI — shell + Workspace; `preview` fast-forwarded to
the P4 UI commit)._

---

## 🚧 Needed to continue — P4 Realtime (P4.10 / P4.11)

The P4 **UI** is done and live on `preview` (see it now at
**`preview.eski.lol/s/lb/c/beats?demo=1`** — the `?demo=1` shows the Late Bloom LP
fixture; without it you get the real, empty database and its empty states). What's
left in P4 is the **live spine** — messages appearing in real time, typing dots,
unread-clear, and presence in the members rail. To build + verify that, I need two
things from you, because "open two windows, send, watch it arrive" needs real auth +
real data:

1. **Turn on sign-in so real accounts exist.** (These are the two 🟠 auth items below,
   now blocking.)
   - **Supabase → Auth → URL config:** add `https://preview.eski.lol` to Site URL +
     Redirect URLs, so magic-link sign-in returns to the app.
   - **Supabase → Auth → email:** the built-in mailer only sends a few/hour — fine for
     you to test with, add real SMTP before wider testing. (Sign-in is magic-link/OTP:
     you enter an email, click the link. No password.)
   - Tell me **one or two emails** you'll sign in with for testing (e.g. your own +
     a second) so I can confirm the flow end-to-end.

2. **Decide how a test server gets created.** There's no Create-Server screen yet
   (that's P9), so the database has no server/channels/members/messages to go live
   against. Pick one — **I can't decide this for you:**
   - **(a) I seed a demo server for you now** — I insert a "Late Bloom LP"–style
     server + channels + membership tied to your auth user (once #1 exists), so P4
     live works immediately. Fastest path to a working preview. *(Recommended.)*
   - **(b) We build P9 Create/Join first**, then you make a server through the UI, then
     I wire P4 live against it. Cleaner order, but delays seeing live chat.

Everything else Realtime needs is already done — the Supabase **Realtime publication**
and replica identity were set up in P2 (no action from you there).

---

## 🔴 Do soon

- [x] **Cloudflare DNS — `preview` record exists.** Your DNS table shows
      `CNAME  preview  →  70c3f7…vercel-dns-017.com`, DNS-only (grey cloud) — correct.
      (Vercel gives a project-specific `vercel-dns-017` target instead of the generic
      `cname.vercel-dns.com`; both work.)
- [ ] **Confirm in Vercel** that `preview.eski.lol` is bound to the **`preview` git
      branch** and preview deployments are on (Settings → Domains + Git). The `preview`
      branch now carries **P0–P3 + the P4 UI**, so a deploy should be building — check
      `preview.eski.lol/s/lb/c/beats?demo=1` renders the workspace once it's up.
- [ ] **DNS tidy-ups** (from the 2026-08-23 config review — not breaking anything today):
      - Grey-cloud (`DNS only`) the `_domainconnect` CNAME — it's wrongly Proxied; orange-
        clouding a `vercel-dns.com` target does nothing and can break Vercel's guided setup.
      - Verify the `*.eski.lol` wildcard A records: they point at `64.29.17.65` /
        `216.198.79.65`, a different pool than the `.1` IPs your `www`/apex use. Update them
        to your Vercel domain-card IPs (`216.198.79.1` / `64.29.17.1`) or drop the wildcard —
        eski routes by path, so nothing needs `*.eski.lol` to resolve.

## 🟠 Do before uploads / auth work (P2–P5)

- [ ] **Vercel env vars** (Settings → Environment Variables, set for **Preview** and
      **Production**) — copy the NAMES from [`.env.example`](../.env.example). The app
      boots without them (public Supabase values are baked into `app/env.js`), but
      `api/sign.mjs` (R2 uploads) needs the server vars:
      `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `R2_BUCKET`, `R2_ACCOUNT_ID`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`.
      (Redeploy after editing — Vercel doesn't apply env changes to existing deploys.)
- [ ] **Cloudflare R2 CORS** — when we build upload (~P5), apply
      [`r2-cors.json`](../r2-cors.json) to the `eski` bucket and add the preview origin
      (`https://preview.eski.lol`) to the allowed origins.
- [ ] **Supabase Auth → email** — the built-in mailer is rate-limited (~a few/hour).
      Add a real SMTP sender (the `SMTP_*` vars) before anyone but you signs in.
- [ ] **Supabase Auth → URL config** — add `https://preview.eski.lol` (and any
      `*.vercel.app` preview URL you use) to the allowed redirect URLs, so magic-link /
      OAuth sign-in returns to the app.

## 🟡 Nice to have / later

- [ ] **Supabase Auth → enable "Leaked password protection"** (dashboard toggle;
      flagged by the security advisor — one click).
- [x] **R2 custom domain wired to `cdn.eski.lol`.** DNS record exists (Proxied); the
      client constant in `app/env.js` **and** `.env.example` now use `https://cdn.eski.lol`
      (Claude, 2026-08-23). **You still must:** (a) set/confirm the `R2_PUBLIC_BASE_URL`
      **Vercel env var** = `https://cdn.eski.lol` and **redeploy** (Vercel doesn't apply env
      changes to existing deploys), and (b) add `https://cdn.eski.lol` to `r2-cors.json`
      when uploads land (~P5). Note: no client code reads it yet (mediaUrl arrives in P5),
      so nothing serves media today — this is correct prep.
- [ ] **Stripe** (only when billing/storage-slider ships, ~P8) — a Stripe account +
      the webhook that writes `invoices` / flips `storage_balance.status`.
- [ ] **Decide `main` vs `preview` promotion** — when the preview looks right, we merge
      `preview` → `main` (main deploys to prod / eski.lol).

---

## Build progress (Claude's side)

| Phase | What | Status |
|---|---|---|
| **P0** | App scaffold — shell, router, signals, Supabase client, tokens, sprite | ✅ done, on `preview` |
| **P1** | Schema + RLS — ~41 tables, all policies, allow/deny tested | ✅ done, applied + on `preview` |
| **P2** | RPCs + triggers + search + realtime (+ share resolver, trash purge) | ✅ done, applied + round-trip tested + on `preview` |
| **P3** | Design-system primitives (buttons/fields/modals/player/…) | ✅ done, verified both themes + on `preview` |
| **P4** | Shell + Workspace (chat, members, composer, realtime) | 🟢 UI done, on `preview`; **Realtime (P4.10/11) next — see top block** |
| P5 | Feed · File explorer · Details pane · Profile · Upload | pending |
| P7 | Messages/DMs · Friends · Notifications | pending |
| P8 | Admin (roles, permissions, moderation, billing) | pending |
| P9 | Create · Join · Sign-in · 404 · quick-switcher | pending |

**Reality check:** this is a large app (Discord × Google Drive). Backend is complete
(P1 schema/RLS + P2 RPCs/triggers/search/realtime, all live on Supabase), the P3 UI
primitives are built, and the **P4 shell + Workspace UI** is assembled and on `preview`.
The remaining work is the rest of the UI-assembly phases (P4 Realtime, then P5–P9),
which are many sessions. Each checkpoints green on `preview` so you can watch it fill
in. **Note:** the `gallery.html` reference is close but not 100% complete — some
features are missing, so `eski-style` is the value authority and gaps get flagged,
not invented.

**`preview` carries P0–P3 + the P4 UI.** The active work branch is
`claude/catch-up-p4-d3efls`; `main` (prod / eski.lol) is untouched — promote
`preview → main` when it looks right.

**Supabase project:** `Eski` (`zidqagrmxeawpasurpwi`) — the old retired-product schema
was wiped (you approved) and the fresh schema is live.
