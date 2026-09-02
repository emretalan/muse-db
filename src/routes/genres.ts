import type { FastifyInstance } from 'fastify';
import { getGenres } from '../services/movies.js';
import { countGenreFacets, getRecentPickMovieIds } from '../db/queries.js';
import type { FacetCounts } from '../db/queries.js';
import type { GenresResponse, PickFilters } from '../types/index.js';

interface FacetCountsRequest {
  filters?: PickFilters;
  sessionId?: string;
  excludeMovieIds?: number[];
}

interface FacetCountsResponse {
  counts: FacetCounts;
}

export async function genreRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Reply: GenresResponse }>('/genres', async () => {
    const genres = await getGenres();
    return { genres };
  });

  /**
   * Tür ekranı, kartları çizmeden önce hangi türlerin dolu olduğunu sorar.
   *
   * Gövde `/origins/counts` ile aynı biçimde; `filters.genreIds` yok sayılır —
   * sorulan şey zaten "tür seçilmemişken her türde ne var". Yanıtın anahtarları
   * TMDB tür kimlikleri (JSON anahtarı olduğu için metin), artı toplamı veren
   * `any`.
   */
  fastify.post<{ Body: FacetCountsRequest; Reply: FacetCountsResponse | { error: string } }>(
    '/genres/counts',
    async (request, reply) => {
      const { filters, sessionId, excludeMovieIds } = request.body ?? {};

      try {
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];

        const counts = await countGenreFacets(filters ?? {}, excludeIds);
        return { counts };
      } catch (error) {
        request.log.error(error, 'Genre facet count failed');
        return reply.status(500).send({ error: 'Failed to count genres.' });
      }
    }
  );
}
