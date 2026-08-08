# Auth: what eski uses, and what else there is

Written 8 Aug 2026, after wiring the pick-a-username flow. The question was
"look into other auth solutions" — so this is an honest comparison, and the
conclusion is **stay put**, with reasons rather than inertia.

---

## What is here now

Supabase Auth, one provider (Google), OAuth redirect back to whatever page you
signed in on.

| | |
|---|---|
| where the session lives | `localStorage`, key `sb-<ref>-auth-token` |
| what holds it | `@supabase/supabase-js`, vendored, 57 KB brotli |
| who reads the user | `platform.js` only — one boot path, `window.eski.user` |
| what identity means | a row in `profiles` keyed by `auth.users.id` |
| what enforces access | Postgres RLS, using `auth.uid()` |

**The last line is the whole argument.** Every policy in `schema*.sql` is
written against `auth.uid()`, and `auth.uid()` reads the JWT that Supabase Auth
issued. The two RPCs are deliberately **not** `SECURITY DEFINER` so they run as
the caller. Auth is not a login screen here; it is the thing the entire
permission model is expressed in terms of.

---

## What replacing it would actually cost

Not "swap a library". The pieces that would have to move:

1. **Every RLS policy.** `auth.uid()` is a Supabase function reading a Supabase
   JWT. A different issuer means either teaching Postgres to verify its tokens
   (custom JWT signing keys — possible, see below) or moving authorisation out
   of the database entirely, into an API layer that does not exist and would
   have to be written and kept correct.
2. **`profiles.id references auth.users(id)`.** Identity is foreign-keyed to
   the auth schema, and so, transitively, is every comic, part, comment, save
   and preference.
3. **The whole boot path.** One file, so this part is genuinely small.

(1) and (2) are the cost, and they are large. **This is not a bad thing to
discover** — it is what "auth is not a component" looks like. The right time to
have this thought was before the first policy was written, and the second-best
time is never, unless something actually hurts.

---

## The alternatives, and what each would buy

### Clerk

Best-in-class prebuilt UI: sign-in, MFA, sessions, organisations, a hosted
account page. If eski needed teams or enterprise SSO tomorrow, this is what to
reach for.

**Buys us nothing today.** The prebuilt UI is the product, and eski deliberately
does not use a prebuilt sign-in — there is one provider behind a two-word menu
in the nav, and the house style is the point. Paying for a component we would
restyle out of existence, in exchange for rewriting every RLS policy, is a bad
trade in both directions.

Clerk does integrate with Supabase RLS via third-party auth, so this is not
impossible — just unmotivated.

### Auth0 / Okta

Enterprise-grade, priced accordingly, and aimed at problems eski does not have
(compliance attestations, directory sync, fine-grained enterprise policy). The
free tier's MAU limit is the one below Supabase's. **No.**

### Better Auth (self-hosted, TypeScript)

The interesting one. Owns its tables in *your* Postgres, so identity stops
being foreign-keyed to a vendor's schema, and it is genuinely good software.

But it wants a server. eski has no server — it is static files on Vercel plus
Postgres plus two functions — and adopting it means running an auth service,
keeping it patched, and handling its outages. **That is a real operational
burden for a solo project**, in exchange for portability we have no plan to
use.

### Rolling our own

No. Not because it is hard to write a password check — because it is hard to
keep writing one: session fixation, timing attacks, rotation, revocation,
enumeration, rate limits, and the reset-email flow that is the actual attack
surface on most sites. This is the single clearest "do not" in the whole
document.

---

## What is worth doing instead

The real gaps are not the vendor. They are these, in order:

### 1. A second provider — email magic links · SMALL, worth doing

Google is the only way in. That excludes anyone without a Google account or
unwilling to use it, and it means a single provider outage is a total sign-in
outage. Supabase ships magic links; `PROVIDERS` in `platform.js` is already a
list, and the sign-in menu is already built from it.

The work is one entry, one email input in the menu, and SMTP configured in the
Supabase dashboard — **which is a dashboard task, not a code task**, and the
free tier's built-in SMTP is rate-limited enough that it needs a real provider
(Resend, Postmark) before it is dependable.

Discord is already half-wired: it is commented out of `PROVIDERS` with a note
saying it must be enabled in the dashboard first. Same shape, less work, and
plausibly the better fit for this audience.

### 2. Account deletion · REQUIRED, not optional

Roadmap item 20, still open. Under UK GDPR (eski is UK-facing) erasure is a
right, not a feature.

The database half is **almost** done, and the exception is the interesting
part. Checked against the live project rather than the schema files: every
table referencing `auth.users(id)` is `on delete cascade` — `profiles`,
`comics`, `parts`, `comments`, `saves`, `kudos`, `follows`, `bookmarks`,
`user_prefs`, `upload_quota` — **except three, which are `set null`**:
`comic_tags`, `reports` and `views`. That is the right split and worth keeping:
a tag stays on the comic without naming who added it, a report survives the
reporter deleting their account, and a view count does not drop.

So deletion works. What is missing is a control that calls it, and one product
decision: `comments` cascades, which means deleting an account silently removes
its side of every conversation and leaves replies answering nothing. Every site
that has hit this ends up choosing between erasing the row and tombstoning it
(`[deleted]`, body cleared, thread intact). **That choice is the actual task**
— the deletion itself is a button.

### 3. Session length and revocation · CHECK, then probably nothing

Supabase refresh tokens are long-lived by default. Worth setting a JWT expiry
and a refresh-token rotation policy in the dashboard rather than accepting the
defaults, and worth confirming "sign out" revokes rather than just clearing
local storage. Both are dashboard settings.

### 4. What happens when a handle is abused

Handles are first-come. There is no reserved list, so `admin`, `eski`,
`support` and `moderator` are all claimable by anyone, and impersonation via
handle is the cheapest attack on a site whose whole currency is attribution.
A reserved-word check in the pick-a-username flow is about ten lines and should
go in before there are users, not after.

---

## Conclusion

**Keep Supabase Auth.** Not because it is the best auth product in isolation —
Clerk's is nicer, Better Auth's is more portable — but because on this site
auth is not a component that can be swapped. It is the vocabulary the entire
authorisation model is written in, and every alternative costs a rewrite of
every policy to buy something eski does not currently need.

Revisit if any of these become true:

- eski needs **teams or organisations** (Clerk's actual strength)
- Supabase's **pricing or availability** becomes a problem at real traffic
- an **enterprise or institutional** user needs SSO
- we want to **leave Supabase entirely**, in which case auth moves as part of
  that, not before it

Until then the wins are the four items above, and three of the four are
dashboard settings rather than code.

---

## What needs YOU (not code)

1. **Enable Discord** in Supabase → Authentication → Providers, paste its
   client id and secret, then uncomment `'discord'` in `PROVIDERS`
   (`platform.js`). See ESK-2003 — a provider listed but not enabled fails at
   the redirect with a raw error page.
2. **Set up real SMTP** (Resend or Postmark) in Supabase → Authentication →
   Emails before magic links can be relied on. The built-in sender is
   rate-limited for testing only.
3. **Check the JWT expiry and refresh-token rotation** in
   Authentication → Sessions, rather than shipping on the defaults.
