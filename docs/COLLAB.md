# eski — how everything works

**A functional reference for the whole product.** This document explains every
function of eski, screen by screen and flow by flow, in plain language. Its two
jobs:

1. **Release readiness.** A checklist you can walk before you ship, so nothing is
   broken or missing. Each area ends with a **Ready when** list — the observable
   things that must be true for that area to count as working.
2. **Smoother flows.** [Flows worth making easier](#flows-worth-making-easier)
   names the paths a user takes most and where friction hides, so the beta feels
   fast instead of correct-but-heavy.

**Source of truth.** [`CANON.md`](CANON.md) is the contract — the vocabulary, the
permission model, and the per-element UI registry. Where this document and CANON
disagree, **CANON wins**; tell CANON, not this file, when a decision changes.
This file is the readable companion: it turns the contract into "here is what the
user does and what happens." [`design/gallery.html`](design/gallery.html) is the
visual law. Open items are gathered in [The TODO list](#the-todo-list).

Nothing is live yet. This is the planning-and-design phase, so "works" below means
"is specified, mocked, and ready to build," not "runs in production."

---

## What eski is

eski is a collaboration app for creative people — think **Discord plus Google
Drive**. You join **servers** (studios you're invited into), talk in
**channels**, and share **works** (any uploaded file). Every server has a real
**File explorer** with a nested folder tree, and every file honestly reports whose
storage pays for its bytes. Outside servers, you have a friends-only **Feed** of
public work and **direct messages**.

### The three layers, one account

One sign-in gives you three contexts. The same work entity can appear in each; how
it's labeled and who can see it changes per context.

| Layer | What it's for | The work is called | Who sees it |
|---|---|---|---|
| **Public** | Your portfolio and your friends' Feed | a **post** | Friends (in Feed); anyone with the link |
| **Server** | A studio you collaborate in | a **file** | That server's members |
| **Private** | Your own storage | a **file** | Only you |

### The vocabulary that never changes

eski's main failure mode is a correct decision quietly undone — including a second
word appearing for a thing that already has one. Use these canonical terms
everywhere (full list in CANON §A):

| Term | Means | Not called |
|---|---|---|
| **Server** | The studio you create, join, and invite into | studio, group, guild, workspace *(as data)* |
| **Workspace** | The three-pane screen of a server | — (screen name only) |
| **Channel** | A room inside a server (`text`; `voice` is reserved) | room, feed |
| **Files** | A server's File explorer entry | media channel |
| **work** | The uploaded entity | asset, media item, attachment |
| **post** / **file** | A work seen in public / in a server or privately | — |
| **collaborators** | People credited on a work, each a chip | credits, contributors |
| **folder** | A nested container in a server's file tree | collection |
| **friend** | The one relationship, mutual | follow, connection, contact |
| **save** | Keep your own copy of a work in your storage | bookmark |
| **Public / Server / Private** | The three visibility values | Shared, Everyone, This server, No one |

---

## Accounts, sign-in, and your handle

There's no user directory and no discovery. People find each other by exact
**handle** (`@username`) only.

**Sign in or sign up**

1. Open the app signed out. You land on the **Sign-in** screen — a single card on
   a dimmed backdrop, no server rail.
2. Enter your email for a magic link, or use an OAuth provider.
3. On first sign-up, **claim a handle**. It's unique and it's the only way others
   add you.
4. Follow the magic link. The card shows a **sent** confirmation state while you
   wait.

Auth, create-server, join-by-link, and every system card share one look: centered
on both axes, generous padding, no drop shadow (the scrim is the separation).

**Ready when**

- Sign-in, sign-up, and handle-claim each render as a centered card with no rail.
- An invalid email or a taken handle shows an error line under the field.
- The "magic link sent" state is distinct from the entry state.
- A signed-out user hitting any deep link is routed to sign-in, then back.

---

## Friends, requests, and blocking

**Friend** is the only relationship. It's mutual, and it does exactly two things:
it lets you **DM** each other, and it surfaces each other's **public posts** in
your Feed.

**Add a friend**

1. Open the **＋** menu (server rail) or the Messages screen.
2. Enter an exact `@handle`. There's no search and no suggestions.
3. Send the request. The other person sees it in their requests surface and can
   **accept** or **ignore**.

**Block** hides content in both directions and revokes the Feed and DM connection.

| Action | Rule | Result |
|---|---|---|
| See a friend's public posts in Feed | Friendship `accepted` | Their public work appears in your Feed |
| Open a DM | Friendship `accepted` | A 1:1 or group DM channel |
| Add by handle | Exact match only | A pending request |
| Respond | Accept or ignore | Accept creates the friendship |
| Block | Either side | Both directions hidden; Feed and DM revoked |

**Public posts stay public.** Friendship gates the Feed *surface* and DMs, not the
raw readability of a public work — anyone with the link still sees a public post.

**Ready when**

- Adding a non-existent handle fails cleanly; you can't friend yourself.
- A pending request shows on the recipient's side and clears on accept or ignore.
- Blocking immediately removes the person's posts from your Feed and closes DMs.
- Un-added handles can't open a DM.

---

## Servers

A **server** is the container for all collaboration. Membership is per server —
being in server A gives you zero rights in server B.

### Create a server

1. Open **＋ → Create server**.
2. Enter a server name, upload a square avatar, and name a first text channel.
3. Confirm. You become the **owner** (all permissions). The server seeds only two
   roles: **owner** and **`@everyone`**.

A brand-new server needs **zero role setup**: `@everyone` has every non-admin
permission on, so all members can post, upload, comment, and react out of the box,
and only the owner administers.

### Join by invite link

1. Open a `/join/<code>` link. A preview card shows the server name, member count,
   and who invited you.
2. Select **Join**. You're added to `@everyone` and given the next free member
   color.

If the code is bad, you get a **Dead invite** card instead — expired, revoked,
full, or already-a-member, each with its own message (see
[Utility screens](#utility-screens)).

### Leave, and the last-owner rule

Any member can leave from the server menu. The **owner can't leave without
transferring ownership** first, so a server is never left leaderless.

**Ready when**

- Create seeds owner + `@everyone` only, with the light default permissions.
- A valid invite previews correctly; each dead-invite state shows distinct copy.
- Joining assigns a member color (cycling past the palette size).
- The owner is blocked from leaving until ownership transfers.

---

## Roles and permissions

Permission is **role × visibility**, never role alone. Roles carry permission
flags, members hold one or more roles, and a member's power is the OR of their
roles' flags. The RLS policy is the fence; the UI only hides what the policy
already forbids.

### The default two roles

| Role | Permissions |
|---|---|
| **Owner** | All flags. The only biller. Can delete the server and transfer ownership. |
| **`@everyone`** | Every non-admin flag on: `upload`, `add_tags`, `comment`, `pin_message`, `send_messages`, `view_channel`. Every admin flag off. |

Granular roles (adding a "Producer," gating a channel) stay available but are
**opt-in** — reach for them only when a server grows.

### The permission flags

| Group | Flags |
|---|---|
| **Server** | `manage_server`, `manage_roles`, `manage_channels`, `manage_invites`, `view_audit`, `manage_billing` |
| **Members** | `kick`, `ban`, `timeout`, `create_invite` |
| **Content** | `upload`, `add_tags`, `comment`, `pin_message`, `delete_any_message` |
| **Per-channel** | `view_channel`, `send_messages` |

### What each actor can do

| Capability | Owner | Admin | Member | Timed-out | Non-member |
|---|:--:|:--:|:--:|:--:|:--:|
| Read server content | ✅ | ✅ | ✅ | ✅ | ⛔ |
| Post a message | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| React / pin | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| Edit / delete own message | self | self | self | self | ⛔ |
| Delete any message | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Upload a work | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| Withhold a work (takedown) | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Add / rename / reorder channels | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Manage members (role, kick) | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Ban / timeout | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Create / revoke invites | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| View audit log | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Export the server | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Delete the server | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Transfer ownership | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |

An admin does everything an owner does *except* delete the server, transfer
ownership, and kick or ban the owner.

### Manage roles

- **Roles editor** (Server settings → Roles, needs `manage_roles`): create,
  rename, color, reorder roles, and set flags in a matrix grouped Server /
  Members / Content. `@everyone` is pinned last and can't be deleted; editing it
  changes the baseline.
- **Assign roles to a member** (from the member popout): a multi-select checklist.
  A member can hold several roles; permissions are the union.
- **Channel permissions** (when a channel is set Private): an allow-list of roles
  and individual members. Zero rows means open to all members; any rows make it
  private to exactly those.

**Ready when**

- A new server administers with owner + `@everyone` and no other setup.
- Each flag actually gates its action at the database layer, not just the UI.
- Removing a role removes its member and channel grants.
- A private channel hides from non-granted members in every surface (list,
  search, files, pins), returning **Access denied**, not a 404.

---

## Channels

A **channel** is a room inside a server, shown in the 232px channel column
alongside the fixed **Files** entry. Its kind decides what it holds.

| Kind | Status | Holds |
|---|---|---|
| **Text** | Built | Persistent, searchable chat |
| **Voice** | Reserved in the enum, **not built in v1** | (calls deferred to v2) |

Admins add, rename, reorder, and set permissions on channels; members only see and
use them. Channel rename lives in **Server settings → Channels**, not a one-off
prompt.

**Ready when**

- Members see the channel list with unread bold and mention badges; admins also
  see the add-channel and drag-to-reorder affordances.
- Voice channels are hidden or clearly disabled, never half-working.
- An empty server prompts the admin to "create your first channel."

---

## Chat and messaging

Each text channel is reverse-chronological, grouped by author, with each byline in
that author's **server color**. Messages insert, edit, and delete live over
Realtime.

**Send and format a message**

1. Type in the composer. Format with the toolbar (Markdown, rendered on send),
   pick emoji, and autocomplete `@mentions` and `#channels`.
2. Attach a file to share a work inline (see [Sharing a file into a
   channel](#placements-one-work-many-surfaces)).
3. Send. Typing broadcasts a transient indicator to others.

**Act on a message** (hover on desktop, long-press on mobile):

| Action | Who | Note |
|---|---|---|
| React with an emoji | Members | Toggles a reaction pill |
| Reply in thread | Members | Opens a thread on the parent message |
| Edit / delete own | Author | Leaves an "edited" tag or a tombstone |
| Delete any | Admin | Moderation |
| Pin / unpin | Members pin; admin unpins any | Shows in the **Pins** tab |
| Copy link | Anyone who can read | Deep link to the message |

The channel header carries three tabs — **Messages / Pins / Files** — plus a
members icon and search. A **timed-out** member sees a disabled composer with a
notice; a **banned** member isn't there.

**Ready when**

- Markdown renders, mentions notify, and reactions toggle live for all readers.
- Threads open and count replies; pins list and unpin correctly by role.
- The timed-out and slowmode composer states disable sending with a clear reason.
- A Realtime drop shows a "reconnecting" banner rather than silently losing
  messages.

---

## Works: upload and visibility

A **work** is any uploaded file. It has one **home** (an owner and a storage
account) and a single visibility value. The same work reads as a **post** in
public and a **file** in a server or privately.

### Upload (the fast default)

The default upload is **one step**: drop, pick visibility, **Post**. The title
auto-fills from the file name, and nothing below visibility is required.

1. Open the upload sheet (from a real upload entry point) and drop one or more
   files. The type is recognized for its icon and filters — never shown as a tag.
2. Pick **visibility**: Public / Server / Private. This is the one required choice.
3. If **Server**, pick which server and, optionally, which **folder** (default is
   root). A storage-impact line shows which account's bytes this draws.
4. Select **Post**. It commits immediately.

**Add details** (a collapsed disclosure) reveals optional **Title**, **Tags**, and
**Collaborators**, so a social user sharing a meme never sees an artist-shaped
form, while a producer expands it and credits the room.

### Visibility values

| Value | Storage | Who sees it | Reads as |
|---|---|---|---|
| **Public** | Your personal storage | Friends (Feed), anyone with the link | post |
| **Server** | The server's storage | That server's members | file |
| **Private** | Your personal storage | Only you | file |

Visibility is **per work** and editable per work. Making a work **Private**
retracts all its placements.

**Ready when**

- The one-step path works end to end with only a file and a visibility choice.
- The server picker exposes both server and folder; the storage-impact line names
  the correct paying account.
- Add-details stays collapsed by default and never blocks posting.
- Over-quota uploads are blocked with "free space or add storage," never charged.

---

## Placements: one work, many surfaces

A work lives in one home. **Placements** are lightweight references that put it
onto other surfaces. Discussion and audience attach to the placement, not the
work — so one work can be in several places, counted in storage once.

| Action | What it is | Storage effect |
|---|---|---|
| **Post to a server** | A `server` placement of a work you own | Your bytes; members read it via the placement |
| **Crosspost** | A placement of an already-owned personal work into a server | No copy; stays personal-stored |
| **Multi-share** | Placements in several servers or DMs | Counted once (dedup + single owner) |
| **Forward to a DM** | A `dm` placement | Grants read to the DM's members |
| **Forward a server file to a non-member** | Copies to the sender's personal storage | New work, same dedup blob, near-zero bytes |
| **Publish (server file → portfolio)** | Forks a personal copy crediting the original | New personal-owned work; the server file stays |

**Ownership and presence stay split.** The owner controls the file (edit, delete);
the server controls its presence. An admin with moderation permission can **detach
a placement** (remove it from the server) without touching the owner's file or
bytes. Deleting a work removes every placement and decrements the blob refcount;
the blob is garbage-collected at refcount zero. A save that loses its placement
shows "no longer available," never a dangling open.

**Ready when**

- A personal work crossposted into a server is readable by members without
  changing its visibility.
- Removing a placement leaves the work and its other placements intact.
- Forwarding out to a non-member copies rather than granting a live cross-server
  read.
- Deleting the last reference GCs the blob; a stale save degrades gracefully.

---

## Collaborators and tags

Both are **on the work** and both are shaped only by the makers — not by every
server member.

- **Collaborators** are people credited on a work, each a chip (a real `@handle`
  plus an optional freeform role like "prod" or "mix"), in the member's server
  color inside a server. Crediting is **consent-gated**: `accepted` automatically
  when the person is a friend or co-member, `pending` (muted chip, not shown on
  their profile) for a stranger. A credited person can always remove themselves.
- **Tags** are user labels; the first five show inline with "+N" for the rest.
- **File type** (the extension) drives the icon and Type filter and is **never**
  rendered as a tag.

Only the **owner and already-accepted collaborators** can add tags or
collaborators. A server organizes with **folders** (server-scoped), not by
graffitiing a work's global metadata.

**Ready when**

- Crediting a friend auto-accepts; crediting a stranger stays pending and hidden
  on their profile until they accept.
- A credited person can self-remove from any work.
- A non-owner, non-collaborator server member can't edit a work's tags.

---

## The Feed

The **Feed** is the friends-only portfolio grid — only `public` works by your
accepted friends. Server and Private work never leak in.

- **Layout:** a full-width grid of square, borderless cells; toggle to a denser
  masonry view. Media renders by kind (image thumbnail, video play overlay, audio
  as a music/audio icon card, text as its words, non-previewable as a **type
  card** of icon + extension).
- **Filter and sort:** search by title, tag, or handle; filter by type; sort
  newest and so on — Reddit-style, no tag modifiers.
- **Empty state:** "No posts yet — add friends to see their work."
- No member color renders here — the identity hue is server-scoped only.

**Ready when**

- Only accepted friends' public posts appear; nothing server or private leaks.
- Every media kind, including non-previewable, renders in a square cell.
- Grid ⇄ masonry toggles, and search and sort narrow the grid server-side.

---

## The File explorer

A server's files as a **Discord-meets-Google-Drive** file system: a nested folder
tree on the left, the current folder's contents in the main pane, and a three-way
view toggle.

| View | Shows |
|---|---|
| **Grid** (default) | Subfolders and files of the current folder, as cards |
| **List** | A dense row per item: name, type, size, uploader, date |
| **Feed** | The whole subtree flattened to **previewable** works, newest-first, each with its comments inline — an Instagram-style server media feed |

- **Folder tree:** collapsible and nested (root → children); drag a file or folder
  onto a folder to move it; permitted members add, rename, and delete folders.
- **Storage footer:** pinned to the foot of the tree — "This server's storage — X
  of Y GB used," a bar, and a **manage** link to storage settings. Always visible.
- **Breadcrumb:** the path to the current folder; each segment navigates.
- **Filters:** channel, type, uploader, sort — plus search across the whole tree.
- **Bulk actions:** multi-select for download, move to folder, or delete.
- **Lightbox:** a full media viewer with a "shared in" strip.

A file lives in exactly one folder per server (default root). Unpreviewable files
(`.flp`, `.zip`) appear in grid and list but are hidden in feed view.

**Ready when**

- The tree navigates, and dragging moves a file or folder with permission checks.
- All three views render, and feed view flattens the subtree to previewable media
  with inline comments.
- The storage footer reads the server's live usage and links to billing.
- Bulk select and the lightbox work on touch (long-press, full-screen).

---

## The Details pane

Opens from any card as a near-full-screen split over a scrim: the **media takes
the room** on the left, a fixed ~380px info rail on the right, no drop shadow. The
same shell serves two things that differ in their discussion surface and storage.

| | **Post** (public) | **Server file** |
|---|---|---|
| Discussion | A public **comment thread** with an add-comment field | **No thread** — a "Replies happen in #channel →" link to the chat |
| Storage | Your personal storage | The server's storage |
| Channel | None (not in a server) | Its posting channel |
| Keeps | Tags, collaborators | Tags, collaborators |

The rail leads with a **storage row** — a plain-language note of size and whose
storage pays ("8.4 MB on the server's storage" / "32.1 MB on your storage") — then
a clickable **location** breadcrumb into the file tree, then per-kind metadata
(uploaded-by, added date, length, dimensions/fps, format/codec). Actions:
**Download** (with get-as formats) and **Save to my files** (into a personal
folder; a dedup-cheap copy that survives the server deleting theirs).

Media controls pin to the foot of the media area. Only a **folder** shows
prev/next arrows over the media plus a navigable list in the rail; a single work
has none. **Report** and **close** sit in the rail's top bar.

**Ready when**

- A post shows a comment thread; a server file shows the channel link, not a
  thread.
- The storage row and location breadcrumb read correctly and the breadcrumb
  navigates.
- Download and Save both work, and Save notes it copies into your storage.
- On mobile the pane goes full-screen as a column (media on top, rail below).

---

## Profile

A person's public identity: square avatar, name, `@handle`, and bio, with **Add
friend** / **Message** (or **Edit** on your own).

- **Shelf tabs:** **Public / Server / Private** with counts, plus **Settings** and
  a search button. A viewer sees your Public shelf always, your Server shelf only
  for servers you share, and your Private shelf never.
- **Grid:** the same square ⇄ masonry card renderer as the Feed.
- **Settings tab:** name, handle, bio, avatar, theme, status, and storage.

No member color renders on a profile — identity hue is server-scoped.

**Ready when**

- Each shelf gates correctly by viewer relationship; Private never shows to others.
- Own-profile shows Edit and Settings; another's shows Add friend / Message.

---

## Messages (DMs)

Direct conversations, 1:1 or group, gated by friendship.

- **Add by handle** is an inline field at the top of the thread list — not a
  modal. Exact handle only.
- The list shows friends, pending requests, and threads with unread dots and
  mute/pin.
- A conversation is messages plus a composer (attach, send). Call buttons in the
  header are a v2 deferral.

**Ready when**

- The add-by-handle field is inline and opens a DM only with an accepted friend.
- Group DMs work; leaving one keeps your messages for the rest.
- Unread counts drive the Messages badge on the server rail.

---

## Saves

**Save to my files** keeps your own copy of a work in your personal storage, filed
in a personal **save folder**. It's a new work you own referencing the same dedup
blob — near-zero extra bytes if you already have it — so it's yours even if the
server later deletes theirs. It draws **your** quota. Saves are distinct from a
pinned message and from a bookmark.

**Ready when**

- Saving creates an owner copy that survives deletion of the original.
- A save whose source placement is gone shows "no longer available."

---

## Storage and billing

Storage is a **dynamic slider**: one continuous scale of GB, no feature tiers. The
per-GB price drops as the slider rises. There are **two independent single-payer
sliders** — your personal storage, and (with `manage_billing`) a server's own
storage — never combined, never allocated across.

**The load-bearing rules**

- **One payer per byte, accounts never combine.** Every work is owned by one
  storage account — a user or a server. There's no pooling: members can't donate
  free space or fund a server's slider. A server is funded by its own slider,
  bounded by it (over the level the admin set → read-only).
- **Content-addressed dedup.** Media is stored by `sha256`; the quota counts
  unique blobs. A clip reposted ten times is stored and billed once. The meter
  reads "X GB used (from Y GB of files)" so people see reposts cost nothing.
- **Storage only — no feature tiers.** Every account has every feature; paid GB
  unlock only space. Upgrading slides the scale; downgrading slides back.
- **Free floor:** every user gets **10 GB free** (hard cap, no card); every server
  gets **~5 GB free** (flat per server, not per member).

**Two guarantees that remove the anxiety**

- **Never surprise-charged.** At any ceiling, new uploads are blocked (read-only),
  never auto-billed. Buying more is always an explicit slide.
- **Never deleted for non-payment.** Over quota or a lapsed card makes files
  read-only; they stay and you can always download them. A server whose billing
  admin leaves goes: transfer billing → grace window → read-only, never deleted.

**Mid-cycle changes are asymmetric.** Sliding **up** unlocks capacity immediately
and charges the prorated difference for the days left (the consent action). Sliding
**down** gives no refund; the lower level takes effect at the next renewal.

The storage screen (Server settings → Storage & billing, gated `manage_billing`)
shows a usage bar and a slider each for personal and server storage, with a live
blended $/GB, plus an **Export** (a zip of every server file and its metadata,
content-addressed, no lock-in).

**Ready when**

- The signer checks the paying account's remaining quota before a PUT; over quota
  returns read-only, not a charge.
- The meter shows the dedup win (used vs. uploaded).
- Slide-up prorates and unlocks; slide-down defers to renewal with no refund math.
- A billing admin leaving triggers transfer → grace → read-only, never deletion.

---

## Notifications

An in-app bell only for v1 (no email or push yet). Notifications group by day
across tabs: **All / Mentions / Threads / Saved**.

- A row links to its target — a mention, comment, join, or reaction — and supports
  an inline reply.
- **Mark all read** clears the unread state.

**Ready when**

- Mentions, comments, joins, and reactions each create a linking row.
- Inline reply posts to the right target; mark-all-read clears counts live.

---

## Search and the quick switcher

A global overlay (⌘/Ctrl+K) over any screen — not its own route.

- Debounced prefix search; the empty state shows recents and jump-to.
- Results group into servers, channels, people, and files, each capped and
  keyboard-navigable (↑↓/⏎).
- **Scope is the live read rule:** results only surface what you're allowed to
  see; a private channel gates on `can_view_channel`.

**Ready when**

- Results never surface a private channel or a work you can't read.
- Keyboard navigation selects and opens a result.

---

## Utility screens

Minimal, on-brand cards with no rail, centered on a scrim.

| Screen | When | Behavior |
|---|---|---|
| **404 / not found** | A bad URL | One card, back-to-Feed. Never leaks whether a private thing exists. |
| **Dead invite** | A bad `/join/<code>` | Distinct copy for **expired**, **revoked**, **full**, and **already-a-member**. |
| **Access denied** | A private channel or server you can't see | A quiet "You don't have access" — deliberately not a 404 that leaks existence. |

**Ready when**

- Each dead-invite state renders its own message and CTA.
- Access-denied and 404 never reveal the existence of private content.

---

## The responsive contract

The desktop shell is four panes: **server rail (58) · channel column (232) · main
· members rail (210)**. A phone shows **one pane at a time**.

| Desktop pane | Mobile treatment |
|---|---|
| Server rail | Bottom tab bar (Home · Messages · Servers · Notifications · You) |
| Channel column | A left drawer (swipe or tap the server name) |
| Main | Full-screen; the default on load |
| Members rail | Off-screen; reached via a members icon → full-screen sheet |
| Details pane | A full-height bottom sheet |
| Any hover affordance | Bound to long-press or an always-visible "⋯" — never hover-only |

Breakpoints: **≥1100px** full four panes · **720–1099px** members rail collapses
to an icon · **<720px** single pane plus bottom tabs.

**Ready when**

- No screen relies on hover on touch.
- Each pane has its documented mobile collapse, and the bottom sheet is full-height.

---

## Two end-to-end workflows

These trace real collaborations through the product to confirm the pieces connect.

### A remote album — producers and rappers across Ableton and FL

1. A producer creates a server "LP," seeds `#beats` and `#refs`, and invites the
   group by link. Everyone joins `@everyone` — no role setup.
2. She uploads a loop as a **Server** file into a **beats** folder. The
   storage-impact line confirms it draws the server's storage.
3. A rapper opens it in the Details pane, hits **Save to my files** to keep a copy
   in his own storage, and replies in `#beats` chat (a server file has no comment
   thread; discussion is the channel).
4. He records a take and uploads it as a new Server file, crediting the producer
   as a **collaborator** (auto-accepted — they're co-members).
5. When the track is done, the producer **publishes** her favorite render to her
   public portfolio. That forks a personal copy crediting the original; the server
   file stays put, and the two diverge by design.

### A VFX shot on a deadline — compositor, animator, mograph

1. A studio server "Shot 042" has folders per task and a private `#client`
   channel gated to admins by an allow-list.
2. The animator uploads a playblast as a Server file into the **anim** folder; the
   File explorer's **feed** view lets the team scroll every previewable render
   newest-first with comments inline.
3. The compositor crossposts a personal reference frame into the server — it stays
   on her storage but everyone can see it via the placement.
4. An admin **detaches** an out-of-date plate placement from the server; the
   owner's file and bytes are untouched.
5. On delivery, an admin **exports** the server — a content-addressed zip of every
   file and its metadata, no lock-in.

---

## Flows worth making easier

The product's job is to feel fast where a user acts often. These are the paths to
keep frictionless — and the friction to watch for.

- **Just post.** The one-step upload (drop → visibility → Post) is the default;
  the artist-shaped Title/Tags/Collaborators form stays collapsed. Watch for any
  required field creeping above the disclosure.
- **A small server needs no console.** Owner + `@everyone` with light defaults
  must administer a 5-friend server with zero role setup. Roles are opt-in.
- **Save is one tap.** Keeping a copy from the Details pane shouldn't ask which
  storage or explain dedup at length — a short note is enough.
- **Add a friend without a directory.** Exact-handle-only is deliberate, so make
  the field forgiving (trim `@`, clear "no such handle" copy) since there's no
  search to fall back on.
- **Know who pays, at a glance.** The storage-impact line at upload and the
  storage row in the Details pane keep "whose bytes" honest without a trip to
  settings. Keep them plain-language.
- **Never a dead end on storage.** Hitting a cap blocks the upload with "free
  space or add storage" and a direct slide to buy — never a silent failure and
  never a surprise charge.
- **Discussion lives in one place per context.** A post is discussed in its
  comment thread; a server file, in its channel. Don't split the conversation
  across both.

---

## The TODO list

Everything still open, gathered in one place. Full detail lives in the linked
files; this is the index.

### Owner decisions still open

These are genuine build-vs-buy or policy calls (COLLAB history, CANON §D):

- **WebRTC provider for calls (v2)** — LiveKit / Daily / 100ms / self-hosted.
- **Transcode scope** — audio-only for v1 is the recommendation; video is heavier.
- **Notifications channel beyond the bell** — email/push is a later single pipe.
- **DMCA agent registration** and **Supabase region** — load-bearing before launch.
- **Ratify the permission-flag set** (CANON §D.1) — the proposed flags are marked
  ⚑ratify.
- **Member-color palette** — the 30 hex pairs are a design deliverable to sign off
  in `gallery.html`, then write into `styleguide.html` tokens (CANON §A.10).

### Design and build TODOs — [`design/gallery.html`](design/gallery.html)

`gallery.html` is LAW and has **~50 pending edits** tracked in
[`design/gallery-todo.md`](design/gallery-todo.md). Grouped:

- **Identity:** circular profile pictures everywhere; remove name-card circles;
  add owner/public/mutual profile POVs.
- **Details pane:** file-size row instead of the storage sentence; drop the
  storage×visibility badges; fix the channel/location row; better button balance;
  fix the discussion model (comments on public, none in server); remove Opens-with
  and the save blurb; add nav arrows, a Modified date, and by-whom.
- **Folder pane:** show item count once; scrolling, navigable side list; fix audio
  thumbnails; Save-to-Files and Download for whole folder or selection.
- **Thumbnails:** list every image/video/audio placeholder; make previewable-type
  containers transparent.
- **Media players:** center the play button; hi-res waveform in audio expanded
  view; music icon on audio cards; speed and quality settings; rectangular
  progress bar, no round knob; borderless play icon; unify audio and video player;
  invisible 5-second skip.
- **Upload sheet:** tighten copy; add a folder-upload variant; add a real upload
  entry point.
- **File-browser features:** right-click/burger menu and selection mode; clumped
  multi-file channel posts; many more explorer filters.
- **Servers:** surface server icons and covers beyond the rail.
- **Sharing:** a Google-Drive-style Share dialog (set visibility); a read-only
  shared-view screen.
- **Files:** a Trash that auto-empties after 30 days; a starring system.
- **Storage states:** storage-upgrade UI; a read-only-over-cap screen.
- **New screens/states:** a Settings screen; blocked/pending state screens.
- **Polish:** slash-command list; hover animation on every button; hidden
  scrollbars that keep scroll; loading/skeleton states everywhere; empty states
  everywhere; toast and upload-progress visuals; a single consistent
  unpreviewable-file icon.

Two reference lists are now written out of that queue: the slash-command set
([`design/slash-commands.md`](design/slash-commands.md), todo #35) and the
placeholder-art inventory ([`design/placeholders.md`](design/placeholders.md),
todo #28).

### Brand assets to draw — [`design/brand-assets-todo.md`](design/brand-assets-todo.md)

Hand-drawn assets (Inkscape), not gallery work: logo, wordmark lockup, brandmark
glyph, favicon set, social/OG share-card template, unpreviewable-file icon,
default server icon, and optional empty-state illustrations. The Tauri app-icon
set is deferred with the desktop version.

## Appendix: Backend plan (§7)

This appendix is the hand-off-ready backend plan — the tables, RPCs, Realtime
channels, indexes, and migration order the build runs against.
[`CODEGEN.md`](CODEGEN.md) and the [`prompts/`](prompts/) build queue cite it by
section number (§7.2, §7.4, §7.6, §7.8, §7.9), so its numbering is kept stable.

The backend is a **true clean slate** — the schema is authored fresh for this
product (`create table if not exists`, in the migration order of §7.8). Every
table ships with RLS: **the policy is the fence, the UI is the signpost**. This
plan carries the CANON §D architecture — granular roles, the placement model,
dynamic-slider storage, and collaborator consent — as its baseline.

### 7.1 Tables
Each row: purpose · columns · RLS summary. `uid()` = `(select auth.uid())`.

**Servers, roles, and channels**

| Table | Purpose | Columns (beyond `id uuid pk default gen_random_uuid()`, `created_at`) | RLS |
|---|---|---|---|
| `servers` | a studio | `slug uniq, name, description, cover_key, owner_id→auth.users` | read: `member_of(id)`; write: `is_server_admin(id)` |
| `server_members` | membership + colour + timeout | `server_id, user_id, color smallint, timeout_until timestamptz, joined_at, pk(server_id,user_id)` | read: `member_of(server_id)`; self-leave; admin manages |
| `roles` | permission roles (CANON §D.1) | `server_id, name, color smallint, position int, permissions bigint (flag bitmask), is_default bool (@everyone)` | read: `member_of(server_id)`; write: `has_perm(server_id,'manage_roles')` |
| `member_roles` | members ↔ roles (union of power) | `server_id, user_id, role_id, pk(server_id,user_id,role_id)` | read: member; write: `manage_roles` |
| `channel_roles` | v1 private-channel allow-list | `channel_id, role_id, pk(channel_id,role_id)` — zero rows = open to all members | read: member; write: `manage_channels` |
| `server_invites` | invite links | `code text pk, server_id, created_by, expires_at, max_uses int, uses int default 0` | read: admin; use via RPC |
| `channels` | rooms | `server_id, name, kind in(text,voice), topic, slowmode_sec int default 0, position int` | read: `can_view_channel(id)`; write: `manage_channels` |

**Chat, DMs, and people**

| Table | Purpose | Columns | RLS |
|---|---|---|---|
| `messages` | persistent chat | `channel_id, user_id, body, parent_id→messages, also_to_channel bool, edited_at, deleted_at, body_tsv tsvector generated` | read: `can_view_channel`; insert: member & not timed-out; update/delete own (tombstone); delete-any: `delete_any_message` |
| `message_reactions` | emoji reactions | `message_id, user_id, emoji text, pk(message_id,user_id,emoji)` | read: member; add/remove own |
| `message_pins` | per-channel pins | `channel_id, message_id, pinned_by, pk(channel_id,message_id)` | read: member; pin: `pin_message`; unpin-any: admin |
| `channel_reads` | unread/mention state | `user_id, channel_id, last_read_at, pk(user_id,channel_id)` | owner only |
| `mentions` | @-index for badges | `message_id, mentioned_user, server_id` | read: mentioned user |
| `dm_channels` | 1:1 and group DMs | `is_group bool, name null` | member of it |
| `dm_members` | who's in a DM | `dm_channel_id, user_id, muted bool, pinned bool, last_read_at, pk(...)` | self |
| `dm_messages` | DM chat | mirrors `messages` (dm_channel_id, user_id, body, parent_id, edited_at, deleted_at) | member of the DM |
| `friendships` | add-by-handle | `a_user, b_user, status in(pending,accepted,blocked), requested_by, pk(a_user,b_user)` ordered pair | either party |
| `profiles` | account (name, handle, bio, status, presence) | `handle uniq, name, bio, avatar_key, status_emoji, status_text, status_expires_at, presence_state, tz, pronouns, links jsonb` | read: public; write: self |
| `notifications` | the bell | `user_id, kind in(mention,comment,join,reaction,invite,friend), actor_id, server_id null, target_type, target_id, excerpt text, read_at` | owner only |

**Works, files, and storage**

| Table | Purpose | Columns | RLS |
|---|---|---|---|
| `works` | the uploaded thing | `owner_type in(user,server), owner_id, visibility in(public,personal,server), server_id null, title null, file_ext, kind, blob_sha→media_blobs, bytes, search_tsv tsvector generated` | `works_read` (CANON §B.3): public, or own, or `visibility='server' & member_of`, or readable via any `placement` |
| `work_items` | items of a multi-item work | `work_id, blob_sha, position` | inherits the work |
| `work_collaborators` | consent-gated collaborators (CANON §D.3.1) | `work_id, user_id, role text null, status in(accepted,pending), pk(work_id,user_id)` | read: work-readers; write: owner + accepted collaborators; self-remove always |
| `content_tags` | user labels | `work_id, tag text` | read: work-readers; write: owner + accepted collaborators |
| `comments` | post-level threads | `work_id, user_id, context in(public), body, parent_id, resolved_at, deleted_at` | read: work-readers; write: friend-of-owner / `comment` |
| `placement` | one work → many surfaces (CANON §D.3) | `work_id, surface in(feed,server,dm), surface_id, channel_id null, folder_id null→folders, placed_by` | read: those who can see the surface; write: `upload`; detach: owner or moderation |
| `folders` | nested server file tree | `server_id, parent_id null→folders (null=root), name` | read: `member_of`; write: `manage_channels`/folder perm |
| `media_blobs` | content-addressed dedup store | `sha256 pk, bytes, refcount` | server-managed; GC at refcount 0 |
| `storage_meters` | usage per account | `owner_type in(user,server), owner_id, bytes_used (sum of DISTINCT owned blobs), pk(owner_type,owner_id)` | read: the account's members/self |
| `storage_balance` | one slider per account | `owner_type, owner_id, purchased_gb, status, stripe_customer, pk(owner_type,owner_id)` | read/write: self / `manage_billing` |
| `saved_items` | Save to my files (owner copy) | `user_id, work_id, folder_id null→save_folders, pk(user_id,work_id)` | owner only |
| `save_folders` | personal bookmark folders | `user_id, name, pk(id)` | owner only |

**Moderation**

| Table | Purpose | Columns | RLS |
|---|---|---|---|
| `server_bans` | bans | `server_id, user_id, banned_by, reason, until timestamptz null` | admin |
| `reports` | flagged content | `reporter_id, target_type, target_id, reason, created_at` | reporter writes; admin reads |
| `audit_log` | moderation trail | `server_id, actor_id, action, target_type, target_id, meta jsonb` | admin read; server-written |

The signer (`api/sign.mjs`) keeps its rate-limit machinery; it now checks the
paying account's remaining quota (`storage_meters` vs `storage_balance`) before
issuing a PUT.

### 7.2 Key columns and enums (the load-bearing fields)
```
works.owner_type   text in(user,server)          -- which storage account owns + PAYS (CANON §D.2)
works.owner_id     uuid                          -- that account
works.visibility   text in(public,personal,server) default 'public'  -- one enum, labels Public/Server/Private
works.server_id    uuid null                     -- the chosen server when visibility='server'
works.title        text null                     -- file name is the default title
works.file_ext     text                          -- icon + Type filter, never rendered as a tag
works.kind         text                          -- image/video/audio/text/other, drives the renderer
works.blob_sha     text → media_blobs            -- content-addressed; dedup counts unique blobs
works.bytes        bigint                         -- for the storage row / meter
works.search_tsv   tsvector generated            -- title + tags + owner, for search
comments.context   text in(public)               -- post comments only; a server file discusses in its channel
comments.resolved_at timestamptz null            -- post comments resolve
profiles.status_emoji / status_text / status_expires_at  -- global custom status
profiles.presence_state text in(online,idle,dnd,invisible) default 'online'
profiles.tz text · profiles.pronouns text · profiles.links jsonb  -- shown on the member popout
```

### 7.3 RPCs, triggers, functions (all `security definer`, `search_path=public`)
- **Gate helpers** every policy calls: `member_of(server_id)`,
  `is_server_admin(server_id)`, `has_perm(server_id, flag)`,
  `can_view_channel(channel_id)` (member_of AND no role-deny on `view_channel`),
  and `dm_member(dm_channel_id)`.
- `join_via_invite(code)`, validate code (exists, not expired, uses<max) → insert `server_members`, grant the `@everyone` role, assign the next free colour (cycles past the palette size), `uses+1`; returns the server. (Powers `/join/<code>`.)
- `set_member_roles(user, role_ids[])` / `set_channel_access(channel, role_ids[], member_ids[])`, the granular-role writers (CANON §C.17/§C.18).
- `mark_channel_read(channel_id)`, upsert `channel_reads.last_read_at=now()`.
- `toggle_reaction(message_id, emoji)`; `pin_message` / `unpin_message`.
- `create_dm(handle)` / `create_group_dm(handles[])`, resolve handles→users (friendship required), find-or-create `dm_channels` + `dm_members`.
- `add_friend(handle)` / `respond_friend(user, accept)` / `block_user(user)`.
- `move_to_folder(work_id, folder_id)`, sets the file's `placement.folder_id`.
- `adopt_work(work_id)`, move a work's owner → the server (needs `manage_billing`).
- `ban_member` / `timeout_member` / `kick_member` (admin), each writes `audit_log`; the owner can't be kicked or banned.
- `export_manifest('server', id)`, returns JSON of works+metadata; the client fetches signed URLs and zips.
- **Triggers:** `messages` fanout on insert → parse `@handle`, write `mentions` + `notifications`; set `edited_at` on body change; tombstone on `deleted_at`. `works` insert → maintain `search_tsv`. `comments` insert with a mention → `notifications`. A work insert/delete adjusts `media_blobs.refcount` (GC the blob at 0) and `storage_meters`. Rate-limit `messages` (e.g. 60/min), comments, and reports.
- **Utility:** `file_report`, `delete_my_account`, `profiles_tombstone` (departed members grey, not deleted).

### 7.4 Realtime (Supabase)
| Channel | Mode | Carries |
|---|---|---|
| `server:{id}` | **Presence** | who's online + "working on" `{doing}` (Members rail) |
| `channel:{id}` | **Postgres Changes** | live `messages` insert/update/delete |
| `channel:{id}:typing` | **Broadcast** | typing indicators (ephemeral, no table) |
| `user:{id}` | **Postgres Changes** | `notifications` insert (the bell) |
Add the relevant tables to the `supabase_realtime` publication.

### 7.5 Server / edge functions
- `api/sign.mjs`, **exists**, presigned R2 uploads. Unchanged.
- `transcode`, audio on demand (F11). **Not** a Supabase Edge Function (no ffmpeg
  there); a Vercel Node function with `ffmpeg-static`, or a tiny worker. Video is
  a later, heavier call (Mux/Cloudflare Stream).
- `notify`, email/push fanout off `notifications` (later; shares the CSAM-alert pipe).
- Export can stay client-side (JSZip) reading `export_manifest`; move server-side only if zips get large.
- WebRTC signaling is the provider's (LiveKit/Daily), not ours.

### 7.6 Client packages: build vs buy (smallest unit each)
| Unit | Decide | Why |
|---|---|---|
| Voice/video calls (F14) | **Buy: LiveKit** (cloud or self-host) | media/SFU stack is months of work; rooms key by channel/DM id |
| Full-text search (#1) | **Build: Postgres FTS** (`tsvector` + GIN) | built in, enough for one server's scale; revisit Meilisearch only if it strains |
| Emoji picker (#5) | **Buy: emoji-mart** (data + search) | emoji dataset + skin tones is not worth hand-rolling |
| Message formatting (#5) | **Build tiny** | plain textarea + toolbar that inserts markdown; render with `marked` (small). No ProseMirror/Slate for v1 |
| Mentions / channel autocomplete | **Build** | a prefix query over members/channels; trivial |
| Drag-reorder (channels) | **Buy: SortableJS** | DnD edge cases (touch, autoscroll) are the time-sink |
| Waveform render | **Build (already have)** | `generateWaveform()` exists and is theme-aware; keep |
| Zip export (F19) | **Buy: JSZip** | standard, client-side |
| Local time / dates | **Build: `Intl`** | built in; store `profiles.tz` |
| Quick switcher / shortcuts (#2) | **Build** | already mocked; a keydown map + fuzzy filter |
| Invite codes | **Buy: `nanoid`** | 1-line, collision-safe short codes |
| Transcode (F11) | **Buy the binary: `ffmpeg-static`**, glue is ours | don't reimplement codecs |
| Rich profile / status / presence (#6) | **Build** | plain columns + Realtime presence |

### 7.7 Indexes and search
- GIN on `messages.body_tsv`, `works.search_tsv`; one `search_all(q, scope)` RPC
  unions the three (messages, works, comments) with `ts_rank`, feeding screen #1
  and the quick switcher. Modifiers (`from:`, `in:`, `has:`) parse client-side into
  query args.
- FK indexes on every `*_id` used in a policy or a join (`messages.channel_id`,
  `notifications.user_id, read_at`, `channel_reads`, …) , same discipline as the
  existing `works_*_idx`.

### 7.8 Migration order (each a re-runnable file, `schema-*.sql` convention)
1. `servers`, `server_members`, `server_invites` + `member_of`/`is_server_admin`.
2. Granular roles: `roles` (seed owner + `@everyone`), `member_roles`, `channel_roles` + `has_perm`/`can_view_channel` (CANON §D.1).
3. `media_blobs`, `storage_meters`, `storage_balance`; `works` (+ `works_read`, §B.3), `work_items`, `folders`, `placement`, `work_collaborators`, `content_tags` (+ tag/credit consent RPCs).
4. `channels`, `messages` (+tsv), `message_reactions`, `message_pins`, `channel_reads`, `mentions`, gated on `can_view_channel`.
5. `comments` (context, resolved_at); `profiles`.
6. `dm_channels`/`dm_members`/`dm_messages`; `friendships`.
7. `notifications`; `saved_items`/`save_folders`; message/comment→notification triggers.
8. Moderation: `server_bans`, `reports`, `audit_log`, `server_members.timeout_until`.
9. RPCs (§7.3), FTS indexes (§7.7), grants, `notify pgrst 'reload schema'`, realtime publication.

### 7.9 Per-screen backend checklist (so nothing is missed)
- **Workspace**, `server_members`→rail; `channels`→column; `messages`+Realtime→chat; `channel_reads`→unread badges; `message_reactions`; Presence→members.
- **Thread view**, `messages.parent_id`; `also_to_channel`.
- **Channel Pins/Files**, `message_pins`; works placed in the channel (`placement where channel_id`) for Files.
- **Search / quick switcher**, `search_all()` + FTS indexes, every hit filtered through the live read policy (`can_view_channel`).
- **Feed**, `works` where `visibility='public'` and author ∈ friends (`friendships` accepted).
- **File explorer**, `works` + `placement.folder_id` + `folders where server_id`; `storage_meters`/`storage_balance` for the storage footer.
- **Details pane**, `works` + `content_tags` + `work_collaborators` + `comments(context=public)` (posts) or the channel link (server files) + `saved_items` + transcode.
- **Profile / popout**, `profiles` (status/tz/pronouns/links) + `member_roles` + mutual servers (a join) + `friendships`.
- **Messages**, `dm_channels`/`dm_members`/`dm_messages` + `friendships`.
- **Server settings**, `channels` (manage), `roles`/`member_roles`/`channel_roles`, `server_invites`, `server_bans`, `audit_log`, `storage_balance`/`storage_meters` (two sliders), `export_manifest`.
- **Create / Join**, `servers` insert (seed owner + `@everyone`) + `server_invites` + `join_via_invite`.
- **Notifications**, `notifications` + Realtime `user:{id}`; inline reply reuses `messages`/`comments`.
- **Sign-in / onboarding**, Supabase Auth + the sign-in/claim screen (CANON §C.14) + unique `profiles.handle` claim.
- **Call** *(v2 — deferred, not built)*, a LiveKit room per `channel`/`dm` id; Presence for who's in.
