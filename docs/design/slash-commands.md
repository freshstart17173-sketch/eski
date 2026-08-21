# Slash commands — the message-composer command set

Captured 2026-08-21. Answers gallery todo **#35** ("produce a list of slash
commands"). This is the design list; it is not yet in the composer mockup.

A slash command is typed into the **message composer** (a channel or a DM),
starts with `/`, and either runs a moderation/utility action or inserts styled
text. It is only ever a **shortcut to a capability that already exists in
CANON** — no command grants anything the hover menus, member rail, or settings
screens don't already grant. Every command below cites the CANON §B row or RPC
that enforces it, so the fence stays the same whether you click or type.

The composer shows an autocomplete list (gallery todo #35's UI) filtered as you
type `/`; a command you can't run (missing permission) is **not offered**, the
same way a disabled button isn't shown.

## Action commands (map to an existing RPC / capability)

| Command | Does | Where it works | Enforced by (CANON §B / RPC) |
|---|---|---|---|
| `/slowmode <seconds>` | Set this channel's slowmode; `0` clears it. | Server channel | `manage_channels` → `channels.slowmode_sec` |
| `/timeout @member <duration>` | Temporarily mute a member (e.g. `10m`, `1h`). | Server channel | `timeout_member` rpc (`moderate_members`) + `audit_log` |
| `/kick @member` | Remove a member from the server. | Server channel | `kick` (`is_server_admin`); owner can't be kicked |
| `/ban @member` | Ban a member. | Server channel | `ban_member` rpc (`is_server_admin`) + `audit_log` |
| `/invite` | Create/copy an invite link for this server. | Server channel | `is_server_admin` → `server_invites` |
| `/leave` | Leave this server. | Server channel | self-leave (`server_members`) |
| `/dm @handle` | Open (or start) a DM with a friend. | Anywhere | `create_dm` rpc; requires `friendships.status='accepted'` |
| `/status <emoji?> <text?>` | Set your status; empty clears it. | Anywhere | self-write `profiles.status_*` |
| `/upload` | Open the upload sheet in the current context. | Server channel | `upload` (placement into this channel) |
| `/search <query>` | Jump to search prefilled with the query. | Anywhere | read-scoped (`works_read` / channel visibility) |

**Deliberately *not* commands** (kept out to protect the model):

- **No `/nick`** — identity is `name` + server colour; there is no per-server
  nickname in the schema (`server_members` has `color`, `timeout_until`, no
  nick). Adding one would be new scope, not a shortcut.
- **No `/pin`** — a pin targets one specific message; it stays a message-hover
  action (`pin_message`), where the target is unambiguous.
- **No `/react`** — same reason; reactions target a specific message via the
  hover/long-press menu.

## Text commands (client-side, no backend)

Insert or transform composer text only; they never hit an RPC.

| Command | Inserts |
|---|---|
| `/shrug` | `¯\_(ツ)_/¯` appended to your message |
| `/spoiler <text>` | wraps the text as a spoiler (markdown, revealed on click) |

`/me` (italic third-person action line) is **held** — messages render markdown
via `marked`, but there is no action-message style in CANON yet. ⚑ratify with
the owner before adding it (it would be a new message render mode, not just a
macro).

## Open decision

Whether to ship the two text commands at all in the beta, or keep the composer
to action commands only, is a small owner call — logged in
[`gallery-todo.md`](gallery-todo.md) #35 and CANON §G (open owner decisions). The action
set above is safe to build now because every row already exists in CANON §B.
