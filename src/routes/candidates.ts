import type { FastifyInstance } from 'fastify';
import {
  countCandidateMovies,
  getCandidateMovies,
  getMoviesGenres,
  getMoviesKeywords,
  getMoviesTitles,
  getRecentPickMovieIds,
  recordSeasonStart,
} from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import type { PickFilters, Movie, MovieRow } from '../types/index.js';
import { toMovie } from '../services/serialize.js';
import { sanitizePickFilters } from '../services/filters.js';
import { isSeasonSlug } from '../services/seasons.js';

interface CandidatesRequest {
  filters: PickFilters;
  limit?: number;
  sessionId?: string;
  excludeMovieIds?: number[];
  /** Uygulamanın dili — başlıklar bu dilde döner. Gönderilmezse İngilizce. */
  lang?: string;
  /** Tören bir tematik sezonun kapısından başladıysa o sezonun slug'ı.
   *
   *  Yalnızca sayım için: sezon kartındaki "bu ay N kişi yola çıktı" satırı
   *  buradan çıkıyor. Aday listesine hiç etkisi yok — sezonun etkisi zaten
   *  `filters` içinde. */
  seasonSlug?: string;
}

interface CandidatesResponse {
  movies: Movie[];
  totalResults: number;
}

export async function candidatesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CandidatesRequest; Reply: CandidatesResponse | { error: string } }>(
    '/candidates',
    async (request, reply) => {
      const { filters, limit = 30, sessionId, excludeMovieIds, lang, seasonSlug } =
        request.body;
      const language = normalizeLanguage(lang);

      // Gövde tipli arayüze cast edildi ama doğrulanmadı; bozuk bir alan
      // sorguyu 500 ile düşürürdü. Tanınmayanı düşürüp devam ediyoruz.
      const { filters: safeFilters, dropped } = sanitizePickFilters(filters);
      if (dropped.length > 0) {
        request.log.warn({ dropped }, 'Candidates: bozuk filtre alanları düşürüldü');
      }

      try {
        // Exclude recently picked movies if a session ID is provided
        const recentIds = sessionId ? await getRecentPickMovieIds(sessionId) : [];
        
        // Merge with client-provided exclusions (fulfilled/watched movies from Archive)
        const clientExcludeIds = Array.isArray(excludeMovieIds) ? excludeMovieIds : [];
        const excludeIds = [...new Set([...recentIds, ...clientExcludeIds])];
        
        // Sezon sayacı. Yanıtı **bekletmiyor ve düşürmüyor**: bu uç törenin
        // kritik yolunda ve bir sayaç yazımının kaderi engellemesi kabul
        // edilemez. Slug gerçek bir sezona ait değilse hiç yazılmıyor.
        if (sessionId && isSeasonSlug(seasonSlug)) {
          void recordSeasonStart(sessionId, seasonSlug).catch((error) => {
            request.log.warn(error, 'Sezon başlangıcı yazılamadı');
          });
        }

        const candidates = await getCandidateMovies(safeFilters, excludeIds);

        if (candidates.length === 0) {
          return { movies: [], totalResults: 0 };
        }

        // Karıştırma yok: `getCandidateMovies` zaten `ORDER BY random()` ile
        // dönüyor. Buradaki eski `sort(() => Math.random() - 0.5)` hem
        // gereksizdi hem de yanlıydı — karşılaştırma tabanlı bir sıralamaya
        // tutarsız karşılaştırıcı vermek düzgün permütasyon üretmiyor.
        const selected = candidates.slice(0, Math.min(limit, candidates.length));

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
        const totalResults = await countCandidateMovies(safeFilters, excludeIds);

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
