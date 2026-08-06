#!/usr/bin/env bash
#
# QUBIT — one-command deploy to the box.
#
# Rsyncs this working copy to osbui@192.168.2.43:/home/osbui/applications/qubit and
# runs `docker compose up -d --build`. The app container applies Prisma migrations at
# startup (docker/entrypoint.sh), so a schema change deploys with no extra step.
#
# Usage:
#   ./scripts/deploy.sh              # sync + build + restart + verify
#   ./scripts/deploy.sh --no-build   # sync + restart only (no image rebuild)
#   ./scripts/deploy.sh --logs       # after deploy, tail app logs
#
# Overridable via env: BOX, DEST, SSH_KEY, ALIAS_IP, PUBLIC_URL.
set -euo pipefail

BOX="${BOX:-osbui@192.168.2.43}"
BOX_HOST="${BOX##*@}"
DEST="${DEST:-/home/osbui/applications/qubit}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
ALIAS_IP="${ALIAS_IP:-192.168.2.50}"
PUBLIC_URL="${PUBLIC_URL:-https://q.fikrawork.com}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSH="ssh -o ConnectTimeout=8 -i $SSH_KEY"

DO_BUILD=1
TAIL_LOGS=0
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --logs)     TAIL_LOGS=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ── Preflight: can we reach the box on the LAN? ────────────────────────────────
echo "→ checking reachability of $BOX_HOST …"
if ! ping -c1 -t3 "$BOX_HOST" >/dev/null 2>&1; then
  cat >&2 <<EOF
✗ $BOX_HOST is not reachable from this Mac.

  This is almost always the subnet alias/route dropping after a Wi-Fi reconnect.
  Restore it with (remove-then-add so the route is recreated):

    sudo ifconfig en0 -alias $ALIAS_IP 2>/dev/null; sudo ifconfig en0 alias $ALIAS_IP 255.255.255.0

  (Install the launchd daemon in ~/qubit-alias-setup/ to make this automatic.)
EOF
  exit 1
fi

# ── 1. Sync source (never ship node_modules, build output, or secrets) ─────────
echo "→ syncing $PROJECT_DIR → $BOX:$DEST …"
rsync -az --delete \
  -e "$SSH" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.zip' \
  --exclude 'tests' \
  --exclude 'test-results' \
  --exclude 'playwright-report' \
  --exclude 'coverage' \
  --exclude '.DS_Store' \
  --exclude 'screenshots ui' \
  --exclude 'design_handoff_qubit_ai_command_center*' \
  --exclude 'qubit-clickup-transformation-docs' \
  --exclude 'import' \
  --exclude '.claude' \
  --exclude 'tsconfig.tsbuildinfo' \
  "$PROJECT_DIR"/ "$BOX:$DEST"/

# NOTE: --delete keeps the box in sync with local, but the excludes above (esp.
# .env / .env.*) are PROTECTED — rsync will not delete excluded files on the box,
# so the production .env and .env.production stay put.

# ── 2. Build + (re)start on the box ────────────────────────────────────────────
if [ "$DO_BUILD" -eq 1 ]; then
  echo "→ building + restarting stack on box …"
  UP_ARGS="up -d --build"
else
  echo "→ restarting stack on box (no rebuild) …"
  UP_ARGS="up -d"
fi

# shellcheck disable=SC2029
$SSH "$BOX" "cd $DEST && docker compose $UP_ARGS && docker compose ps"

# ── 3. Verify (poll — startup runs Prisma migrations before serving) ───────────
# M-P0a: probe /api/health, not /login. /login only proves Next is serving HTML; health
# runs a real query, so a reachable app with an unreachable database now FAILS the deploy
# instead of passing it. (It is excluded from the auth middleware for exactly this reason —
# a redirect to /login would answer 302 and read as "fine".)
echo "→ verifying (waiting for app to serve; migrations run at startup) …"
code=000
body=""
for i in $(seq 1 30); do
  code="$($SSH "$BOX" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health" 2>/dev/null || true)"
  [ "$code" = "200" ] && break
  sleep 3
done
body="$($SSH "$BOX" "curl -s --max-time 5 http://localhost:3001/api/health" 2>/dev/null || true)"
echo "   local /api/health on box → HTTP $code $body"

if [ "$code" != "200" ]; then
  echo "✗ app+database did not report healthy within 90s — recent app logs:" >&2
  $SSH "$BOX" "cd $DEST && docker compose logs app --tail 40"
  exit 1
fi

pub="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL/api/health" || true)"
echo "   $PUBLIC_URL/api/health → HTTP $pub"
echo "✓ deployed. $PUBLIC_URL"

if [ "$TAIL_LOGS" -eq 1 ]; then
  echo "→ tailing app logs (Ctrl-C to stop) …"
  $SSH "$BOX" "cd $DEST && docker compose logs -f app"
fi
