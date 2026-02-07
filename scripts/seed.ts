/**
 * TMDB Data Seeding Script
 *
 * This script fetches movies from TMDB API and populates the database.
 *
 * Usage:
 *   npm run seed
 *
 * Prerequisites:
 *   - TMDB_API_KEY must be set in .env
 *   - Database must be migrated (npm run migrate)
 *
 * The script will:
 *   1. Fetch popular movies from TMDB
 *   2. Filter based on quality criteria
 *   3. Upsert into the database
 */

import { pool } from '../src/db/client.js';
import { config } from '../src/config.js';

interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  runtime?: number;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult: boolean;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
}

interface TMDBResponse {
  page: number;
  total_pages: number;
  results: TMDBMovie[];
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RATE_LIMIT_DELAY = 50; // ms between requests

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromTMDB<T>(endpoint: string): Promise<T> {
  const url = `${TMDB_BASE_URL}${endpoint}`;
  const separator = endpoint.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}api_key=${config.tmdbApiKey}`;

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function fetchMovieDetails(movieId: number): Promise<TMDBMovie> {
  return fetchFromTMDB<TMDBMovie>(`/movie/${movieId}`);
}

async function fetchPopularMovies(page: number): Promise<TMDBResponse> {
  return fetchFromTMDB<TMDBResponse>(`/movie/popular?page=${page}`);
}

async function fetchTopRatedMovies(page: number): Promise<TMDBResponse> {
  return fetchFromTMDB<TMDBResponse>(`/movie/top_rated?page=${page}`);
}

async function upsertMovie(movie: TMDBMovie): Promise<number | null> {
  // Skip if missing required fields
  if (!movie.title || !movie.release_date) {
    return null;
  }

  const year = parseInt(movie.release_date.substring(0, 4), 10);
  if (isNaN(year)) {
    return null;
  }

  // Skip if below quality threshold
  if (movie.vote_count < 100) {
    return null;
  }

  // Skip adult content
  if (movie.adult) {
    return null;
  }

  // Skip if no poster
  if (!movie.poster_path) {
    return null;
  }

  const result = await pool.query<{ id: number }>(
    `INSERT INTO movies (
      tmdb_id, title, original_title, year, runtime, synopsis,
      poster_path, vote_average, vote_count, original_language, adult
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      title = EXCLUDED.title,
      runtime = EXCLUDED.runtime,
      synopsis = EXCLUDED.synopsis,
      poster_path = EXCLUDED.poster_path,
      vote_average = EXCLUDED.vote_average,
      vote_count = EXCLUDED.vote_count
    RETURNING id`,
    [
      movie.id,
      movie.title,
      movie.original_title,
      year,
      movie.runtime || null,
      movie.overview || null,
      movie.poster_path,
      movie.vote_average,
      movie.vote_count,
      movie.original_language,
      movie.adult,
    ]
  );

  return result.rows[0].id;
}

async function linkMovieGenres(movieId: number, genreIds: number[]): Promise<void> {
  for (const genreId of genreIds) {
    await pool.query(
      `INSERT INTO movie_genres (movie_id, genre_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [movieId, genreId]
    );
  }
}

async function linkMovieCountries(
  movieId: number,
  countries: { iso_3166_1: string }[]
): Promise<void> {
  for (const country of countries) {
    // Only link if country exists in our table
    await pool.query(
      `INSERT INTO movie_countries (movie_id, country_code)
       SELECT $1, code FROM countries WHERE code = $2
       ON CONFLICT DO NOTHING`,
      [movieId, country.iso_3166_1]
    );
  }
}

async function seed(): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('Error: TMDB_API_KEY is not set in .env');
    process.exit(1);
  }

  console.log('Starting TMDB seed...');

  const seenIds = new Set<number>();
  let totalProcessed = 0;
  let totalInserted = 0;

  // Fetch from both popular and top rated endpoints
  const endpoints = [
    { name: 'popular', fetcher: fetchPopularMovies },
    { name: 'top_rated', fetcher: fetchTopRatedMovies },
  ];

  for (const { name, fetcher } of endpoints) {
    console.log(`\nFetching ${name} movies...`);

    // Fetch first 50 pages (1000 movies per endpoint)
    for (let page = 1; page <= 50; page++) {
      try {
        const response = await fetcher(page);

        for (const movie of response.results) {
          if (seenIds.has(movie.id)) continue;
          seenIds.add(movie.id);

          totalProcessed++;

          // Fetch full details for runtime and genres
          await sleep(RATE_LIMIT_DELAY);
          const details = await fetchMovieDetails(movie.id);

          const movieId = await upsertMovie(details);
          if (movieId) {
            totalInserted++;

            // Link genres
            if (details.genres) {
              await linkMovieGenres(
                movieId,
                details.genres.map((g) => g.id)
              );
            }

            // Link countries
            if (details.production_countries) {
              await linkMovieCountries(movieId, details.production_countries);
            }
          }

          if (totalProcessed % 100 === 0) {
            console.log(`  Processed: ${totalProcessed}, Inserted: ${totalInserted}`);
          }
        }

        await sleep(RATE_LIMIT_DELAY);
      } catch (error) {
        console.error(`Error on page ${page}:`, error);
        // Continue to next page
      }
    }
  }

  console.log(`\nSeed complete!`);
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Total inserted: ${totalInserted}`);

  await pool.end();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
