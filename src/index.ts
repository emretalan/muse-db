import { config, validateConfig } from './config.js';
import { buildServer } from './server.js';

async function main() {
  validateConfig();

  const server = buildServer();

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Server running at http://localhost:${config.port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

main();
