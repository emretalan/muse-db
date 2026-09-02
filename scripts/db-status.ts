#!/usr/bin/env npx tsx
/**
 * Database Status Script
 * 
 * Shows current state of the Muse database.
 * 
 * Usage:
 *   npm run db:status
 */

import { pool } from '../src/db/client.js';

interface CountResult {
  count: string;
}

interface GenreCount {
  name: string;
  count: string;
}

interface DecadeCount {
  decade: string;
  count: string;
}

async function getStatus(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    📊 Muse Database Status                           ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Total movies
  const moviesResult = await pool.query<CountResult>('SELECT COUNT(*) as count FROM movies');
  const totalMovies = parseInt(moviesResult.rows[0].count, 10);

  // Movies with runtime
  const runtimeResult = await pool.query<CountResult>(
    'SELECT COUNT(*) as count FROM movies WHERE runtime IS NOT NULL AND runtime >= 60'
  );
  const moviesWithRuntime = parseInt(runtimeResult.rows[0].count, 10);

  // Quality movies (vote_count >= 500, vote_average >= 5.5)
  const qualityResult = await pool.query<CountResult>(
    'SELECT COUNT(*) as count FROM movies WHERE vote_count >= 500 AND vote_average >= 5.5'
  );
  const qualityMovies = parseInt(qualityResult.rows[0].count, 10);

  console.log(`  📽  Total Movies:         ${totalMovies}`);
  console.log(`  ⏱  With Runtime (60+):   ${moviesWithRuntime}`);
  console.log(`  ⭐ Quality (500+ votes):  ${qualityMovies}`);

  // Genres breakdown
  console.log(`\n  📚 Movies by Genre:`);
  const genresResult = await pool.query<GenreCount>(`
    SELECT g.name, COUNT(mg.movie_id) as count
    FROM genres g
    LEFT JOIN movie_genres mg ON g.id = mg.genre_id
    GROUP BY g.id, g.name
    ORDER BY count DESC
    LIMIT 10
  `);

  for (const row of genresResult.rows) {
    const bar = '█'.repeat(Math.min(Math.round(parseInt(row.count, 10) / 20), 20));
    console.log(`     ${row.name.padEnd(15)} ${row.count.padStart(4)} ${bar}`);
  }

  // Decades breakdown
  console.log(`\n  📅 Movies by Decade:`);
  const decadesResult = await pool.query<DecadeCount>(`
    SELECT 
      CONCAT(FLOOR(year / 10) * 10, 's') as decade,
      COUNT(*) as count
    FROM movies
    WHERE year >= 1980
    GROUP BY FLOOR(year / 10)
    ORDER BY decade DESC
  `);

  for (const row of decadesResult.rows) {
    const bar = '█'.repeat(Math.min(Math.round(parseInt(row.count, 10) / 10), 30));
    console.log(`     ${row.decade.padEnd(6)} ${row.count.padStart(4)} ${bar}`);
  }

  // Languages
  console.log(`\n  🌍 Top Languages:`);
  const langResult = await pool.query<{ original_language: string; count: string }>(`
    SELECT original_language, COUNT(*) as count
    FROM movies
    GROUP BY original_language
    ORDER BY count DESC
    LIMIT 5
  `);

  const langNames: Record<string, string> = {
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    de: 'German',
    it: 'Italian',
    zh: 'Chinese',
    hi: 'Hindi',
  };

  for (const row of langResult.rows) {
    const name = langNames[row.original_language] || row.original_language;
    console.log(`     ${name.padEnd(12)} ${row.count}`);
  }

  // Countries
  const countriesResult = await pool.query<CountResult>('SELECT COUNT(*) as count FROM countries');
  const totalCountries = parseInt(countriesResult.rows[0].count, 10);
  const movieCountriesResult = await pool.query<CountResult>('SELECT COUNT(*) as count FROM movie_countries');
  const totalMovieCountries = parseInt(movieCountriesResult.rows[0].count, 10);

  console.log(`\n  🌍 Countries:             ${totalCountries}`);
  console.log(`  🔗 Movie-Country Links:   ${totalMovieCountries}`);

  if (totalCountries > 0) {
    const topCountries = await pool.query<{ name: string; count: string }>(`
      SELECT c.name, COUNT(mc.movie_id) as count
      FROM countries c
      LEFT JOIN movie_countries mc ON c.code = mc.country_code
      GROUP BY c.code, c.name
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log(`\n  🏴 Top Countries by Movies:`);
    for (const row of topCountries.rows) {
      console.log(`     ${row.name.padEnd(20)} ${row.count}`);
    }
  }

  // İzleme sağlayıcıları. Tazeleme yaşı burada duruyor çünkü envanterdeki
  // tek bayatlayan veri bu: bir başlık bir servisten çıkabiliyor ve tablo
  // ancak yeniden sorulduğunda öğreniyor.
  const providerStats = await pool.query<{
    baslik: string;
    satir: string;
    servis: string;
    en_eski: string | null;
    hic: string;
  }>(`
    SELECT (SELECT count(DISTINCT movie_id) FROM movie_providers)::text AS baslik,
           (SELECT count(*) FROM movie_providers)::text               AS satir,
           (SELECT count(*) FROM providers)::text                     AS servis,
           (SELECT to_char(min(providers_synced_at), 'YYYY-MM-DD')
              FROM movies WHERE providers_synced_at IS NOT NULL)      AS en_eski,
           (SELECT count(*) FROM movies WHERE providers_synced_at IS NULL)::text AS hic
  `);
  const ps = providerStats.rows[0];
  console.log(`\n  📺 Sağlayıcı verisi:`);
  console.log(`     Sağlayıcısı olan başlık:  ${ps.baslik}`);
  console.log(`     Bölge × sağlayıcı satırı: ${ps.satir}`);
  console.log(`     Tanınan servis:           ${ps.servis}`);
  console.log(`     En eski tazeleme:         ${ps.en_eski ?? '—'}`);
  console.log(`     Hiç sorulmamış:           ${ps.hic}`);

  // Migrations
  console.log(`\n  📋 Migrations:`);
  try {
    const migrations = await pool.query<{ name: string; executed_at: string }>('SELECT name, executed_at FROM _migrations ORDER BY id');
    for (const row of migrations.rows) {
      console.log(`     ✓ ${row.name}`);
    }
  } catch {
    console.log(`     (no _migrations table found)`);
  }

  // Recent picks
  const picksResult = await pool.query<CountResult>('SELECT COUNT(*) as count FROM user_picks');
  const totalPicks = parseInt(picksResult.rows[0].count, 10);

  console.log(`\n  🎯 Total User Picks:      ${totalPicks}`);

  console.log(`
╚══════════════════════════════════════════════════════════════════════╝
`);

  await pool.end();
}

getStatus().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
