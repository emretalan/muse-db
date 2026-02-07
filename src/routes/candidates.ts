import type { FastifyInstance } from 'fastify';
import { getCandidateMovies, getMoviesGenres, getRecentPickMovieIds } from '../db/queries.js';
import type { PickFilters, Movie, MovieRow } from '../types/index.js';
import { config } from '../config.js';

interface CandidatesRequest {
  filters: PickFilters;
  limit?: number;
  sessionId?: string;
  excludeMovieIds?: number[];
}

interface CandidatesResponse {
  movies: Movie[];
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

export async function candidatesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CandidatesRequest; Reply: CandidatesResponse | { error: string } }>(
    '/candidates',
    async (request, reply) => {
      const { filters, limit = 30, sessionId, excludeMovieIds } = request.body;

      try {
        // Exclude recently picked movies if a session ID is provided
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        
        // Merge with client-provided exclusions (fulfilled/watched movies from Archive)
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];
        
        const candidates = await getCandidateMovies(filters || {}, excludeIds);

        if (candidates.length === 0) {
          return { movies: [] };
        }

        const shuffled = candidates.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(limit, shuffled.length));

        const movieIds = selected.map((m) => m.id);
        const genresMap = await getMoviesGenres(movieIds);

        const movies = selected.map((movie) => 
          toMovie(movie, genresMap.get(movie.id) || [])
        );

        return { movies };
      } catch (error) {
        request.log.error(error, 'Candidates fetch failed');
        return reply.status(500).send({
          error: 'Failed to fetch candidates.',
        });
      }
    }
  );
}
