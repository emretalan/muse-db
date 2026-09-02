import type { FastifyInstance } from 'fastify';
import {
  countRefinementFacets,
  getRecentPickMovieIds,
  getRegionProviders,
} from '../db/queries.js';
import type { FacetCounts } from '../db/queries.js';
import type { PickFilters } from '../types/index.js';
import { config } from '../config.js';

interface RefineCountsRequest {
  filters?: PickFilters;
  sessionId?: string;
  excludeMovieIds?: number[];
}

interface ProviderChip {
  id: number;
  name: string;
  logoUrl: string | null;
}

interface RefineCountsResponse {
  counts: FacetCounts;
  /** Kullanıcının bölgesinde gösterilecek sağlayıcı kutuları — kimlik, ad ve
   *  logo. Sayımları `counts` içinde `prov:<id>` anahtarlarında.
   *
   *  Ayrı bir uçta durabilirdi ama o zaman ekran iki istek atardı; ve liste
   *  önbellekli olduğu için burada durmasının maliyeti yok. */
  providers: ProviderChip[];
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
 * `famous`, yayıncı `net:netflix`, sağlayıcı `prov:8`.
 *
 * Sağlayıcı kutularının **kimlikleri de** burada dönüyor (`providers`), çünkü
 * hangi kutuların gösterileceği bölgeye göre değişiyor ve uygulamanın bunu
 * önceden bilmesi mümkün değil: Türkiye'de puhutv var, Japonya'da U-NEXT.
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

        const active = filters ?? {};
        const [counts, providers] = await Promise.all([
          countRefinementFacets(active, excludeIds),
          getRegionProviders(active.region ?? '', active.mediaType === 'tv' ? 'tv' : 'movie'),
        ]);

        return {
          counts,
          providers: providers.map((p) => ({
            id: p.id,
            name: p.name,
            logoUrl: p.logoPath ? `${config.tmdbLogoBaseUrl}${p.logoPath}` : null,
          })),
        };
      } catch (error) {
        request.log.error(error, 'Refinement facet count failed');
        return reply.status(500).send({ error: 'Failed to count refinements.' });
      }
    }
  );
}
