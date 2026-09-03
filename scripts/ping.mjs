import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
try { await c.connect(); await c.query('SELECT 1'); console.log('UP'); await c.end(); process.exit(0); }
catch (e) { console.log('DOWN:', e.message); process.exit(1); }
