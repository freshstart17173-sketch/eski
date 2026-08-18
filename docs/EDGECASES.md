# Context-crossover edge cases — state audit

eski is three products wearing one schema: a **social** app (friends, DMs,
presence), a **work** app (servers, canvas, versions, boards), and a **portfolio**
(public posts). The seams between them are where data leaks, strands, or lands in
an undefined state. This doc runs two personas through their real loops and
enumerates every crossover hazard I could find, with a fix grounded in how
Discord / Instagram / Figma / Slack handled the same thing.

It is a **findings + proposals** doc, not a lock. Rows that need a decision are
tagged **⚑DECIDE**; once chosen they graduate into CANON.

---

## 0. The root cause (read this first)

Almost every hazard below traces to **one modelling choice**: a `work` has a
**single `visibility`** and a **single `server_id`** (CANON §A.9, §B.3). But the
product constantly wants *the same file* to appear in several places at once — your
private drafts, a server for feedback, a DM, a canvas, your public portfolio —
each with its **own discussion, its own storage owner, its own audience**. A single
`visibility`+`server_id` cannot express "lives in my personal space **and** is shown
in server X **and** attached in a DM."

So today, the moment a work crosses a context, one of three things happens:

- **No legal data path** — the read policy denies it (a personal work shared into a
  server/DM is readable only by the owner: `works_read` = `public OR owner OR
  (server AND member)`; a personal crosspost is none of the first, matches neither
  of the last → **members can't open it**). The crosspost concept in §D.3 has no
  backing table.
- **Silent carry-over** — tags and credits live *on the work*, so a tag a server-mate
  adds is now on your public post too; a credit added in one server renders (or
  fails to render) in another.
- **Orphan / limbo** — the work's `server_id`/owner points at a server or member
  that's gone, and nothing decided what happens.

**The fix that dissolves most of the table** (what every mature app converged on):
separate **the work** (owned, one *home*, one storage pool, its tags/credits/versions)
from **placements** — lightweight references that put a work into a channel, DM,
canvas, or public feed. Discussion and audience attach to the **placement**, not the
work. This is Slack "shared to N channels", Notion "move / mention", Figma
"place instance", Instagram "post vs reshare-to-story". Concretely:

```
work            (owner_id, home in ('personal'), storage_source, bytes, tags, credits, version_of)
                 -- a work always has exactly ONE home + ONE storage pool
placement        (id, work_id, surface in ('feed','server','dm','canvas'),
                  surface_id, placed_by, created_at)
                 -- the same work can have many placements; each is a reference
```

`works_read` then becomes "readable if you can see **any** placement of it (or it's
`public`, or you own it)". Storage never moves on a share (the home pays). This is
referenced throughout as **[PLACEMENT]**.

Where a row can be fixed without that refactor, it says so.

---

## 1. The two personas and where v1 already can't serve them

### Persona A — "Late Night Lobby": five friends, socializing

Loop: a private server; text channels for chat/memes/links; voice hang-outs; **game
streaming**; **movie nights**; reaction spam; custom status ("in queue"); the odd
clip someone wants on their public profile too.

| Their expectation | v1 reality | Severity |
|---|---|---|
| Watch a movie / stream a game **together** | **Not supported** — calls & screenshare are v2 (CANON §0), and voice channels are **disabled/hidden in v1**. The headline use case of a social server does not exist yet. | **Blocker for persona A** |
| Casually dump a 2 GB movie in a channel | It lands in the **server storage pool**, PAYG, **billed to one person** (§D.2). Five friends dumping media bankrupts whoever owns billing. | High — cost surprise |
| Share a meme they *found* (not their work) | The upload model is artist-shaped: **Title / Tags / Credits / version**. There is no "just post an image" fast path; "credits" and "versions" are meaningless noise here. | Medium — wrong mental model |
| Custom emoji, soundboard, bots | Not modelled. Social servers live on these. | Medium — feature gap |
| A 5-person friend group | Sees a **granular role/permission matrix** built for studios. Massive over-engineering for "we're all admins." | Medium — onboarding friction |
| Forward a funny message to another chat | No **forward/repost** primitive (only `also_to_channel` back to a thread's parent). | Medium |

### Persona B — "Late Bloom LP": four artists, collaborating + portfolios

Loop: personal public portfolios; a project server; upload stems/comps as server
files; **crosspost** a personal WIP in for feedback; review on the **canvas** with
annotations + versions; a **board** of tasks; then push a finished piece to their
**public** portfolio; save others' public work for inspiration.

| Their expectation | v1 reality | Severity |
|---|---|---|
| Crosspost my personal WIP into the server so the team can see it | **No data path** — a `personal` work isn't readable by members under `works_read`; §D.3 describes it but no table backs it. | **Blocker for the core loop** |
| Push a finished server file to my public portfolio | Undefined — is it a visibility flip (moves it out of the server, breaking everyone's links) or a copy (splits history/versions)? See §2. | High |
| Add a version to a file | "Anyone can add a version" (COLLAB §7.2 dropped the owner guard) — fine in a server, **alarming on a public post** (a friend could add v2 to your portfolio piece). | High |
| Credit a collaborator | `works.credits` is text; a credited person didn't consent and can't remove themselves; renders with no colour off-server. | Medium |
| Save a peer's public work for inspiration | Works, until it goes private / they unfriend → dangling save. See §7. | Medium |

**Takeaway:** persona A is mostly **unbuilt** (calls/voice) and mildly **mis-fit**
(artist upload flow, heavy roles). Persona B's **crosspost loop has no backing
table**. Both are fixable; both are load-bearing.

---

## 2. Visibility & sharing transitions (the core table)

A work's `visibility` is `public | server | personal` with one `server_id`. Every
arrow between contexts is a hazard.

| # | Transition / trigger | What breaks — carried / lost / limbo | Fix (precedent) |
|---|---|---|---|
| V1 | **Personal/public → crosspost into a server** | No read path: members can't open it (`works_read`). §D.3's crosspost is unbacked. | **[PLACEMENT]** — a `server` placement grants read via the placement, not `visibility`. (Slack "share to channel"; the file keeps its home.) |
| V2 | **Server file → make public** (push to portfolio) | If it's a **visibility flip**, `server_id` must clear → the file **vanishes from the server** and every message/canvas/board link to it 404s. Storage must move server→personal pool. Comments (server context) strand. | Don't flip — **add a public placement** and keep the server one; storage stays where the home is. If the home *was* the server, "publishing" = **fork to a personal copy** (new work, `version_of=null`, credit original). (Instagram "share post to your story" = reshare, not move.) ⚑DECIDE: publish = new placement vs personal fork. |
| V3 | **Public post → make Private** | Existing crossposts/placements in servers, DM attachments, and others' **saves** now point at a work they can no longer read. | Cascade: making a work Private **retracts its placements** (they show "author made this private"), same as IG (a post going private disappears from others' saved). Owner is warned how many places it's shown. |
| V4 | **Private draft → shared in a DM** | `works_read` denies non-owner DM members (personal, no server) → **the person you sent it to can't open it**. | **[PLACEMENT]** `dm` placement grants read to DM members. (Discord DM attachments are readable by the DM.) Until [PLACEMENT], DM file-sharing is broken. |
| V5 | **Work crossposted into two servers** | Two disjoint comment/annotation threads; which server "owns" tags? Storage counted once (good) but "remove from server" ambiguous. | [PLACEMENT] makes this natural: N placements, discussion per placement, tags on the work. "Remove" detaches one placement. (Slack multi-channel share.) |
| V6 | **Change which server** a server-native file belongs to | `server_id` change moves storage pool + breaks the old server's references + strands old-context comments. | Disallow moving a **native** file between servers; offer **crosspost** instead (a placement) so the original stays put. |
| V7 | **Server file whose channel is later made Private** | The file was visible to all members; now gated by `can_view_channel`. Members who saw it, saved it, or linked it lose access retroactively. | Re-gate reads on `can_view_channel` (already in §D.1). Warn on making a channel private: "N files/messages become hidden." Saves dangle → row S-series. |
| V8 | **"personal" vs "public" for a work not in any server** | `personal` (Private) and `public` are both `server_id=null`; a work with `visibility=personal` shared anywhere has no grant path (V4). | The home is always `personal`; **audience** is a property of placements + a `public` flag, not a tri-state that also encodes location. [PLACEMENT] collapses this. |

---

## 3. Identity: credits, member colour, @-mentions crossing contexts

Member colour is **server-scoped** (§A.10) and must never appear on public/Feed.
Credits and mentions reference **people**, whose identity presentation is
context-dependent.

| # | Trigger | What breaks | Fix (precedent) |
|---|---|---|---|
| I1 | **Credit added in server X, work shown in server Y / public** | `works.credits` is text; the credited handle may not be a member of Y (no colour) or is off-server on public (must be colourless). Renders inconsistently or as a dead handle. | Store credits as `work_credits(work_id, user_id, role_text)` (a real reference, not text). Render the **name** everywhere; apply member hue **only** when the viewer shares the credited person's *current* server context; plain on public. |
| I2 | **Credited person never consented** | Anyone can stamp your name on their work; it appears on their public portfolio as if you vouch for it. | Credits are **claims that notify the credited user**, who can **remove themselves** (Instagram tagging: tagged users can remove the tag; pending tags off by default for strangers). ⚑DECIDE: auto-show for friends/co-members, pending for strangers. |
| I3 | **Credited/mentioned person leaves the server** | Their `user_id` is no longer a member → colour gone, popout "not in this server", but the credit/mention persists. | Keep the reference; render name in neutral grey with a "former member" affordance. (Discord keeps mentions of departed users, greyed.) |
| I4 | **@mention in a server of a non-member** (autocomplete can't find them, but a raw paste of their handle) | Mention resolves to a real global user who isn't in the server → they get a notification for a server they can't open (row N2), or it renders as plain text. | Only resolve mentions to **members** (`can_view_channel`); non-members render as plain text, no notification. (Slack won't notify non-channel-members.) |
| I5 | **Member colour in exported / crossposted content** | A server file's credit chips carry hue; pushed to public they must lose it; a canvas link-shared publicly shows member-hued annotations. | Colour is applied at **render** from the *viewer's* server context, never baked into stored data — so it simply doesn't apply off-server. Enforce: no hue value is ever persisted onto a comment/credit/annotation row. |

---

## 4. Discussion: comments vs chat vs annotations crossing contexts

Post-level **comments** (`comments`, context = `public` or a `server_id`) vs
**channel chat** vs canvas **annotations** (per §C.7: posts have comment threads;
server files defer to chat; folders have neither).

| # | Trigger | What breaks | Fix (precedent) |
|---|---|---|---|
| D1 | **A public post is crossposted into a server** | It's a *post* (has public comments) but now viewed as a *server file* (should defer to chat). Which discussion shows? Do public commenters and server members see each other? | Discussion follows the **placement**: on the public placement you see public comments; on the server placement you see the server chat thread. They never merge (privacy). Show a subtle "also discussed on the creator's post" affordance, not the content. (Notion "move to teamspace" keeps comments scoped to the page but access re-gates.) |
| D2 | **Server file with chat replies → later published to public** | Chat replies (server-context, private) must **not** travel to the public post. But the creator expects "the discussion" to come along. | They don't travel — publish creates a fresh public placement with an empty public comment thread. Warn: "server discussion stays in the server." |
| D3 | **Annotation on a work, then the work is removed from the canvas** | Annotations key to `(canvas_id, work_id)`; remove the `canvas_item` → annotations orphan (canvas_id valid, work no longer on it). | Deleting a `canvas_item` **soft-deletes its annotations** (or keeps them for restore). Never leave annotation rows whose work isn't on the canvas. (Figma: removing a frame archives its comments.) |
| D4 | **Comment authored, then the commenter is blocked by the viewer** | Block should hide their content both directions (§B.4), but their old comments on a shared work persist. | Blocking hides the blocker's comments from the blocked user's view **client-side per-viewer**, not by deleting (their comment still exists for others). (Instagram/Discord block = per-viewer hide.) |
| D5 | **Folder (no comments) contains posts (which have comments)** | The folder pane shows no discussion, but its items individually do. Users may look for discussion at the folder level. | Correct as designed (folder is a grouping); ensure clicking an item opens its own pane with its own discussion. No fix needed — documented so it isn't "fixed" into a bug. |

---

## 5. Storage & billing crossing contexts (PAYG, §D.2–D.3)

Two pools: personal (the user) and server (the biller). Placement must not move
bytes; ownership churn must not strand cost.

| # | Trigger | What breaks | Fix (precedent) |
|---|---|---|---|
| P1 | **Crosspost draws personal pool but appears in a server** | Correct by design — but if the owner is **out of personal quota**, the crosspost upload fails even though the *server* has room. Confusing "why can't I share, the server has space?". | Message must name the pool: "This draws **your** storage (crosspost); you're full — post it to the server instead to use server storage." |
| P2 | **Member leaves / is removed; their native server files remain** | `storage_source=server` files keep counting against the **server** pool, but their `owner_id` left. Who can edit/delete them now? Cost persists. | Native server files are **owned by the server** for storage/moderation (like Slack: files posted to a workspace belong to the workspace). The departed user loses edit; admins manage. Bytes stay on the server pool (the server chose to host them). |
| P3 | **Member leaves; their crossposts (personal pool) were shown in the server** | The reference should stay or go? Bytes are theirs (personal), but the team relied on the file. | The **placement** is detached when they leave (or their content withheld), the file stays theirs, bytes stay personal. The server sees "shared by a former member — no longer available" unless they re-share. (Instagram: unfollow/leave doesn't delete their posts, but private ones vanish.) |
| P4 | **Server deleted** | Native files (server pool) deleted + pool zeroed + billing stopped — good. But **crossposts** (personal) must survive (they're not the server's bytes), and members' **saves** of server files now dangle. | Delete cascades native content only; detach placements of personal crossposts; saved_items of deleted works are pruned/marked unavailable. |
| P5 | **Biller (owner) leaves / stops paying** | Server storage is billed to `owner_id`/`manage_billing`. If they leave, who pays? Does the server go read-only? Data hostage. | On biller exit, transfer billing to another admin or put the server in a **grace/read-only** state (Discord server ownership transfer; a grace period before lockout). ⚑DECIDE: grace window + transfer flow. |
| P6 | **Same file crossposted to 5 servers** | Counted once (personal) — good — but "delete" from one server must not delete the file; "delete the file" must clean all 5 placements. | [PLACEMENT] cascade: delete work → remove all placements; remove placement → file untouched. |

---

## 6. Membership churn — leave / kick / ban (the biggest orphan cluster)

When a member exits, everything keyed to them in that server needs a decided fate.

| # | Their artifact in the server | Undefined today | Fix (precedent) |
|---|---|---|---|
| M1 | **Chat messages** | Delete or keep? | **Keep**, author shown greyed as former member (Discord/Slack keep messages; deletion would gut threads). Ban optionally purges last N days (Discord "delete message history"). |
| M2 | **Native files they uploaded** | Owner left; edit/delete rights, storage cost | Server-owned (P2); admins manage; readable as before. |
| M3 | **Crossposts they shared** | Reference to a personal file | Detach placement (P3); file stays theirs. |
| M4 | **Board cards assigned to them** | `assignee_id` → non-member | Unassign to "unassigned" + audit-log note; keep the card. (Jira/Linear reassign on deactivate.) |
| M5 | **Canvas they own** (`owner_id`) but server-scoped | Orphan owner; can others still edit? | Server-scoped canvases are **server-owned**; a departed owner's canvas stays; admins can reassign owner. Personal canvases go with them. |
| M6 | **Annotations / comments they authored** | Persist under a non-member | Keep, greyed (D3/I3). |
| M7 | **Roles / member_roles / channel_roles** | Dangling grants | Cascade-delete their `member_roles`; their private-channel grants removed. |
| M8 | **Pending @mentions / notifications** to them | They get notified for a server they can't open (N2) | Suppress delivery once membership ends. |
| M9 | **They were the last admin / owner** | Server leaderless | Block the last owner from leaving without transfer, or auto-promote (Discord blocks; offers transfer). ⚑DECIDE. |
| M10 | **Ban, then they had public posts crossposted in** | Ban removes membership + should stop their content surfacing | Ban detaches their placements and blocks re-join on any invite (§7.1 `server_bans`); their personal files are untouched (owner's). |

---

## 7. Saves, folders, and dangling references

`saved_items` (personal) and `collections`/Folders (server) reference works that can
move out from under them.

| # | Trigger | What breaks | Fix (precedent) |
|---|---|---|---|
| S1 | **You save a server file, then get kicked** | The save points at a work you can no longer read | Save resolves through the live read policy → shows "no longer available" placeholder, offers remove. (Instagram saved-of-private-post = greyed/removed.) |
| S2 | **You save a public post, the author makes it Private** | Same dangling read | Same placeholder; pruned on next access. |
| S3 | **A Folder (server) contains a crosspost whose owner left** | Item points to a detached placement | Folder shows the item as unavailable; admin can remove. |
| S4 | **You save your own crosspost, then delete the original** | Save + all placements should clear | Cascade on work delete (P6). |
| S5 | **Save spans contexts** — you save a work seen in server A; later only visible in server B you're not in | Read now denied | Saves are **per-work**, resolved live; if no visible placement remains, it's unavailable. Saves never grant access. |

---

## 8. DMs & group DMs (the third context)

DMs have no roles, no storage pool of their own, no folders — a thin context that
still receives files and forwards.

| # | Trigger | What breaks | Fix (precedent) |
|---|---|---|---|
| DM1 | **File shared in a DM** | Which pool? No `server_id`; `personal` → recipient can't read (V4) | `dm` placement; bytes on **sender's personal** pool; read via placement. (Discord DM files.) |
| DM2 | **Forward a server file into a DM** with a non-member | Leaks a server file to someone outside the server | Forwarding a server file to a non-member **re-uploads a copy to the sender's personal pool** or is blocked; never a live server placement for a non-member. ⚑DECIDE: copy vs block. (Slack: forwarding across workspaces copies.) |
| DM3 | **Group DM vs small server** | Overlapping; a group DM can't have channels/boards/canvas; users may expect them | Offer "upgrade this group DM to a server" (Discord did exactly this). Until then, document the ceiling. |
| DM4 | **You leave a group DM** | Your messages/files stay for the rest; your presence gone | Keep messages (M1); detach your file placements or keep (⚑DECIDE — Discord keeps). |
| DM5 | **DM with someone you then block** | Should hide both directions (§B.4) | Block closes the DM for both, hides history per-viewer (D4). |

---

## 9. Canvas, versions, search, notifications, presence

| # | Trigger | What breaks | Fix (precedent) |
|---|---|---|---|
| C1 | **Canvas set to `link` visibility embeds a server-only / personal work** | Anyone with the link reads the canvas → can they see the embedded work? Leak. | The canvas link grants read to **the canvas surface and its placed works** (that's the point of sharing it) — so **only place works you intend to expose**; warn on link-share if it contains non-public works. (Figma: sharing a file exposes its embedded content; components from private libs are the classic leak.) ⚑DECIDE: block non-public works on a link canvas, or warn. |
| C2 | **Version added by a non-owner to a public post** | "Anyone can add a version" (COLLAB §7.2) is meant for server collaboration; on a **public** post a stranger/friend could add v2 to your portfolio | Gate "add version" by context: **server files** → any member with `add_version`; **public posts** → owner only (or credited collaborators). Reinstate an owner guard for `home=personal & public`. |
| C3 | **Each version is its own `works` row with its own visibility** | v1 public, v2 personal → a version chain that spans audiences; which one shows on the profile? | Versions **inherit the head's placement/visibility**; you don't set visibility per version. Publishing a work publishes its current head; older versions ride along read-gated the same way. |
| C4 | **Search / quick-switcher indexes across contexts** | A `personal`/private work or a private-channel file surfaces in a server search; DM content in server search; server file in public search | `search_all(q, scope)` must filter every hit through the **same read policy** (`can_view_channel`, visibility, placement). Never rank by a raw FTS table without the gate. (This is already the §7.7 intent — call it out as a test.) |
| C5 | **Notification to a user who left / was banned** | They receive a mention/comment notif for a server they can't open | Suppress once membership ends (M8); a tap lands on "you no longer have access." |
| C6 | **Notification from a blocked user** | Blocked user's reaction/comment/friend-request still notifies | Block suppresses notifications both directions (§B.4). |
| C7 | **Custom status / presence scope** | Is "streaming Elden Ring" global (your work server sees it) or per-server? Member colour is per-server; status is undefined | **Status is global** (one per account, like Discord custom status); **member colour and nickname are per-server**. Presence `{doing}` is broadcast per-server (`server:{id}`) so a private server's channel name never leaks to another. ⚑DECIDE: global vs per-server status; confirm `{doing}` doesn't leak private-channel names. |
| C8 | **Profile leaks server membership** | The Server shelf / mutual-servers popout could reveal a private server's existence to a non-member | Server shelf shows only works in servers **the viewer also belongs to** (§B.3); mutual-servers lists only shared ones; `{doing}` shows activity, not the private channel name. Verify no endpoint returns a user's full server list to another user. |
| C9 | **Tags added by a server member appear on the public post** | `content_tags` on `work_id` are global; a server-mate's tag shows publicly | Tags are **on the work**; only the **owner and credited collaborators** can edit tags (not every server member), so they can't graffiti your public metadata. Server-specific labels (if wanted) live on the **placement**, not the work. ⚑DECIDE: who can tag. |

---

## 10. Decisions this surfaces (the ⚑DECIDE list, for CANON)

1. **Adopt the placement model** (work = one home + one pool; placements = references
   into feed/server/dm/canvas). This is the single highest-leverage change; it
   closes V1, V4, V5, D1, P6, DM1, S5 outright. — *biggest call.*
2. **Publish (server → public)** = new public placement (or a personal fork), never a
   `server_id` flip. (V2)
3. **Credits are consenting references** (`work_credits`, notify + self-remove),
   rendered colour-only in-context. (I1, I2)
4. **Add-version is context-gated** — owner-only on public posts, member-permission in
   servers. (C2)
5. **Native server files are server-owned** for storage/moderation once posted; the
   uploader leaving doesn't orphan them. (P2, M2)
6. **Billing continuity** on owner/biller exit: transfer or grace-period read-only.
   (P5, M9)
7. **Status is global; colour/nickname per-server;** presence never leaks private
   channel names. (C7, C8)
8. **Tag/label split**: global tags editable by owner+credited; server-local labels on
   the placement. (C9)
9. **Social persona v1 honesty**: calls/voice/watch-together are v2 — either pull one
   forward or set expectations; add a **fast "just post" path** and a **light default
   role set** so a 5-friend server isn't a permissions console. (§1 persona A)
10. **Forwarding across contexts** copies (personal pool) or is blocked for
    non-members; never a silent cross-context live grant. (DM2)

---

## 11. What each app taught us (precedent index)

- **Discord** — keeps departed users' messages (greyed); blocks last-owner from
  leaving, offers ownership transfer; global custom status + per-server nickname/role
  colour; group-DM → server upgrade; **Forward** copies a message; ban with optional
  history purge. → M1, M9, C7, DM3, DM2, M10.
- **Instagram** — tagged people can remove themselves; pending tags for strangers;
  a post going private disappears from others' saves; "add to story" reshares
  (reference), it doesn't move the post. → I2, S2, V2.
- **Figma / Are.na** — sharing a file exposes its embedded content (private-library
  leak is the classic bug); removing a frame archives its comments. → C1, D3.
- **Slack** — files posted to a workspace belong to the workspace; a message shared
  to N channels is one message with N references; cross-workspace forward copies. →
  P2, V5, DM2.
- **Notion** — moving a page re-gates access and keeps comments scoped to the page,
  not the destination. → D1.
- **Jira / Linear** — deactivating an assignee unassigns their issues rather than
  deleting them. → M4.

---

## 12. Resolutions (2026-08-18) — the ⚑DECIDE rows, decided

| # | Decision | Choice | Notes |
|---|---|---|---|
| 1 | Data model | **Full placement model** | Work = one home + one storage owner; placements reference it into feed/server/dm/canvas. Discussion + audience attach to the placement. Closes V1/V4/V5/D1/P6/DM1/S5. |
| 2 | Social in v1 | **Work-first; social is v2** | Ship the artist/collab product. Friends can chat + share, but voice/watch-together/streaming wait for v2. |
| 3 | Publish (server → public) | **Fork a personal copy** | A new work owned by you, `version_of=null`, crediting the original; the server file stays. Histories diverge by design. |
| 4 | Credits consent | **Auto for friends/co-members, pending for strangers** | Instagram-style. Credited person can always self-remove. `work_credits(work_id, user_id, role)`. |
| 5 | Billing exit | **Transfer, else grace then read-only** | On biller exit: prompt transfer → grace window → read-only until paid. Never deleted. |
| 6 | Who can tag | **Owner + credited collaborators** | Global tags shaped only by the makers; server-local labels (if any) live on the placement. |
| 7 | Forward out (server file → DM non-member) | **Copy to sender's personal storage** | A new work referencing the same dedup blob (near-zero bytes), owned by the sender. No live cross-server grant. |
| 8 | Canvas Link visibility with non-public works | **Everything on the canvas is shared (Google-Docs style) — but WARN** | Link exposes every work placed on the canvas; the share dialog lists what becomes visible. No silent leak; the warning is the guardrail. |
| — | Storage model | **Revised** — see CANON §D.2 | One owner/payer per byte, content-addressed **dedup**, **free quota + flat subscriptions** (not scary PAYG), servers own their native files' bytes, biller continuity. |
| — | Storage×visibility badge | **Three states** | Personal · Private / Personal · Public / Server. Provenance (crosspost/fork) is not shown. |
| — | Annotations scope | **Work + server, not canvas** | One file on many canvases shares one annotation set; annotations are a canvas surface only (no details-pane element). |

**Handled without asking (obvious):** global custom status (per-server nickname/
colour); search filters every hit through the live read policy; departed-member
content greys, isn't deleted; mentions resolve only to members; blocking suppresses
notifications + hides content per-viewer both directions; making a work Private
retracts its placements; deleting a work GC's its dedup blob at refcount 0.

**Still open — the user wants to design this together:** a **generous, flexible**
storage/billing shape (the tier numbers in §D.2 are a placeholder). See the live
discussion; §D.2 will be rewritten once we land it.
