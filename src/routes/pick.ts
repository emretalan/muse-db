import type { FastifyInstance } from 'fastify';
import { pickMovie } from '../services/picker.js';
import type { PickRequest, PickResponse } from '../types/index.js';
import { normalizeLanguage } from '../services/languages.js';
import { sanitizeVector } from '../services/taste.js';
import { sanitizePickFilters } from '../services/filters.js';

export async function pickRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PickRequest; Reply: PickResponse | { error: string } }>(
    '/pick',
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({
          error: 'Request body must be an object.',
        });
      }

      const { sessionId, filters, excludeMovieIds, lang, taste, seasonSlug } = body as PickRequest;
      const language = normalizeLanguage(lang);
      // Gövde doğrulanmadan `PickFilters`'a cast edilmişti; bozuk bir alan
      // sorguyu 500 ile düşürürdü. Aşağıdaki süre denetimi de bu yüzden
      // temizlenmiş sayılar üzerinde çalışmak zorunda: `'abc' < 60` JS'te
      // `false` döndüğü için eski hâlinde kontrolden sızıyordu.
      const { filters: safeFilters, dropped } = sanitizePickFilters(filters);
      if (dropped.length > 0) {
        request.log.warn({ dropped }, 'Pick: bozuk filtre alanları düşürüldü');
      }
      const safeExcludeIds = Array.isArray(excludeMovieIds)
        ? excludeMovieIds.filter((id) => Number.isInteger(id))
        : [];

      // Validate session ID (accepts Firebase UIDs or UUIDs)
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 255) {
        return reply.status(400).send({
          error: 'Invalid session ID format.',
        });
      }

      // Validate filters
      //
      // Taban türe bağlı. Filmde 60 dakika eskiden beri doğru: uzun metrajın
      // altı elenmiş sayılıyor. Dizide aynı sayı yanlış — `movies.runtime`
      // dizi satırlarında **ilk bölümün** süresi ve bir sitcom bölümü 22
      // dakika. 60 tabanı, uygulamanın dizideki üç somut süre seçeneğinin
      // (`<30`, `30–50`, `50+`) üçünü birden reddediyordu; ortak sözde dizi
      // seçen herkes "kadere ulaşılamadı" alıyordu.
      //
      // Alt sınır tohumlamanın kendi eşiği: `scripts/seed-tv.ts`
      // `MIN_EPISODE_RUNTIME = 10`, yani bundan kısa bölüm katalogda yok.
      const durationFloor = safeFilters.mediaType === 'tv' ? 1 : 60;

      if (safeFilters.minDuration !== undefined && safeFilters.minDuration < durationFloor) {
        return reply.status(400).send({
          error: `minDuration must be at least ${durationFloor} minutes.`,
        });
      }

      if (safeFilters.maxDuration !== undefined && safeFilters.maxDuration < durationFloor) {
        return reply.status(400).send({
          error: `maxDuration must be at least ${durationFloor} minutes.`,
        });
      }

      try {
        const movie = await pickMovie(
          sessionId,
          safeFilters,
          safeExcludeIds,
          language,
          sanitizeVector(taste),
          // Slug yalnızca kayda geçiyor. Uydurulmuş bir değer kaderi
          // etkilemiyor; en fazla kendi sezonunun sayacını şişirir, o yüzden
          // biçim denetimi (uzunluk + karakter) yeterli.
          typeof seasonSlug === 'string' && /^[a-z0-9-]{1,40}$/.test(seasonSlug)
            ? seasonSlug
            : null
        );

        if (!movie) {
          return {
            movie: null,
            message: 'No movies match your criteria. Try broader filters.',
          };
        }

        return { movie };
      } catch (error) {
        request.log.error(error, 'Pick failed');
        return reply.status(500).send({
          error: 'Failed to pick a movie. Please try again.',
        });
      }
    }
  );
}
