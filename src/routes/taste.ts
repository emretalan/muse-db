import type { FastifyInstance } from 'fastify';
import { getTasteFacts } from '../db/queries.js';
import {
  buildTasteProfile,
  isReactionKey,
  type TasteEntry,
  type TasteProfile,
} from '../services/taste.js';

interface TasteRequest {
  entries?: unknown;
}

/** Defterin üst sınırı. Arşiv büyüdükçe her satırı taşımanın anlamı yok:
 *  profil zaten en yeni cevaplarda yoğunlaşıyor ve 400 satır tek sorguda
 *  rahatça dönüyor. Uygulama en yeniden başlayarak gönderiyor. */
const MAX_ENTRIES = 400;

export async function tasteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: TasteRequest; Reply: TasteProfile | { error: string } }>(
    '/taste',
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({ error: 'Request body must be an object.' });
      }

      const raw = body.entries;
      if (!Array.isArray(raw)) {
        return reply.status(400).send({ error: 'entries must be an array.' });
      }

      const entries: TasteEntry[] = [];
      for (const item of raw.slice(0, MAX_ENTRIES)) {
        if (!item || typeof item !== 'object') continue;
        const { movieId, reaction } = item as Record<string, unknown>;
        if (!Number.isInteger(movieId)) continue;
        if (!isReactionKey(reaction)) continue;
        entries.push({ movieId: movieId as number, reaction });
      }

      try {
        const facts = await getTasteFacts([...new Set(entries.map((e) => e.movieId))]);
        return buildTasteProfile(entries, facts);
      } catch (error) {
        request.log.error(error, 'Taste profile failed');
        return reply.status(500).send({ error: 'Failed to build taste profile.' });
      }
    }
  );
}
