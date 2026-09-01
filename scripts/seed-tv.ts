#!/usr/bin/env npx tsx
/**
 * TMDB Dizi Seed Aracı
 *
 * Dizileri `movies` tablosuna `media_type = 'tv'` ile ekler.
 *
 * Kullanım:
 *   npx tsx scripts/seed-tv.ts [--count 200] [--refresh]
 *
 * Muse'ün töreni "kader seçer, bu akşam izlersin, sonra izledim dersin"
 * üzerine kurulu ve arşivdeki `isFulfilled` tek bir boole. 73 bölümlük bir
 * dizi bu törene girmiyor. Verilen karar: kader diziyi seçer, ama **söz ilk
 * bölüm üzerinedir**. Bu betik o kararın veri tarafı — her dizi için
 * S01E01 de çekiliyor ve `runtime`/`year` sütunlarına ilk bölümün süresi ve
 * yılı yazılıyor, böylece süre ve dönem filtreleri tek satır değişmeden
 * dizide de çalışıyor.
 */

import { pool } from '../src/db/client.js';
import { config } from '../src/config.js';

// ============================================================================
// Types
// ============================================================================

interface TMDBSeries {
  id: number;
  name: string;
  original_name: string;
  first_air_date?: string;
  last_air_date?: string | null;
  overview?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  tagline?: string | null;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult?: boolean;
  popularity?: number;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
  networks?: { id: number; name: string }[];
  created_by?: { id: number; name: string }[];

  // append_to_response
  credits?: { crew?: { job: string; name: string }[] };
  /** DİKKAT: dizide anahtar kelimeler `results` altında, filmde `keywords`
   *  altında geliyor. Aynı ada sahip iki farklı şekil. */
  keywords?: { results?: { id: number; name: string }[] };
  /** Filmdeki `release_dates`'in dizi karşılığı — ve şekli de farklı:
   *  ülke başına tarih listesi değil, tek bir `rating` dizesi. */
  content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  external_ids?: { imdb_id?: string | null };
}

interface TMDBEpisode {
  name?: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number | null;
  air_date?: string | null;
}

interface TMDBResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: { id: number }[];
}

interface Sweep {
  label: string;
  params: Record<string, string>;
  target: number;
  minVotes: number;
}

// ============================================================================
// Constants
// ============================================================================

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RATE_LIMIT_DELAY = 50;
const CERTIFICATION_PREFERENCE = ['US', 'GB'];

/** İngilizce dizilerin sorgu anındaki oy eşiği
 *  (config.selection.minVoteCountTv). Bölgesel taramalar İrlanda gibi
 *  İngilizce konuşan ülkeleri de kapsıyor; bölge eşiğiyle (50-100) alınan
 *  İngilizce bir dizi tabloya girer ama hiç gösterilmez. */
const ENGLISH_QUERY_VOTE_FLOOR = 200;

/** Bir bölümün alt sınırı. Filmlerdeki 60 dakika burada anlamsız: bir sitcom
 *  bölümü 22 dakika. Bu eşik yalnızca fragman/teaser kayıtlarını eliyor. */
const MIN_EPISODE_RUNTIME = 10;

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromTMDB<T>(endpoint: string): Promise<T> {
  const separator = endpoint.includes('?') ? '&' : '?';
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}${separator}api_key=${config.tmdbApiKey}`);
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function fetchSeries(seriesId: number): Promise<TMDBSeries> {
  return fetchFromTMDB<TMDBSeries>(
    `/tv/${seriesId}?append_to_response=credits,keywords,content_ratings,external_ids`
  );
}

/** İlk bölüm. Yoksa null — o dizi atlanıyor, çünkü sözün üzerine verileceği
 *  şey yok. Yalnızca "Specials" sezonu olan kayıtlar burada eleniyor. */
async function fetchFirstEpisode(seriesId: number): Promise<TMDBEpisode | null> {
  try {
    return await fetchFromTMDB<TMDBEpisode>(`/tv/${seriesId}/season/1/episode/1`);
  } catch {
    return null;
  }
}

async function fetchDiscover(params: Record<string, string>, page: number): Promise<TMDBResponse> {
  const query = new URLSearchParams({ ...params, include_adult: 'false', page: String(page) });
  return fetchFromTMDB<TMDBResponse>(`/discover/tv?${query.toString()}`);
}

/** Dizinin yaratıcıları. Bir dizide "yönetmen" tek bir kişi değil — sezon
 *  boyunca değişiyor — ama yaratıcı sabit ve izleyicinin aradığı isim o.
 *  Yaratıcısı kayıtlı değilse ilk bölümün yönetmenine düşülüyor. */
function extractCreators(series: TMDBSeries): string[] | null {
  const created = series.created_by?.map((c) => c.name) ?? [];
  if (created.length > 0) return [...new Set(created)];

  const directors = (series.credits?.crew ?? [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);
  return directors.length > 0 ? [...new Set(directors)] : null;
}

function extractCertification(series: TMDBSeries): string | null {
  const results = series.content_ratings?.results;
  if (!results) return null;

  const pick = (code: string): string | null => {
    const entry = results.find((r) => r.iso_3166_1 === code);
    return entry && entry.rating.trim().length > 0 ? entry.rating.trim() : null;
  };

  for (const code of CERTIFICATION_PREFERENCE) {
    const value = pick(code);
    if (value) return value;
  }
  const any = results.find((r) => r.rating.trim().length > 0);
  return any ? any.rating.trim() : null;
}

// ============================================================================
// Sweeps
// ============================================================================

function buildSweeps(perDecade: number): Sweep[] {
  const decades: [string, string, string][] = [
    ['1960-1979', '1960-01-01', '1979-12-31'],
    ['1980-1989', '1980-01-01', '1989-12-31'],
    ['1990-1999', '1990-01-01', '1999-12-31'],
    ['2000-2009', '2000-01-01', '2009-12-31'],
    ['2010-2019', '2010-01-01', '2019-12-31'],
    ['2020-2029', '2020-01-01', '2029-12-31'],
  ];

  const sweeps: Sweep[] = decades.map(([label, gte, lte]) => ({
    label: `dönem ${label}`,
    params: {
      sort_by: 'vote_count.desc',
      'vote_count.gte': '200',
      'first_air_date.gte': gte,
      'first_air_date.lte': lte,
    },
    target: perDecade,
    minVotes: 200,
  }));

  const regions: [string, string, number, number][] = [
    ['Türkiye', 'TR', 100, 50],
    ['Uzak Doğu', 'JP|KR|CN|HK|TW|TH', 200, 100],
    ['Avrupa', 'FR|IT|ES|DE|SE|DK|NO|NL|PL|BE|IE', 200, 100],
    ['Latin Amerika', 'MX|BR|AR|CL|CO', 100, 80],
  ];

  for (const [label, countries, target, minVotes] of regions) {
    sweeps.push({
      label: `bölge ${label}`,
      params: {
        sort_by: 'vote_count.desc',
        'vote_count.gte': String(minVotes),
        with_origin_country: countries,
      },
      target,
      minVotes,
    });
  }

  return sweeps;
}

// ============================================================================
// Database
// ============================================================================

async function getExistingTvIds(): Promise<Set<number>> {
  const result = await pool.query<{ tmdb_id: number }>(
    "SELECT tmdb_id FROM movies WHERE media_type = 'tv'"
  );
  return new Set(result.rows.map((r) => r.tmdb_id));
}

async function upsertSeries(
  series: TMDBSeries,
  episode: TMDBEpisode,
  minVotes: number
): Promise<number | null> {
  if (!series.name || !series.first_air_date) return null;
  if (series.adult) return null;
  if (!series.poster_path) return null;
  const floor =
    series.original_language === 'en' ? Math.max(minVotes, ENGLISH_QUERY_VOTE_FLOOR) : minVotes;
  if (series.vote_count < floor) return null;

  const year = parseInt(series.first_air_date.substring(0, 4), 10);
  if (isNaN(year)) return null;

  // Sözün üzerine verileceği bölümün süresi bilinmiyorsa dizi alınmıyor:
  // süre filtresi o sayının üzerinde çalışıyor.
  const runtime = episode.runtime ?? null;
  if (!runtime || runtime < MIN_EPISODE_RUNTIME) return null;

  const result = await pool.query<{ id: number }>(
    `INSERT INTO movies (
      tmdb_id, media_type, title, original_title, year, runtime, synopsis,
      poster_path, vote_average, vote_count, original_language, adult,
      backdrop_path, tagline, imdb_id, popularity, status, certification, directors,
      first_air_date, last_air_date, number_of_seasons, number_of_episodes, networks,
      first_episode_name, first_episode_overview, first_episode_still_path
    ) VALUES ($1, 'tv', $2, $3, $4, $5, $6, $7, $8, $9, $10, false,
              $11, $12, $13, $14, $15, $16, $17,
              $18, $19, $20, $21, $22, $23, $24, $25)
    ON CONFLICT (tmdb_id, media_type) DO UPDATE SET
      title = EXCLUDED.title,
      runtime = EXCLUDED.runtime,
      synopsis = EXCLUDED.synopsis,
      poster_path = EXCLUDED.poster_path,
      vote_average = EXCLUDED.vote_average,
      vote_count = EXCLUDED.vote_count,
      backdrop_path = EXCLUDED.backdrop_path,
      tagline = EXCLUDED.tagline,
      imdb_id = EXCLUDED.imdb_id,
      popularity = EXCLUDED.popularity,
      status = EXCLUDED.status,
      last_air_date = EXCLUDED.last_air_date,
      number_of_seasons = EXCLUDED.number_of_seasons,
      number_of_episodes = EXCLUDED.number_of_episodes,
      networks = EXCLUDED.networks,
      first_episode_name = EXCLUDED.first_episode_name,
      first_episode_overview = EXCLUDED.first_episode_overview,
      first_episode_still_path = EXCLUDED.first_episode_still_path,
      certification = COALESCE(EXCLUDED.certification, movies.certification),
      directors = COALESCE(EXCLUDED.directors, movies.directors)
    RETURNING id`,
    [
      series.id,
      series.name,
      series.original_name,
      year,
      runtime,
      series.overview || null,
      series.poster_path,
      series.vote_average,
      series.vote_count,
      series.original_language,
      series.backdrop_path || null,
      series.tagline?.trim() || null,
      series.external_ids?.imdb_id || null,
      series.popularity ?? null,
      series.status || null,
      extractCertification(series),
      extractCreators(series),
      series.first_air_date,
      series.last_air_date || null,
      series.number_of_seasons ?? null,
      series.number_of_episodes ?? null,
      series.networks?.map((n) => n.name) ?? null,
      episode.name || null,
      episode.overview || null,
      episode.still_path || null,
    ]
  );

  return result.rows[0].id;
}

async function linkGenres(movieId: number, genreIds: number[]): Promise<void> {
  if (genreIds.length === 0) return;
  await pool.query(
    `INSERT INTO movie_genres (movie_id, genre_id)
     SELECT $1, unnest($2::int[])
     ON CONFLICT DO NOTHING`,
    [movieId, genreIds]
  );
}

async function linkCountries(movieId: number, codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await pool.query(
    `INSERT INTO movie_countries (movie_id, country_code)
     SELECT $1, c.code FROM countries c WHERE c.code = ANY($2)
     ON CONFLICT DO NOTHING`,
    [movieId, codes]
  );
}

async function linkKeywords(movieId: number, keywords: { id: number; name: string }[]): Promise<void> {
  if (keywords.length === 0) return;
  const ids = keywords.map((k) => k.id);
  await pool.query(
    `INSERT INTO keywords (id, name)
     SELECT * FROM unnest($1::int[], $2::text[])
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [ids, keywords.map((k) => k.name)]
  );
  await pool.query(
    `INSERT INTO movie_keywords (movie_id, keyword_id)
     SELECT $1, unnest($2::int[])
     ON CONFLICT DO NOTHING`,
    [movieId, ids]
  );
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('\n  ❌ TMDB_API_KEY ayarlı değil\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const countIndex = args.indexOf('--count');
  const perDecade = countIndex >= 0 ? parseInt(args[countIndex + 1], 10) || 200 : 200;

  const sweeps = buildSweeps(perDecade);
  const existing = await getExistingTvIds();
  const before = existing.size;

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                      📺 Muse TV Seeder                               ║
╚══════════════════════════════════════════════════════════════════════╝

  Tabloda hâlihazırda: ${before} dizi
  Tarama sayısı:       ${sweeps.length}
  Dönem başına hedef:  ${perDecade}
`);

  const totals = { added: 0, existing: 0, noEpisode: 0, quality: 0, errors: 0 };
  const startedAt = Date.now();

  for (const sweep of sweeps) {
    let added = 0;
    let page = 1;
    let totalPages = 1;
    process.stdout.write(`  ${sweep.label.padEnd(24)} `);

    while (added < sweep.target && page <= totalPages && page <= 500) {
      let response: TMDBResponse;
      try {
        response = await fetchDiscover(sweep.params, page);
      } catch {
        totals.errors++;
        break;
      }
      totalPages = response.total_pages;

      for (const item of response.results) {
        if (added >= sweep.target) break;
        if (existing.has(item.id)) {
          totals.existing++;
          continue;
        }
        existing.add(item.id);

        try {
          await sleep(RATE_LIMIT_DELAY);
          const series = await fetchSeries(item.id);

          await sleep(RATE_LIMIT_DELAY);
          const episode = await fetchFirstEpisode(item.id);
          if (!episode) {
            totals.noEpisode++;
            continue;
          }

          const movieId = await upsertSeries(series, episode, sweep.minVotes);
          if (!movieId) {
            totals.quality++;
            continue;
          }

          added++;
          totals.added++;

          if (series.genres) await linkGenres(movieId, series.genres.map((g) => g.id));
          if (series.production_countries) {
            await linkCountries(movieId, series.production_countries.map((c) => c.iso_3166_1));
          }
          // Dizide anahtar kelimeler `results` altında — filmdeki `keywords`
          // değil. Aynı ada sahip iki farklı şekil.
          if (series.keywords?.results?.length) {
            await linkKeywords(movieId, series.keywords.results);
          }
        } catch {
          totals.errors++;
        }
      }

      page++;
      await sleep(RATE_LIMIT_DELAY);
    }

    console.log(`+${added}`);
  }

  const after = await pool.query<{ n: string }>(
    "SELECT count(*) n FROM movies WHERE media_type = 'tv'"
  );

  const elapsed = Date.now() - startedAt;
  const minutes = Math.floor(elapsed / 60000);
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                          TV Seed Complete! 📺                        ║
╚══════════════════════════════════════════════════════════════════════╝

  ✓ Eklenen dizi:        ${totals.added}
  ⊘ Zaten tabloda:       ${totals.existing}
  ⊘ İlk bölümü yok:      ${totals.noEpisode}
  ⊘ Kaliteden elenen:    ${totals.quality}
  ✗ Hata:                ${totals.errors}
  ⏱  Süre:               ${minutes}m ${Math.floor((elapsed % 60000) / 1000)}s

  📊 Dizi sayısı: ${before} → ${after.rows[0].n}
`);

  await pool.end();
}

main().catch((error) => {
  console.error('\n  ❌ Seed başarısız:', error.message);
  process.exit(1);
});
