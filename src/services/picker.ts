import type { Movie, MovieRow, PickFilters, WeightedCandidate } from '../types/index.js';
import { config } from '../config.js';
import {
  getCandidateMovies,
  getMoviesGenres,
  getRecentPickMovieIds,
  isFirstPickForSession,
  recordPick,
} from '../db/queries.js';

// Calculate weight for a movie based on rating and popularity
function calculateWeight(movie: MovieRow): number {
  const ratingScore = movie.vote_average / 10;
  const popularityScore = Math.log10(movie.vote_count + 1);
  return ratingScore * popularityScore;
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

// Convert database row to API response
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

// Main pick function
export async function pickMovie(
  sessionId: string,
  filters: PickFilters
): Promise<Movie | null> {
  // Step 1: Get recently picked movie IDs to exclude
  const recentPickIds = await getRecentPickMovieIds(sessionId);

  // Step 2: Fetch candidate movies
  const candidates = await getCandidateMovies(filters, recentPickIds);

  if (candidates.length === 0) {
    return null;
  }

  // Step 3: Get genres for all candidates
  const movieIds = candidates.map((m) => m.id);
  const genresMap = await getMoviesGenres(movieIds);

  // Step 4: Calculate weights
  let weightedCandidates: WeightedCandidate[] = candidates.map((movie) => ({
    movie,
    weight: calculateWeight(movie),
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
  await recordPick(sessionId, selected.movie.id, filters);

  // Step 8: Return the movie
  return toMovie(selected.movie, selected.genres);
}
