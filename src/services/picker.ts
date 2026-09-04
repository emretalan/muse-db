import type { Movie, MovieRow, PickFilters, WeightedCandidate } from '../types/index.js';
import { config } from '../config.js';
import { toMovie } from './serialize.js';
import {
  eraForYear,
  getCandidateMovies,
  getMovieKeywords,
  getMoviesGenres,
  getRecentPickMovieIds,
  isFirstPickForSession,
  recordPick,
  getMoviesTitles,
  getMoviesGenreIds,
} from '../db/queries.js';
import { candidateAffinity, FATE_STRENGTH, type TasteVector } from './taste.js';

// Calculate weight for a movie based on rating and popularity
function calculateWeight(movie: MovieRow): number {
  const ratingScore = movie.vote_average / 10;
  const popularityScore = Math.log10(movie.vote_count + 1);
  return ratingScore * popularityScore;
}

/**
 * Zevk katsayısı — adaptif kader (kalem 16).
 *
 * Taban ağırlığa **çarpan** olarak giriyor, toplanan bir puan olarak değil:
 * toplansaydı zevk, oy sayısı ve puanın taşıdığı kalite sinyalini bastırıp
 * kötü ama "senin türünden" filmleri öne çıkarırdı. Çarpan ikisini de
 * koruyor — iyi filmler arasından senin sevdiklerine doğru eğiliyor.
 *
 * Aralık 0,5× – 1,5×. Alt sınırın sıfır olmaması ürünün kendisiyle ilgili:
 * kader hâlâ şaşırtabilmeli. Hiç sevmediğin bir tür daha az çıkıyor, hiç
 * çıkmıyor değil.
 */
function tasteMultiplier(
  vector: TasteVector | null,
  movie: MovieRow,
  genreIds: number[]
): number {
  if (!vector) return 1;
  const affinity = candidateAffinity(
    vector,
    genreIds,
    movie.moods ?? [],
    eraForYear(movie.year)
  );
  return 1 + FATE_STRENGTH * affinity;
}

// Weighted random selection from candidates
function weightedRandomSelect(candidates: WeightedCandidate[]): WeightedCandidate | null {
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;

  for (const candidate of candidates) {
    random -= candidate.weight;
    if (random <= 0) {
      return candidate;
    }
  }

  // Fallback to last candidate (shouldn't happen)
  return candidates[candidates.length - 1];
}

// Main pick function
export async function pickMovie(
  sessionId: string,
  filters: PickFilters,
  excludeMovieIds: number[] = [],
  /** İstemcinin dili; başlık bu dilde döndürülüyor. */
  language: string | null = null,
  /** Zevk vektörü; verilmezse kader bugüne kadarki gibi yalnızca kalite ve
   *  bilinirliğe bakıyor. */
  taste: TasteVector | null = null,
  /** Yalnızca kayda geçiyor; seçimi etkilemiyor. */
  seasonSlug: string | null = null
): Promise<Movie | null> {
  // Step 1: Get recently picked movie IDs to exclude
  const recentPickIds = await getRecentPickMovieIds(sessionId);

  // Step 2: Fetch candidate movies. A shared pact passes both participants'
  // watched lists, so neither is handed a film they have already seen.
  const excludeIds = [...new Set([...recentPickIds, ...excludeMovieIds])];
  const candidates = await getCandidateMovies(filters, excludeIds);

  if (candidates.length === 0) {
    return null;
  }

  // Step 3: Get genres for all candidates. Tür kimlikleri yalnızca zevk
  // vektörü varken çekiliyor — vektörsüz bir seçimde fazladan bir sorgu.
  const movieIds = candidates.map((m) => m.id);
  const [genresMap, genreIdsMap] = await Promise.all([
    getMoviesGenres(movieIds),
    taste ? getMoviesGenreIds(movieIds) : Promise.resolve(new Map<number, number[]>()),
  ]);

  // Step 4: Calculate weights
  let weightedCandidates: WeightedCandidate[] = candidates.map((movie) => ({
    movie,
    weight:
      calculateWeight(movie) *
      tasteMultiplier(taste, movie, genreIdsMap.get(movie.id) ?? []),
    genres: genresMap.get(movie.id) || [],
  }));

  // Step 5: Apply first-pick bias
  const isFirstPick = await isFirstPickForSession(sessionId);
  if (isFirstPick && weightedCandidates.length > 10) {
    // Sort by weight descending
    weightedCandidates.sort((a, b) => b.weight - a.weight);

    // Keep only top percentile
    const topCount = Math.ceil(
      weightedCandidates.length * config.selection.firstPickTopPercentile
    );
    weightedCandidates = weightedCandidates.slice(0, topCount);
  }

  // Step 6: Select using weighted random
  const selected = weightedRandomSelect(weightedCandidates);

  if (!selected) {
    return null;
  }

  // Step 7: Record the pick
  await recordPick(sessionId, selected.movie.id, filters, seasonSlug);

  // Step 8: Return the movie
  const keywords = await getMovieKeywords(selected.movie.id);
  const titles = await getMoviesTitles([selected.movie.id], language);
  return toMovie(selected.movie, selected.genres, keywords, {
    language,
    title: titles.get(selected.movie.id),
  });
}
