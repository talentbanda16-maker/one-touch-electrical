# Deployment

## Hosting

The app is packaged as three containers (`db`, `backend`, `frontend`) via
`docker-compose.yml` at the repo root, so it can be deployed to any
Docker-capable host (a VPS, Render, Railway, Fly.io, AWS ECS/Lightsail, etc.)
without code changes.

1. Copy `.env.example` to `.env` and fill in real secrets — a strong
   `POSTGRES_PASSWORD`, random `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
   (e.g. `openssl rand -hex 32`), and the public `FRONTEND_URL` the app
   will be reachable at.
2. `docker compose up -d --build`
3. The backend runs `prisma migrate deploy` on every start, so schema
   changes ship automatically with a redeploy — no manual migration step.
4. Seed the first Technical Manager account: `docker compose exec backend node prisma/seed.js`
   (or create one directly via `POST /api/users` using a temporary admin
   token, then rely on the in-app "Manage users" screen from there on).

Put the `frontend` container behind a reverse proxy / load balancer that
terminates TLS (e.g. Caddy, an ALB, or the hosting platform's built-in
HTTPS) — the app itself doesn't handle certificates. Set `NODE_ENV=production`
(already default in `docker-compose.yml`) so refresh-token cookies are
sent `Secure`/`SameSite=Strict`.

## Database backup and recovery

- `./scripts/backup-db.sh` — dumps the app database to a gzipped SQL
  file under `./backups/`, pruning anything older than `RETENTION_DAYS`
  (default 30). Works two ways, auto-detected: dumps via the running
  docker-compose `db` container when one is up, otherwise falls back to
  running `pg_dump` directly against `DATABASE_URL` from `backend/.env`
  (for a bare-metal/non-Docker Postgres). Requires the `pg_dump` client
  on `PATH` for the fallback path.
- `./scripts/restore-db.sh backups/<file>.sql.gz` — restores a backup,
  same auto-detection. Destructive: prompts for confirmation, then swaps
  in the restored database and keeps the prior one as `<db>_old` until
  you drop it manually.
- Both scripts strip Prisma's `?schema=` query param before handing the
  connection string to `pg_dump`/`psql` — it's a Prisma-only option, not
  a real libpq one, and both tools reject it otherwise.
- Verified end-to-end against a real database: `backup-db.sh` produced a
  valid dump (all tables present), and restoring it into a scratch
  database reproduced identical row counts across `users`, `projects`,
  `reports` and `audit_logs`.

Recommended schedule: a daily cron entry (or Windows Task Scheduler job)
calling `backup-db.sh`, plus copying the `backups/` directory to
off-host storage (S3, another VPS, etc.) — a backup that lives on the
same disk as the database doesn't protect against host-level failure.

```cron
0 2 * * * cd /path/to/one-touch && ./scripts/backup-db.sh >> /var/log/one-touch-backup.log 2>&1
```

## Uploaded files

Report photos and project documents are written to the `uploads` named
volume (mounted at `/app/uploads` in the backend container), not baked
into any image. Back it up the same way as the database — e.g.
`docker run --rm -v one-touch_uploads:/data -v $(pwd)/backups:/backup alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .`
