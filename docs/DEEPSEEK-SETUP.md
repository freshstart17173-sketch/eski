# Setting up a DeepSeek agent for eski

A practical guide to running **DeepSeek V4‑Pro** inside the **DeepSeek Harness (`dsh`)**
against this repo, with GitHub, MCP (incl. Supabase), vision, skills, and full project
context wired in — so it can do the same kind of work the Claude Code agent does here.

> **Accuracy note (read first).** This was written 2026‑08‑31 from public sources dated
> around the V4‑Pro GA launch (mid‑Aug 2026). DeepSeek Harness is an early/developer‑preview
> project with "expected compatibility‑breaking changes," and some details below come from
> third‑party setup guides, **not** the official repo README. Treat the **shapes** as correct
> and **verify the exact commands, package names, and config keys against the version‑matched
> official docs** before relying on them:
> - Harness repo: `https://github.com/deepseek-ai/deepseek-harness`
> - API docs: `https://api-docs.deepseek.com`
>
> Every place that's likely to drift is flagged with **⚠ verify**.

---

## 0. What you're actually setting up

Two separate things — don't conflate them:

| Piece | What it is |
|---|---|
| **DeepSeek V4‑Pro** | The *model*. A 1.6T‑param MoE, ~1M‑token context, up to 384k output, hybrid thinking/non‑thinking, tuned for long‑running **agentic** + software‑engineering tasks. GA `deepseek-v4-pro-0813`, MIT‑licensed. This is the brain. |
| **DeepSeek Harness (`dsh`)** | The *agent runtime* (the "harness"). An open‑source Node.js app on the **Cordis** plugin framework: it builds the system prompt, keeps a session/turn log, calls the model, runs tool calls through a shared registry, and supports **MCP**, **hooks**, and **skills**. This is the body — the DeepSeek equivalent of Claude Code. |

V4‑Pro itself is **text/agentic, not multimodal** — vision is a *separate* model (see §5).

---

## 1. Prerequisites

- **Node.js** `^22.19.0` or `>=24.0.0`. ⚠ verify against the repo's `engines`.
- A **DeepSeek API key** from `https://platform.deepseek.com` (Platform → API keys).
- A **GitHub token** (fine‑grained PAT) scoped to the `freshstart17173-sketch/eski` repo —
  `contents:rw`, `pull_requests:rw`, `issues:rw` is enough for the work done in this repo.
- Your **Supabase** access token + project ref `zidqagrmxeawpasurpwi` (for the DB MCP, §4).

Keep every secret in an env var or the harness's credential store — **never in a prompt,
`cordis.yml`, or a committed file.** Put them in a local `.env` that's git‑ignored:

```bash
# .env  (DO NOT COMMIT)
export DEEPSEEK_API_KEY="sk-..."
export GITHUB_TOKEN="github_pat_..."
export SUPABASE_ACCESS_TOKEN="sbp_..."
```

---

## 2. Install the harness

Fastest path (npx):

```bash
npx @deepseek-ai/dsh web        # ⚠ verify the published package name
# → serves the web UI at http://127.0.0.1:3080
```

From source (what the third‑party guide actually verified, macOS/arm64):

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web                     # → http://127.0.0.1:3080
```

Sanity check: the page loads at `:3080` and returns HTTP 200.

---

## 3. Point it at V4‑Pro (auth + model)

Set the API key in the harness's credential mechanism (env var is the simplest):

```bash
source .env                      # DEEPSEEK_API_KEY now in the environment
```

Select the model for the session:

- **`deepseek-v4-pro`** (or the pinned `deepseek-v4-pro-0813`) — default for coding/agent work here.
- **`deepseek-v4-flash`** — the cheaper 284B variant for quick/cheap turns.

The base URL for the DeepSeek API is `https://api.deepseek.com` (OpenAI‑compatible
`/chat/completions`, plus Messages & Responses endpoints). ⚠ verify how the harness expects
the model + key (env var names vs. a `models:` block in `cordis.yml`).

---

## 4. MCP access (GitHub + Supabase + more)

The harness speaks **MCP** through a plugin, **`@deepseek-ai/dsh-mcp-client`** — **one plugin
instance = one MCP server**. Registered tools appear to the model as
`mcp__<serverName>__<rawName>` (e.g. GitHub's `create_issue` → `mcp__github__create_issue`) —
the *same* naming Claude Code uses, so any MCP server you already use here works unchanged.

MCP servers are mounted in **`cordis.yml`** (the harness's composition file). ⚠ verify the exact
schema — this is the most likely thing to have drifted.

### GitHub access

```yaml
# cordis.yml
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

That gives the agent PR/issue/commit/file tools against `freshstart17173-sketch/eski`.
**Develop on the `preview` branch and push there** (see §6) — same rule this repo already
follows; it deploys to `preview.eski.lol`.

### Supabase access (this project's DB)

```yaml
  - id: mcp-supabase
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: Supabase
      transport: stdio
      command: npx
      args: ['-y', '@supabase/mcp-server-supabase@latest',
             '--project-ref=zidqagrmxeawpasurpwi']   # ⚠ verify package + flags
      env:
        SUPABASE_ACCESS_TOKEN: !!js process.env.SUPABASE_ACCESS_TOKEN
```

This is what lets the agent run `list_migrations` / `list_tables` / `apply_migration` /
`execute_sql` — **essential**, because per `docs/VERIFICATION.md` backend claims here must be
proven against the live DB, not from a single simulation. Remote HTTP servers use
`transport: streamable-http` + a `url`/`headers` block instead of `command`/`args`.

Inspect what got mounted:

```bash
dsh web --dump-config | grep -A3 mcp        # ⚠ verify flag
```

---

## 5. Vision

**V4‑Pro does not accept images.** Multimodal is a distinct, experimental model:

- **`deepseek-v4-flash-vision-exp`** — mixed **text + image** input; images via **base64**,
  **URL**, or the (free) **Files API**; billed up to **384 tokens/image** at Flash pricing;
  works on Chat Completions / Messages / Responses.

So for eski's visual‑QA loop (render a screen in `?demo=1`, screenshot, *look* at it), you have
two options:

1. **Two‑model setup (recommended):** keep V4‑Pro as the coding brain, and when a step needs to
   *see* a screenshot, route that one call to `deepseek-v4-flash-vision-exp` (pass the PNG as
   base64) and feed its description back to V4‑Pro. If the harness supports a per‑role/per‑task
   model override, configure the "vision" role to the vision model. ⚠ verify the harness exposes
   a vision/model‑routing hook.
2. **Screenshot‑as‑artifact:** have the harness save screenshots to disk (Playwright is already
   set up here — Chromium at `/opt/pw-browsers`, no install) and only send them to the vision
   model when a change is visual. This matches the repo's rule that a demo screenshot proves
   *layout*, not live data.

If your harness build can't route to a second model, vision won't work through V4‑Pro alone —
that's a model limitation, not a config you can force.

---

## 6. Skills

The harness has a **Skill System**: skills are **Markdown documents** (metadata: `name`
kebab‑case, `description`, `invocation`, `provider`, `content`, `resourceBase`) invoked as
**`/skill-name`** slash commands — the same shape as Claude Code skills. So this repo's existing
skills port over almost directly:

- **`eski-style`** — the token/component source of truth (are.na‑monochrome design language).
- **`eski-polish`** — the alignment/spacing/density finishing pass.

To wire them up:

1. Copy `.claude/skills/eski-style/SKILL.md` and `.claude/skills/eski-polish/SKILL.md` into
   wherever `dsh` discovers skills (⚠ verify the path — likely a `skills/` dir or a
   `cordis.yml` skills block).
2. Adjust the front‑matter keys to the harness's field names (`invocation`/`provider` vs.
   Claude's `name`/`description`) if they differ.
3. Confirm they list, then invoke with `/eski-style` before any styling work.

**Hooks** are also supported via a **Codex‑compatible `hooks.json`** (`SessionStart`,
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`; a hook exiting with code **2** blocks
the action). Port this repo's `SessionStart` behaviour (fast‑forward `preview` to origin's tip)
into a `hooks.json` `SessionStart` command so every session starts on the true tip.

---

## 7. In‑depth project context (the important part)

The harness is only as good as the context you hand it. eski already keeps all of its truth in
the repo, so **point the agent at these files first** — ideally in the system prompt / a project
context file the harness loads on every session:

| File | Why it's load‑bearing |
|---|---|
| **`CLAUDE.md`** (repo root) | The operating rules: solo project, straight‑to‑`main`/prod, work tracked in `docs/`, design rules that must be *enforced not relitigated* (one canonical name, colours from tokens, `--r` radius, square icon buttons, scrim‑not‑shadow). |
| **`docs/CANON.md`** | **The single source of truth** — vocabulary (§A), roles/permissions↔RLS (§B), per‑screen UI registry (§C), added scope (§D), backend/data model + migration order (§E), workflows (§F), open decisions (§G). *When anything disagrees with CANON, CANON wins.* |
| **`docs/design/gallery.html`** | **LAW** — every screen + every dialog/menu/modal rendered live; the measured target for what each surface looks like. |
| **`docs/TODO.md`** | The master TODO + runbook: the "Start here" ritual, the work queue, and the deterministic test method. Start every session here. |
| **`docs/VERIFICATION.md`** | **Mandatory before any RLS/write test.** Documents the traps (a `col = auth.uid()` INSERT that flips 42501 non‑deterministically over MCP) and the reliable method (static analysis + service‑role shape check + live path). |
| **`docs/BUILDLOG.md`** | Append‑only history so any agent can cold‑start; the newest dated entries + "Current state" are the map. |
| **`.claude/skills/eski-style`, `eski-polish`** | The design values + the finishing‑pass audit (see §6). |

### Give it a project‑context file

DeepSeek Harness is described as **Codex‑ and Claude‑Code‑compatible** for hooks, so it likely
reads a project context file. Either:

- **Reuse `CLAUDE.md`** if the harness loads it, **or**
- Create an **`AGENTS.md`** at the repo root (the Codex convention) whose whole job is to say:
  *"Read `docs/CANON.md` and `docs/TODO.md`'s 'Start here' first; CANON wins on any conflict;
  load the `eski-style` skill before any styling; verify backend claims via
  `docs/VERIFICATION.md`; develop on `preview` and push there; produce honest status ('renders
  in demo' / 'backend‑verified' / 'needs live QA'), never a bare 'works'."*

Keep it short and make it **point at** the canon rather than duplicate it — a second copy is the
exact "duplicate selector / synonym" failure mode `CLAUDE.md` warns against.

### The deterministic test loop (so V4‑Pro doesn't ship regressions)

Wire these into the agent's workflow (they're all sandbox‑runnable here):

- **Backend:** Supabase MCP (§4) + the `docs/VERIFICATION.md` method (roll everything back in a
  `do $$ … raise exception 'RESULTS:%' … $$` block; never leave rows in the live DB).
- **Frontend:** serve the repo and drive headless Chromium against `http://localhost:PORT/?demo=1`,
  screenshot, assert **zero `pageerror`**; `node --check <file>` for syntax. A green screenshot
  proves *render*, not live data — say so.

---

## 8. First‑run checklist

1. `dsh web` loads at `:3080`; model set to `deepseek-v4-pro`.
2. `mcp__github__*` and `mcp__Supabase__*` tools are listed (`--dump-config | grep mcp`).
3. `/eski-style` resolves; `hooks.json` `SessionStart` fast‑forwards `preview`.
4. Vision routed to `deepseek-v4-flash-vision-exp` (or screenshots saved for it).
5. Hand it a **read‑only** first task to confirm context, e.g.:
   *"Read `docs/TODO.md` and list every open item in the master TODO; confirm you're on `preview`
   at origin's tip."* — it should behave exactly like the Claude agent did.
6. Only then give it a real queue item; make it commit to `preview` + append a `BUILDLOG.md` entry.

---

## Sources

- [DeepSeek V4‑Pro overview (DeepInfra)](https://deepinfra.com/blog/deepseek-v4-pro-model-overview)
- [DeepSeek launches V4‑Pro, Aug 2026 (Unite.AI)](https://www.unite.ai/deepseek-ships-v4-pro-as-its-flagship-model-leaves-preview/)
- [DeepSeek V4 architecture/pricing (Morph)](https://www.morphllm.com/deepseek-v4)
- [DeepSeek V4 Preview release notes (official API docs)](https://api-docs.deepseek.com/news/news260424/)
- [DeepSeek Harness repo (deepseek-ai/deepseek-harness)](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness — MCP client, hooks & skills (DeepWiki)](https://deepwiki.com/deepseek-ai/deepseek-harness/7.2-mcp-client-hooks-and-skills)
- [Connect MCP servers to DeepSeek Harness (Composio)](https://composio.dev/content/how-to-connect-mcp-servers-to-deepseek-harness)
- [MCP integration config (DeepSeek Harness docs)](https://deepseekdocs.com/en/docs/features/mcp)
- [DeepSeek Harness setup: dsh, plugins, MCP (atoms.dev)](https://atoms.dev/blog/deepseek-harness)
- [DeepSeek‑V4‑Flash‑Vision‑Exp multimodal release (official API docs)](https://api-docs.deepseek.com/news/news260821/)
