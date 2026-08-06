#!/usr/bin/env bash
#
# QUBIT — install the nightly backup cron on the box (M-P0a).
#
# Idempotent: re-running replaces the QUBIT cron line rather than adding a second one.
# Run from this repo; it copies scripts/backup-db.sh to the box and registers cron.
#
#   ./scripts/install-backup.sh              # install / refresh the cron entry
#   ./scripts/install-backup.sh --run-now    # install, then take a --verify backup at once
#
# Schedule: 02:30 UTC daily, with a --verify (restore-tested) run on Sundays. Verifying
# every night would double the I/O for no extra signal; weekly proves the dumps restore.
set -euo pipefail

BOX="${BOX:-osbui@192.168.2.43}"
DEST="${DEST:-/home/osbui/applications/qubit}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH="ssh -o ConnectTimeout=8 -i $SSH_KEY"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_NOW=0
[ "${1:-}" = "--run-now" ] && RUN_NOW=1

echo "→ copying backup-db.sh to $BOX:$DEST/scripts/"
scp -q -i "$SSH_KEY" "$SCRIPT_DIR/backup-db.sh" "$BOX:$DEST/scripts/backup-db.sh"
$SSH "$BOX" "chmod +x $DEST/scripts/backup-db.sh && mkdir -p /home/osbui/backups/qubit && chmod 700 /home/osbui/backups/qubit"

echo "→ registering cron (idempotent — the QUBIT lines are replaced, others untouched)"
$SSH "$BOX" "bash -s" <<EOF
set -euo pipefail
# Keep every non-QUBIT crontab line exactly as it was.
crontab -l 2>/dev/null | grep -v '# qubit-backup' > /tmp/qubit-cron || true
cat >> /tmp/qubit-cron <<'CRON'
30 2 * * 1-6 cd $DEST && ./scripts/backup-db.sh >> /home/osbui/backups/qubit/cron.log 2>&1  # qubit-backup
30 2 * * 0 cd $DEST && ./scripts/backup-db.sh --verify >> /home/osbui/backups/qubit/cron.log 2>&1  # qubit-backup weekly restore test
CRON
crontab /tmp/qubit-cron
rm -f /tmp/qubit-cron
echo "   cron now:"
crontab -l | grep qubit-backup | sed 's/^/     /'
EOF

if [ "$RUN_NOW" = "1" ]; then
  echo "→ taking a restore-VERIFIED backup now"
  $SSH "$BOX" "cd $DEST && ./scripts/backup-db.sh --verify"
fi

echo "✓ backup installed. Dumps: /home/osbui/backups/qubit (0700, files 0600)"
echo "  Restore a dump into a scratch db:"
echo "    docker compose exec -T db psql -U postgres -d postgres -c 'CREATE DATABASE qubit_restore;'"
echo "    docker compose exec -T db pg_restore -U postgres -d qubit_restore --no-owner --no-privileges < <dump>"
