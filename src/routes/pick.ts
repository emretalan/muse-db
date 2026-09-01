import type { FastifyInstance } from 'fastify';
import { pickMovie } from '../services/picker.js';
import type { PickRequest, PickResponse } from '../types/index.js';

export async function pickRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PickRequest; Reply: PickResponse | { error: string } }>(
    '/pick',
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({
          error: 'Request body must be an object.',
        });
      }

      const { sessionId, filters, excludeMovieIds } = body as PickRequest;
      const safeFilters = filters || {};
      const safeExcludeIds = Array.isArray(excludeMovieIds)
        ? excludeMovieIds.filter((id) => Number.isInteger(id))
        : [];

      // Validate session ID (accepts Firebase UIDs or UUIDs)
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 255) {
        return reply.status(400).send({
          error: 'Invalid session ID format.',
        });
      }

      // Validate filters
      if (safeFilters.minDuration !== undefined && safeFilters.minDuration < 60) {
        return reply.status(400).send({
          error: 'minDuration must be at least 60 minutes.',
        });
      }

      if (safeFilters.maxDuration !== undefined && safeFilters.maxDuration < 60) {
        return reply.status(400).send({
          error: 'maxDuration must be at least 60 minutes.',
        });
      }

      if (
        safeFilters.genreIds !== undefined &&
        !Array.isArray(safeFilters.genreIds) &&
        typeof safeFilters.genreIds !== 'number'
      ) {
        return reply.status(400).send({
          error: 'genreIds must be a number or an array of numbers.',
        });
      }

      try {
        const movie = await pickMovie(sessionId, safeFilters, safeExcludeIds);

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
