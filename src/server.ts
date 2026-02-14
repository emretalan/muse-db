import Fastify from 'fastify';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { genreRoutes } from './routes/genres.js';
import { pickRoutes } from './routes/pick.js';
import { candidatesRoutes } from './routes/candidates.js';
import { searchRoutes } from './routes/search.js';

export function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Request logging
  fastify.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'request completed'
    );
    done();
  });

  // CORS for iOS app
  fastify.addHook('onRequest', (_request, reply, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    done();
  });

  // Handle preflight
  fastify.options('*', (_request, reply) => {
    reply.status(204).send();
  });

  // Register routes
  fastify.register(healthRoutes);
  fastify.register(genreRoutes);
  fastify.register(pickRoutes);
  fastify.register(candidatesRoutes);
  fastify.register(searchRoutes);

  return fastify;
}
