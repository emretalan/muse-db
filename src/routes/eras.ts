import type { FastifyInstance } from 'fastify';
import { countEraFacets, getRecentPickMovieIds } from '../db/queries.js';
import type { FacetCounts } from '../db/queries.js';
import type { PickFilters } from '../types/index.js';

interface EraCountsRequest {
  filters?: PickFilters;
  sessionId?: string;
  excludeMovieIds?: number[];
}

interface EraCountsResponse {
  counts: FacetCounts;
}

/**
 * Dönem ekranı, kartları çizmeden önce hangi dönemlerin dolu olduğunu sorar.
 *
 * `/origins/counts` ve `/genres/counts` ile aynı gövde; `filters.era` yok
 * sayılır. Anahtarlar `Era` değerleri ("1980-1989"), artı `any`.
 */
export async function eraRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: EraCountsRequest; Reply: EraCountsResponse | { error: string } }>(
    '/eras/counts',
    async (request, reply) => {
      const { filters, sessionId, excludeMovieIds } = request.body ?? {};

      try {
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];

        const counts = await countEraFacets(filters ?? {}, excludeIds);
        return { counts };
      } catch (error) {
        request.log.error(error, 'Era facet count failed');
        return reply.status(500).send({ error: 'Failed to count eras.' });
      }
    }
  );
}
