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
  state to `shots/`; `--update` re-baselines the DOM-diff signal.
- **Add a state:** add a `force()` to the `STATES` registry in `gallery.html`
  (search `STATES={`), pointing at the existing switch — never a second copy —
  then re-run `verify.mjs --update`.

Counts today: **21 screens · 29 named states · 32 dialogs · 82 URLs.**

## Screens with named alternate states

| Screen | Default | Named states (`#screen/state`) |
|---|---|---|
| **workspace** | `#workspace` | `offline` · `thread` · `pins` · `files` · `voicebar` |
| **explorer** | `#explorer` | `loading` · `grid` · `list` · `feedview` · `trash` · `empty` · `starred` |
| **settings** | `#settings` | `general` · `channels` · `members` · `roles` · `invites` · `moderation` · `audit` · `storage` |
| **notifications** | `#notifications` | `all` · `mentions` · `threads` · `saved` |
| **dms** | `#dms` | `convo` · `friends` |
| **auth** | `#auth` | `signin` · `sent` · `claim` *(the sign-in → magic-link → claim-handle order)* |

## Screens at default only (one composed state)

`feed` · `profile` · `friends` · `usersettings` · `search` · `shared` · `create` ·
`newserver` · `join` · `vc` · `e404` · `deadinvite` · `denied` · `blocked` ·
`pending`. Each is reachable at `#<screen>`; the system ones (`e404`,
`deadinvite`, `denied`, `blocked`, `pending`) are themselves the alternate/error
states of the flows that reach them.

## Dialogs (all reachable at `#dialog/<id>`, all in §⑥ of the catalog)

Menus: `dlMenu` `saveMenu` `emojiMenu` `msgMenu` `cardMenu` `serverMenu`
`notifMenu` `channelMenu` `dmMenu` `folderMenu` `exViewMenu`.
Modals: `channelModal` `inviteModal` `fwdModal` `newDmModal` `reportModal`
`editChanModal` `catModal` `gdmModal` `statusModal` `helpModal` `epModal`
`moveModal` `timeoutModal` `banModal` `arModal` `leaveModal` `delSrvModal`
`srvNotifModal` `shareModal` `storageModal` `uModal`.

## Coverage gaps — states to add (the Phase-D backlog)

These states exist in the product but not yet as a forced, screenshottable URL.
Each is a small `STATES` entry once the node exists; some need a node built first.
Until then the codegen build has no pixel to diff for them.

| Screen | Missing state | Node exists? | Note |
|---|---|---|---|
| feed | `empty` (no friends' posts) | needs node | pair with the existing `.emptystate` pattern |
| feed | `loading` (skeleton grid) | reuse `.skel` | wire like `explorer/loading` |
| profile | `empty` (no works), `public`, `mutual` POV | POV switcher removed | re-expose as states, not a control |
| search | `empty` / `no-results` | needs node | the query-with-zero-hits frame |
| dms | `empty` (no conversations) | needs node | first-run inbox |
| friends | `pending` / `blocked` tabs as states | tabs exist | lift the tab into `#friends/pending` |
| workspace | `slowmode` / `timed-out` composer | class exists | force the disabled composer |
| explorer | `readonly` (over-cap) / `locked-folder` | banners exist | force the `#46` / `#58` states |
| create | `error` (name taken) | needs node | inline validation frame |

Work this list in the Phase-D pass; each closed row is a state the build can no
longer invent. `verify.mjs` will pick each one up automatically once its `force()`
lands in the registry.
