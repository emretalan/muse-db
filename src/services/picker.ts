import type { Movie, MovieRow, PickFilters, WeightedCandidate } from '../types/index.js';
import { toMovie } from './serialize.js';
import { eraForYear } from './eras.js';
import {
  getCandidateMovies,
  getMovieKeywords,
  getMoviesGenres,
  getRecentPickMovieIds,
  recordPick,
  recordSeasonStart,
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
  const weightedCandidates: WeightedCandidate[] = candidates.map((movie) => ({
    movie,
    weight:
      calculateWeight(movie) *
      tasteMultiplier(taste, movie, genreIdsMap.get(movie.id) ?? []),
    genres: genresMap.get(movie.id) || [],
  }));

  // Burada bir zamanlar **ilk seçim yanlılığı** vardı: oturumun hiç seçimi
  // yoksa aday listesi ağırlığa göre sıralanıp en iyi %30'a kırpılıyordu.
  // Niyeti "yeni kullanıcının gördüğü ilk film iyi bir film olsun"du.
  //
  // Kaldırıldı, çünkü hiçbir zaman o işi yapmadı. `/pick` uygulamada
  // **yalnızca** ortak söz yolundan çağrılıyor ve `sessionId` olarak davet
  // kodu gidiyor; davet kodu her ortak sözde yeniden üretildiği için
  // "bu oturumun ilk seçimi mi" sorusu her seferinde `true` dönüyordu. Yani
  // kural yeni kullanıcıya değil, **her ortak söze** uygulanıyordu.
  //
  // Etkisi ölçüldü (üretim, 40'ar seçim): havuzun medyan oy sayısı 548 iken
  // taze oturumun getirdiklerinde 2.759, ve kütüphanenin %70'i ortak sözde
  // hiç çıkamıyordu. Tek kişilik tören zaten hiç yanlılık taşımıyor — o yol
  // `/pick`'i değil `/candidates`'ı kullanıp tekdüze seçiyor — yani kural iki
  // yolu birbirinden ayırmaktan başka bir şey yapmıyordu.
  //
  // Ağırlıklandırma duruyor ve yeterli: en zayıf film tekdüzenin 0,54 katı,
  // en güçlüsü 1,83 katı şansa sahip. Eğiyor, dışlamıyor.

  // Step 5: Select using weighted random
  const selected = weightedRandomSelect(weightedCandidates);

  if (!selected) {
    return null;
  }

  // Step 6: Record the pick
  await recordPick(sessionId, selected.movie.id, filters, seasonSlug);
  // Sezondan başlayan ortak sözler de sayaca girsin. Ayrı bir çağrı, çünkü
  // sayacın kaynağı `user_picks` değil (bkz. `019_season_starts.sql`).
  if (seasonSlug) {
    await recordSeasonStart(sessionId, seasonSlug);
  }

  // Step 7: Return the movie
  const keywords = await getMovieKeywords(selected.movie.id);
  const titles = await getMoviesTitles([selected.movie.id], language);
  return toMovie(selected.movie, selected.genres, keywords, {
    language,
    title: titles.get(selected.movie.id),
  });
}
