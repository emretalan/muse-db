import 'dotenv/config';

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/muse_dev',

  // TMDB (for seeding)
  tmdbApiKey: process.env.TMDB_API_KEY || '',

  // Selection algorithm constants
  selection: {
    minVoteCount: 500,
    minVoteAverage: 5.5,
    minRuntime: 60,
    recentPicksLimit: 20,
    firstPickTopPercentile: 0.3,
  },

  // TMDB image base URL
  tmdbImageBaseUrl: 'https://image.tmdb.org/t/p/w500',
} as const;

export function validateConfig(): void {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
}
