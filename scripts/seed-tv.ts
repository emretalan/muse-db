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
 *
 * TMDB bölüm belgesinde süreyi çoğu telenovelada boş bırakıyor; o durumda
 * dizinin kendi `episode_run_time` alanından kestiriliyor ve satır
 * `runtime_estimated` ile işaretleniyor. Bkz. `episodeRuntimeOf`.
 */

import { pool } from '../src/db/client.js';
import {
  TRANSLATION_REGIONS,
  TIER_TWO_LANGUAGES,
  minVotesForLanguage,
} from '../src/services/languages.js';
import { config } from '../src/config.js';
import { LinkBuffer } from './link-buffer.js';

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
  /** Dizinin kendi sayfasındaki tipik bölüm süresi/süreleri. S01E01
   *  belgesinde süre yoksa `episodeRuntimeOf` buradan kestiriyor. */
  episode_run_time?: number[];
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
  translations?: {
    translations?: {
      iso_639_1: string;
      iso_3166_1: string;
      /** Dizide başlık `name`, filmde `title`. */
      data?: { name?: string; title?: string };
    }[];
  };
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

/** Kademe 3 dillerinin sorgu anındaki oy tabanı; taramalar bunun altına
 *  inmemeli. Dil bazlı taban `minVotesForLanguage` ile geliyor: bir tarama
 *  bütün dilleri kapsıyor olabilir (tür taramaları öyle) ve İngilizceden 200,
 *  Japoncadan 50 isteyen sorgunun altında kalan satır tabloya girip hiç
 *  gösterilmez. */
const TIER_THREE_MIN_VOTES = config.selection.minVoteCountTvTierThree;

/** Bir bölümün alt sınırı. Filmlerdeki 60 dakika burada anlamsız: bir sitcom
 *  bölümü 22 dakika.
 *
 *  Bu eşiğin "yalnızca fragman/teaser kayıtlarını elediği" yazıyordu; ölçünce
 *  öyle olmadığı görüldü. Gerçekte elediği başlıklar arasında SpongeBob
 *  SquarePants (9 dk, 3.261 oy), Doraemon (7), Oggy and the Cockroaches (7),
 *  Caméra Café (7) ve Super Dragon Ball Heroes (8) var — hiçbiri fragman
 *  değil, hepsi kısa formatın kendisi.
 *
 *  Eşik yine de duruyor, çünkü sorun veri değil tören: Muse'ün sözü "bu akşam,
 *  bir hikâye" ve 7 dakikalık bir bölüm bir akşam etmiyor. Ama artık bunun bir
 *  ürün kararı olduğu yazılı; bir gün kısa format ayrı bir kutu olarak
 *  açılırsa değişecek yer burası. */
const MIN_EPISODE_RUNTIME = 10;

/** Kestirimin üst sınırı. `episode_run_time` bazen bölümün değil bütün
 *  mini dizinin süresini taşıyor — *Scenes from a Marriage* 297 dakika
 *  diyor, gerçek ilk bölüm 52. Ölçüldü: bu sınır 292 dizinin yalnızca
 *  ikisini kesiyor ve ikisi de doğru kesiliyor. Yalnızca kestirime
 *  uygulanıyor; gerçek S01E01 süresi ne diyorsa o yazılıyor. */
const MAX_ESTIMATED_RUNTIME = 240;

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
    `/tv/${seriesId}?append_to_response=credits,keywords,content_ratings,external_ids,translations`
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

/**
 * Sözün üzerine verilecek bölümün süresi, ve o sürenin gerçek mi kestirim mi
 * olduğu.
 *
 * Sıra hiç değişmiyor: **S01E01'in kendi süresi varsa her zaman o.** Kestirim
 * yalnızca o yokken devreye giriyor, çünkü `episode_run_time` tipik bölümü
 * anlatıyor ve uzun metraj pilotu olan diziler için yanlış sayı — söz ilk
 * bölüm üzerineyse pilotun kendi süresi doğru olan.
 *
 * Kestirim medyan alıyor. Dizilerin yalnızca %3'ü birden fazla değer taşıyor,
 * yani seçim çoğu satırda hiçbir şeyi değiştirmiyor; ölçüldüğünde ilk değer,
 * medyan, en küçük ve en büyük birbirinden ayırt edilemedi (hepsinde ±5 dk
 * içinde %82–84). Medyan, ayırt edilemeyenler arasından uç değere en az
 * teslim olanı.
 *
 * Süre hiçbir yerden gelmiyorsa `null` — o dizi yine alınmıyor. Süre filtresi
 * o sayının üzerinde çalışıyor ve uydurulmuş bir sayı, eksik olandan kötü.
 */
function episodeRuntimeOf(
  series: TMDBSeries,
  episode: TMDBEpisode
): { runtime: number; estimated: boolean } | null {
  const real = episode.runtime ?? null;
  if (real && real >= MIN_EPISODE_RUNTIME) return { runtime: real, estimated: false };

  // Gerçek süre var ama eşiğin altında: kısa formatın kendisi. Kestirime
  // düşmek burada bir kaçamak olurdu — sayı biliniyor, kararı o veriyor.
  if (real) return null;

  const candidates = (series.episode_run_time ?? []).filter((n) => n > 0);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const median = sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);

  if (median < MIN_EPISODE_RUNTIME || median > MAX_ESTIMATED_RUNTIME) return null;
  return { runtime: median, estimated: true };
}

/** Her taramanın taşıdığı taban parametre — gerekçesi seed-movies.ts'teki eşi.
 *  Süre burada yok: dizide filtre ilk bölümün süresi üzerinde çalışıyor ve o
 *  değer discover yanıtında hiç bulunmuyor, ancak bölüm çekildikten sonra
 *  biliniyor. */
const BASE_DISCOVER_PARAMS: Record<string, string> = {
  'vote_average.gte': String(config.selection.minVoteAverage),
};

async function fetchDiscover(params: Record<string, string>, page: number): Promise<TMDBResponse> {
  const query = new URLSearchParams({
    ...BASE_DISCOVER_PARAMS,
    ...params,
    include_adult: 'false',
    page: String(page),
  });
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

  // Tür taramaları.
  //
  // Dönem ve bölge taramaları oy sayısına göre sıralıyor, ve bu türler genel
  // sıralamada hep aşağıda kalıyor — ilk geçişten sonra kütüphanede 18
  // belgesel ve 12 realite vardı, oysa TMDB'de sırasıyla 339 ve 193 var.
  // Uygulamanın tür ekranındaki bir kartın karşılığının boş olması, o kartı
  // hiç göstermemekten daha kötü.
  // Hedefler TMDB'de ≥20 oylu havuzlarla hizalı (ölçüldü): belgesel 885,
  // realite 490, savaş&politika 336, pembe dizi 363, çocuk 705, talk 100,
  // western 88, haber 35.
  const thinGenres: [string, number, number][] = [
    ['Belgesel', 99, 400],
    ['Realite', 10764, 300],
    ['Savaş ve Politika', 10768, 250],
    ['Pembe Dizi', 10766, 250],
    ['Çocuk', 10762, 400],
    ['Talk', 10767, 100],
    ['Western', 37, 90],
    ['Haber', 10763, 40],
  ];

  for (const [label, genreId, target] of thinGenres) {
    sweeps.push({
      label: `tür ${label}`,
      params: {
        sort_by: 'vote_count.desc',
        'vote_count.gte': String(TIER_THREE_MIN_VOTES),
        with_genres: String(genreId),
      },
      target,
      minVotes: TIER_THREE_MIN_VOTES,
    });
  }

  // Dil taramaları.
  //
  // Bölge taramaları ("Uzak Doğu", "Avrupa") ülkeye bakıyor ve hedefleri
  // bütün bölgeye ait; tek tek diller o hedefin içinde boğuluyor. Ölçüldüğünde
  // Japonca 787/1.082, Korece 511/793'te takılıydı — ikisi de aynı "Uzak Doğu"
  // taramasını paylaşıyordu.
  //
  // Hedefler TMDB havuzunun üstünde bırakılıyor: tarama zaten sayfalar bitince
  // duruyor, yani asıl sınır havuzun kendisi olmalı, hedef değil.
  //
  // Eşikler kademelerin sorgu tabanlarıyla birebir aynı; altına inen bir satır
  // tabloya girip hiç gösterilmiyor.
  const tierThreeLanguages = [
    'tr', 'de', 'ru', 'pt', 'ko', 'zh', 'cn', 'hi', 'pl', 'sv', 'da', 'no',
    'nl', 'fi', 'cs', 'hu', 'el', 'ar', 'fa', 'th', 'ta', 'te', 'he', 'ro',
    'uk', 'id',
  ];

  const languageSweeps: [readonly string[], number, number][] = [
    // Kademe 1. Dönem taramaları da İngilizceyi tarıyor, ama listeleri 1960'ta
    // başlıyor; bu taramada tarih kısıtı olmadığı için 1960 öncesi de geliyor.
    [['en'], config.selection.minVoteCountTv, 1800],
    [TIER_TWO_LANGUAGES, config.selection.minVoteCountTvNonEnglish, 1200],
    [tierThreeLanguages, TIER_THREE_MIN_VOTES, 800],
  ];

  for (const [languages, minVotes, target] of languageSweeps) {
    for (const language of languages) {
      sweeps.push({
        label: `dil ${language}`,
        params: {
          sort_by: 'vote_count.desc',
          'vote_count.gte': String(minVotes),
          with_original_language: language,
        },
        target,
        minVotes,
      });
    }
  }

  return sweeps;
}

// ============================================================================
// Database
// ============================================================================

/**
 * "Bunu zaten aldık" listesi — tür bağı koşuluyla.
 *
 * Dizi satırı anında yazılıyor ama bağlantıları `LinkBuffer`'da birikiyor.
 * Betik iki boşaltma arasında kesilirse tür bağı olmayan satırlar kalır ve
 * tür filtresine hiç görünmezler. Listede olmadıkları için bir sonraki koşuda
 * tamamlanıyorlar; upsert `ON CONFLICT` olduğu için `id` değişmiyor.
 */
async function getExistingTvIds(): Promise<Set<number>> {
  const result = await pool.query<{ tmdb_id: number }>(
    `SELECT tmdb_id FROM movies m
     WHERE m.media_type = 'tv'
       AND EXISTS (SELECT 1 FROM movie_genres g WHERE g.movie_id = m.id)`
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
  const floor = Math.max(minVotes, minVotesForLanguage(series.original_language, 'tv'));
  if (series.vote_count < floor) return null;
  // Puan tabanı da sorgu anındaki eşikle aynı olmalı; yoksa satır tabloya
  // girer ve hiçbir sorguya görünmez. (Süre kontrolü aşağıda, ilk bölümün
  // süresi elde edildikten sonra.)
  if (series.vote_average < config.selection.minVoteAverage) return null;

  const year = parseInt(series.first_air_date.substring(0, 4), 10);
  if (isNaN(year)) return null;

  // Sözün üzerine verileceği bölümün süresi hiçbir kaynaktan gelmiyorsa dizi
  // alınmıyor: süre filtresi o sayının üzerinde çalışıyor.
  const measured = episodeRuntimeOf(series, episode);
  if (!measured) return null;
  const { runtime, estimated } = measured;

  const result = await pool.query<{ id: number }>(
    `INSERT INTO movies (
      tmdb_id, media_type, title, original_title, year, runtime, synopsis,
      poster_path, vote_average, vote_count, original_language, adult,
      backdrop_path, tagline, imdb_id, popularity, status, certification, directors,
      first_air_date, last_air_date, number_of_seasons, number_of_episodes, networks,
      first_episode_name, first_episode_overview, first_episode_still_path,
      runtime_estimated
    ) VALUES ($1, 'tv', $2, $3, $4, $5, $6, $7, $8, $9, $10, false,
              $11, $12, $13, $14, $15, $16, $17,
              $18, $19, $20, $21, $22, $23, $24, $25, $26)
    ON CONFLICT (tmdb_id, media_type) DO UPDATE SET
      title = EXCLUDED.title,
      runtime = EXCLUDED.runtime,
      runtime_estimated = EXCLUDED.runtime_estimated,
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
      estimated,
    ]
  );

  return result.rows[0].id;
}

/** TMDB kimi çeviriyi görünmez yön işaretleriyle sarmalıyor — "The Office"in
 *  Türkçesi "\u200eOfis\u200e" olarak geliyor. Ekranda görünmüyorlar ama
 *  karşılaştırmayı bozuyorlar, o yüzden `trim` yetmiyor. */
function cleanTitle(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}

/** Bkz. `seed-movies.ts`'teki eşi. Dizide başlık `data.name` altında. */
function extractTranslations(
  entries:
    | { iso_639_1: string; iso_3166_1: string; data?: { name?: string; title?: string } }[]
    | undefined
): { language: string; title: string }[] {
  if (!entries) return [];
  const out: { language: string; title: string }[] = [];
  for (const [language, region] of Object.entries(TRANSLATION_REGIONS)) {
    const entry = entries.find((e) => e.iso_639_1 === language && e.iso_3166_1 === region);
    const title = cleanTitle(entry?.data?.name ?? entry?.data?.title);
    if (title) out.push({ language, title });
  }
  return out;
}

/** Bir dizinin tüm bağlantı satırlarını tampona yazar. Doğrudan yazım yerine
 *  toplu boşaltma — gerekçesi scripts/link-buffer.ts başında. */
function bufferLinks(links: LinkBuffer, movieId: number, series: TMDBSeries): void {
  if (series.genres) {
    links.addGenres(movieId, series.genres.map((g) => g.id));
  }
  if (series.production_countries) {
    links.addCountries(movieId, series.production_countries.map((c) => c.iso_3166_1));
  }
  // Dizide anahtar kelimeler `results` altında — filmdeki `keywords` değil.
  // Aynı ada sahip iki farklı şekil.
  if (series.keywords?.results?.length) {
    links.addKeywords(movieId, series.keywords.results);
  }
  links.addTranslations(movieId, extractTranslations(series.translations?.translations));
}

// ============================================================================
// Main
// ============================================================================
/**
 * Tablodaki dizileri TMDB'den yeniden çekip alanlarını tazeler.
 *
 * Yeni dizi eklemez ve hiçbir `movies.id` değişmez: sorgu tablodan gelen
 * `tmdb_id` üzerinden gidiyor ve upsert `ON CONFLICT (tmdb_id, media_type)`
 * olduğu için satır yerinde güncelleniyor. Çeviri gibi sonradan eklenen
 * sütunları doldurmanın tek yolu bu.
 */
async function refresh(): Promise<void> {
  const result = await pool.query<{ tmdb_id: number }>(
    "SELECT tmdb_id FROM movies WHERE media_type = 'tv' ORDER BY id"
  );
  const ids = result.rows.map((r) => r.tmdb_id);

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                   📺 Muse TV Seeder — refresh                        ║
╚══════════════════════════════════════════════════════════════════════╝

  Tablodaki dizi sayısı: ${ids.length}
`);

  const totals = { updated: 0, skipped: 0, errors: 0 };
  const links = new LinkBuffer();
  const startedAt = Date.now();

  for (const [index, tmdbId] of ids.entries()) {
    try {
      await sleep(RATE_LIMIT_DELAY);
      const series = await fetchSeries(tmdbId);

      await sleep(RATE_LIMIT_DELAY);
      const episode = await fetchFirstEpisode(tmdbId);
      if (!episode) {
        totals.skipped++;
        continue;
      }

      // Eşik 0: satır zaten tabloda. Bugünkü eşiklerin altına düşmüş olsa
      // bile verisini tazelemek istiyoruz; kimin gösterileceğine sorgu
      // anındaki eşikler karar veriyor, seed değil.
      const movieId = await upsertSeries(series, episode, 0);
      if (!movieId) {
        totals.skipped++;
        continue;
      }

      totals.updated++;

      bufferLinks(links, movieId, series);
      if (links.shouldFlush) await links.flush();
    } catch {
      totals.errors++;
    }

    if ((index + 1) % 25 === 0 || index === ids.length - 1) {
      process.stdout.write(
        `\r  ${index + 1}/${ids.length}  güncellenen ${totals.updated}  atlanan ${totals.skipped}  hata ${totals.errors}   `
      );
    }
  }

  await links.flush();

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n\n  ✓ ${totals.updated} dizi tazelendi (${elapsed} sn)\n`);
}


async function main(): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('\n  ❌ TMDB_API_KEY ayarlı değil\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.includes('--refresh')) {
    await refresh();
    await pool.end();
    return;
  }

  const countIndex = args.indexOf('--count');
  const perDecade = countIndex >= 0 ? parseInt(args[countIndex + 1], 10) || 200 : 200;

  // --only <önek>: yalnızca etiketi bu önekle başlayan taramaları çalıştır.
  // İkinci bir geçişte dönem ve bölge taramalarını baştan sayfalamak, hepsi
  // zaten tabloda olduğu için sadece zaman kaybı.
  const onlyIndex = args.indexOf('--only');
  const onlyPrefix = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

  const sweeps = buildSweeps(perDecade).filter(
    (s) => !onlyPrefix || s.label.startsWith(onlyPrefix)
  );
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
  const links = new LinkBuffer();
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

          bufferLinks(links, movieId, series);
          if (links.shouldFlush) await links.flush();
        } catch {
          totals.errors++;
        }
      }

      page++;
      await sleep(RATE_LIMIT_DELAY);
    }

    // Tarama sonunda boşalt: kesilme hâlinde en fazla bir taramanın
    // bağlantıları kaybolsun.
    await links.flush();
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
