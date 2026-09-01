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
    mediaType: row.media_type,
    numberOfSeasons: row.number_of_seasons,
    numberOfEpisodes: row.number_of_episodes,
    networks: row.networks ?? [],
    firstEpisodeName: row.first_episode_name,
    firstEpisodeOverview: row.first_episode_overview,
    firstEpisodeStillUrl: row.first_episode_still_path
      ? `${config.tmdbBackdropBaseUrl}${row.first_episode_still_path}`
      : null,
    lastYear: yearOf(row.last_air_date),
  };
}

/** Bir tarih sütunundan yıl. pg `DATE` sütunlarını Date nesnesi olarak
 *  döndürüyor, ama JSON'dan gelen yollarda dize olabiliyor. */
function yearOf(value: Date | string | null): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}
