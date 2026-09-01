import { pool } from './client.js';
import type { MovieRow, Genre, PickFilters, Era, MediaType } from '../types/index.js';
import { config } from '../config.js';

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
  excludeMovieIds: number[]
): { fromAndWhere: string; params: unknown[] } {
  const {
    minVoteCount,
    minVoteCountNonEnglish,
    minVoteCountTv,
    minVoteCountTvNonEnglish,
    minVoteAverage,
    minRuntime,
    minRuntimeTv,
  } = config.selection;

  // Belirtilmemişse film. Yayındaki istemciler bu alanı göndermiyor ve
  // yalnızca film görmeye devam etmeli — dizinin sessizce araya karışması
  // bir güncelleme değil, bir sürpriz olurdu.
  const mediaType: MediaType = filters.mediaType === 'tv' ? 'tv' : 'movie';
  const isTv = mediaType === 'tv';
  const voteFloorEnglish = isTv ? minVoteCountTv : minVoteCount;
  const voteFloorOther = isTv ? minVoteCountTvNonEnglish : minVoteCountNonEnglish;

  const normalizedOrigin = normalizeList(filters.origin);
  const normalizedCountries = normalizeList(filters.originCountries).map((c) => c.toUpperCase());

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
    // Oy eşiği hem dile hem türe göre — gerekçesi config.selection'da.
    `(
       (m.original_language = 'en'  AND m.vote_count >= ${voteFloorEnglish})
    OR (m.original_language <> 'en' AND m.vote_count >= ${voteFloorOther})
    )`,
    `m.vote_average >= ${minVoteAverage}`,
  ];

  const params: unknown[] = [];
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

  // Menşe: dil ve/veya yapım ülkesi.
  //
  // `originCountries` yalnızca istemci gönderdiğinde devreye giriyor ve dille
  // VEYA ilişkisinde. Sebebi: "Avrupa" filtresi bugün 14 dilden oluşan bir
  // liste, yani Fransa'da çekilmiş İngilizce bir film ona takılmıyor.
  // Göndermeyen istemciler (yayındaki 1.0.8 dahil) bugünkü davranışı görmeye
  // devam ediyor — bu yüzden koşul eklemeli, mevcut kolun yerine geçen değil.
  const originClauses: string[] = [];
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
  if (originClauses.length > 0) {
    conditions.push(`(${originClauses.join(' OR ')})`);
  }

  // Exclude recently picked movies
  if (excludeMovieIds.length > 0) {
    conditions.push(`m.id != ALL($${paramIndex})`);
    params.push(excludeMovieIds);
    paramIndex++;
  }

  // Genre filter (if specified)
  let genreJoin = '';
  if (normalizedGenreIds.length > 0) {
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
