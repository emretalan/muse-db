import type { FastifyInstance } from 'fastify';
import {
  getMovieById,
  getMovieGenres,
  getMovieKeywords,
  getMoviesTitles,
} from '../db/queries.js';
import type { Movie } from '../types/index.js';
import { toMovie } from '../services/serialize.js';
import { normalizeLanguage } from '../services/languages.js';

interface MovieParams {
  id: string;
}

interface MovieQuery {
  lang?: string;
}

interface MovieResponse {
  movie: Movie | null;
}

/**
 * Tek bir filmi kimliğinden, istenen dilde döndürür.
 *
 * Ortak söz için var. Kazananı iki cihazdan biri seçip tüm film nesnesini
 * paylaşılan belgeye yazıyor; karşı taraf onu yazanın dilinde alıyor ve
 * arşivine de o dilde kaydediyordu. Kimlik iki cihazda da aynı olduğuna göre
 * her cihaz kendi kopyasını buradan tazeliyor.
 */
export async function movieRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: MovieParams; Querystring: MovieQuery; Reply: MovieResponse | { error: string } }>(
    '/movies/:id',
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return reply.status(400).send({ error: 'Invalid movie ID' });
      }

      const language = normalizeLanguage(request.query.lang);

      try {
        const row = await getMovieById(id);
        if (!row) {
          return reply.status(404).send({ error: 'Movie not found' });
        }

        const [genres, keywords, titles] = await Promise.all([
          getMovieGenres(row.id),
          getMovieKeywords(row.id),
          getMoviesTitles([row.id], language),
        ]);

        return {
          movie: toMovie(row, genres, keywords, { language, title: titles.get(row.id) }),
        };
      } catch (error) {
        request.log.error(error, 'Movie fetch failed');
        return reply.status(500).send({ error: 'Failed to fetch movie.' });
      }
    }
  );
}
