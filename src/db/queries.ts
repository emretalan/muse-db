import { pool } from './client.js';
import type { MovieRow, Genre, PickFilters, Era, MediaType } from '../types/index.js';
import { config } from '../config.js';
import { expandOrigin, ORIGIN_BUCKETS, originBucketFor } from '../services/origins.js';
import { TIER_ONE_LANGUAGE, TIER_TWO_SQL } from '../services/languages.js';
import { MOOD_SLUGS } from '../services/moods.js';
import type { TasteFacts } from '../services/taste.js';
import { NETWORK_BUCKETS, expandNetworks } from '../services/networks.js';
import { AGE_CEILINGS } from '../services/ratings.js';
import { normalizeRegion } from '../services/providers.js';

// Era to year range mapping
function eraToYearRange(era: Era): { start: number; end: number | null } {
  const ranges: Record<Era, { start: number; end: number | null }> = {
    // Open-ended at the bottom: the library goes back to the 1940s.
    'pre-1980': { start: 0, end: 1979 },
    '1980-1989': { start: 1980, end: 1989 },
    '1990-1999': { start: 1990, end: 1999 },
    '2000-2009': { start: 2000, end: 2009 },
    '2010-2019': { start: 2010, end: 2019 },
    '2020-now': { start: 2020, end: null },
  };
  return ranges[era];
}

/**
 * Bir yılın hangi döneme düştüğü — `eraToYearRange`'in tersi.
 *
 * Aralıklar tek yerde dursun diye burada: profil ekranı "seksenlere hep evet
 * diyorsun" derken törenin dönem kutularıyla aynı sınırları kullanmak zorunda,
 * yoksa kullanıcı o kutuyu seçtiğinde başka bir liste görüyor.
 */
export function eraForYear(year: number | null): Era | null {
  if (year === null || !Number.isFinite(year)) return null;
  if (year <= 1979) return 'pre-1980';
  if (year <= 1989) return '1980-1989';
  if (year <= 1999) return '1990-1999';
  if (year <= 2009) return '2000-2009';
  if (year <= 2019) return '2010-2019';
  return '2020-now';
}

// Fetch all genres
export async function getAllGenres(): Promise<Genre[]> {
  const result = await pool.query<Genre>('SELECT id, name FROM genres ORDER BY name');
  return result.rows;
}

/** Aday listesinin üst sınırı. Sayım artık bu sınırdan bağımsız
 *  (`countCandidateMovies`), yani kütüphane büyüdükçe kullanıcıya gösterilen
 *  "kaç film arasından" sayısı doğru kalıyor. */
const CANDIDATE_FETCH_LIMIT = 1000;

function normalizeList(value: string[] | string | undefined): string[] {
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((v) => v.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/**
 * `/candidates` ve `/pick` için ortak FROM + WHERE kurucusu.
 *
 * Aday listesi ile sayımın birebir aynı koşullardan geçmesi şart; ayrı ayrı
 * yazıldıklarında biri değişip diğeri unutuluyor ve kullanıcıya "1000 film
 * arasından" denirken aslında 1.659 film oluyordu.
 */
function buildCandidateQuery(
  filters: PickFilters,
  excludeMovieIds: number[],
  /** Bir boyutu sorgudan tamamen çıkarır. Her facet sayımı, **kendi** boyutu
   *  dışındaki tüm filtreleri paylaşan bir taban sorguya ihtiyaç duyuyor:
   *  "tür seçilmemişken her türde ne var", "dönem seçilmemişken her dönemde
   *  ne var". */
  options: {
    skipOrigin?: boolean;
    skipEra?: boolean;
    skipGenres?: boolean;
    skipMoods?: boolean;
    skipAge?: boolean;
    skipPopularity?: boolean;
    skipNetworks?: boolean;
    skipProviders?: boolean;
  } = {}
): { fromAndWhere: string; params: unknown[] } {
  const {
    minVoteCount,
    minVoteCountNonEnglish,
    minVoteCountTierThree,
    minVoteCountTv,
    minVoteCountTvNonEnglish,
    minVoteCountTvTierThree,
    minVoteAverage,
    minRuntime,
    minRuntimeTv,
    famousVotes,
    famousVotesTv,
    hiddenVotes,
    hiddenVotesTv,
  } = config.selection;

  // Belirtilmemişse film. Yayındaki istemciler bu alanı göndermiyor ve
  // yalnızca film görmeye devam etmeli — dizinin sessizce araya karışması
  // bir güncelleme değil, bir sürpriz olurdu.
  const mediaType: MediaType = filters.mediaType === 'tv' ? 'tv' : 'movie';
  const isTv = mediaType === 'tv';
  const voteFloorEnglish = isTv ? minVoteCountTv : minVoteCount;
  const voteFloorTierTwo = isTv ? minVoteCountTvNonEnglish : minVoteCountNonEnglish;
  const voteFloorTierThree = isTv ? minVoteCountTvTierThree : minVoteCountTierThree;

  // Menşe artık bir kova slug'ı ("europe") olarak da gelebiliyor; `expandOrigin`
  // slug'ı dil + ülke listesine açıyor, tanımadığı değeri dil kodu sayıyor.
  const expanded = expandOrigin(normalizeList(filters.origin));
  const normalizedOrigin = expanded.languages;
  // Doğrudan ülke soran çağrılar İngilizce kısıtına tabi değil — kova değil,
  // açık bir istek.
  const normalizedCountries = [
    ...new Set([
      ...expanded.countries.map((c) => c.toUpperCase()),
      ...normalizeList(filters.originCountries).map((c) => c.toUpperCase()),
    ]),
  ];
  const nonEnglishCountries = expanded.nonEnglishCountries.map((c) => c.toUpperCase());

  const normalizedGenreIds =
    typeof filters.genreIds === 'number'
      ? [filters.genreIds]
      : Array.isArray(filters.genreIds)
        ? filters.genreIds
        : [];

  const conditions: string[] = [
    'm.adult = false',
    'm.runtime IS NOT NULL',
    `m.media_type = '${mediaType}'`,
    `m.runtime >= ${isTv ? minRuntimeTv : minRuntime}`,
    // Oy eşiği hem dile hem türe göre, üç kademeli — kademelerin dil
    // üyeliği ve gerekçesi services/languages.ts içinde.
    `(
       (m.original_language  =  '${TIER_ONE_LANGUAGE}' AND m.vote_count >= ${voteFloorEnglish})
    OR (m.original_language  IN (${TIER_TWO_SQL})      AND m.vote_count >= ${voteFloorTierTwo})
    OR (m.original_language NOT IN ('${TIER_ONE_LANGUAGE}', ${TIER_TWO_SQL})
        AND m.vote_count >= ${voteFloorTierThree})
    )`,
    `m.vote_average >= ${minVoteAverage}`,
  ];

  const params: unknown[] = [];
  let paramIndex = 1;

  // Era filter
  if (filters.era && !options.skipEra) {
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

  // Menşe: dil VEYA yapım ülkesi.
  //
  // VEYA, çünkü iki kaynak da eksik olabiliyor: 99 kaydın hiç
  // `production_countries` bilgisi yok, ve Fransa'da çekilmiş İngilizce bir
  // film dile takılmıyor. Kova slug'ı gönderen istemci ikisini birden
  // getiriyor; ham dil kodu gönderen eski sürüm (yayındaki 1.0.9) yalnızca
  // dil kolunu dolduruyor ve bugünkü davranışını aynen görüyor.
  const originClauses: string[] = [];
  if (!options.skipOrigin) {
    if (normalizedOrigin.length > 0) {
      originClauses.push(`m.original_language = ANY($${paramIndex})`);
      params.push(normalizedOrigin);
      paramIndex++;
    }
    if (normalizedCountries.length > 0) {
      originClauses.push(
        `EXISTS (SELECT 1 FROM movie_countries mc
                  WHERE mc.movie_id = m.id AND mc.country_code = ANY($${paramIndex}))`
      );
      params.push(normalizedCountries);
      paramIndex++;
    }
    if (nonEnglishCountries.length > 0) {
      originClauses.push(
        `(m.original_language <> 'en' AND EXISTS (
            SELECT 1 FROM movie_countries mc
             WHERE mc.movie_id = m.id AND mc.country_code = ANY($${paramIndex})))`
      );
      params.push(nonEnglishCountries);
      paramIndex++;
    }
    if (originClauses.length > 0) {
      conditions.push(`(${originClauses.join(' OR ')})`);
    }
  }

  // Ruh hâli: seçilenlerden **herhangi biri** yeterli. Kesişim istemek
  // ("hem hafif hem ağlatan") çoğu bileşimde sıfır döndürür ve kullanıcı
  // ikinci kutuya dokunduğu anda töreni çıkmaza sokar.
  const normalizedMoods = normalizeList(filters.moods).filter((m) =>
    MOOD_SLUGS.includes(m)
  );
  if (normalizedMoods.length > 0 && !options.skipMoods) {
    conditions.push(`m.moods && $${paramIndex}`);
    params.push(normalizedMoods);
    paramIndex++;
  }

  // Yaş tavanı. `age_rating IS NULL` de eleniyor: "çocukla izlenir" diyen
  // kişiye "bilmiyoruz" göndermek sorunun cevabı değil.
  if (filters.maxAge && !options.skipAge) {
    conditions.push(`m.age_rating IS NOT NULL AND m.age_rating <= $${paramIndex}`);
    params.push(filters.maxAge);
    paramIndex++;
  }

  // Bilinirlik. Eşikler medya türüne göre; gerekçesi config.selection içinde.
  if (filters.popularity && !options.skipPopularity) {
    if (filters.popularity === 'famous') {
      conditions.push(`m.vote_count >= ${isTv ? famousVotesTv : famousVotes}`);
    } else if (filters.popularity === 'hidden') {
      conditions.push(`m.vote_count < ${isTv ? hiddenVotesTv : hiddenVotes}`);
    }
  }

  // Yayıncı. Kova slug'ı kanal adlarına açılıyor; tanınmayan slug düşüyor.
  if (!options.skipNetworks) {
    const networkNames = expandNetworks(normalizeList(filters.networks));
    if (networkNames.length > 0) {
      conditions.push(`m.networks && $${paramIndex}`);
      params.push(networkNames);
      paramIndex++;
    }
  }

  // Sağlayıcı: seçilenlerden herhangi birinde varsa yeter. Bölge şart —
  // izleme hakları ülkeye satılıyor ve *Parasite* ABD'de hiçbir abonelikte
  // yokken Almanya'da on ayrı serviste.
  const normalizedProviders =
    typeof filters.providers === 'number'
      ? [filters.providers]
      : Array.isArray(filters.providers)
        ? filters.providers.filter((p) => Number.isInteger(p))
        : [];
  if (normalizedProviders.length > 0 && !options.skipProviders) {
    conditions.push(
      `EXISTS (SELECT 1 FROM movie_providers mp
                WHERE mp.movie_id = m.id
                  AND mp.region = $${paramIndex}
                  AND mp.provider_id = ANY($${paramIndex + 1}))`
    );
    params.push(normalizeRegion(filters.region), normalizedProviders);
    paramIndex += 2;
  }

  // Exclude recently picked movies
  if (excludeMovieIds.length > 0) {
    conditions.push(`m.id != ALL($${paramIndex})`);
    params.push(excludeMovieIds);
    paramIndex++;
  }

  // Genre filter (if specified)
  let genreJoin = '';
  if (normalizedGenreIds.length > 0 && !options.skipGenres) {
    genreJoin = '\n      INNER JOIN movie_genres mg ON m.id = mg.movie_id\n    ';
    conditions.push(`mg.genre_id = ANY($${paramIndex})`);
    params.push(normalizedGenreIds);
    paramIndex++;
  }

  const fromAndWhere = `
    FROM movies m
    ${genreJoin}
    WHERE ${conditions.join(' AND ')}
  `;

  return { fromAndWhere, params };
}

// Fetch candidate movies based on filters
export async function getCandidateMovies(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<MovieRow[]> {
  const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds);
  const result = await pool.query<MovieRow>(
    `SELECT DISTINCT m.* ${fromAndWhere} LIMIT ${CANDIDATE_FETCH_LIMIT}`,
    params
  );
  return result.rows;
}

/** Filtrelere uyan toplam film sayısı — aday listesinin üst sınırından
 *  bağımsız. Uygulama bunu "kaç film arasından seçiliyor" diye gösteriyor. */
export async function countCandidateMovies(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<number> {
  const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds);
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT m.id) AS count ${fromAndWhere}`,
    params
  );
  return parseInt(result.rows[0].count, 10);
}

/** Kova slug'ı -> o kovaya düşen başlık sayısı. `any` menşe filtresi hiç
 *  uygulanmamış toplam. */
export type OriginCounts = Record<string, number>;

/**
 * Her menşe kovası için, menşe DIŞINDAKİ filtreler uygulanmış hâlde kaç
 * başlık kaldığını döndürür.
 *
 * Uygulama bunu menşe ekranını çizmeden önce çağırıyor: sonucu boş çıkacak
 * kovaları sönükleştiriyor. Aksi hâlde kullanıcı "Hindistan + dizi" gibi bir
 * kombinasyon seçip söz ekranında sessizce takılıyor.
 *
 * Kova başına ayrı `countCandidateMovies` çağırmak 8 gidiş dönüş demekti;
 * kova sayısı sabit olduğu için hepsi tek sorguda `FILTER` ile toplanıyor.
 */
export async function countOriginFacets(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<OriginCounts> {
  const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
    skipOrigin: true,
  });

  const selects: string[] = ['COUNT(DISTINCT m.id) AS any'];
  for (const bucket of ORIGIN_BUCKETS) {
    const clauses: string[] = [];
    if (bucket.languages.length > 0) {
      params.push(bucket.languages);
      clauses.push(`m.original_language = ANY($${params.length})`);
    }
    if (bucket.countries.length > 0) {
      params.push(bucket.countries);
      const exists = `EXISTS (SELECT 1 FROM movie_countries mc
                  WHERE mc.movie_id = m.id AND mc.country_code = ANY($${params.length}))`;
      clauses.push(
        bucket.anglophone ? exists : `(m.original_language <> 'en' AND ${exists})`
      );
    }
    if (clauses.length === 0) continue;
    // Slug tire içeriyor ("far-east"), o yüzden sütun adı tırnaklanıyor.
    selects.push(
      `COUNT(DISTINCT m.id) FILTER (WHERE ${clauses.join(' OR ')}) AS "${bucket.slug}"`
    );
  }

  const result = await pool.query<Record<string, string>>(
    `SELECT ${selects.join(', ')} ${fromAndWhere}`,
    params
  );

  const row = result.rows[0] ?? {};
  const counts: OriginCounts = {};
  for (const [key, value] of Object.entries(row)) {
    counts[key] = parseInt(value, 10) || 0;
  }
  return counts;
}

/** Facet sayımlarının ortak biçimi: anahtar -> kalan başlık sayısı.
 *  `any` anahtarı o boyutta hiç seçim yapılmamış hâlin toplamı. */
export type FacetCounts = Record<string, number>;

/**
 * TMDB tür kimliği -> o türde kalan başlık sayısı.
 *
 * Tür kendi sayımından çıkarılıyor (`skipGenres`), çünkü sorulan şey "tür
 * seçilmemişken her türde ne var". Ekran çoklu seçime izin veriyor ve türler
 * VEYA ile birleşiyor, yani Dram'ı seçmek Belgesel'in ne getireceğini
 * değiştirmiyor — sayım bir kez alınıp ekranda sabit kalabiliyor.
 *
 * FILTER yerine CTE + JOIN: 19 tür için 19 ayrı EXISTS alt sorgusu
 * yazmak gerekirdi.
 */
export async function countGenreFacets(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<FacetCounts> {
  const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
    skipGenres: true,
  });

  const result = await pool.query<{ key: string; count: string }>(
    `WITH base AS (SELECT DISTINCT m.id ${fromAndWhere})
     SELECT mg.genre_id::text AS key, count(*)::text AS count
       FROM base b JOIN movie_genres mg ON mg.movie_id = b.id
      GROUP BY mg.genre_id
     UNION ALL
     SELECT 'any', count(*)::text FROM base`,
    params
  );

  const counts: FacetCounts = {};
  for (const row of result.rows) {
    counts[row.key] = parseInt(row.count, 10) || 0;
  }
  return counts;
}

/** Bütün dönemler, yıl aralıklarıyla. `eraToYearRange` tek tek çağrılabilirdi
 *  ama sayım hepsini birden istiyor. */
const ERA_KEYS: Era[] = [
  'pre-1980',
  '1980-1989',
  '1990-1999',
  '2000-2009',
  '2010-2019',
  '2020-now',
];

/**
 * Dönem -> o dönemde kalan başlık sayısı.
 *
 * Dönem kendi sayımından çıkarılıyor; tür ve menşe uygulanıyor. Tören sırası
 * gereği menşe henüz seçilmemiş oluyor, ama filtre gelirse de doğru çalışır.
 */
export async function countEraFacets(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<FacetCounts> {
  const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
    skipEra: true,
  });

  const selects = ['COUNT(DISTINCT m.id) AS any'];
  for (const era of ERA_KEYS) {
    const { start, end } = eraToYearRange(era);
    const range =
      end === null ? `m.year >= ${start}` : `m.year BETWEEN ${start} AND ${end}`;
    // Anahtar tire içeriyor, o yüzden sütun adı tırnaklanıyor.
    selects.push(`COUNT(DISTINCT m.id) FILTER (WHERE ${range}) AS "${era}"`);
  }

  const result = await pool.query<Record<string, string>>(
    `SELECT ${selects.join(', ')} ${fromAndWhere}`,
    params
  );

  const counts: FacetCounts = {};
  for (const [key, value] of Object.entries(result.rows[0] ?? {})) {
    counts[key] = parseInt(value, 10) || 0;
  }
  return counts;
}

/**
 * İnce ayar ekranının bütün sayımları — tek çağrıda.
 *
 * Dört boyut var (ruh hâli, yaş, bilinirlik, yayıncı) ve her biri **kendi**
 * boyutu dışındaki filtreleri paylaşan bir taban sorgu istiyor: "ruh hâli
 * seçilmemişken her ruh hâlinde ne var". Bu yüzden dört ayrı sorgu, ama
 * paralel ve tek HTTP gidiş dönüşünde — ekran hepsini birden çiziyor.
 *
 * Anahtarlar tek bir haritada toplanıyor ve çakışmıyorlar: ruh hâli slug'ları
 * (`cozy`), yaş tavanları (`age:12`), bilinirlik (`famous`) ve yayıncı
 * kovaları (`net:netflix`) ayrı ad alanlarında.
 *
 * `total` anahtarı ayrı bir iş yapıyor: **bütün** filtreler uygulanmış hâlde
 * kaç başlık kaldığı. Diğer üç sayım ucunda böyle bir değer yok çünkü onlar
 * tek bir soru soruyor ve cevabı ekranda kart kart görünüyor; burada dört
 * boyut birden oynuyor ve kullanıcının havuzu daralttığını görebilmesi
 * gerekiyor. (`any` bunun yerine geçemez: o, ruh hâli hariç tutulmuş hâlin
 * toplamı.)
 */
export async function countRefinementFacets(
  filters: PickFilters,
  excludeMovieIds: number[]
): Promise<FacetCounts> {
  const isTv = filters.mediaType === 'tv';
  const { famousVotes, famousVotesTv, hiddenVotes, hiddenVotesTv } = config.selection;

  const moodQuery = () => {
    const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
      skipMoods: true,
    });
    const selects = MOOD_SLUGS.map(
      (slug) => `COUNT(DISTINCT m.id) FILTER (WHERE '${slug}' = ANY(m.moods)) AS "${slug}"`
    );
    selects.push('COUNT(DISTINCT m.id) AS any');
    return pool.query<Record<string, string>>(
      `SELECT ${selects.join(', ')} ${fromAndWhere}`,
      params
    );
  };

  const ageQuery = () => {
    const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
      skipAge: true,
    });
    const selects = AGE_CEILINGS.map(
      (age) =>
        `COUNT(DISTINCT m.id) FILTER (WHERE m.age_rating IS NOT NULL AND m.age_rating <= ${age}) AS "age:${age}"`
    );
    return pool.query<Record<string, string>>(
      `SELECT ${selects.join(', ')} ${fromAndWhere}`,
      params
    );
  };

  const popularityQuery = () => {
    const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
      skipPopularity: true,
    });
    return pool.query<Record<string, string>>(
      `SELECT COUNT(DISTINCT m.id) FILTER (WHERE m.vote_count >= ${isTv ? famousVotesTv : famousVotes}) AS famous,
              COUNT(DISTINCT m.id) FILTER (WHERE m.vote_count <  ${isTv ? hiddenVotesTv : hiddenVotes}) AS hidden
         ${fromAndWhere}`,
      params
    );
  };

  const networkQuery = () => {
    const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
      skipNetworks: true,
    });
    const selects: string[] = [];
    for (const bucket of NETWORK_BUCKETS) {
      params.push(bucket.names);
      selects.push(
        `COUNT(DISTINCT m.id) FILTER (WHERE m.networks && $${params.length}) AS "net:${bucket.slug}"`
      );
    }
    return pool.query<Record<string, string>>(
      `SELECT ${selects.join(', ')} ${fromAndWhere}`,
      params
    );
  };

  // Yayıncı yalnız dizide anlamlı — film satırlarında `networks` her zaman
  // boş, ve sekiz kutu için sekiz sıfır saymanın maliyeti var.
  // Sağlayıcı sayımı: taban sorgu kendi filtresi olmadan kuruluyor, sonra
  // bölgenin izleme tablosuyla birleşiyor. CTE + JOIN kullanılıyor çünkü kaç
  // sağlayıcı olacağı önceden bilinmiyor — ruh hâli ya da yaş gibi sabit bir
  // liste değil, bölgeye göre değişen bir küme.
  const providerQuery = () => {
    const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds, {
      skipProviders: true,
    });
    params.push(normalizeRegion(filters.region));
    return pool.query<{ key: string; count: string }>(
      `WITH base AS (SELECT DISTINCT m.id ${fromAndWhere})
       SELECT 'prov:' || mp.provider_id AS key, count(*)::text AS count
         FROM base b JOIN movie_providers mp ON mp.movie_id = b.id
        WHERE mp.region = $${params.length}
        GROUP BY mp.provider_id`,
      params
    );
  };

  const totalQuery = () => {
    const { fromAndWhere, params } = buildCandidateQuery(filters, excludeMovieIds);
    return pool.query<Record<string, string>>(
      `SELECT COUNT(DISTINCT m.id) AS total ${fromAndWhere}`,
      params
    );
  };

  const [singleRowResults, providerResult] = await Promise.all([
    Promise.all(
      isTv
        ? [moodQuery(), ageQuery(), popularityQuery(), networkQuery(), totalQuery()]
        : [moodQuery(), ageQuery(), popularityQuery(), totalQuery()]
    ),
    providerQuery(),
  ]);

  const counts: FacetCounts = {};
  for (const result of singleRowResults) {
    for (const [key, value] of Object.entries(result.rows[0] ?? {})) {
      counts[key] = parseInt(value, 10) || 0;
    }
  }
  // Sağlayıcı sorgusu tek satır değil satır listesi döndürüyor.
  for (const row of providerResult.rows) {
    counts[row.key] = parseInt(row.count, 10) || 0;
  }
  return counts;
}

/** İnce ayar ekranında bir bölge için gösterilecek sağlayıcı kutuları. */
export interface RegionProvider {
  id: number;
  name: string;
  logoPath: string | null;
}

/**
 * Bir bölgenin sağlayıcı listesi — kataloğun kendisinden.
 *
 * Elle kova tanımı yok: TMDB'de ABD'de 292, Almanya'da 195 sağlayıcı var ve
 * listeler her ay oynuyor. Hangi kutuların gösterileceğine **veri** karar
 * veriyor; bir servis kataloğumuzda ne kadar başlık taşıyorsa o kadar üstte.
 *
 * Liste **filtrelerden bağımsız** ve önbellekli. Kullanıcı ruh hâlini
 * değiştirdikçe kutuların yeniden sıralanması, hangi kutuya bastığını
 * unutturur; sönükleşme zaten sayımdan geliyor.
 */
const regionProviderCache = new Map<string, { list: RegionProvider[]; at: number }>();
const REGION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Bir bölgede kaç kutu gösteriliyor. Onikiden sonrası ekranda altı satır
 *  eder. */
const REGION_PROVIDER_LIMIT = 12;

/**
 * Bir servisin kutu olmayı hak etmesi için bölgenin kataloğunun ne kadarını
 * taşıması gerektiği.
 *
 * Ölçerek kondu: Türkiye listesinin kuyruğunda 14.133 filmin 20'sini taşıyan
 * servisler vardı (Cultpix, Bloodstream). Bir kutu, cevabı değiştirebiliyorsa
 * kutudur; 20 başlık tür ya da dönemle kesiştiği anda sıfır oluyor ve
 * kullanıcı neden hiçbir şey çıkmadığını anlamıyor.
 */
const REGION_PROVIDER_SHARE = 0.01;
/** Küçük bölgelerde oran tek başına her şeyi eleyebilir; mutlak taban. */
const REGION_PROVIDER_FLOOR = 40;

export async function getRegionProviders(
  region: string,
  mediaType: MediaType
): Promise<RegionProvider[]> {
  const normalized = normalizeRegion(region);
  const key = `${normalized}:${mediaType}`;
  const cached = regionProviderCache.get(key);
  if (cached && Date.now() - cached.at < REGION_CACHE_TTL_MS) return cached.list;

  // Taban sorgu yalnızca görünürlük koşullarıyla: hangi servisin bu bölgede
  // ağırlığı olduğu, kullanıcının o anki türüne göre değişmemeli.
  const { fromAndWhere, params } = buildCandidateQuery({ mediaType }, []);
  params.push(normalized);

  const result = await pool.query<{ id: number; name: string; logo_path: string | null }>(
    `WITH base AS (SELECT DISTINCT m.id ${fromAndWhere}),
          floor AS (
            SELECT GREATEST(${REGION_PROVIDER_FLOOR},
                            (count(*) * ${REGION_PROVIDER_SHARE})::int) AS n
              FROM base
          )
     SELECT p.id, p.name, p.logo_path
       FROM base b
       JOIN movie_providers mp ON mp.movie_id = b.id
       JOIN providers p ON p.id = mp.provider_id
      WHERE mp.region = $${params.length}
      GROUP BY p.id, p.name, p.logo_path
     HAVING count(*) >= (SELECT n FROM floor)
      -- Aboneliğe dahil servisler önce. Reklamlı ve kütüphane servislerinin
      -- arka kataloğu çok geniş ve saf sayı sıralaması Netflix'i ABD'de
      -- altıncı sıraya düşürüyordu (gerekçe: migration 015).
      -- COALESCE: kind sütunu 015 ile geldi ve tazeleme turu bitene kadar bir
      -- kısım satırda NULL. Postgres NULL'ı DESC sıralamada başa koyuyor,
      -- yani sarmalanmasa tazelenmemiş servisler tepede görünürdü.
      ORDER BY COALESCE(bool_or(mp.kind = 'f'), false) DESC, count(*) DESC
      LIMIT ${REGION_PROVIDER_LIMIT}`,
    params
  );

  const list = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    logoPath: r.logo_path,
  }));
  regionProviderCache.set(key, { list, at: Date.now() });
  return list;
}

/** Detay ekranının alt yarısı: kadro, seri ve benzerler. */
export interface CastMember {
  personId: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface CollectionSibling {
  id: number;
  title: string;
  year: number;
  posterPath: string | null;
}

export interface SimilarTitle {
  id: number;
  title: string;
  year: number;
  posterPath: string | null;
  /** Kaç anahtar kelime ortak — sıralamanın sebebi, ekranda gösterilmiyor. */
  shared: number;
}

/** Bir başlığın kadrosu, TMDB'nin sırasıyla. */
export async function getMovieCast(movieId: number): Promise<CastMember[]> {
  const result = await pool.query<{
    person_id: number;
    name: string;
    character: string | null;
    profile_path: string | null;
  }>(
    `SELECT person_id, name, character, profile_path
       FROM movie_cast WHERE movie_id = $1 ORDER BY ord`,
    [movieId]
  );
  return result.rows.map((r) => ({
    personId: r.person_id,
    name: r.name,
    character: r.character,
    profilePath: r.profile_path,
  }));
}

/** Aynı seriden diğer filmler, yayın sırasıyla. Filmin kendisi listede yok. */
export async function getCollectionSiblings(movieId: number): Promise<{
  name: string;
  posterPath: string | null;
  films: CollectionSibling[];
} | null> {
  const own = await pool.query<{
    collection_id: number | null;
    collection_name: string | null;
    collection_poster_path: string | null;
  }>(
    `SELECT collection_id, collection_name, collection_poster_path
       FROM movies WHERE id = $1`,
    [movieId]
  );
  const row = own.rows[0];
  if (!row?.collection_id || !row.collection_name) return null;

  const siblings = await pool.query<{
    id: number;
    title: string;
    year: number;
    poster_path: string | null;
  }>(
    `SELECT id, title, year, poster_path
       FROM movies
      WHERE collection_id = $1 AND id <> $2
      ORDER BY year`,
    [row.collection_id, movieId]
  );

  // Tek filmlik "seri" bir seri değil: TMDB kimi filme henüz ikinci filmi
  // çekilmemiş bir koleksiyon atıyor.
  if (siblings.rows.length === 0) return null;

  return {
    name: row.collection_name,
    posterPath: row.collection_poster_path,
    films: siblings.rows.map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      posterPath: r.poster_path,
    })),
  };
}

/**
 * Anahtar kelime örtüşmesine göre benzer başlıklar.
 *
 * TMDB'nin `/recommendations` ucu yerine kendi verimiz: ek istek harcamıyor ve
 * yalnızca **kütüphanede olan** başlıkları döndürüyor — kullanıcıya
 * dokunamayacağı bir film önermenin anlamı yok.
 *
 * Aynı türde olma şartı yok ama aynı medya türünde olma şartı var: bir filme
 * benzer dizi önermek töreni bozar (söz ilk bölüm üzerine veriliyor, film
 * üzerine değil).
 *
 * `HAVING count(*) >= 3`: iki ortak etiket rastlantı, üç bir imza. "sequel" ve
 * "based on novel" gibi geniş etiketler tek başına her şeyi her şeye benzetiyor.
 */
export async function getSimilarTitles(
  movieId: number,
  limit = 12
): Promise<SimilarTitle[]> {
  const result = await pool.query<{
    id: number;
    title: string;
    year: number;
    poster_path: string | null;
    shared: string;
  }>(
    `WITH own AS (
       SELECT keyword_id FROM movie_keywords WHERE movie_id = $1
     )
     SELECT m.id, m.title, m.year, m.poster_path, count(*) AS shared
       FROM movie_keywords mk
       JOIN own ON own.keyword_id = mk.keyword_id
       JOIN movies m ON m.id = mk.movie_id
      WHERE m.id <> $1
        AND m.media_type = (SELECT media_type FROM movies WHERE id = $1)
        AND m.poster_path IS NOT NULL
      GROUP BY m.id, m.title, m.year, m.poster_path
     HAVING count(*) >= 3
      ORDER BY count(*) DESC, m.vote_count DESC
      LIMIT $2`,
    [movieId, limit]
  );
  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    posterPath: r.poster_path,
    shared: parseInt(r.shared, 10),
  }));
}

/**
 * Aynı yönetmenin kütüphanedeki diğer yapımları.
 *
 * Kadro ve seri şeritlerinin yanına üçüncü bir keşif ekseni. `movies.directors`
 * 008 ile geldi ve bugüne kadar yalnızca ekranda bir isim yazdırmak için
 * kullanılıyordu; oysa 14.582 filmin hepsinde dolu ve bir dizi olduğu için
 * kesişim operatörüyle (`&&`) doğrudan sorgulanabiliyor.
 *
 * Ayrı bir `people` tablosu hâlâ kurulmuyor: isim eşleşmesi TMDB'nin kendi
 * yazımına güveniyor ve aynı yönetmen her satırda aynı yazılıyor. Kişi
 * kimliğine ihtiyaç, filmografi ekranı geldiğinde doğar.
 *
 * Ortak yapımlarda birden fazla yönetmen olabiliyor (Coen kardeşler); şerit
 * başlığı için hepsi dönüyor.
 */
export async function getSameDirector(
  movieId: number,
  limit = 12
): Promise<{ names: string[]; films: CollectionSibling[] } | null> {
  const own = await pool.query<{ directors: string[] | null }>(
    'SELECT directors FROM movies WHERE id = $1',
    [movieId]
  );
  const directors = own.rows[0]?.directors;
  if (!directors || directors.length === 0) return null;

  const result = await pool.query<{
    id: number;
    title: string;
    year: number;
    poster_path: string | null;
  }>(
    `SELECT m.id, m.title, m.year, m.poster_path
       FROM movies m
      WHERE m.id <> $1
        AND m.directors && $2
        AND m.media_type = (SELECT media_type FROM movies WHERE id = $1)
        AND m.poster_path IS NOT NULL
      ORDER BY m.vote_count DESC
      LIMIT $3`,
    [movieId, directors, limit]
  );

  if (result.rows.length === 0) return null;

  return {
    names: directors,
    films: result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      posterPath: r.poster_path,
    })),
  };
}

/** Verilen filmlerin istenen dildeki başlıkları. Çevirisi olmayan film
 *  haritada hiç yer almıyor — `toMovie` yedeğe düşüyor. */
export async function getMoviesTitles(
  movieIds: number[],
  language: string | null
): Promise<Map<number, string>> {
  if (movieIds.length === 0 || !language) return new Map();

  const result = await pool.query<{ movie_id: number; title: string }>(
    `SELECT movie_id, title
       FROM movie_translations
      WHERE movie_id = ANY($1) AND language_code = $2`,
    [movieIds, language]
  );

  return new Map(result.rows.map((row) => [row.movie_id, row.title]));
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

/** Detay ekranında gösterilecek anahtar kelime sayısı. TMDB bir filme 30+
 *  etiket verebiliyor; ekranda okunabilir olan ilk birkaçı. */
const MAX_KEYWORDS_PER_MOVIE = 8;

// Get keywords for a single movie
export async function getMovieKeywords(movieId: number): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT k.name
     FROM keywords k
     INNER JOIN movie_keywords mk ON k.id = mk.keyword_id
     WHERE mk.movie_id = $1
     ORDER BY k.name
     LIMIT $2`,
    [movieId, MAX_KEYWORDS_PER_MOVIE]
  );
  return result.rows.map((row) => row.name);
}

// Get keywords for multiple movies at once
export async function getMoviesKeywords(movieIds: number[]): Promise<Map<number, string[]>> {
  if (movieIds.length === 0) return new Map();

  const result = await pool.query<{ movie_id: number; name: string }>(
    `SELECT mk.movie_id, k.name
     FROM keywords k
     INNER JOIN movie_keywords mk ON k.id = mk.keyword_id
     WHERE mk.movie_id = ANY($1)
     ORDER BY mk.movie_id, k.name`,
    [movieIds]
  );

  const map = new Map<number, string[]>();
  for (const row of result.rows) {
    const list = map.get(row.movie_id) || [];
    // Kesme sorguda değil burada: LIMIT çok satırlı bir sonuç kümesinde
    // film başına değil toplamda çalışırdı.
    if (list.length < MAX_KEYWORDS_PER_MOVIE) {
      list.push(row.name);
      map.set(row.movie_id, list);
    }
  }
  return map;
}

// Search for a title (case-insensitive, supports partial matches)
// Tries exact match first, then prefix match, then contains match.
// Returns the best-quality match based on vote count.
//
// Varsayılan olarak yalnızca filmlerde arıyor. Tek çağıran, ana ekrandaki
// film alıntısına dokunulduğunda o filme gitmek — oraya bir dizinin düşmesi
// yanlış olurdu.
/** Tek bir satır, kimliğinden.
 *
 *  Ortak söz için gerekli: kazananı iki cihazdan biri seçip tüm film nesnesini
 *  paylaşılan belgeye yazıyor, yani karşı taraf onu yazanın dilinde alıyor.
 *  Kimlik ikisinde de aynı olduğuna göre herkes kendi dilindeki kopyayı
 *  buradan tazeliyor. */
export async function getMovieById(id: number): Promise<MovieRow | null> {
  const result = await pool.query<MovieRow>('SELECT * FROM movies WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function searchMovieByTitle(
  title: string,
  mediaType: MediaType = 'movie'
): Promise<MovieRow | null> {
  const attempts = [
    'LOWER(title) = LOWER($1)',
    "LOWER(title) LIKE LOWER($1) || '%'",
    "LOWER(title) LIKE '%' || LOWER($1) || '%'",
  ];

  for (const predicate of attempts) {
    const result = await pool.query<MovieRow>(
      `SELECT * FROM movies
       WHERE media_type = $2 AND ${predicate}
       ORDER BY vote_count DESC
       LIMIT 1`,
      [title, mediaType]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  return null;
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

// Fetch a movie synopsis from the local database
export async function getMovieSynopsis(movieId: number): Promise<string | null> {
  const result = await pool.query<{ synopsis: string | null }>(
    'SELECT synopsis FROM movies WHERE id = $1',
    [movieId]
  );

  const synopsis = result.rows[0]?.synopsis ?? null;
  return synopsis && synopsis.trim().length > 0 ? synopsis.trim() : null;
}

/** Tabloda duran (İngilizce) yardımcı metinler.
 *
 *  `/movies/{id}/synopsis` İngilizce istendiğinde TMDB'ye hiç gitmiyor —
 *  seed zaten bu değerleri yazdı. Üçü tek sorguda geliyor çünkü üçü de aynı
 *  satırda ve çağıran hepsini birden istiyor. */
export async function getLocalTexts(movieId: number): Promise<{
  tagline: string | null;
  episodeName: string | null;
  episodeOverview: string | null;
}> {
  const result = await pool.query<{
    tagline: string | null;
    first_episode_name: string | null;
    first_episode_overview: string | null;
  }>(
    'SELECT tagline, first_episode_name, first_episode_overview FROM movies WHERE id = $1',
    [movieId]
  );
  const row = result.rows[0];
  const clean = (v: string | null | undefined) =>
    v && v.trim().length > 0 ? v.trim() : null;
  return {
    tagline: clean(row?.tagline),
    episodeName: clean(row?.first_episode_name),
    episodeOverview: clean(row?.first_episode_overview),
  };
}

/** TMDB kimliği ve tür birlikte.
 *
 *  Canlı proxy rotalarının (fragman, izleme platformları, çevrilmiş özet)
 *  ihtiyacı bu: TMDB'de aynı bilgi film için /movie/{id}/..., dizi için
 *  /tv/{id}/... altında ve iki ad alanının kimlikleri birbirinden bağımsız.
 *  Tür bilinmeden doğru yol kurulamıyor. */
export async function getTmdbRef(
  movieId: number
): Promise<{ tmdbId: number; mediaType: MediaType } | null> {
  const result = await pool.query<{ tmdb_id: number; media_type: MediaType }>(
    'SELECT tmdb_id, media_type FROM movies WHERE id = $1',
    [movieId]
  );
  const row = result.rows[0];
  return row ? { tmdbId: row.tmdb_id, mediaType: row.media_type } : null;
}

/** Kimlik -> tür kimlikleri. `getMoviesGenres` adları döndürüyor ve adlar
 *  yerelleştirmeye açık; zevk vektörü kimlik üzerinden çalışmak zorunda. */
export async function getMoviesGenreIds(
  movieIds: number[]
): Promise<Map<number, number[]>> {
  if (movieIds.length === 0) return new Map();

  const result = await pool.query<{ movie_id: number; genre_id: number }>(
    'SELECT movie_id, genre_id FROM movie_genres WHERE movie_id = ANY($1)',
    [movieIds]
  );

  const map = new Map<number, number[]>();
  for (const row of result.rows) {
    const ids = map.get(row.movie_id);
    if (ids) ids.push(row.genre_id);
    else map.set(row.movie_id, [row.genre_id]);
  }
  return map;
}

/**
 * Zevk defterindeki başlıkların katalog nitelikleri.
 *
 * Tek sorgu: defter 200 satıra kadar çıkabiliyor ve profil ekranı açılırken
 * dört ayrı gidiş dönüş beklemek görünür bir gecikme demekti.
 */
export async function getTasteFacts(
  movieIds: number[]
): Promise<Map<number, TasteFacts>> {
  if (movieIds.length === 0) return new Map();

  const result = await pool.query<{
    id: number;
    year: number | null;
    runtime: number | null;
    media_type: MediaType;
    original_language: string | null;
    moods: string[] | null;
    genre_ids: number[];
    countries: string[];
  }>(
    `SELECT m.id,
            m.year,
            m.runtime,
            m.media_type,
            m.original_language,
            m.moods,
            COALESCE(array_agg(DISTINCT mg.genre_id)
                     FILTER (WHERE mg.genre_id IS NOT NULL), '{}') AS genre_ids,
            COALESCE(array_agg(DISTINCT mc.country_code)
                     FILTER (WHERE mc.country_code IS NOT NULL), '{}') AS countries
       FROM movies m
       LEFT JOIN movie_genres mg ON mg.movie_id = m.id
       LEFT JOIN movie_countries mc ON mc.movie_id = m.id
      WHERE m.id = ANY($1)
      GROUP BY m.id`,
    [movieIds]
  );

  const map = new Map<number, TasteFacts>();
  for (const row of result.rows) {
    map.set(row.id, {
      movieId: row.id,
      genreIds: row.genre_ids ?? [],
      moods: row.moods ?? [],
      era: eraForYear(row.year),
      origin: originBucketFor(row.original_language, row.countries ?? []),
      runtime: row.runtime,
      mediaType: row.media_type,
    });
  }
  return map;
}
