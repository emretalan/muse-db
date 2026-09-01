import type { FastifyInstance } from 'fastify';
import { countOriginFacets, getRecentPickMovieIds } from '../db/queries.js';
import type { PickFilters } from '../types/index.js';
import type { OriginCounts } from '../db/queries.js';

interface OriginCountsRequest {
  filters?: PickFilters;
  sessionId?: string;
  excludeMovieIds?: number[];
}

interface OriginCountsResponse {
  counts: OriginCounts;
}

/**
 * Menşe ekranı, kartları çizmeden önce hangi kovaların dolu olduğunu sorar.
 *
 * Gövde `/candidates` ile aynı biçimde; `filters.origin` yok sayılır — sorulan
 * şey zaten "menşe seçilmemişken her kovada ne var".
 */
export async function originRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: OriginCountsRequest; Reply: OriginCountsResponse | { error: string } }>(
    '/origins/counts',
    async (request, reply) => {
      const { filters, sessionId, excludeMovieIds } = request.body ?? {};

      try {
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];

        const counts = await countOriginFacets(filters ?? {}, excludeIds);
        return { counts };
      } catch (error) {
        request.log.error(error, 'Origin facet count failed');
        return reply.status(500).send({
          error: 'Failed to count origins.',
        });
      }
    }
  );
}
