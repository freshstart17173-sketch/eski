# The state matrix — every screen × its states, dialogs & URLs

The one page to review the whole surface from. Each row is a state the codegen
build must produce; each has a **URL that forces it** (open in a browser, or feed
it to the screenshot gate) and is checked by [`verify.mjs`](verify.mjs) — which
enumerates this list from the live DOM, so it can't silently drift from the
gallery.

- **Open a state:** `gallery.html?app=1#<screen>` or `…#<screen>/<state>`, plus
  `&theme=dark|light` and `&w=1024|1440`. A dialog: `…#dialog/<id>`.
- **Check everything:** `node verify.mjs` (hard-fails on JS errors, dead nav,
  unreachable states, dialogs that won't open/close). `--shots` writes a PNG per
  state to `shots/`; `--update` re-baselines the DOM-diff signal; `--theme dark`
  sweeps dark.
- **Add a state:** add a `force()` to the `STATES` registry in `gallery.html`
  (search `STATES={`), pointing at the existing switch — never a second copy —
  then re-run `verify.mjs --update`.

Counts today: **21 screens · 44 named states · 32 dialogs · 97 URLs.**

## Screens with named alternate states

| Screen | Default | Named states (`#screen/state`) |
|---|---|---|
| **workspace** | `#workspace` | `offline` · `thread` · `pins` · `files` · `voicebar` · `slowmode` · `timedout` |
| **explorer** | `#explorer` | `loading` · `grid` · `list` · `feedview` · `trash` · `empty` · `starred` · `readonly` · `locked` |
| **settings** | `#settings` | `general` · `channels` · `members` · `roles` · `invites` · `moderation` · `audit` · `storage` |
| **notifications** | `#notifications` | `all` · `mentions` · `threads` · `saved` |
| **feed** | `#feed` | `loading` · `empty` |
| **search** | `#search` | `empty` (no-results) |
| **dms** | `#dms` | `convo` · `friends` · `empty` |
| **friends** | `#friends` | `all` · `pending` · `blocked` |
| **profile** | `#profile` | `public` (stranger POV) · `mutual` (friend POV) · `empty` |
| **create** | `#create` | `error` (name taken) |
| **auth** | `#auth` | `signin` · `sent` · `claim` *(the sign-in → magic-link → claim-handle order)* |

## Screens at default only (one composed state)

`usersettings` · `shared` · `newserver` · `join` · `vc` · `e404` · `deadinvite` ·
`denied` · `blocked` · `pending`. Each is reachable at `#<screen>`; the system
ones (`e404`, `deadinvite`, `denied`, `blocked`, `pending`) are themselves the
alternate/error states of the flows that reach them, and `vc` is the voice-call
WIP placeholder.

## Dialogs (all reachable at `#dialog/<id>`, all in §⑥ of the catalog)

Menus: `dlMenu` `saveMenu` `emojiMenu` `msgMenu` `cardMenu` `serverMenu`
`notifMenu` `channelMenu` `dmMenu` `folderMenu` `exViewMenu`.
Modals: `channelModal` `inviteModal` `fwdModal` `newDmModal` `reportModal`
`editChanModal` `catModal` `gdmModal` `statusModal` `helpModal` `epModal`
`moveModal` `timeoutModal` `banModal` `arModal` `leaveModal` `delSrvModal`
`srvNotifModal` `shareModal` `storageModal` `uModal`.

## Coverage — remaining nice-to-haves

The Phase-D backlog is essentially closed (batches A–C, 2026-08-22). What's left
is optional polish, not build-blocking:

| Screen | State | Note |
|---|---|---|
| notifications | `empty` | no-activity inbox (the Saved tab already has its own empty) |
| usersettings | panel states | lift the account/profile/notifications/appearance/privacy panels into `#usersettings/<panel>` like `settings` |
| join / deadinvite | the four dead-invite copy variants | already one screen; could split expired/revoked/full/already-member into states |
| shared | `expired` | a shared link that has lapsed |

Add any of these the same way — a `force()` in the registry pointing at a real
node — and `verify.mjs` picks it up automatically.
