import type { FastifyInstance } from 'fastify';
import { searchMovieByTitle, getMovieGenres, getMovieKeywords } from '../db/queries.js';
import type { Movie, MovieRow } from '../types/index.js';
import { toMovie } from '../services/serialize.js';

interface SearchQuery {
  title: string;
}

interface SearchResponse {
  movie: Movie | null;
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: SearchQuery; Reply: SearchResponse | { error: string } }>(
    '/movies/search',
    async (request, reply) => {
      const { title } = request.query;

      if (!title || title.trim().length === 0) {
        return reply.status(400).send({ error: 'title query parameter is required' });
      }

      try {
        const row = await searchMovieByTitle(title.trim());

        if (!row) {
          return { movie: null };
        }

        const [genres, keywords] = await Promise.all([
          getMovieGenres(row.id),
          getMovieKeywords(row.id),
        ]);
        return { movie: toMovie(row, genres, keywords) };
      } catch (error) {
        request.log.error(error, 'Movie search failed');
        return reply.status(500).send({
          error: 'Failed to search for movie.',
        });
      }
    }
  );
}
