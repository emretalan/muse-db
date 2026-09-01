import type { FastifyInstance } from 'fastify';
import { getTmdbId } from '../db/queries.js';
import { config } from '../config.js';

interface ProvidersParams {
  id: string;
}

interface ProvidersQuery {
  region?: string;
}

interface WatchProvider {
  id: number;
  name: string;
  logoUrl: string;
}

interface ProvidersResponse {
  region: string;
  link: string | null;
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
}

/** Shape of one provider entry inside TMDB's watch/providers payload. */
interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}

interface TmdbRegion {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
  ads?: TmdbProvider[];
}

// In-memory cache: key = "movieId:region"
const providersCache = new Map<string, { payload: ProvidersResponse; cachedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — availability shifts, but not hourly

const DEFAULT_REGION = 'US';

/** Empty (but valid) payload — callers should render nothing rather than an error. */
function emptyPayload(region: string): ProvidersResponse {
  return { region, link: null, flatrate: [], rent: [], buy: [] };
}

function mapProviders(list: TmdbProvider[] | undefined): WatchProvider[] {
  if (!list) return [];
  return [...list]
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logoUrl: p.logo_path ? `${config.tmdbLogoBaseUrl}${p.logo_path}` : '',
    }));
}

export async function providerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: ProvidersParams;
    Querystring: ProvidersQuery;
    Reply: ProvidersResponse | { error: string };
  }>('/movies/:id/providers', async (request, reply) => {
    const movieId = parseInt(request.params.id, 10);

    if (isNaN(movieId) || movieId <= 0) {
      return reply.status(400).send({ error: 'Invalid movie ID' });
    }

    // ISO 3166-1 alpha-2, uppercased. Anything else falls back to US.
    const raw = (request.query.region || DEFAULT_REGION).trim().toUpperCase();
    const requestedRegion = /^[A-Z]{2}$/.test(raw) ? raw : DEFAULT_REGION;

    const cacheKey = `${movieId}:${requestedRegion}`;
    const cached = providersCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.payload;
    }

    try {
      const tmdbId = await getTmdbId(movieId);

      if (!tmdbId) {
        return reply.status(404).send({ error: 'Movie not found' });
      }

      if (!config.tmdbApiKey) {
        request.log.warn('TMDB_API_KEY not configured — cannot fetch watch providers');
        return emptyPayload(requestedRegion);
      }

      const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${config.tmdbApiKey}`;
      const response = await fetch(tmdbUrl);

      if (!response.ok) {
        request.log.error(`TMDB API error: ${response.status}`);
        return emptyPayload(requestedRegion);
      }

      const data = (await response.json()) as { results?: Record<string, TmdbRegion> };
      const results = data.results ?? {};

      // Prefer the caller's region; fall back to US so the section is useful
      // even where JustWatch has no local coverage.
      const resolvedRegion = results[requestedRegion]
        ? requestedRegion
        : results[DEFAULT_REGION]
          ? DEFAULT_REGION
          : null;

      const payload: ProvidersResponse = resolvedRegion
        ? {
            region: resolvedRegion,
            link: results[resolvedRegion]?.link ?? null,
            flatrate: mapProviders(results[resolvedRegion]?.flatrate),
            rent: mapProviders(results[resolvedRegion]?.rent),
            buy: mapProviders(results[resolvedRegion]?.buy),
          }
        : emptyPayload(requestedRegion);

      providersCache.set(cacheKey, { payload, cachedAt: Date.now() });

      return payload;
    } catch (error) {
      // Never fail the detail screen over a nice-to-have enhancement.
      request.log.error(error, 'Watch providers fetch failed');
      return emptyPayload(requestedRegion);
    }
  });
}
