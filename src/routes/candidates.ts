import type { FastifyInstance } from 'fastify';
import {
  countCandidateMovies,
  getCandidateMovies,
  getMoviesGenres,
  getMoviesKeywords,
  getMoviesTitles,
  getRecentPickMovieIds,
} from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import type { PickFilters, Movie, MovieRow } from '../types/index.js';
import { toMovie } from '../services/serialize.js';

interface CandidatesRequest {
  filters: PickFilters;
  limit?: number;
  sessionId?: string;
  excludeMovieIds?: number[];
  /** Uygulamanın dili — başlıklar bu dilde döner. Gönderilmezse İngilizce. */
  lang?: string;
}

interface CandidatesResponse {
  movies: Movie[];
  totalResults: number;
}

export async function candidatesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CandidatesRequest; Reply: CandidatesResponse | { error: string } }>(
    '/candidates',
    async (request, reply) => {
      const { filters, limit = 30, sessionId, excludeMovieIds, lang } = request.body;
      const language = normalizeLanguage(lang);

      try {
        // Exclude recently picked movies if a session ID is provided
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        
        // Merge with client-provided exclusions (fulfilled/watched movies from Archive)
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];
        
        const candidates = await getCandidateMovies(filters || {}, excludeIds);

        if (candidates.length === 0) {
          return { movies: [], totalResults: 0 };
        }

        const shuffled = candidates.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(limit, shuffled.length));

        const movieIds = selected.map((m) => m.id);
        const [genresMap, keywordsMap, titlesMap] = await Promise.all([
          getMoviesGenres(movieIds),
          getMoviesKeywords(movieIds),
          getMoviesTitles(movieIds, language),
        ]);

        const movies = selected.map((movie) =>
          toMovie(movie, genresMap.get(movie.id) || [], keywordsMap.get(movie.id) || [], {
            language,
            title: titlesMap.get(movie.id),
          })
        );

        // `candidates.length` değil: aday listesi CANDIDATE_FETCH_LIMIT ile
        // kırpılıyor, o yüzden filtresiz bir sorguda "1000" diyordu — gerçek
        // sayı 1.659'du. Uygulama bunu kullanıcıya gösteriyor.
        const totalResults = await countCandidateMovies(filters || {}, excludeIds);

        return { movies, totalResults };
      } catch (error) {
        request.log.error(error, 'Candidates fetch failed');
        return reply.status(500).send({
          error: 'Failed to fetch candidates.',
        });
      }
    }
  );
}
