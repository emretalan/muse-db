import type { FastifyInstance } from 'fastify';
import { countRefinementFacets, getRecentPickMovieIds } from '../db/queries.js';
import type { FacetCounts } from '../db/queries.js';
import type { PickFilters } from '../types/index.js';

interface RefineCountsRequest {
  filters?: PickFilters;
  sessionId?: string;
  excludeMovieIds?: number[];
}

interface RefineCountsResponse {
  counts: FacetCounts;
}

/**
 * İnce ayar ekranının bütün sayımları.
 *
 * `/genres/counts`, `/eras/counts` ve `/origins/counts` ile aynı gövde, ama
 * tek boyut değil dört boyut döndürüyor — çünkü karşılığındaki ekran da tek
 * soru değil dört soru soruyor ve hepsini aynı anda çiziyor. Dört ayrı uç,
 * o ekranı dört isteğe çıkarırdı.
 *
 * Anahtarlar ayrı ad alanlarında: ruh hâli `cozy`, yaş `age:12`, bilinirlik
 * `famous`, yayıncı `net:netflix`.
 */
export async function refineRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RefineCountsRequest; Reply: RefineCountsResponse | { error: string } }>(
    '/refine/counts',
    async (request, reply) => {
      const { filters, sessionId, excludeMovieIds } = request.body ?? {};

      try {
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];

        const counts = await countRefinementFacets(filters ?? {}, excludeIds);
        return { counts };
      } catch (error) {
        request.log.error(error, 'Refinement facet count failed');
        return reply.status(500).send({ error: 'Failed to count refinements.' });
      }
    }
  );
}
