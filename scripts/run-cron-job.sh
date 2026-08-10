#!/usr/bin/env bash
#
# QUBIT — run one scheduled job by name. RUNS ON THE BOX, called by cron.
#
#   ./scripts/run-cron-job.sh nightly-snapshot
#   ./scripts/run-cron-job.sh nudger
#   ./scripts/run-cron-job.sh checkin-chase
#
# Why a wrapper instead of the curl line docs/deployment.md shows: that puts CRON_SECRET
# in the crontab, where it is visible to `crontab -l`, copied into every backup of the
# crontab, and duplicated per job. Here the secret is read from .env.production at run
# time and never printed — the crontab holds only a job name.
set -euo pipefail

STACK_DIR="${STACK_DIR:-/home/osbui/applications/qubit}"
ENV_FILE="${ENV_FILE:-$STACK_DIR/.env.production}"
URL="${URL:-https://q.fikrawork.com/api/internal/cron}"
LOG="${LOG:-$STACK_DIR/cron.log}"

JOB="${1:-}"
[ -n "$JOB" ] || { echo "usage: $0 <job>" >&2; exit 2; }

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

# Read the secret without exporting it into the environment of anything else.
SECRET="$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'' || true)"
if [ -z "$SECRET" ]; then
  log "$JOB FAILED: CRON_SECRET missing from $ENV_FILE"
  exit 1
fi

# --fail so an HTTP error is an exit code, not a silently logged error body. The response
# body is logged (it carries per-job counts); the secret is only ever in the header.
if body="$(curl -sS --fail --max-time 120 -X POST "$URL" \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $SECRET" \
    -d "{\"job\":\"$JOB\"}" 2>&1)"; then
  log "$JOB ok $body"
else
  log "$JOB FAILED $body"
  exit 1
fi
