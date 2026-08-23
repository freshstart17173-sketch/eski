# eski — owner todo

Your action items (the things Claude can't do — external dashboards + accounts) and a
snapshot of where the build is. Claude tracks the *code* build in
[`BUILDLOG.md`](BUILDLOG.md); this file is **your** list.

_Last updated: 2026-08-23 (after P0 scaffold + P1 schema)._

---

## 🔴 Do soon — needed for preview.eski.lol to come up

- [ ] **Cloudflare DNS** — add a record so the subdomain points at Vercel:
      `CNAME  preview  →  cname.vercel-dns.com`, **DNS-only (grey cloud)** so Vercel
      issues the TLS cert cleanly. (This is the only Cloudflare change needed right now.)
- [ ] **Vercel → Settings → Domains** — add `preview.eski.lol` and bind it to the
      **`preview` git branch** (so it always tracks the latest preview deploy). The build
      is already pushed to `preview`; a `*.vercel.app` URL should exist even before the
      custom domain resolves.
- [ ] **Confirm the Vercel project deploys the `preview` branch.** If preview
      deployments are off, turn them on (Settings → Git).

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
- [ ] **Optional R2 custom domain** — put `cdn.eski.lol` on the bucket via Cloudflare,
      then flip `R2_PUBLIC_BASE_URL` to it (one line — the DB stores object keys, not
      URLs). Removes the rate-limited `r2.dev` dev domain.
- [ ] **Stripe** (only when billing/storage-slider ships, ~P8) — a Stripe account +
      the webhook that writes `invoices` / flips `storage_balance.status`.
- [ ] **Decide `main` vs `preview` promotion** — when the preview looks right, we merge
      `preview` → `main` (main deploys to prod / eski.lol).

---

## Build progress (Claude's side)

| Phase | What | Status |
|---|---|---|
| **P0** | App scaffold — shell, router, signals, Supabase client, tokens, sprite | ✅ done, on `preview` |
| **P1** | Schema + RLS — ~35 tables, all policies, allow/deny tested | ✅ done, applied to Supabase + committed |
| **P2** | RPCs + triggers + search + realtime | ⏭️ next |
| P3 | Design-system primitives (buttons/fields/modals/…) | pending |
| P4 | Shell + Workspace (chat, members, composer, realtime) | pending |
| P5 | Feed · File explorer · Details pane · Profile · Upload | pending |
| P7 | Messages/DMs · Friends · Notifications | pending |
| P8 | Admin (roles, permissions, moderation, billing) | pending |
| P9 | Create · Join · Sign-in · 404 · quick-switcher | pending |

**Reality check:** this is a large app (Discord × Google Drive). The backend fence is
now in place; the bulk of the remaining work is P2 (backend RPCs) then the UI phases
(P3–P9), which are many sessions. Each phase checkpoints green on `preview` so you can
watch it fill in.

**Supabase project:** `Eski` (`zidqagrmxeawpasurpwi`) — the old retired-product schema
was wiped (you approved) and the fresh schema is live.
