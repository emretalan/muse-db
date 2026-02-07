import type { Genre } from '../types/index.js';
import { getAllGenres } from '../db/queries.js';

// In-memory cache for genres (refreshed on server restart)
let genresCache: Genre[] | null = null;

export async function getGenres(): Promise<Genre[]> {
  if (genresCache) {
    return genresCache;
  }

  genresCache = await getAllGenres();
  return genresCache;
}

// Clear cache (useful for testing)
export function clearGenresCache(): void {
  genresCache = null;
}
