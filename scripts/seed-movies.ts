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
import { TRANSLATION_REGIONS } from '../src/services/languages.js';
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
  backdrop_path?: string | null;
  tagline?: string | null;
  imdb_id?: string | null;
  popularity?: number;
  status?: string;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult: boolean;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];

  // append_to_response ile aynı çağrıda gelen alt kaynaklar — ek istek değil,
  // sadece daha büyük bir yanıt.
  credits?: { crew?: { job: string; name: string }[] };
  keywords?: { keywords?: { id: number; name: string }[] };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates: { certification: string }[] }[];
  };
  translations?: {
    translations?: {
      iso_639_1: string;
      iso_3166_1: string;
      data?: { title?: string; name?: string };
    }[];
  };
}

interface TMDBResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TMDBMovie[];
}

interface SeedOptions {
  /** `discover` kipinde: dönem taraması başına hedef. */
  count: number;
  source: 'popular' | 'top_rated' | 'both' | 'discover';
  minVotes: number;
  clear: boolean;
  /** Yeni film aramak yerine tablodaki mevcut filmleri TMDB'den yeniden çek.
   *  Yeni sütunları (yönetmen, anahtar kelime, backdrop, slogan, sertifika)
   *  geriye dönük doldurmanın tek yolu bu — `popular`/`top_rated` listeleri
   *  kütüphanedeki 2.129 filmin ancak bir kısmına denk geliyor. */
  refresh: boolean;
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
    refresh: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--refresh') {
      options.refresh = true;
      continue;
    }

    if (arg === '--count' || arg === '-c') {
      options.count = parseInt(args[++i], 10) || 500;
    } else if (arg === '--source' || arg === '-s') {
      const source = args[++i];
      if (
        source === 'popular' ||
        source === 'top_rated' ||
        source === 'both' ||
        source === 'discover'
      ) {
        options.source = source;
      }
    } else if (arg === '--min-votes') {
      options.minVotes = parseInt(args[++i], 10) || 100;
    } else if (arg === '--clear') {
      // `movies.id` bir SERIAL ve bu değer sunucunun dışında yaşıyor: her
      // kullanıcının cihazındaki SwiftData arşivinde (`MovieDeal.movieId`),
      // Firestore'daki `users/{uid}/deals/{id}.movieId` alanında, ve
      // uygulamanın her tören başında gönderdiği `excludeMovieIds` listesinde.
      //
      // Temizleyip yeniden seed etmek serial'leri baştan dağıtır — herkesin
      // arşivindeki her kayıt başka bir filme işaret etmeye başlar, geri
      // dönüşü yok. Bu yüzden bayrak tek başına yetmiyor; ve red veritabanına
      // hiç bağlanmadan, burada veriliyor.
      if (!args.includes('--i-know-this-destroys-user-archives')) {
        console.error(`
  ❌ --clear reddedildi.

     Bu işlem movies.id serial'lerini yeniden dağıtır. O kimlikler
     kullanıcıların cihazındaki arşivde ve Firestore'da duruyor; temizlik
     sonrası herkesin arşivi yanlış filmlere işaret eder.

     Kütüphaneyi büyütmek için --clear gerekmiyor: seed zaten
     ON CONFLICT (tmdb_id) DO UPDATE ile ekleme yapıyor, yani mevcut
     satırları kimliklerini koruyarak günceller.

     Gerçekten sıfırdan bir *yerel geliştirme* veritabanı kuruyorsan
     --i-know-this-destroys-user-archives bayrağını da ekle.
`);
        process.exit(1);
      }
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
  --source, -s <type>     Source: 'popular', 'top_rated', 'both', 'discover'
                          (default: 'both'). 'discover' balances the library
                          with per-decade and per-region sweeps instead of
                          TMDB's editorial lists; --count is the per-decade
                          target there.
  --min-votes <number>    Minimum vote count for quality (default: 100)
  --refresh               Re-fetch every movie already in the table from TMDB
                          and backfill the enrichment columns (directors,
                          keywords, backdrop, tagline, certification).
                          Adds no new movies and never changes an id.
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

/** Yaş sınırının hangi ülkeden alınacağı. ABD şeması (G/PG/PG-13/R) en tanıdık
 *  olanı; yoksa Birleşik Krallık, o da yoksa dolu olan ilk değer. */
const CERTIFICATION_PREFERENCE = ['US', 'GB'];

async function fetchMovieDetails(movieId: number): Promise<TMDBMovie> {
  // Yönetmen, anahtar kelimeler ve yaş sınırı bu üç alt kaynakta duruyor ve
  // append_to_response sayesinde hiç ek istek harcamadan aynı yanıtla geliyor.
  return fetchFromTMDB<TMDBMovie>(
    `/movie/${movieId}?append_to_response=credits,keywords,release_dates,translations`
  );
}

/** credits.crew içinden yönetmen isimleri. Bir filmin birden fazla yönetmeni
 *  olabilir (Coen kardeşler), o yüzden dizi. */
function extractDirectors(movie: TMDBMovie): string[] | null {
  const crew = movie.credits?.crew;
  if (!crew) return null;
  const names = crew.filter((c) => c.job === 'Director').map((c) => c.name);
  return names.length > 0 ? [...new Set(names)] : null;
}

/** release_dates içinden tek bir yaş sınırı. TMDB bunu ülke ülke veriyor ve
 *  çoğu ülke için boş string dönüyor — boşlar elenmeli. */
function extractCertification(movie: TMDBMovie): string | null {
  const results = movie.release_dates?.results;
  if (!results) return null;

  const firstNonEmpty = (code: string): string | null => {
    const entry = results.find((r) => r.iso_3166_1 === code);
    const found = entry?.release_dates.find((d) => d.certification.trim().length > 0);
    return found ? found.certification.trim() : null;
  };

  for (const code of CERTIFICATION_PREFERENCE) {
    const value = firstNonEmpty(code);
    if (value) return value;
  }

  for (const entry of results) {
    const found = entry.release_dates.find((d) => d.certification.trim().length > 0);
    if (found) return found.certification.trim();
  }

  return null;
}

/** Tek bir /discover/movie taraması. */
interface DiscoverSweep {
  label: string;
  /** TMDB'ye olduğu gibi geçen sorgu parametreleri. */
  params: Record<string, string>;
  /** Bu taramadan kaç yeni film alınmaya çalışılacak. */
  target: number;
  /** Bu tarama için oy eşiği — bölgesel taramalarda İngilizce eşiği anlamsız. */
  minVotes: number;
}

/**
 * Kütüphaneyi dengeleyen taramalar.
 *
 * `popular` ve `top_rated` TMDB'nin editoryal vitrini: İngilizce ve son
 * yıllara ağırlıklı. 1980'lerin kütüphanede 88 filmde kalmasının sebebi
 * TMDB'de 80'ler filmi olmaması değil, o iki listede olmaması. /discover
 * dönemi ve ülkeyi doğrudan kısıtlayabildiği için raflar tek tek
 * doldurulabiliyor.
 */
function buildSweeps(perDecade: number): DiscoverSweep[] {
  const decades: [string, string, string][] = [
    ['1920-1949', '1920-01-01', '1949-12-31'],
    ['1950-1959', '1950-01-01', '1959-12-31'],
    ['1960-1969', '1960-01-01', '1969-12-31'],
    ['1970-1979', '1970-01-01', '1979-12-31'],
    ['1980-1989', '1980-01-01', '1989-12-31'],
    ['1990-1999', '1990-01-01', '1999-12-31'],
    ['2000-2009', '2000-01-01', '2009-12-31'],
    ['2010-2019', '2010-01-01', '2019-12-31'],
    ['2020-2029', '2020-01-01', '2029-12-31'],
  ];

  const sweeps: DiscoverSweep[] = decades.map(([label, gte, lte]) => ({
    label: `dönem ${label}`,
    // vote_count.desc, vote_average.desc değil: eksik olan on yılların
    // *tanınmış* filmleri. Yüksek puanlı ama kimsenin duymadığı bir filmle
    // 80'ler rafını doldurmak sorunu çözmüyor.
    params: {
      sort_by: 'vote_count.desc',
      'vote_count.gte': '500',
      'primary_release_date.gte': gte,
      'primary_release_date.lte': lte,
    },
    target: perDecade,
    minVotes: 500,
  }));

  // Bölgesel taramalar. with_original_language değil with_origin_country:
  // Türk-Alman ortak yapımı bir film ya da İngilizce çekilmiş bir Hint filmi
  // dile göre kaçıyor, ülkeye göre kaçmıyor.
  const regions: [string, string, number, number][] = [
    ['Türkiye',       'TR',                          150, 100],
    ['Hindistan',     'IN',                          200, 150],
    ['Latin Amerika', 'MX|BR|AR|CL|CO|PE',           200, 150],
    ['Uzak Doğu',     'JP|KR|CN|HK|TW|TH',           300, 150],
    ['Avrupa',        'FR|IT|ES|DE|SE|DK|NO|NL|PL|GR|PT|CZ|HU|BE|AT|CH|IE|FI', 300, 150],
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

async function fetchDiscover(
  params: Record<string, string>,
  page: number
): Promise<TMDBResponse> {
  const query = new URLSearchParams({
    ...params,
    include_adult: 'false',
    page: String(page),
  });
  return fetchFromTMDB<TMDBResponse>(`/discover/movie?${query.toString()}`);
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
  await pool.query('DELETE FROM movie_keywords');
  await pool.query('DELETE FROM user_picks');
  await pool.query('DELETE FROM movies');
  console.log('  ✓ Movies cleared\n');
}

/** Tablodaki her filmin TMDB kimliği, id sırasıyla. `--refresh` bunun
 *  üzerinden yürüyor. */
/** Tazelenecek TMDB kimlikleri — yalnızca filmler.
 *
 *  `media_type` süzgeci şart: tablo dizileri de taşıyor ve bir dizinin TMDB
 *  kimliği `/movie/` altında bambaşka bir filme denk geliyor. Süzgeçsiz bir
 *  tazeleme o filmleri tabloya yeni satır olarak eklerdi. */
async function getAllTmdbIds(): Promise<number[]> {
  const result = await pool.query<{ tmdb_id: number }>(
    "SELECT tmdb_id FROM movies WHERE media_type = 'movie' ORDER BY id"
  );
  return result.rows.map((r) => r.tmdb_id);
}

async function getExistingMovieCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM movies WHERE media_type = 'movie'"
  );
  return parseInt(result.rows[0].count, 10);
}

/** İngilizce yapımların sorgu anındaki oy eşiği (config.selection.minVoteCount).
 *
 *  Bölgesel taramalar `with_origin_country` ile çalışıyor ve İrlanda ya da
 *  Birleşik Krallık gibi ülkeler İngilizce film döndürüyor. Bölge eşiği (150)
 *  ile alınan İngilizce bir film tabloya girer ama sorgu eşiğini (500)
 *  geçemeyeceği için hiç gösterilmez — görünmez satır biriktirmenin anlamı
 *  yok. Bu değer `config.selection.minVoteCount` ile aynı kalmalı. */
const ENGLISH_QUERY_VOTE_FLOOR = 500;

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
  const floor =
    movie.original_language === 'en' ? Math.max(minVotes, ENGLISH_QUERY_VOTE_FLOOR) : minVotes;
  if (movie.vote_count < floor) {
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

  // ON CONFLICT DO UPDATE — asla INSERT-only değil, çünkü bu betik zenginleştirme
  // için mevcut satırların üzerinden ikinci kez geçiyor. `id` korunur.
  const result = await pool.query<{ id: number }>(
    `INSERT INTO movies (
      tmdb_id, media_type, title, original_title, year, runtime, synopsis,
      poster_path, vote_average, vote_count, original_language, adult,
      backdrop_path, tagline, imdb_id, popularity, status, certification, directors
    ) VALUES ($1, 'movie', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16, $17, $18)
    -- Tekillik 009'dan beri (tmdb_id, media_type) çifti üzerinde: bir film ve
    -- bir dizi aynı TMDB kimliğini taşıyabiliyor, iki ayrı ad alanı.
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
      -- COALESCE: TMDB bazen bu ikisini boş döndürüyor. Boş bir yanıt yüzünden
      -- daha önce doğru toplanmış bir değeri silmenin anlamı yok.
      certification = COALESCE(EXCLUDED.certification, movies.certification),
      directors = COALESCE(EXCLUDED.directors, movies.directors)
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
      movie.backdrop_path || null,
      movie.tagline?.trim() || null,
      movie.imdb_id || null,
      movie.popularity ?? null,
      movie.status || null,
      extractCertification(movie),
      extractDirectors(movie),
    ]
  );

  return result.rows[0].id;
}

// Junction tablolarına satır başına bir sorgu atmak yerel veritabanında
// önemsizdi; uzak bir Postgres'te her sorgu bir gidiş-dönüş demek. 2.129 filmi
// yenilerken bu, on binlerce gidiş-dönüşe ve saatlere dönüşüyor. Hepsi tek
// çok satırlı INSERT'e indirildi.
async function linkMovieGenres(movieId: number, genreIds: number[]): Promise<void> {
  if (genreIds.length === 0) return;
  await pool.query(
    `INSERT INTO movie_genres (movie_id, genre_id)
     SELECT $1, unnest($2::int[])
     ON CONFLICT DO NOTHING`,
    [movieId, genreIds]
  );
}

async function linkMovieKeywords(
  movieId: number,
  keywords: { id: number; name: string }[]
): Promise<void> {
  if (keywords.length === 0) return;

  const ids = keywords.map((k) => k.id);
  const names = keywords.map((k) => k.name);

  // Anahtar kelime sözlüğü paylaşılıyor: aynı "time travel" binlerce filmde
  // geçiyor, her seferinde yeniden yazmak yerine upsert.
  await pool.query(
    `INSERT INTO keywords (id, name)
     SELECT * FROM unnest($1::int[], $2::text[])
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [ids, names]
  );
  await pool.query(
    `INSERT INTO movie_keywords (movie_id, keyword_id)
     SELECT $1, unnest($2::int[])
     ON CONFLICT DO NOTHING`,
    [movieId, ids]
  );
}

/** TMDB kimi çeviriyi görünmez yön işaretleriyle sarmalıyor — "The Office"in
 *  Türkçesi "\u200eOfis\u200e" olarak geliyor. Ekranda görünmüyorlar ama
 *  karşılaştırmayı bozuyorlar, o yüzden `trim` yetmiyor. */
function cleanTitle(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}

/** TMDB'nin çeviri listesinden uygulamanın konuştuğu dilleri süzer.
 *
 *  TMDB aynı dil için birden fazla bölge tutabiliyor — `de-DE` ile `de-AT`
 *  ayrı iki kayıt — o yüzden bölge kodu da eşleşmek zorunda. Çevirisi
 *  olmayan dilde boş string dönüyor; o kayıt hiç yazılmıyor ve okuma tarafı
 *  İngilizceye düşüyor.
 */
function extractTranslations(
  entries:
    | { iso_639_1: string; iso_3166_1: string; data?: { title?: string; name?: string } }[]
    | undefined
): { language: string; title: string }[] {
  if (!entries) return [];
  const out: { language: string; title: string }[] = [];
  for (const [language, region] of Object.entries(TRANSLATION_REGIONS)) {
    const entry = entries.find((e) => e.iso_639_1 === language && e.iso_3166_1 === region);
    const title = cleanTitle(entry?.data?.title ?? entry?.data?.name);
    if (title) out.push({ language, title });
  }
  return out;
}

async function linkMovieTranslations(
  movieId: number,
  translations: { language: string; title: string }[]
): Promise<void> {
  if (translations.length === 0) return;
  await pool.query(
    `INSERT INTO movie_translations (movie_id, language_code, title)
     SELECT $1, * FROM unnest($2::text[], $3::text[])
     ON CONFLICT (movie_id, language_code) DO UPDATE SET title = EXCLUDED.title`,
    [movieId, translations.map((t) => t.language), translations.map((t) => t.title)]
  );
}

async function linkMovieCountries(
  movieId: number,
  countries: { iso_3166_1: string }[]
): Promise<void> {
  if (countries.length === 0) return;
  const codes = countries.map((c) => c.iso_3166_1);
  // `countries` tablosunda 40 ülke var; listede olmayan bir kod sessizce düşer.
  await pool.query(
    `INSERT INTO movie_countries (movie_id, country_code)
     SELECT $1, c.code FROM countries c WHERE c.code = ANY($2)
     ON CONFLICT DO NOTHING`,
    [movieId, codes]
  );
}

// ============================================================================
// Main Seed Function
// ============================================================================

/**
 * Mevcut satırları TMDB'den yeniden çekip zenginleştirme sütunlarını doldurur.
 *
 * Yeni film eklemez ve hiçbir `movies.id` değişmez — sorgu tablodan gelen
 * `tmdb_id` üzerinden gidiyor ve upsert `ON CONFLICT (tmdb_id) DO UPDATE`
 * olduğu için satır yerinde güncelleniyor.
 */
async function refresh(): Promise<void> {
  const tmdbIds = await getAllTmdbIds();

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                 🎬 Muse Movie Seeder — refresh                       ║
╚══════════════════════════════════════════════════════════════════════╝

  Tablodaki film sayısı: ${tmdbIds.length}
  Yeni film eklenmeyecek, hiçbir id değişmeyecek.
`);

  const progress: SeedProgress = {
    processed: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    startTime: Date.now(),
  };

  for (const tmdbId of tmdbIds) {
    progress.processed++;
    try {
      await sleep(RATE_LIMIT_DELAY);
      const details = await fetchMovieDetails(tmdbId);

      // Kalite eşiği burada geçersiz: bu film zaten kütüphanede. Oy sayısı
      // zamanla eşiğin altına düşmüş olsa bile verisini tazelemek istiyoruz;
      // hangi filmlerin kullanıcıya gösterileceğine sorgu anındaki eşikler
      // karar veriyor, seed değil.
      const movieId = await upsertMovie(details, 0);
      if (movieId) {
        progress.inserted++;
        if (details.genres) {
          await linkMovieGenres(movieId, details.genres.map((g) => g.id));
        }
        if (details.production_countries) {
          await linkMovieCountries(movieId, details.production_countries);
        }
        if (details.keywords?.keywords?.length) {
          await linkMovieKeywords(movieId, details.keywords.keywords);
        }
        await linkMovieTranslations(
          movieId,
          extractTranslations(details.translations?.translations)
        );
      } else {
        progress.skipped++;
      }
    } catch {
      progress.errors++;
    }

    printProgress(progress, tmdbIds.length);
  }

  const elapsed = Date.now() - progress.startTime;
  const enriched = await pool.query<{ n: string }>(
    "SELECT count(*) n FROM movies WHERE directors IS NOT NULL"
  );

  console.log(`\n
╔══════════════════════════════════════════════════════════════════════╗
║                        Refresh Complete! 🎉                          ║
╚══════════════════════════════════════════════════════════════════════╝

  ✓ Güncellenen:      ${progress.inserted}
  ⊘ Atlanan:          ${progress.skipped}
  ✗ Hata:             ${progress.errors}
  ⏱  Süre:            ${formatDuration(elapsed)}

  📊 Yönetmeni olan film sayısı: ${enriched.rows[0].n}
`);

  await pool.end();
}

/**
 * Dönem ve bölge kotalarıyla kütüphaneyi dengeler.
 *
 * Tabloda zaten olan filmler atlanıyor. Yalnızca hız için değil: az önce
 * çalışan --refresh hepsini zaten TMDB'den tazeledi, ikinci kez çekmenin
 * hiçbir getirisi yok.
 */
async function discoverSeed(options: SeedOptions): Promise<void> {
  const sweeps = buildSweeps(options.count);
  const existing = new Set(await getAllTmdbIds());
  const before = existing.size;

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                🎬 Muse Movie Seeder — discover                       ║
╚══════════════════════════════════════════════════════════════════════╝

  Tabloda hâlihazırda: ${before} film (bunlar atlanacak)
  Tarama sayısı:       ${sweeps.length}
  Dönem başına hedef:  ${options.count}
`);

  const totals = { added: 0, skippedExisting: 0, skippedQuality: 0, errors: 0 };
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

      for (const movie of response.results) {
        if (added >= sweep.target) break;

        if (existing.has(movie.id)) {
          totals.skippedExisting++;
          continue;
        }
        existing.add(movie.id);

        try {
          await sleep(RATE_LIMIT_DELAY);
          const details = await fetchMovieDetails(movie.id);
          const movieId = await upsertMovie(details, sweep.minVotes);

          if (movieId) {
            added++;
            totals.added++;
            if (details.genres) {
              await linkMovieGenres(movieId, details.genres.map((g) => g.id));
            }
            if (details.production_countries) {
              await linkMovieCountries(movieId, details.production_countries);
            }
            if (details.keywords?.keywords?.length) {
              await linkMovieKeywords(movieId, details.keywords.keywords);
            }
            await linkMovieTranslations(
              movieId,
              extractTranslations(details.translations?.translations)
            );
          } else {
            totals.skippedQuality++;
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

  const finalCount = await getExistingMovieCount();
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                       Discover Complete! 🎉                          ║
╚══════════════════════════════════════════════════════════════════════╝

  ✓ Eklenen yeni film:   ${totals.added}
  ⊘ Zaten tabloda:       ${totals.skippedExisting}
  ⊘ Kaliteden elenen:    ${totals.skippedQuality}
  ✗ Hata:                ${totals.errors}
  ⏱  Süre:               ${formatDuration(Date.now() - startedAt)}

  📊 Kütüphane: ${before} → ${finalCount}
`);

  await pool.end();
}

async function seed(options: SeedOptions): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('\n  ❌ Error: TMDB_API_KEY is not set in .env\n');
    process.exit(1);
  }

  if (options.refresh) {
    await refresh();
    return;
  }

  if (options.source === 'discover') {
    await discoverSeed(options);
    return;
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
  // 'discover' buraya hiç ulaşmıyor — yukarıda kendi akışına dallanıyor.

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

              // Link keywords
              if (details.keywords?.keywords?.length) {
                await linkMovieKeywords(movieId, details.keywords.keywords);
              }
              await linkMovieTranslations(
                movieId,
                extractTranslations(details.translations?.translations)
              );
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
