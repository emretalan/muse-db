import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.on('error', (e) => console.error('pool', e.message));
console.table((await pool.query(process.argv.slice(2).join(' '))).rows);
await pool.end();
