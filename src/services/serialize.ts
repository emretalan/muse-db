import type { Movie, MovieRow } from '../types/index.js';
import { config } from '../config.js';

/**
 * Bir veritabanı satırını API yanıtına çevirir.
 *
 * Bu fonksiyon `candidates.ts`, `search.ts` ve `picker.ts` içinde üç ayrı
 * kopya olarak duruyordu. Üçü de aynı işi yapıyordu ama yeni bir alan
 * eklendiğinde üçünü birden güncellemek gerekiyordu — nitekim `originalTitle`
 * yıllardır tabloda duruyor ve hiçbir kopyada yer almıyordu.
 */
export function toMovie(row: MovieRow, genres: string[], keywords: string[] = []): Movie {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    title: row.title,
    // Yerelleştirilmiş başlıkla aynıysa göndermenin anlamı yok — istemci
    // "Yaban Çilekleri / Yaban Çilekleri" göstermek zorunda kalmasın.
    originalTitle: row.original_title && row.original_title !== row.title
      ? row.original_title
      : null,
    year: row.year,
    runtime: row.runtime || 0,
    synopsis: row.synopsis || '',
    tagline: row.tagline || null,
    posterUrl: row.poster_path ? `${config.tmdbImageBaseUrl}${row.poster_path}` : '',
    backdropUrl: row.backdrop_path ? `${config.tmdbBackdropBaseUrl}${row.backdrop_path}` : null,
    voteAverage: Number(row.vote_average),
    genres,
    directors: row.directors ?? [],
    keywords,
    certification: row.certification || null,
    imdbId: row.imdb_id || null,
  };
}
