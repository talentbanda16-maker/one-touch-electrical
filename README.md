# One Touch Electrical Services — Operations & Project Management System

## Structure

- `backend/` — Node.js/Express API + PostgreSQL (via Prisma)
- `frontend/` — React app (Vite + Tailwind)

## First-time setup

### 1. Database

Once PostgreSQL is installed, create the dev database:

```
psql -U postgres -c "CREATE DATABASE one_touch_dev;"
```

### 2. Backend

```
cd backend
copy .env.example .env
```

Edit `.env` and set `DATABASE_URL` to match your Postgres password.

```
npm run prisma:migrate
npm run seed
npm run dev
```

The seed script prints a Technical Manager login (email/password) — use it to log in the first time, then change the password.

Backend runs on http://localhost:4000

### 3. Frontend

```
cd frontend
npm run dev
```

Frontend runs on http://localhost:5173 and proxies `/api` requests to the backend.

## Roles

`TECHNICAL_MANAGER`, `FOREMAN`, `QS`, `SHE_OFFICER`, `STORESMAN`, `FINANCE`, `MANAGEMENT`

Only the Technical Manager can create new user accounts (`POST /api/users`) and projects (`POST /api/projects`).
