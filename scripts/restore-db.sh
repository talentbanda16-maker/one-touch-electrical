#!/usr/bin/env bash
# Restores a backup produced by backup-db.sh. DESTRUCTIVE: swaps in the
# restored data in place of the current database (previous data is kept
# under a "_old" name, not deleted, until you drop it manually).
# Usage: ./scripts/restore-db.sh backups/one_touch_20260101_020000.sql.gz
#
# Works two ways, same detection as backup-db.sh: via the running
# docker-compose "db" container, or directly against DATABASE_URL from
# backend/.env when docker-compose isn't running.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?Usage: restore-db.sh <path-to-backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }

if docker compose ps db 2>/dev/null | grep -q "Up"; then
  POSTGRES_USER="${POSTGRES_USER:-postgres}"
  POSTGRES_DB="${POSTGRES_DB:-one_touch}"

  read -r -p "This will REPLACE all data in '$POSTGRES_DB' with the contents of $FILE. Type 'yes' to continue: " confirm
  [ "$confirm" = "yes" ] || { echo "Aborted."; exit 1; }

  docker compose exec -T db psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}_restoring;"
  docker compose exec -T db psql -U "$POSTGRES_USER" -c "CREATE DATABASE ${POSTGRES_DB}_restoring;"
  gunzip -c "$FILE" | docker compose exec -T db psql -U "$POSTGRES_USER" "${POSTGRES_DB}_restoring"

  docker compose exec -T db psql -U "$POSTGRES_USER" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"
  docker compose exec -T db psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}_old;"
  docker compose exec -T db psql -U "$POSTGRES_USER" -c "ALTER DATABASE ${POSTGRES_DB} RENAME TO ${POSTGRES_DB}_old;"
  docker compose exec -T db psql -U "$POSTGRES_USER" -c "ALTER DATABASE ${POSTGRES_DB}_restoring RENAME TO ${POSTGRES_DB};"
else
  set -a
  source backend/.env
  set +a
  : "${DATABASE_URL:?DATABASE_URL not set in backend/.env}"
  # Strip Prisma's ?schema= param — not a real libpq option, pg_dump/psql reject it.
  PG_URL=$(echo "$DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//')

  DB_NAME=$(echo "$PG_URL" | sed -E 's#.*/([^/?]+).*#\1#')
  MAINT_URL=$(echo "$PG_URL" | sed -E 's#(/)[^/?]+(\?.*)?$#\1postgres#')

  read -r -p "This will REPLACE all data in '$DB_NAME' with the contents of $FILE. Type 'yes' to continue: " confirm
  [ "$confirm" = "yes" ] || { echo "Aborted."; exit 1; }

  psql "$MAINT_URL" -c "DROP DATABASE IF EXISTS ${DB_NAME}_restoring;"
  psql "$MAINT_URL" -c "CREATE DATABASE ${DB_NAME}_restoring;"
  gunzip -c "$FILE" | psql "${MAINT_URL%/postgres}/${DB_NAME}_restoring"

  psql "$MAINT_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"
  psql "$MAINT_URL" -c "DROP DATABASE IF EXISTS ${DB_NAME}_old;"
  psql "$MAINT_URL" -c "ALTER DATABASE ${DB_NAME} RENAME TO ${DB_NAME}_old;"
  psql "$MAINT_URL" -c "ALTER DATABASE ${DB_NAME}_restoring RENAME TO ${DB_NAME};"
fi

echo "Restore complete. Previous data kept as '<db>_old' — drop it manually once you've verified the restore."
