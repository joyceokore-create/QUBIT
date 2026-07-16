#!/bin/bash
# Runs once on first Postgres init (as the superuser). Creates the QUBIT app role as a
# NORMAL role — NOT superuser, NOT BYPASSRLS — and makes it own the database + public
# schema so migrations (run as this role) can create tables and RLS policies. Because the
# tables use FORCE ROW LEVEL SECURITY, the owning app role is STILL subject to RLS, so
# tenant isolation is enforced. A superuser role would silently bypass it — never point the
# app's DATABASE_URL at the superuser.
set -e

: "${APP_DB_USER:=qubit}"
: "${APP_DB_PASSWORD:=qubit}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
      CREATE ROLE ${APP_DB_USER} WITH LOGIN PASSWORD '${APP_DB_PASSWORD}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
  END
  \$\$;
  ALTER DATABASE ${POSTGRES_DB} OWNER TO ${APP_DB_USER};
EOSQL

# Own + own future objects in the public schema so `prisma migrate deploy` (run as the app
# role) can create tables and policies.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  ALTER SCHEMA public OWNER TO ${APP_DB_USER};
  GRANT ALL ON SCHEMA public TO ${APP_DB_USER};
EOSQL

echo "[qubit] created non-superuser app role '${APP_DB_USER}' (RLS-enforced)."
