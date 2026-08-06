#!/usr/bin/env bash
#
# QUBIT — nightly Postgres backup. RUNS ON THE BOX (installed by scripts/install-backup.sh,
# fired by cron). See docs/36 §4 / DECISIONS DM1.69.
#
# Usage (on the box):
#   ./backup-db.sh            # take a backup, prune old ones
#   ./backup-db.sh --verify   # additionally restore the new dump into a scratch database
#                             # and compare table counts, then drop the scratch DB
#
# Design notes worth knowing before you change this:
#   * pg_dump runs as the SUPERUSER (postgres) inside the db container, not as the app's
#     `qubit` role. The app role is deliberately non-superuser so FORCE row-level security
#     applies to it — which also means it cannot read every row, so a dump taken as `qubit`
#     would silently be INCOMPLETE. This is the same trap as DM1.18, one layer down.
#   * Custom format (-Fc): compressed, and restorable table-by-table with pg_restore.
#   * The dump contains real user emails — PII. Directory is 0700, files 0600, and the
#     backups live outside the app tree so a stray rsync --delete can never touch them.
#   * set -euo pipefail + a non-zero exit on any failure, so cron surfaces the problem
#     instead of leaving a zero-byte file that looks like a backup.
set -euo pipefail

STACK_DIR="${STACK_DIR:-/home/osbui/applications/qubit}"
BACKUP_DIR="${BACKUP_DIR:-/home/osbui/backups/qubit}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
DB_NAME="${DB_NAME:-qubit}"
DB_SUPERUSER="${DB_SUPERUSER:-postgres}"
LOG_FILE="${LOG_FILE:-$BACKUP_DIR/backup.log}"

VERIFY=0
[ "${1:-}" = "--verify" ] && VERIFY=1

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"; }
fail() { log "FAILED: $*"; exit 1; }

cd "$STACK_DIR" || fail "stack dir $STACK_DIR not found"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/qubit-$STAMP.dump"

log "starting backup → $OUT"

# -Fc custom format; --no-owner/--no-privileges keep the dump portable across roles, and
# the app's roles/grants are recreated by docker/db-init.sh on a fresh stack anyway.
if ! docker compose exec -T db pg_dump -U "$DB_SUPERUSER" -d "$DB_NAME" -Fc --no-owner --no-privileges > "$OUT.part" 2>>"$LOG_FILE"; then
  rm -f "$OUT.part"
  fail "pg_dump returned non-zero"
fi

# A dump that exists but is empty/truncated is worse than no dump — it looks like success.
SIZE="$(stat -c%s "$OUT.part" 2>/dev/null || stat -f%z "$OUT.part")"
[ "$SIZE" -gt 10240 ] || { rm -f "$OUT.part"; fail "dump is only ${SIZE}B — refusing to keep it"; }

mv "$OUT.part" "$OUT"
chmod 600 "$OUT"
log "ok — $(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B") written"

# ── Restore verification (--verify) ─────────────────────────────────────────────
# Restores into a SCRATCH database and drops it afterwards. The live database is never
# touched: an untested backup is a hope, not a backup.
if [ "$VERIFY" = "1" ]; then
  SCRATCH="qubit_restore_check_$STAMP"
  log "verify: restoring into scratch db $SCRATCH"
  docker compose exec -T db psql -U "$DB_SUPERUSER" -d postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null
  docker compose exec -T db psql -U "$DB_SUPERUSER" -d postgres -c "CREATE DATABASE \"$SCRATCH\";" >/dev/null
  # pg_restore exits non-zero on non-fatal warnings too; -e off + explicit table check below.
  if ! docker compose exec -T db pg_restore -U "$DB_SUPERUSER" -d "$SCRATCH" --no-owner --no-privileges < "$OUT" 2>>"$LOG_FILE"; then
    log "verify: pg_restore reported warnings — checking the result anyway"
  fi
  LIVE_TABLES="$(docker compose exec -T db psql -U "$DB_SUPERUSER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" | tr -d '\r')"
  REST_TABLES="$(docker compose exec -T db psql -U "$DB_SUPERUSER" -d "$SCRATCH" -t -A -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" | tr -d '\r')"
  # Row-level spot check on the tenant table, which has NO RLS, so counts are directly
  # comparable without a tenant context.
  LIVE_TENANTS="$(docker compose exec -T db psql -U "$DB_SUPERUSER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM tenant;" | tr -d '\r')"
  REST_TENANTS="$(docker compose exec -T db psql -U "$DB_SUPERUSER" -d "$SCRATCH" -t -A -c "SELECT count(*) FROM tenant;" | tr -d '\r')"
  docker compose exec -T db psql -U "$DB_SUPERUSER" -d postgres -c "DROP DATABASE \"$SCRATCH\";" >/dev/null
  log "verify: tables live=$LIVE_TABLES restored=$REST_TABLES · tenants live=$LIVE_TENANTS restored=$REST_TENANTS"
  [ "$LIVE_TABLES" = "$REST_TABLES" ] || fail "table count mismatch — the dump is not a faithful copy"
  [ "$LIVE_TENANTS" = "$REST_TENANTS" ] || fail "tenant count mismatch — the dump is not a faithful copy"
  log "verify: PASS — this dump restores cleanly"
fi

# ── Retention ───────────────────────────────────────────────────────────────────
PRUNED="$(find "$BACKUP_DIR" -maxdepth 1 -name 'qubit-*.dump' -mtime "+$RETAIN_DAYS" -print -delete | wc -l | tr -d ' ')"
[ "$PRUNED" = "0" ] || log "pruned $PRUNED backup(s) older than $RETAIN_DAYS days"

KEPT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'qubit-*.dump' | wc -l | tr -d ' ')"
log "done — $KEPT backup(s) on disk"
