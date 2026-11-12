#!/usr/bin/env bash
# Claude Code hook (SessionStart + UserPromptSubmit): warn when the shared Development
# branch has moved on origin, or when local commits are not pushed yet, so a session
# pulls before editing and merges stay small. Never blocks; never touches the tree.
# Throttled: the fetch runs at most once per 90s per checkout (file mtime in .git).
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || exit 0

stamp=".git/upstream-check.stamp"
now=$(date +%s)
last=0
[ -f "$stamp" ] && last=$(stat -f %m "$stamp" 2>/dev/null || stat -c %Y "$stamp" 2>/dev/null || echo 0)
if [ $((now - last)) -ge 90 ]; then
  timeout 20 git fetch -q origin >/dev/null 2>&1 || git fetch -q origin >/dev/null 2>&1 || true
  touch "$stamp" 2>/dev/null || true
fi

behind=$(git rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)
ahead=$(git rev-list --count "$upstream..HEAD" 2>/dev/null || echo 0)
[ "$behind" = 0 ] && [ "$ahead" = 0 ] && exit 0

msg=""
if [ "$behind" != 0 ]; then
  list=$(git log --format='  %h %an: %s' "HEAD..$upstream" 2>/dev/null | head -8)
  msg="⚠ $upstream is $behind commit(s) ahead of $branch — pull before editing:
$list"
  [ "$behind" -gt 8 ] && msg="$msg
  …"
fi
if [ "$ahead" != 0 ]; then
  [ -n "$msg" ] && msg="$msg
"
  msg="$msg↑ $branch has $ahead unpushed commit(s) — push once CI-safe so teammates pull them."
fi
# Dirty tree + upstream ahead = the merge that bites; say so.
if [ "$behind" != 0 ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  msg="$msg
  (working tree has local changes — commit or stash, then git pull --rebase)"
fi

# Exact text for both the user and the model (SessionStart/UserPromptSubmit read stdout as context).
printf '%s\n' "$msg"
