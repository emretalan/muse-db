import type { FastifyInstance } from 'fastify';
import { getTmdbId } from '../db/queries.js';
import { config } from '../config.js';

interface TrailerParams {
  id: string;
}

interface TrailerResponse {
  youtubeKey: string | null;
  name: string | null;
}

// Simple in-memory cache (key: movieId, value: { youtubeKey, name, timestamp })
const trailerCache = new Map<number, { youtubeKey: string | null; name: string | null; cachedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function trailerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: TrailerParams; Reply: TrailerResponse | { error: string } }>(
    '/movies/:id/trailer',
    async (request, reply) => {
      const movieId = parseInt(request.params.id, 10);

      if (isNaN(movieId) || movieId <= 0) {
        return reply.status(400).send({ error: 'Invalid movie ID' });
      }

      // Check cache first
      const cached = trailerCache.get(movieId);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return { youtubeKey: cached.youtubeKey, name: cached.name };
      }

      try {
        // Look up TMDB ID from our database
        const tmdbId = await getTmdbId(movieId);

        if (!tmdbId) {
          return reply.status(404).send({ error: 'Movie not found' });
        }

        if (!config.tmdbApiKey) {
          request.log.warn('TMDB_API_KEY not configured — cannot fetch trailers');
          return { youtubeKey: null, name: null };
        }

        // Call TMDB videos endpoint
        const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${config.tmdbApiKey}&language=en-US`;
        const response = await fetch(tmdbUrl);

        if (!response.ok) {
          request.log.error(`TMDB API error: ${response.status}`);
          return { youtubeKey: null, name: null };
        }

        const data = (await response.json()) as {
          results: Array<{
            key: string;
            site: string;
            type: string;
            official: boolean;
            name: string;
          }>;
        };

        // Find the best trailer: prefer official YouTube trailers
        const videos = data.results.filter(
          (v) => v.site === 'YouTube'
        );

        // Priority: Official Trailer > Trailer > Teaser > any video
        const officialTrailer = videos.find(
          (v) => v.type === 'Trailer' && v.official
        );
        const anyTrailer = videos.find((v) => v.type === 'Trailer');
        const teaser = videos.find((v) => v.type === 'Teaser');
        const best = officialTrailer || anyTrailer || teaser || videos[0] || null;

        const result = {
          youtubeKey: best?.key ?? null,
          name: best?.name ?? null,
        };

        // Cache the result
        trailerCache.set(movieId, { ...result, cachedAt: Date.now() });

        return result;
      } catch (error) {
        request.log.error(error, 'Trailer fetch failed');
        return reply.status(500).send({
          error: 'Failed to fetch trailer',
        });
      }
    }
  );
}
