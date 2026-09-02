import type { FastifyInstance } from 'fastify';
import {
  searchMovieByTitle,
  getMovieGenres,
  getMovieKeywords,
  getMoviesTitles,
} from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import type { Movie, MovieRow } from '../types/index.js';
import { toMovie } from '../services/serialize.js';

interface SearchQuery {
  title: string;
  lang?: string;
}

interface SearchResponse {
  movie: Movie | null;
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: SearchQuery; Reply: SearchResponse | { error: string } }>(
    '/movies/search',
    async (request, reply) => {
      const { title, lang } = request.query;
      const language = normalizeLanguage(lang);

      if (!title || title.trim().length === 0) {
        return reply.status(400).send({ error: 'title query parameter is required' });
      }

      try {
        const row = await searchMovieByTitle(title.trim());

        if (!row) {
          return { movie: null };
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
        request.log.error(error, 'Movie search failed');
        return reply.status(500).send({
          error: 'Failed to search for movie.',
        });
      }
    }
  );
}
