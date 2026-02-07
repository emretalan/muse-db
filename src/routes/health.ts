import type { FastifyInstance } from 'fastify';
import { healthCheck } from '../db/queries.js';
import type { HealthResponse } from '../types/index.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    const dbHealthy = await healthCheck();

    if (!dbHealthy) {
      return reply.status(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
}
