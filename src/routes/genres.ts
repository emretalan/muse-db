import type { FastifyInstance } from 'fastify';
import { getGenres } from '../services/movies.js';
import type { GenresResponse } from '../types/index.js';

export async function genreRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Reply: GenresResponse }>('/genres', async () => {
    const genres = await getGenres();
    return { genres };
  });
}
