#!/usr/bin/env bash
# QUBIT one-command deploy — run ON the target host (Linux), from the repo root:
#
#   AUTH_URL=http://192.168.2.43 ADMIN_EMAIL=you@yourco.com ADMIN_NAME="You" ./docker/deploy.sh
#
# First run generates + persists all secrets (DB creds → docker/.deploy.env, app secrets →
# .env.production), builds + starts the stack (Postgres 17 + the app), applies migrations
# (schema + RLS, via the app entrypoint), then bootstraps the first admin. Re-runs reuse the
# same secrets and just rebuild/restart. Set Q_AI_BASE_URL/Q_AI_API_KEY/Q_AI_MODEL in the
# environment to wire the copilot; leave unset for deterministic reports.
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_ENV="docker/.deploy.env"   # compose substitution vars (gitignored)
PROD_ENV=".env.production"        # app secrets (gitignored)
gen() { openssl rand -base64 32; }

command -v docker >/dev/null 2>&1 || { echo "✗ Docker is not installed on this host."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "✗ Docker Compose v2 is required (docker compose …)."; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "✗ openssl is required to generate secrets."; exit 1; }

# 1. DB / compose credentials — generated once, reused forever (must match the DB volume).
if [ ! -f "$DEPLOY_ENV" ]; then
  echo "→ generating DB credentials ($DEPLOY_ENV)"
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "APP_DB_PASSWORD=$(openssl rand -hex 24)"
    echo "APP_PORT=${APP_PORT:-3000}"
  } > "$DEPLOY_ENV"
fi
set -a; . "$DEPLOY_ENV"; set +a

# 2. App secrets — generated once. AUTH_URL must be how the app is actually reached.
if [ ! -f "$PROD_ENV" ]; then
  : "${AUTH_URL:?Set AUTH_URL (e.g. AUTH_URL=http://192.168.2.43) and re-run.}"
  echo "→ creating $PROD_ENV"
  cat > "$PROD_ENV" <<EOF
DATABASE_URL="postgresql://qubit:${APP_DB_PASSWORD}@db:5432/qubit?schema=public"
AUTH_SECRET="$(gen)"
AUTH_URL="${AUTH_URL}"
MFA_ENCRYPTION_KEY="$(gen)"
INTEGRATION_ENCRYPTION_KEY="$(gen)"
Q_AI_BASE_URL="${Q_AI_BASE_URL:-}"
Q_AI_API_KEY="${Q_AI_API_KEY:-}"
Q_AI_MODEL="${Q_AI_MODEL:-qwen3-14b}"
EOF
  echo "  (edit $PROD_ENV to set Q_AI_* later; safe to leave blank)"
fi

# 3. Build + start (app entrypoint runs `prisma migrate deploy` — schema + RLS).
echo "→ building + starting containers…"
docker compose up -d --build

# 4. Wait for the app to answer.
port="${APP_PORT:-3000}"
echo "→ waiting for app on :${port}…"
for i in $(seq 1 40); do
  if curl -fsS "http://localhost:${port}/login" >/dev/null 2>&1; then echo "  ✓ app is up"; break; fi
  [ "$i" -eq 40 ] && { echo "  ✗ app did not come up — check: docker compose logs app"; exit 1; }
  sleep 3
done

# 5. Bootstrap the first admin (only when ADMIN_EMAIL is provided). Uses the tools image
#    (full toolchain) on the compose network; prints a one-time temp password for a NEW admin.
if [ -n "${ADMIN_EMAIL:-}" ]; then
  echo "→ bootstrapping admin ${ADMIN_EMAIL} (tenant ${TENANT:-riverbank})…"
  docker compose --profile tools run --rm \
    -e ADMIN_EMAIL="${ADMIN_EMAIL}" -e ADMIN_NAME="${ADMIN_NAME:-Admin}" \
    tools npx tsx scripts/bootstrap-tenant.ts --tenant "${TENANT:-riverbank}"
fi

echo "✓ done — QUBIT is running at ${AUTH_URL:-http://localhost:${port}}"
