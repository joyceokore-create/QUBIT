#!/usr/bin/env bash
#
# QUBIT — install the scheduled jobs on the box (DM1.75).
#
# These were DOCUMENTED in docs/deployment.md but never installed: before this script the
# box crontab held only the backup lines, so `project_snapshot`, `portfolio_snapshot`,
# `nudge` and `job_run` were all EMPTY in production. Every week-on-week delta and
# sparkline had no history to read, and no nudge had ever fired.
#
#   ./scripts/install-cron.sh              # install / refresh the QUBIT job lines
#   ./scripts/install-cron.sh --run-now    # install, then run each job once and report
#
# Idempotent: the `# qubit-job` lines are replaced, everything else in the crontab
# (including the backup lines) is left exactly as it was.
set -euo pipefail

BOX="${BOX:-osbui@192.168.2.43}"
DEST="${DEST:-/home/osbui/applications/qubit}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH="ssh -o ConnectTimeout=8 -i $SSH_KEY"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_NOW=0
[ "${1:-}" = "--run-now" ] && RUN_NOW=1

echo "→ copying run-cron-job.sh to $BOX"
scp -q -i "$SSH_KEY" "$SCRIPT_DIR/run-cron-job.sh" "$BOX:$DEST/scripts/run-cron-job.sh"
$SSH "$BOX" "chmod +x $DEST/scripts/run-cron-job.sh"

echo "→ registering job lines (secret stays in .env.production, never in the crontab)"
$SSH "$BOX" "bash -s" <<EOF
set -euo pipefail
crontab -l 2>/dev/null | grep -v '# qubit-job' > /tmp/qubit-jobs || true
cat >> /tmp/qubit-jobs <<'CRON'
55 23 * * * cd $DEST && ./scripts/run-cron-job.sh nightly-snapshot  # qubit-job
30 7 * * 1-5 cd $DEST && ./scripts/run-cron-job.sh nudger  # qubit-job
30 17 * * 5 cd $DEST && ./scripts/run-cron-job.sh nudger  # qubit-job friday-deadline sweep
0 10 * * 1 cd $DEST && ./scripts/run-cron-job.sh checkin-chase  # qubit-job
CRON
crontab /tmp/qubit-jobs
rm -f /tmp/qubit-jobs
echo "   installed:"
crontab -l | grep 'qubit-job' | sed 's/^/     /'
EOF

if [ "$RUN_NOW" = "1" ]; then
  echo "→ running each job once"
  for job in nightly-snapshot nudger checkin-chase; do
    printf '   %-18s ' "$job"
    $SSH "$BOX" "cd $DEST && ./scripts/run-cron-job.sh $job >/dev/null 2>&1 && tail -1 cron.log" || echo "FAILED (see $DEST/cron.log)"
  done
fi

cat <<'NOTE'

Schedule installed:
  23:55 daily     nightly-snapshot   — the history every WoW delta and sparkline reads
  07:30 Mon–Fri   nudger             — the working week's chasers
  17:30 Friday    nudger             — the deadline sweep: catches a check-in confirmed
                                       during Friday afternoon but never sent to the Head,
                                       which the morning-only schedule could not (the gap
                                       docs/37 noted honestly rather than faking)
  10:00 Monday    checkin-chase      — last week's post-mortem for anything unconfirmed
NOTE
