import type { FastifyInstance } from 'fastify';
import { searchMovieByTitle, getMovieGenres } from '../db/queries.js';
import type { Movie, MovieRow } from '../types/index.js';
import { config } from '../config.js';

interface SearchQuery {
  title: string;
}

interface SearchResponse {
  movie: Movie | null;
}

function toMovie(row: MovieRow, genres: string[]): Movie {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    runtime: row.runtime || 0,
    synopsis: row.synopsis || '',
    posterUrl: row.poster_path
      ? `${config.tmdbImageBaseUrl}${row.poster_path}`
      : '',
    voteAverage: Number(row.vote_average),
    genres,
  };
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

        const genres = await getMovieGenres(row.id);
        return { movie: toMovie(row, genres) };
      } catch (error) {
        request.log.error(error, 'Movie search failed');
        return reply.status(500).send({
          error: 'Failed to search for movie.',
        });
      }
    }
  );
}
