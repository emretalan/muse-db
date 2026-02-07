import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function migrate(): Promise<void> {
  console.log('Running migrations...');

  // Create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Get list of executed migrations
  const executedResult = await pool.query<{ name: string }>('SELECT name FROM _migrations');
  const executedMigrations = new Set(executedResult.rows.map((row) => row.name));

  // Get all migration files
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (executedMigrations.has(file)) {
      console.log(`  ✓ ${file} (already executed)`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`  ✓ ${file} (executed)`);
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error(`  ✗ ${file} (failed)`);
      throw error;
    }
  }

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
