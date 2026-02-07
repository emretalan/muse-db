// Core domain types

export interface Movie {
  id: number;
  title: string;
  year: number;
  runtime: number;
  synopsis: string;
  posterUrl: string;
  voteAverage: number;
  genres: string[];
}

export interface MovieRow {
  id: number;
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number;
  runtime: number | null;
  synopsis: string | null;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult: boolean;
  created_at: Date;
}

export interface Genre {
  id: number;
  name: string;
}

export type Era = '1980-1989' | '1990-1999' | '2000-2009' | '2010-2019' | '2020-now';

export interface PickFilters {
  genreIds?: number[];
  era?: Era;
  origin?: string[];
  minDuration?: number;
  maxDuration?: number;
}

export interface PickRequest {
  sessionId: string;
  filters: PickFilters;
}

export interface PickResponse {
  movie: Movie | null;
  message?: string;
}

export interface GenresResponse {
  genres: Genre[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

// Candidate with weight for selection algorithm
export interface WeightedCandidate {
  movie: MovieRow;
  weight: number;
  genres: string[];
}
