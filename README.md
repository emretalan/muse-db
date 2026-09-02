# Muse API

REST API for the Muse movie picker app.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Create database

```bash
createdb muse_dev
```

### 4. Run migrations

```bash
npm run migrate
```

### 5. Start development server

```bash
npm run dev
```

Server runs at `http://localhost:3000`

## API Endpoints

| Method | Path     | Description              |
|--------|----------|--------------------------|
| GET    | /health  | Health check             |
| GET    | /genres  | List available genres    |
| POST   | /pick    | Get a movie recommendation |

### POST /pick

```json
{
  "sessionId": "uuid-string",
  "filters": {
    "mood": "lighthearted",
    "genreIds": [35, 18],
    "era": "2010s",
    "origin": "en",
    "maxDuration": 120
  }
}
```

## Scripts

- `npm run dev` — Start development server with hot reload
- `npm run build` — Build for production
- `npm start` — Run production build
- `npm run migrate` — Run database migrations
- `npm run seed` — Seed database from TMDB (requires API key)
- `npm run providers` — Fetch watch providers for titles that have never been asked
- `npm run providers:refresh` — Re-ask every title, oldest first
- `npm test` — Run tests

## Data Seeding

To seed the database with movies from TMDB:

1. Get an API key from [themoviedb.org](https://www.themoviedb.org/settings/api)
2. Add `TMDB_API_KEY=your_key` to `.env`
3. Run `npm run seed`

This will fetch ~2000 popular and top-rated movies.

## Watch providers — the one thing that goes stale

Every other column in this database is a fact that does not change: a film's
runtime, its cast, its keywords. Watch availability is different. A title that
is on Netflix this month is on Prime the next, and a table that only ever
inserts becomes a list of *where things used to be*.

`npm run providers:refresh` re-asks every title, oldest first, and deletes each
title's old rows before writing the new ones. One full pass is ~20.000 TMDB
calls and takes about 13 minutes (eight concurrent requests). A monthly pass is
enough — availability moves on contract boundaries, not daily.

Interrupting it is safe: `movies.providers_synced_at` is written per batch, so
the next run picks up where it stopped.

### Running it on a schedule

Railway can do this, but it needs its **own service** — setting a cron schedule
on the API service would turn the API into a job that exits. In the Railway
project:

1. New service, same GitHub repo.
2. Start command: `npm run providers:refresh`
3. Cron schedule: `0 4 1 * *` (04:00 UTC on the first of the month)
4. It needs `DATABASE_URL` and `TMDB_API_KEY`, the same as the API service.

Until that exists, running the command by hand once a month does the same job.
