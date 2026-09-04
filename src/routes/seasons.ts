import type { FastifyInstance } from 'fastify';
import { countCandidateMovies, countSeasonStarters } from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import { localize, seasonsForMonth, type ResolvedSeason } from '../services/seasons.js';
import { config } from '../config.js';

/**
 * Katılım sayısının önbelleği — anahtar "slug:yıl-ay".
 *
 * `/seasons` zaten sezon başına bir `COUNT(DISTINCT m.id)` çekiyor (havuz
 * boyu); ikinci bir sayımı her isteğe eklemek istemiyoruz. Sayı saatlik
 * değişen bir şey değil ve istemci zaten günde bir soruyor, ama bir kullanıcı
 * uygulamayı gün içinde birden çok kez açtığında ya da dilini değiştirdiğinde
 * istek tekrarlanıyor. Desen sunucunun geri kalanıyla aynı (`providers.ts`,
 * `synopsis.ts`, `trailer.ts`).
 */
const startersCache = new Map<string, { count: number; cachedAt: number }>();
const STARTERS_TTL_MS = 60 * 60 * 1000; // 1 saat

async function startersFor(slug: string, year: number, month: number): Promise<number> {
  const key = `${slug}:${year}-${month}`;
  const hit = startersCache.get(key);
  if (hit && Date.now() - hit.cachedAt < STARTERS_TTL_MS) return hit.count;

  const count = await countSeasonStarters(slug, year, month);
  startersCache.set(key, { count, cachedAt: Date.now() });
  return count;
}

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

      // Yıl istemciden gelmiyor; sayım penceresi için gerekiyor. Aralık
      // sezonu ocakta da geçerli (`months: [12, 1]`) ve o durumda istemcinin
      // ayı 1 iken sunucunun yılı zaten doğru olanı — sayaç her ay kendi
      // penceresine bakıyor, aralıkta verilenler ocağınkine karışmıyor.
      const year = new Date().getUTCFullYear();

      const active = seasonsForMonth(now);
      const resolved = await Promise.all(
        active.map(async (season) => {
          const { title, subtitle } = localize(season, language);
          // Havuz sayılıyor çünkü boş bir sezon kapı değil duvar: kullanıcı
          // dokunuyor, tören sonuçsuz kalıyor. Katalog büyürken bir sezonun
          // sayısı da değişiyor, o yüzden sabit yazılamaz.
          const poolSize = await countCandidateMovies(season.filters, []);

          // Eşiğin altındaki sayı gönderilmiyor: "3 kişi yola çıktı",
          // davet etmesi gereken bir satırın boş salonu göstermesi olurdu.
          const starters = await startersFor(season.slug, year, now);
          const worthShowing = starters >= config.seasons.minStartersToShow;

          return {
            slug: season.slug,
            title,
            subtitle,
            icon: season.icon,
            filters: season.filters,
            target: season.target,
            poolSize,
            ...(worthShowing ? { starters } : {}),
          };
        })
      );

      return { seasons: resolved.filter((s) => s.poolSize >= s.target * 4) };
    }
  );
}
