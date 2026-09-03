import type { FastifyInstance } from 'fastify';
import { countCandidateMovies } from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import { localize, seasonsForMonth, type ResolvedSeason } from '../services/seasons.js';

interface SeasonsQuery {
  lang?: string;
  /** İstemcinin ayı, 1–12. Verilmezse sunucununki. */
  month?: string;
}

export async function seasonRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: SeasonsQuery; Reply: { seasons: ResolvedSeason[] } }>(
    '/seasons',
    async (request) => {
      const { lang, month } = request.query;
      const language = normalizeLanguage(lang);

      const parsed = Number.parseInt(month ?? '', 10);
      const now = Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
        ? parsed
        : new Date().getUTCMonth() + 1;

      const active = seasonsForMonth(now);
      const resolved = await Promise.all(
        active.map(async (season) => {
          const { title, subtitle } = localize(season, language);
          // Havuz sayılıyor çünkü boş bir sezon kapı değil duvar: kullanıcı
          // dokunuyor, tören sonuçsuz kalıyor. Katalog büyürken bir sezonun
          // sayısı da değişiyor, o yüzden sabit yazılamaz.
          const poolSize = await countCandidateMovies(season.filters, []);
          return {
            slug: season.slug,
            title,
            subtitle,
            icon: season.icon,
            filters: season.filters,
            target: season.target,
            poolSize,
          };
        })
      );

      return { seasons: resolved.filter((s) => s.poolSize >= s.target * 4) };
    }
  );
}
