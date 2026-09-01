# DeepSeek agent setup — step-by-step installation guide

Sets up **DeepSeek V4-Pro** running inside the **DeepSeek Harness (`dsh`)**, wired up against
this repo with GitHub, Supabase, vision, skills, and eski's project context — so it can do the
same kind of work the Claude Code agent does here. Follow the steps in order; each one ends with
something to check before moving on.

> **Read this first.** Written 2026-08-31 from public sources around the V4-Pro GA launch
> (mid-Aug 2026). DeepSeek Harness is an early/developer-preview project with "expected
> compatibility-breaking changes," and some steps below come from third-party setup guides, not
> the official repo README. Steps marked **⚠ verify** are the ones most likely to have drifted —
> check them against the version-matched docs before you rely on them:
> - Harness repo: `https://github.com/deepseek-ai/deepseek-harness`
> - API docs: `https://api-docs.deepseek.com`

Two things this guide installs, so the steps below don't get confusing:

- **DeepSeek V4-Pro** — the *model*. GA build `deepseek-v4-pro-0813`, MIT-licensed. This is the
  brain. It is text/agentic only — **not multimodal** (see Step 6).
- **DeepSeek Harness (`dsh`)** — the *agent runtime* that calls the model, runs tool calls, and
  supports MCP/hooks/skills. This is the body — the DeepSeek equivalent of Claude Code.

---

## Step 1 — Check prerequisites

Before installing anything, make sure you have:

- [ ] **Node.js** `^22.19.0` or `>=24.0.0` (⚠ verify against the harness repo's `engines` field —
      run `node -v` and compare once you've cloned it in Step 3).
- [ ] A **DeepSeek API key** — get one at `https://platform.deepseek.com` → Platform → API keys.
- [ ] A **GitHub token** (fine-grained PAT) scoped to `freshstart17173-sketch/eski` with
      `contents:rw`, `pull_requests:rw`, `issues:rw`.
- [ ] Your **Supabase access token** + this project's ref, `zidqagrmxeawpasurpwi`.

**Checkpoint:** you have all four items above in hand before continuing.

---

## Step 2 — Store your secrets

Never put a secret in a prompt, in `cordis.yml`, or in any committed file. Create a local,
git-ignored `.env`:

```bash
# .env  (DO NOT COMMIT — add it to .gitignore if it isn't already)
export DEEPSEEK_API_KEY="sk-..."
export GITHUB_TOKEN="github_pat_..."
export SUPABASE_ACCESS_TOKEN="sbp_..."
```

**Checkpoint:** `.env` exists, is git-ignored, and all three values are filled in.

---

## Step 3 — Install the harness

Pick ONE of the two paths below.

**Path A — fastest (npx):**

```bash
npx @deepseek-ai/dsh web        # ⚠ verify this is the published package name
```

**Path B — from source** (the path a third-party guide actually verified, on macOS/arm64):

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

Either path serves a web UI at `http://127.0.0.1:3080`.

**Checkpoint:** open `http://127.0.0.1:3080` in a browser — it loads and returns HTTP 200.

---

## Step 4 — Point the harness at V4-Pro

Load your secrets into the environment, then start a session on the right model:

```bash
source .env                      # DEEPSEEK_API_KEY is now in the environment
```

Pick a model for the session:

- **`deepseek-v4-pro`** (or the pinned `deepseek-v4-pro-0813`) — default choice for coding/agent
  work in this repo.
- **`deepseek-v4-flash`** — the cheaper 284B variant, for quick/cheap turns.

The DeepSeek API base URL is `https://api.deepseek.com` (OpenAI-compatible `/chat/completions`,
plus Messages & Responses endpoints). ⚠ verify exactly how your harness build expects the model +
key to be set — an env var, or a `models:` block in `cordis.yml`.

**Checkpoint:** a session starts against `deepseek-v4-pro` with no auth errors.

---

## Step 5 — Connect MCP (GitHub + Supabase)

The harness speaks MCP through a plugin, **`@deepseek-ai/dsh-mcp-client`** — one plugin instance
per MCP server. Registered tools show up to the model as `mcp__<serverName>__<rawName>` (e.g.
GitHub's `create_issue` → `mcp__github__create_issue`) — the same naming Claude Code uses, so any
MCP server already in use on this project works unchanged.

MCP servers are mounted in **`cordis.yml`**, the harness's composition file. ⚠ verify this schema
— it's the piece most likely to have drifted since this guide was written.

**5a. Add GitHub access.** Add this block to `cordis.yml`:

```yaml
plugins:
  - id: mcp-github
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: github
      transport: stdio
      command: npx
      args: ['-y', '@modelcontextprotocol/server-github']
      env:
        GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
```

This gives the agent PR/issue/commit/file tools against `freshstart17173-sketch/eski`. **Develop
on the `preview` branch and push there** — same rule this repo already follows everywhere else;
`preview` deploys to `preview.eski.lol`.

**5b. Add Supabase access.** Add this block too:

```yaml
  - id: mcp-supabase
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: Supabase
      transport: stdio
      command: npx
      args: ['-y', '@supabase/mcp-server-supabase@latest',
             '--project-ref=zidqagrmxeawpasurpwi']   # ⚠ verify package name + flags
      env:
        SUPABASE_ACCESS_TOKEN: !!js process.env.SUPABASE_ACCESS_TOKEN
```

This is **essential**, not optional: per `docs/VERIFICATION.md`, backend claims in this repo must
be proven against the live DB, not from a single simulation — this is what gives the agent
`list_migrations` / `list_tables` / `apply_migration` / `execute_sql`. (A remote HTTP MCP server
would use `transport: streamable-http` + a `url`/`headers` block instead of `command`/`args` —
not needed for either server above.)

**Checkpoint:** confirm both mounted correctly:

```bash
dsh web --dump-config | grep -A3 mcp        # ⚠ verify this flag exists in your build
```

You should see both `github` and `Supabase` listed with their tools.

---

## Step 6 — Set up vision (optional, but needed for visual QA)

**V4-Pro does not accept images** — multimodal is a separate, experimental model,
**`deepseek-v4-flash-vision-exp`** (text + image input, via base64/URL/Files API, billed up to
384 tokens/image at Flash pricing).

For eski's visual-QA loop (render a screen in `?demo=1`, screenshot, look at it), pick one:

- **Option A — two-model setup (recommended).** Keep V4-Pro as the coding brain; route just the
  "look at this screenshot" calls to `deepseek-v4-flash-vision-exp` (pass the PNG as base64) and
  feed its description back to V4-Pro. If your harness build supports a per-role/per-task model
  override, set the "vision" role to the vision model. ⚠ verify your build exposes this routing
  hook — if it doesn't, this option isn't available.
- **Option B — screenshot-as-artifact.** Have the harness save screenshots to disk (Playwright is
  already set up in this repo — Chromium lives at `/opt/pw-browsers`, no install needed) and only
  send them to the vision model when a change is actually visual. This matches the repo's own
  rule that a demo screenshot proves *layout*, not live data.

If your harness build can't route to a second model, vision simply won't work through V4-Pro
alone — that's a model limitation, not something a config change fixes.

**Checkpoint:** a test screenshot successfully round-trips through the vision model (Option A) or
saves to disk for manual/on-demand use (Option B).

---

## Step 7 — Load skills and hooks

The harness has a **Skill System**: skills are Markdown documents (front-matter: `name`
kebab-case, `description`, `invocation`, `provider`, `content`, `resourceBase`) invoked as
`/skill-name` — the same shape Claude Code skills use, so this repo's skills port over directly.

1. Copy `.claude/skills/eski-style/SKILL.md` and `.claude/skills/eski-polish/SKILL.md` into
   wherever `dsh` discovers skills. ⚠ verify the path — likely a `skills/` directory, or a
   `cordis.yml` skills block.
2. If the harness's front-matter field names differ from Claude's (`invocation`/`provider` vs.
   `name`/`description`), adjust the copied files' front matter to match.
3. Confirm both skills list, then invoke `/eski-style` — do this before any styling work.

**Hooks:** the harness also supports a Codex-compatible `hooks.json` (events: `SessionStart`,
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` — a hook exiting with code `2` blocks the
action). Port this repo's `SessionStart` behavior (fast-forward `preview` to origin's tip) into a
`hooks.json` `SessionStart` command, so every session starts on the true tip.

**Checkpoint:** `/eski-style` resolves and returns the skill content; a new session's
`SessionStart` hook fast-forwards `preview`.

---

## Step 8 — Load eski's project context

The harness is only as good as the context it's handed. eski keeps all of its truth in the repo
itself — point the agent at these files first, ideally from the system prompt or a project
context file the harness loads every session:

| File | Why it's load-bearing |
|---|---|
| **`CLAUDE.md`** (repo root) | The operating rules: solo project, straight-to-`main`/prod, work tracked in `docs/`, design rules to *enforce, not relitigate* (one canonical name, colours from tokens, `--r` radius, square icon buttons, scrim not shadow). |
| **`docs/CANON.md`** | **The single source of truth** — vocabulary (§A), roles/permissions↔RLS (§B), per-screen UI registry (§C), added scope (§D), backend/data model + migration order (§E), workflows (§F), open decisions (§G). When anything disagrees with CANON, CANON wins. |
| **`docs/design/gallery.html`** | **LAW** — every screen + every dialog/menu/modal rendered live; the measured target for what each surface looks like. |
| **`docs/TODO.md`** | The master TODO + runbook: the "Start here" ritual, the work queue, and the deterministic test method. Start every session here. |
| **`docs/VERIFICATION.md`** | **Mandatory before any RLS/write test.** Documents the traps (a `col = auth.uid()` INSERT that flips `42501` non-deterministically over MCP) and the reliable method (static analysis + service-role shape check + live path). |
| **`docs/BUILDLOG.md`** | Append-only history so any agent can cold-start; the newest dated entries + "Current state" are the map. |
| **`.claude/skills/eski-style`, `eski-polish`** | The design values + the finishing-pass audit (Step 7). |

**8a. Give it a project-context file.** DeepSeek Harness is described as Codex- and
Claude-Code-compatible for hooks, so it likely reads a project context file too. Either:

- **Reuse `CLAUDE.md`** if the harness loads it as-is, **or**
- Create an **`AGENTS.md`** at the repo root (the Codex convention) whose entire job is to say:
  *"Read `docs/CANON.md` and `docs/TODO.md`'s 'Start here' first; CANON wins on any conflict;
  load the `eski-style` skill before any styling; verify backend claims via
  `docs/VERIFICATION.md`; develop on `preview` and push there; produce honest status ('renders
  in demo' / 'backend-verified' / 'needs live QA'), never a bare 'works'."*

Keep it short and make it **point at** CANON rather than duplicate it — a second copy of the same
rules is the exact "duplicate selector / synonym" failure mode `CLAUDE.md` itself warns against.

**8b. Wire up the deterministic test loop**, so V4-Pro doesn't ship regressions:

- **Backend:** Supabase MCP (Step 5b) + the `docs/VERIFICATION.md` method — roll everything back
  in a `do $$ … raise exception 'RESULTS:%' … $$` block; never leave rows in the live DB.
- **Frontend:** serve the repo and drive headless Chromium against
  `http://localhost:PORT/?demo=1`, screenshot, assert zero `pageerror`; `node --check <file>` for
  syntax. A green screenshot proves *render*, not live data — say so, don't overclaim.

**Checkpoint:** the agent can quote back CANON's §A vocabulary correctly when asked, and knows to
run the VERIFICATION.md method before claiming an RLS policy works.

---

## Step 9 — First run: verify everything together

Work through this checklist in order. Don't skip ahead — each item depends on the ones before it.

1. [ ] `dsh web` loads at `:3080`; the session model is set to `deepseek-v4-pro`.
2. [ ] `mcp__github__*` and `mcp__Supabase__*` tools are listed (`dsh web --dump-config | grep mcp`).
3. [ ] `/eski-style` resolves; a fresh session's `hooks.json` `SessionStart` fast-forwards `preview`.
4. [ ] Vision is routed to `deepseek-v4-flash-vision-exp` (Step 6, Option A) — or screenshots are
       being saved for on-demand use (Option B).
5. [ ] Hand it a **read-only** first task to confirm context is actually loaded, e.g.:
       *"Read `docs/TODO.md` and list every open item in the master TODO; confirm you're on
       `preview` at origin's tip."* — it should behave exactly like the Claude agent does here.
6. [ ] Only once all of the above pass: give it a real queue item, and make it commit to
       `preview` + append a `docs/BUILDLOG.md` entry when done.

**You're done** once all six boxes are checked.

---

## Sources

- [DeepSeek V4-Pro overview (DeepInfra)](https://deepinfra.com/blog/deepseek-v4-pro-model-overview)
- [DeepSeek launches V4-Pro, Aug 2026 (Unite.AI)](https://www.unite.ai/deepseek-ships-v4-pro-as-its-flagship-model-leaves-preview/)
- [DeepSeek V4 architecture/pricing (Morph)](https://www.morphllm.com/deepseek-v4)
- [DeepSeek V4 Preview release notes (official API docs)](https://api-docs.deepseek.com/news/news260424/)
- [DeepSeek Harness repo (deepseek-ai/deepseek-harness)](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness — MCP client, hooks & skills (DeepWiki)](https://deepwiki.com/deepseek-ai/deepseek-harness/7.2-mcp-client-hooks-and-skills)
- [Connect MCP servers to DeepSeek Harness (Composio)](https://composio.dev/content/how-to-connect-mcp-servers-to-deepseek-harness)
- [MCP integration config (DeepSeek Harness docs)](https://deepseekdocs.com/en/docs/features/mcp)
- [DeepSeek Harness setup: dsh, plugins, MCP (atoms.dev)](https://atoms.dev/blog/deepseek-harness)
- [DeepSeek-V4-Flash-Vision-Exp multimodal release (official API docs)](https://api-docs.deepseek.com/news/news260821/)
