#!/bin/bash
# SessionStart hook — keep every fresh session honest about HEAD.
#
# Why this exists: cloud sessions are cloned fresh at start, but the clone can
# come from a STALE ref (a session started 2026-08-28 was cloned at a commit from
# 08-23 while origin/preview was already at 08-25). The agent then cold-starts
# believing the local files + BUILDLOG are current and builds on old history —
# which collides on push. This hook fetches origin and fast-forwards the checked-
# out branch to its true remote tip BEFORE the agent reads anything, then prints
# that tip so it lands in the session's context.
#
# Safety: only ever FAST-FORWARDS. If the local branch has unpushed commits
# (ahead) or has diverged, it does NOT touch the tree — it warns instead. A dirty
# tree is never reset. Network failure is non-fatal (offline sessions still boot).

set -uo pipefail

# Remote (Claude Code on the web) only — a local checkout is the developer's own.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [ -z "$branch" ]; then
  echo "[session-start] detached HEAD — skipping git-freshness sync."
  exit 0
fi

git fetch --quiet origin "$branch" 2>/dev/null || {
  echo "[session-start] could not fetch origin/$branch (offline?) — continuing on local HEAD $(git rev-parse --short HEAD)."
  exit 0
}

# origin may not have this branch yet (brand-new local branch).
if ! git rev-parse --verify --quiet "origin/$branch" >/dev/null; then
  echo "[session-start] origin has no '$branch' yet — local HEAD $(git rev-parse --short HEAD) is the tip."
  exit 0
fi

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/$branch")"
base_sha="$(git merge-base HEAD "origin/$branch" 2>/dev/null || echo "")"

subj() { git log -1 --format='%h %s' "$1" 2>/dev/null; }

if [ "$local_sha" = "$remote_sha" ]; then
  echo "[session-start] up to date with origin/$branch — HEAD is $(subj HEAD)"
  exit 0
fi

# Dirty tree: never clobber. Warn with the true tip so the agent knows.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "[session-start] WARNING: local origin/$branch has moved to $(subj origin/$branch) but the working tree is dirty — NOT syncing. Reconcile manually before building."
  exit 0
fi

if [ "$local_sha" = "$base_sha" ]; then
  # Strictly behind → fast-forward (a clean reset to origin is equivalent).
  git reset --hard "origin/$branch" >/dev/null 2>&1 \
    && echo "[session-start] fast-forwarded $branch to origin — was $(git log -1 --format='%h' "$local_sha"), now $(subj HEAD). This is the current tip; build on it." \
    || echo "[session-start] WARNING: failed to fast-forward to origin/$branch ($(subj origin/$branch)); reconcile manually."
elif [ "$remote_sha" = "$base_sha" ]; then
  echo "[session-start] local $branch is AHEAD of origin (unpushed commits) — leaving it. Local HEAD $(subj HEAD)."
else
  echo "[session-start] WARNING: local $branch has DIVERGED from origin ($(subj origin/$branch)) — not touching. Reconcile before pushing."
fi
exit 0
