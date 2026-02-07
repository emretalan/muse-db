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
- `npm test` — Run tests

## Data Seeding

To seed the database with movies from TMDB:

1. Get an API key from [themoviedb.org](https://www.themoviedb.org/settings/api)
2. Add `TMDB_API_KEY=your_key` to `.env`
3. Run `npm run seed`

This will fetch ~2000 popular and top-rated movies.
