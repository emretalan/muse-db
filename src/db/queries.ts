import { pool } from './client.js';
import type { MovieRow, Genre, PickFilters, Era } from '../types/index.js';
import { config } from '../config.js';

// Era to year range mapping
function eraToYearRange(era: Era): { start: number; end: number | null } {
  const ranges: Record<Era, { start: number; end: number | null }> = {
    '1980-1989': { start: 1980, end: 1989 },
    '1990-1999': { start: 1990, end: 1999 },
    '2000-2009': { start: 2000, end: 2009 },
    '2010-2019': { start: 2010, end: 2019 },
    '2020-now': { start: 2020, end: null },
  };
  return ranges[era];
}

// Fetch all genres
export async function getAllGenres(): Promise<Genre[]> {
  const result = await pool.query<Genre>('SELECT id, name FROM genres ORDER BY name');
  return result.rows;
}

// Fetch candidate movies based on filters
export async function getCandidateMovies(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<MovieRow[]> {
  const { minVoteCount, minVoteAverage, minRuntime } = config.selection;

  const conditions: string[] = [
    'm.adult = false',
    'm.runtime IS NOT NULL',
    `m.runtime >= ${minRuntime}`,
    `m.vote_count >= ${minVoteCount}`,
    `m.vote_average >= ${minVoteAverage}`,
  ];

  const params: (string | number | number[] | string[])[] = [];
  let paramIndex = 1;

  // Era filter
  if (filters.era) {
    const { start, end } = eraToYearRange(filters.era);
    if (end !== null) {
      conditions.push(`m.year >= $${paramIndex} AND m.year <= $${paramIndex + 1}`);
      params.push(start, end);
      paramIndex += 2;
    } else {
      conditions.push(`m.year >= $${paramIndex}`);
      params.push(start);
      paramIndex++;
    }
  }

  // Min duration filter
  if (filters.minDuration) {
    conditions.push(`m.runtime >= $${paramIndex}`);
    params.push(filters.minDuration);
    paramIndex++;
  }

  // Max duration filter
  if (filters.maxDuration) {
    conditions.push(`m.runtime <= $${paramIndex}`);
    params.push(filters.maxDuration);
    paramIndex++;
  }

  // Origin (language) filter
  if (filters.origin && filters.origin.length > 0) {
    conditions.push(`m.original_language = ANY($${paramIndex})`);
    params.push(filters.origin.map(o => o.toLowerCase()));
    paramIndex++;
  }

  // Exclude recently picked movies
  if (excludeMovieIds.length > 0) {
    conditions.push(`m.id != ALL($${paramIndex})`);
    params.push(excludeMovieIds);
    paramIndex++;
  }

  // Genre filter (if specified)
  let genreJoin = '';
  if (filters.genreIds && filters.genreIds.length > 0) {
    genreJoin = `
      INNER JOIN movie_genres mg ON m.id = mg.movie_id
    `;
    conditions.push(`mg.genre_id = ANY($${paramIndex})`);
    params.push(filters.genreIds);
    paramIndex++;
  }

  const query = `
    SELECT DISTINCT m.*
    FROM movies m
    ${genreJoin}
    WHERE ${conditions.join(' AND ')}
    LIMIT 1000
  `;

  const result = await pool.query<MovieRow>(query, params);
  return result.rows;
}

// Get genres for a specific movie
export async function getMovieGenres(movieId: number): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT g.name 
     FROM genres g
     INNER JOIN movie_genres mg ON g.id = mg.genre_id
     WHERE mg.movie_id = $1`,
    [movieId]
  );
  return result.rows.map((row) => row.name);
}

// Get genres for multiple movies at once
export async function getMoviesGenres(movieIds: number[]): Promise<Map<number, string[]>> {
  if (movieIds.length === 0) return new Map();

  const result = await pool.query<{ movie_id: number; name: string }>(
    `SELECT mg.movie_id, g.name 
     FROM genres g
     INNER JOIN movie_genres mg ON g.id = mg.genre_id
     WHERE mg.movie_id = ANY($1)`,
    [movieIds]
  );

  const genreMap = new Map<number, string[]>();
  for (const row of result.rows) {
    const genres = genreMap.get(row.movie_id) || [];
    genres.push(row.name);
    genreMap.set(row.movie_id, genres);
  }
  return genreMap;
}

// Get recent picks for a session
export async function getRecentPickMovieIds(sessionId: string): Promise<number[]> {
  const result = await pool.query<{ movie_id: number }>(
    `SELECT movie_id FROM user_picks
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, config.selection.recentPicksLimit]
  );
  return result.rows.map((row) => row.movie_id);
}

// Check if this is the first pick for a session
export async function isFirstPickForSession(sessionId: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM user_picks WHERE session_id = $1',
    [sessionId]
  );
  return parseInt(result.rows[0].count, 10) === 0;
}

// Record a pick
export async function recordPick(
  sessionId: string,
  movieId: number,
  filters: PickFilters
): Promise<void> {
  await pool.query(
    `INSERT INTO user_picks (session_id, movie_id, filters, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [sessionId, movieId, JSON.stringify(filters)]
  );
}

// Health check - verify database connection
export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
