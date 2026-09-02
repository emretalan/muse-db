import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
});

// Havuzdaki *boşta* bekleyen bir istemci hata verdiğinde node-postgres bunu
// havuzun kendisinde `error` olayı olarak yayıyor. Dinleyicisi olmayan bir
// `error` olayı Node'da süreci düşürüyor — try/catch'in içinde olup olmaman
// fark etmiyor, çünkü hata bir sorgunun değil boşta duran bir soketin.
//
// Railway'in Postgres'i boşta kalan bağlantıları kapatıyor. 1.838 diziyi
// tazeleyen betik 1.608'de tam olarak böyle öldü. Aynı şey API sürecinin de
// başına gelebilirdi: gece boyu istek almayan sunucunun bağlantısı düşünce
// süreç çöker, Railway yeniden başlatana kadar uygulama cevapsız kalırdı.
//
// Dinleyici olduğunda node-postgres bozuk istemciyi havuzdan sessizce çıkarıp
// bir sonraki sorgu için yenisini açıyor.
pool.on('error', (error) => {
  console.error('Postgres havuzu — boştaki istemci hatası:', error.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
