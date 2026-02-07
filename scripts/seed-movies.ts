#!/usr/bin/env npx tsx
/**
 * TMDB Movie Seeding CLI Tool
 *
 * A user-friendly command-line tool to populate the database with movies from TMDB.
 *
 * Usage:
 *   npx tsx scripts/seed-movies.ts [options]
 *
 * Options:
 *   --count, -c    Number of movies to fetch (default: 500)
 *   --source, -s   Source: 'popular', 'top_rated', 'both' (default: 'both')
 *   --min-votes    Minimum vote count for quality filter (default: 100)
 *   --clear        Clear existing movies before seeding
 *   --help, -h     Show this help message
 *
 * Examples:
 *   npx tsx scripts/seed-movies.ts --count 1000
 *   npx tsx scripts/seed-movies.ts -c 500 -s popular
 *   npx tsx scripts/seed-movies.ts --count 2000 --min-votes 500
 *
 * Prerequisites:
 *   - TMDB_API_KEY must be set in .env
 *   - Database must be migrated (npm run migrate)
 */

import { pool } from '../src/db/client.js';
import { config } from '../src/config.js';

// ============================================================================
// Types
// ============================================================================

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
  total_results: number;
  results: TMDBMovie[];
}

interface SeedOptions {
  count: number;
  source: 'popular' | 'top_rated' | 'both';
  minVotes: number;
  clear: boolean;
}

interface SeedProgress {
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
  startTime: number;
}

// ============================================================================
// Constants
// ============================================================================

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RATE_LIMIT_DELAY = 50; // ms between requests
const MOVIES_PER_PAGE = 20;

// ============================================================================
// Helpers
// ============================================================================

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    count: 500,
    source: 'both',
    minVotes: 100,
    clear: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--count' || arg === '-c') {
      options.count = parseInt(args[++i], 10) || 500;
    } else if (arg === '--source' || arg === '-s') {
      const source = args[++i];
      if (source === 'popular' || source === 'top_rated' || source === 'both') {
        options.source = source;
      }
    } else if (arg === '--min-votes') {
      options.minVotes = parseInt(args[++i], 10) || 100;
    } else if (arg === '--clear') {
      options.clear = true;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    🎬 Muse Movie Seeder                              ║
╚══════════════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/seed-movies.ts [options]

Options:
  --count, -c <number>    Number of movies to fetch (default: 500)
  --source, -s <type>     Source: 'popular', 'top_rated', 'both' (default: 'both')
  --min-votes <number>    Minimum vote count for quality (default: 100)
  --clear                 Clear existing movies before seeding
  --help, -h              Show this help message

Examples:
  npx tsx scripts/seed-movies.ts --count 1000
  npx tsx scripts/seed-movies.ts -c 500 -s popular
  npx tsx scripts/seed-movies.ts --count 2000 --min-votes 500 --clear
`);
}

function printBanner(options: SeedOptions): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    🎬 Muse Movie Seeder                              ║
╚══════════════════════════════════════════════════════════════════════╝

  Target Movies:  ${options.count}
  Source:         ${options.source}
  Min Votes:      ${options.minVotes}
  Clear First:    ${options.clear ? 'Yes' : 'No'}
`);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

function printProgress(progress: SeedProgress, target: number): void {
  const elapsed = Date.now() - progress.startTime;
  const rate = progress.processed / (elapsed / 1000);
  const remaining = ((target - progress.inserted) / rate) * 1000;

  const progressBar = createProgressBar(progress.inserted, target, 30);
  const percent = Math.round((progress.inserted / target) * 100);

  process.stdout.write(
    `\r  ${progressBar} ${percent}% | ` +
      `✓ ${progress.inserted} | ` +
      `⊘ ${progress.skipped} | ` +
      `✗ ${progress.errors} | ` +
      `ETA: ${formatDuration(remaining)}    `
  );
}

function createProgressBar(current: number, total: number, width: number): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// TMDB API
// ============================================================================

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

// ============================================================================
// Database Operations
// ============================================================================

async function clearMovies(): Promise<void> {
  console.log('  Clearing existing movies...');
  await pool.query('DELETE FROM movie_genres');
  await pool.query('DELETE FROM movie_countries');
  await pool.query('DELETE FROM user_picks');
  await pool.query('DELETE FROM movies');
  console.log('  ✓ Movies cleared\n');
}

async function getExistingMovieCount(): Promise<number> {
  const result = await pool.query<{ count: string }>('SELECT COUNT(*) as count FROM movies');
  return parseInt(result.rows[0].count, 10);
}

async function upsertMovie(movie: TMDBMovie, minVotes: number): Promise<number | null> {
  // Skip if missing required fields
  if (!movie.title || !movie.release_date) {
    return null;
  }

  const year = parseInt(movie.release_date.substring(0, 4), 10);
  if (isNaN(year)) {
    return null;
  }

  // Skip if below quality threshold
  if (movie.vote_count < minVotes) {
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
    await pool.query(
      `INSERT INTO movie_countries (movie_id, country_code)
       SELECT $1, code FROM countries WHERE code = $2
       ON CONFLICT DO NOTHING`,
      [movieId, country.iso_3166_1]
    );
  }
}

// ============================================================================
// Main Seed Function
// ============================================================================

async function seed(options: SeedOptions): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('\n  ❌ Error: TMDB_API_KEY is not set in .env\n');
    process.exit(1);
  }

  printBanner(options);

  // Show current state
  const existingCount = await getExistingMovieCount();
  console.log(`  Current movies in DB: ${existingCount}\n`);

  // Clear if requested
  if (options.clear) {
    await clearMovies();
  }

  const seenIds = new Set<number>();
  const progress: SeedProgress = {
    processed: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    startTime: Date.now(),
  };

  // Determine which endpoints to use
  const endpoints: { name: string; fetcher: (page: number) => Promise<TMDBResponse> }[] = [];

  if (options.source === 'both' || options.source === 'popular') {
    endpoints.push({ name: 'popular', fetcher: fetchPopularMovies });
  }
  if (options.source === 'both' || options.source === 'top_rated') {
    endpoints.push({ name: 'top_rated', fetcher: fetchTopRatedMovies });
  }

  // Calculate pages needed per endpoint
  const moviesPerEndpoint = Math.ceil(options.count / endpoints.length);
  const pagesPerEndpoint = Math.ceil(moviesPerEndpoint / MOVIES_PER_PAGE);

  console.log('  Fetching movies from TMDB...\n');

  for (const { name, fetcher } of endpoints) {
    if (progress.inserted >= options.count) break;

    for (let page = 1; page <= pagesPerEndpoint; page++) {
      if (progress.inserted >= options.count) break;

      try {
        const response = await fetcher(page);

        for (const movie of response.results) {
          if (progress.inserted >= options.count) break;
          if (seenIds.has(movie.id)) continue;
          seenIds.add(movie.id);

          progress.processed++;

          try {
            // Fetch full details for runtime and genres
            await sleep(RATE_LIMIT_DELAY);
            const details = await fetchMovieDetails(movie.id);

            const movieId = await upsertMovie(details, options.minVotes);
            if (movieId) {
              progress.inserted++;

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
            } else {
              progress.skipped++;
            }
          } catch {
            progress.errors++;
          }

          printProgress(progress, options.count);
        }

        await sleep(RATE_LIMIT_DELAY);
      } catch (error) {
        progress.errors++;
        // Continue to next page
      }
    }
  }

  // Final output
  const elapsed = Date.now() - progress.startTime;
  const finalCount = await getExistingMovieCount();

  console.log(`\n
╔══════════════════════════════════════════════════════════════════════╗
║                         Seed Complete! 🎉                            ║
╚══════════════════════════════════════════════════════════════════════╝

  ✓ Movies inserted:  ${progress.inserted}
  ⊘ Movies skipped:   ${progress.skipped}
  ✗ Errors:           ${progress.errors}
  ⏱  Time elapsed:    ${formatDuration(elapsed)}
  
  📊 Total movies in database: ${finalCount}
`);

  await pool.end();
}

// ============================================================================
// Entry Point
// ============================================================================

const options = parseArgs();
seed(options).catch((error) => {
  console.error('\n  ❌ Seed failed:', error.message);
  process.exit(1);
});
