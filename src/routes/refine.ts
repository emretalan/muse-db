import type { FastifyInstance } from 'fastify';
import {
  countRefinementFacets,
  getRecentPickMovieIds,
  getRegionProviders,
} from '../db/queries.js';
import type { FacetCounts } from '../db/queries.js';
import type { PickFilters } from '../types/index.js';
import { NETWORK_BUCKETS } from '../services/networks.js';
import { STUDIO_BUCKETS } from '../services/studios.js';
import { config } from '../config.js';
import { sanitizePickFilters } from '../services/filters.js';

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

interface NetworkChip {
  slug: string;
  name: string;
}

/** Aynı gövde, ayrı tip: kovalar ayrı listelerde yaşıyor ve sayımları ayrı
 *  ad alanlarında (`net:` / `std:`). Tek tipe indirmek, iki kovanın aynı
 *  slug'ı taşıyabildiği gerçeğini gizlerdi. */
interface StudioChip {
  slug: string;
  name: string;
}

interface RefineCountsResponse {
  counts: FacetCounts;
  /** Kullanıcının bölgesinde gösterilecek sağlayıcı kutuları — kimlik, ad ve
   *  logo. Sayımları `counts` içinde `prov:<id>` anahtarlarında.
   *
   *  Ayrı bir uçta durabilirdi ama o zaman ekran iki istek atardı; ve liste
   *  önbellekli olduğu için burada durmasının maliyeti yok. */
  providers: ProviderChip[];

  /** Yayıncı kutuları — yalnız dizide dolu. Sayımları `counts` içinde
   *  `net:<slug>` anahtarlarında (bunlar zaten dönüyordu; eksik olan
   *  kutuların kendisiydi, o yüzden ekran bölümü hiç çizemiyordu).
   *
   *  Sağlayıcılar gibi sunucudan gidiyor ve aynı gerekçeyle: kova sınırları
   *  kütüphane büyüdükçe oynuyor ve bunun bir App Store sürümü beklemesi
   *  anlamsız (bkz. `services/networks.ts` başlığı). */
  networks: NetworkChip[];

  /** Stüdyo kutuları — yalnız filmde dolu. Sayımları `counts` içinde
   *  `std:<slug>` anahtarlarında.
   *
   *  Yayıncının film tarafındaki eşi ve ekranda **aynı** soruyu çiziyor
   *  ("Kim yaptı?"); ayrı alan olmalarının sebebi kovaların gerçekten ayrı
   *  olması (bkz. `services/studios.ts` başlığı). */
  studios: StudioChip[];
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
 * `famous`, yayıncı `net:netflix`, stüdyo `std:a24`, sağlayıcı `prov:8`.
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

        // Temizlik uçta yapılıyor, sorgu katmanında değil: bu uç `mediaType`
        // ve `region`'ı **kendisi** okuyup hangi kutuların döneceğine karar
        // veriyor (yayıncı mı stüdyo mu, hangi bölgenin sağlayıcıları).
        const { filters: active, dropped } = sanitizePickFilters(filters);
        if (dropped.length > 0) {
          request.log.warn({ dropped }, 'Refine: bozuk filtre alanları düşürüldü');
        }
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
          // Filmde boş: `movies.networks` film satırlarında her zaman boş ve
          // sekiz sönük kutu göstermenin anlamı yok.
          networks:
            active.mediaType === 'tv'
              ? NETWORK_BUCKETS.map((b) => ({ slug: b.slug, name: b.label }))
              : [],
          // Dizide boş: `movies.companies` dizi satırlarında hiç dolmuyor.
          studios:
            active.mediaType === 'tv'
              ? []
              : STUDIO_BUCKETS.map((b) => ({ slug: b.slug, name: b.label })),
        };
      } catch (error) {
        request.log.error(error, 'Refinement facet count failed');
        return reply.status(500).send({ error: 'Failed to count refinements.' });
      }
    }
  );
}
