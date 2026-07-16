#!/bin/sh
# QUBIT container entrypoint: apply migrations (schema + RLS) then serve.
# Runs as the app DB role, which is NON-superuser with FORCE row-level security on every
# tenant table — so tenant isolation holds even though this role owns the tables.
set -e

echo "[qubit] applying migrations (prisma migrate deploy)…"
# Retry briefly so we tolerate the DB coming up a moment after the app container.
n=0
until node node_modules/prisma/build/index.js migrate deploy; do
  n=$((n + 1))
  if [ "$n" -ge 10 ]; then
    echo "[qubit] migrate deploy failed after $n attempts — aborting." >&2
    exit 1
  fi
  echo "[qubit] DB not ready yet, retrying in 3s ($n/10)…"
  sleep 3
done

echo "[qubit] starting server on :${PORT:-3000}"
exec node server.js
