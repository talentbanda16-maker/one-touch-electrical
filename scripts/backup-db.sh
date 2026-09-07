#!/usr/bin/env bash
# Dumps the app database to a timestamped, gzipped SQL file under
# ./backups/. Run from the project root, e.g. on a daily cron/Task
# Scheduler entry — see DEPLOYMENT.md for the recommended schedule.
#
# Works two ways:
#   - docker-compose deployment (DEPLOYMENT.md): dumps via the running
#     "db" container, no host Postgres client needed.
#   - bare-metal/local Postgres (no docker-compose running): falls back
#     to `pg_dump` against DATABASE_URL from backend/.env directly.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d_%H%M%S)
out="$BACKUP_DIR/one_touch_${stamp}.sql.gz"

if docker compose ps db 2>/dev/null | grep -q "Up"; then
  POSTGRES_USER="${POSTGRES_USER:-postgres}"
  POSTGRES_DB="${POSTGRES_DB:-one_touch}"
  docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$out"
else
  set -a
  source backend/.env
  set +a
  : "${DATABASE_URL:?DATABASE_URL not set in backend/.env}"
  # Prisma's DATABASE_URL carries a ?schema= param that's meaningful to
  # Prisma but not a real libpq connection option — pg_dump rejects it.
  PG_URL=$(echo "$DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//')
  pg_dump "$PG_URL" | gzip > "$out"
fi

echo "Backup written to $out"

# Prune backups older than RETENTION_DAYS so the backup directory doesn't
# grow unbounded on a long-running host.
find "$BACKUP_DIR" -name "one_touch_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
