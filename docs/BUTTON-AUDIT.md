# eski — button audit (2026-08-28)

Every on-screen control, screen by screen, with its state. ✓ works · ✗ dead/stub · ⚠ works
but wrong. Fixes for ✗/⚠ are mirrored into [`BUGLOG.md`](BUGLOG.md) (the build list).

Legend: **[stub]** = only toasts a "(P#)" placeholder · **[v2]** = intentionally deferred.

---

## Server rail (shell.js) — every screen
- Home ⚠ — works, but should be the **"e!" logo**, not a home glyph. → fix
- Messages ✓ · My files ✓ · server badges ✓ · ＋ menu (Create/Join/Add friend) ✓
- Avatar menu: Profile ✓ · Set status ✓ · Settings ✓ · Sign out ✓
- ⚠ **In a server the rail avatar shows initials** even with a photo set (server `me`
  drops `avatar_key`). → fix

## Workspace (workspace.js)
- Server-header dropdown: Server settings ✓ · Audit log ✓ · Invite ✓ · Notification settings ✓ · Leave/Delete ✓
- Channel rows ✓ · Files crow ✓ · category collapse ✓ · ＋ add channel ✓ (voice → v2 toast) · gear (edit channel) ✓
- Voice minibar (mic/leave) ✗ **[v2]** — no handlers (deferred)
- Message hover: React ✓ · Reply ✓ · More ✓ (Edit/Pin/Copy link/Delete all ✓)
- File cards ✓ · reactions ✓ · thread open ✓
- **Composer toolbar (B / I / S / code / link / list / quote) ✗** — the `/`-style formatting
  isn't wired. → **remove** (keep only attach · @ · send)
- Composer: attach ✓ · emoji ✓ · @/# autocomplete ✓ · send ✓
- Pins tab: Unpin ⚠ — removes the row + toasts but doesn't persist to the DB. → fix (live unpin)
- **Files tab Type / Sort filters ✗** — open a menu whose items have no `onClick` (dead). → wire or drop
- **Members rail toggle ⚠** — doesn't persist; reopens after you close it. → fix (persist)

## Feed (feed.js)
- **Notifications nav ✗ [stub]** — toasts "(P7)" instead of navigating (screen exists). → fix
- **You nav ✗ [stub]** — toasts "(P5.10)" instead of opening the profile. → fix
- **Type / Sort filters ✗ [stub]** — toast "(P5.9)", not wired. → wire
- **Find friends (empty state) ✗ [stub]** — toasts "(P7)". → navigate to Friends
- Layout grid/masonry ✓ · cards open details ✓

## File explorer (explorer.js)
- New folder ✓ · Upload ✓ · view/date/sort/type/tag/channel/uploader filters ✓ · dir toggle ✓
- star filter ✓ · show-hidden ✓ · breadcrumbs ✓ · card menu (open/star/share/move/rename/hide/delete) ✓
- Trash: restore/purge/empty ✓
- **Storage "manage" ✗ [stub]** — "(P8)" billing, genuinely deferred (needs Stripe)
- ⚠ Drag-to-move works on cards; **drag-and-drop upload + drop onto the Feed/other views** not wired. → fix (§ drag everywhere)

## Details pane (details.js)
- Download ✓ · Save ✓ · Posted-by → profile ✓ · Location crumbs ✓ · tags add/remove ✓ · comments post/delete ✓
- prev/next ✓ · close ✓ · **Report flag ✗ [stub]** "(P8)" — needs the Report feature built

## Profile (profile.js)
- Edit profile ✓ · Add friend ✓ · Message ✓ · shelf tabs ✓ · search ✓
- **Settings tab ✗ [stub]** — toasts "(P9)" instead of navigating to `/settings` (which now exists). → fix (**this is "one of the settings buttons doesn't work"**)
- Edit-profile modal: change photo ✓ · change banner ✓ · save ✓ · cancel ✓ — **move entry into Settings**

## Messages / DMs (dms.js)
- New message ✓ · add-by-handle ✓ · conversation open ✓ · send ✓ · row menu (pin/mute/close/block/report) ✓
- Friends: tabs ✓ · send request ✓ · accept/decline ✓ · message ✓

## Notifications (notifications.js)
- tabs ✓ · row → target ✓ · per-row mark-read ✓ · mark-all ✓

## User settings (usersettings.js)
- setnav ✓ · Back to profile ✓ · Edit profile ✓ · Set a status ✓ · Sign out ✓ · theme ✓ · perf overlay ✓ · unblock ✓
- Notifications panel = copy only (no controls yet) — fine for now

## Global search (/search)
- **✗ not ported** — the route renders the "not yet ported" placeholder. → build the search screen

## Other screens
- Sign in: Google ✓ · magic link ✓ — Onboard: create profile ✓ — Join: join/sign-in/dead-invite ✓
- Shared: save ✓ · download ✓ — 404: go feed ✓ — Switcher (⌘K) ✓
- **Empty states ⚠** — copy is not dense (e.g. "No results / Nothing here matches …"). → tighten
