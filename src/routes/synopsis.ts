import type { FastifyInstance } from 'fastify';
import { getTmdbId } from '../db/queries.js';
import { config } from '../config.js';

interface SynopsisParams {
  id: string;
}

interface SynopsisQuery {
  lang?: string;
}

interface SynopsisResponse {
  synopsis: string | null;
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
const synopsisCache = new Map<string, { synopsis: string | null; cachedAt: number }>();
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

      // Don't bother calling TMDB for English — the DB already has it
      if (lang === 'en') {
        return { synopsis: null };
      }

      const tmdbLocale = LOCALE_MAP[lang] || `${lang}-${lang.toUpperCase()}`;
      const cacheKey = `${movieId}:${tmdbLocale}`;

      // Check cache first
      const cached = synopsisCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return { synopsis: cached.synopsis };
      }

      try {
        const tmdbId = await getTmdbId(movieId);

        if (!tmdbId) {
          return reply.status(404).send({ error: 'Movie not found' });
        }

        if (!config.tmdbApiKey) {
          request.log.warn('TMDB_API_KEY not configured — cannot fetch localized synopsis');
          return { synopsis: null };
        }

        // Call TMDB movie detail endpoint with the requested language
        const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${config.tmdbApiKey}&language=${tmdbLocale}`;
        const response = await fetch(tmdbUrl);

        if (!response.ok) {
          request.log.error(`TMDB API error: ${response.status}`);
          return { synopsis: null };
        }

        const data = (await response.json()) as {
          overview?: string;
        };

        // TMDB returns empty string when no translation exists
        const synopsis = data.overview && data.overview.trim().length > 0 ? data.overview.trim() : null;

        // Cache the result
        synopsisCache.set(cacheKey, { synopsis, cachedAt: Date.now() });

        return { synopsis };
      } catch (error) {
        request.log.error(error, 'Localized synopsis fetch failed');
        return reply.status(500).send({ error: 'Failed to fetch synopsis' });
      }
    }
  );
}
