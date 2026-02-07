import type { FastifyInstance } from 'fastify';
import { pickMovie } from '../services/picker.js';
import type { PickRequest, PickResponse } from '../types/index.js';

export async function pickRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PickRequest; Reply: PickResponse | { error: string } }>(
    '/pick',
    async (request, reply) => {
      const { sessionId, filters } = request.body;

      // Validate session ID (accepts Firebase UIDs or UUIDs)
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 255) {
        return reply.status(400).send({
          error: 'Invalid session ID format.',
        });
      }

      // Validate filters
      if (filters.minDuration !== undefined && filters.minDuration < 60) {
        return reply.status(400).send({
          error: 'minDuration must be at least 60 minutes.',
        });
      }

      if (filters.maxDuration !== undefined && filters.maxDuration < 60) {
        return reply.status(400).send({
          error: 'maxDuration must be at least 60 minutes.',
        });
      }

      if (filters.genreIds !== undefined && !Array.isArray(filters.genreIds)) {
        return reply.status(400).send({
          error: 'genreIds must be an array.',
        });
      }

      try {
        const movie = await pickMovie(sessionId, filters || {});

        if (!movie) {
          return {
            movie: null,
            message: 'No movies match your criteria. Try broader filters.',
          };
        }

        return { movie };
      } catch (error) {
        request.log.error(error, 'Pick failed');
        return reply.status(500).send({
          error: 'Failed to pick a movie. Please try again.',
        });
      }
    }
  );
}
