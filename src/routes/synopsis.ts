import type { FastifyInstance } from 'fastify';
import { getLocalTexts, getMovieSynopsis, getTmdbRef } from '../db/queries.js';
import { config } from '../config.js';

interface SynopsisParams {
  id: string;
}

interface SynopsisQuery {
  lang?: string;
}

interface SynopsisResponse {
  synopsis: string | null;
  /** Filmin sloganı, aynı dilde.
   *
   *  Ayrı bir uç nokta değil çünkü ayrı bir isteğe de gerek yok: TMDB'nin
   *  film detayı `overview` ile `tagline`'ı aynı yanıtta, aynı `language`
   *  parametresine göre veriyor. Tabloda duran slogan İngilizce; Türkçe bir
   *  ekrana İngilizce slogan koymamak için doğru kaynak bu çağrı. */
  tagline: string | null;
  /** Dizilerde ilk bölümün adı ve özeti, aynı dilde. Filmlerde null.
   *
   *  Bunlar da ek bir istek harcamıyor: TMDB dizi detayına
   *  `append_to_response=season/1` eklendiğinde sezonun bölümleri aynı
   *  yanıtta ve aynı dilde geliyor. Sözün üzerine verildiği bölümün özetinin
   *  Türkçe bir ekranda İngilizce kalmasının sebebi yok. */
  episodeName: string | null;
  episodeOverview: string | null;
}

// Map short language codes to TMDB locale codes
const LOCALE_MAP: Record<string, string> = {
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  pt: 'pt-BR',
  'pt-BR': 'pt-BR',
  tr: 'tr-TR',
  en: 'en-US',
};

// In-memory cache: key = "movieId:lang"
interface CachedTexts {
  synopsis: string | null;
  tagline: string | null;
  episodeName: string | null;
  episodeOverview: string | null;
}

const synopsisCache = new Map<string, CachedTexts & { cachedAt: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — synopses rarely change

export async function synopsisRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: SynopsisParams; Querystring: SynopsisQuery; Reply: SynopsisResponse | { error: string } }>(
    '/movies/:id/synopsis',
    async (request, reply) => {
      const movieId = parseInt(request.params.id, 10);
      const lang = request.query.lang || 'en';

      if (isNaN(movieId) || movieId <= 0) {
        return reply.status(400).send({ error: 'Invalid movie ID' });
      }

      const requestedLang = (lang || 'en').trim();
      const normalizedLang = requestedLang.toLowerCase();
      const dbSynopsis = await getMovieSynopsis(movieId);

      // Return the database synopsis immediately for English, or when the DB already provides a usable value.
      if (normalizedLang === 'en') {
        const local = await getLocalTexts(movieId);
        return { synopsis: dbSynopsis, ...local };
      }

      const tmdbLocale =
        LOCALE_MAP[requestedLang] ||
        LOCALE_MAP[normalizedLang] ||
        `${normalizedLang}-${normalizedLang.toUpperCase()}`;
      const cacheKey = `${movieId}:${tmdbLocale}`;

      // Check cache first
      const cached = synopsisCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        const { cachedAt: _ignored, ...payload } = cached;
        return payload;
      }

      try {
        const ref = await getTmdbRef(movieId);

        if (!ref) {
          return reply.status(404).send({ error: 'Movie not found' });
        }

        // Note: dbSynopsis is the English text and must NOT short-circuit here.
        // Almost every movie has one, so returning it would skip the TMDB call
        // for every non-English caller — which is exactly what used to happen.
        // It stays the client-side fallback when TMDB has no translation.

        if (!config.tmdbApiKey) {
          request.log.warn('TMDB_API_KEY not configured — cannot fetch localized synopsis');
          return { synopsis: null, tagline: null, episodeName: null, episodeOverview: null };
        }

        // Call TMDB movie detail endpoint with the requested language
        // Dizide `season/1` ekleniyor: TMDB o sezonun bölümlerini aynı
        // yanıtta ve aynı dilde döndürüyor, yani ilk bölümün çevrilmiş adı ve
        // özeti ek bir istek harcamadan geliyor.
        const append = ref.mediaType === 'tv' ? '&append_to_response=season/1' : '';
        const tmdbUrl = `https://api.themoviedb.org/3/${ref.mediaType}/${ref.tmdbId}?api_key=${config.tmdbApiKey}&language=${tmdbLocale}${append}`;
        const response = await fetch(tmdbUrl);

        if (!response.ok) {
          request.log.error(`TMDB API error: ${response.status}`);
          return { synopsis: null, tagline: null, episodeName: null, episodeOverview: null };
        }

        const data = (await response.json()) as {
          overview?: string;
          tagline?: string;
          'season/1'?: { episodes?: { name?: string; overview?: string }[] };
        };

        const clean = (value: string | undefined) =>
          value && value.trim().length > 0 ? value.trim() : null;

        // TMDB returns empty string when no translation exists
        const synopsis = clean(data.overview);
        // Slogan çoğu dilde çevrilmemiş; boşsa istemci tablodaki İngilizce
        // sloganı göstermeye devam eder. Bölüm metinleri için de aynısı.
        const tagline = clean(data.tagline);
        const firstEpisode = data['season/1']?.episodes?.[0];
        const episodeName = clean(firstEpisode?.name);
        const episodeOverview = clean(firstEpisode?.overview);

        const payload = { synopsis, tagline, episodeName, episodeOverview };
        synopsisCache.set(cacheKey, { ...payload, cachedAt: Date.now() });

        return payload;
      } catch (error) {
        request.log.error(error, 'Localized synopsis fetch failed');
        return reply.status(500).send({ error: 'Failed to fetch synopsis' });
      }
    }
  );
}
