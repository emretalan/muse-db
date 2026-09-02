/**
 * Yalnızca başlık çevirilerini doldurur — film ve dizi, tek geçişte.
 *
 * Kullanım:
 *   npx tsx scripts/seed-titles.ts              # eksik olanları tamamla
 *   npx tsx scripts/seed-titles.ts --all        # hepsini yeniden yaz
 *   npx tsx scripts/seed-titles.ts --media tv   # yalnızca diziler
 *
 * Neden `--refresh`ten ayrı bir betik:
 *
 * Tam tazeleme satır başına altı veritabanı sorgusu atıyor (upsert + tür +
 * ülke + iki anahtar kelime + çeviri). Railway'in genel Postgres uç noktası
 * üzerinden her gidiş-dönüş saniyeler sürebiliyor; ölçüldüğünde film başına
 * 20 saniyeye çıktı, yani 4.776 film 40 saat ederdi. Oysa sonradan eklenen
 * bir sütunu doldurmak için diğer beş sorgunun hiçbirine gerek yok.
 *
 * Burada satır başına sıfır sorgu var: çeviriler bellekte birikip 200'lük
 * gruplar hâlinde tek INSERT ile yazılıyor. TMDB tarafında da tam detay
 * yerine `/translations` alt kaynağı çağrılıyor — 126 KB yerine ~30 KB.
 */

import { pool } from '../src/db/client.js';
import { config } from '../src/config.js';
import { TRANSLATION_REGIONS } from '../src/services/languages.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RATE_LIMIT_DELAY = 50;
/** Kaç satır biriktikten sonra yazılacağı. */
const FLUSH_SIZE = 200;

interface TranslationEntry {
  iso_639_1: string;
  iso_3166_1: string;
  data?: { title?: string; name?: string };
}

interface TranslationsResponse {
  translations?: TranslationEntry[];
}

interface Target {
  id: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** TMDB kimi çeviriyi görünmez yön işaretleriyle sarmalıyor — "The Office"in
 *  Türkçesi "\u200eOfis\u200e" olarak geliyor. Ekranda görünmüyorlar ama
 *  karşılaştırmayı bozuyorlar, o yüzden `trim` yetmiyor. */
function cleanTitle(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}

/** TMDB aynı dil için birden fazla bölge tutabiliyor — `de-DE` ile `de-AT`
 *  ayrı iki kayıt — o yüzden bölge kodu da eşleşmek zorunda. */
function extractTranslations(entries: TranslationEntry[] | undefined) {
  if (!entries) return [];
  const out: { language: string; title: string }[] = [];
  for (const [language, region] of Object.entries(TRANSLATION_REGIONS)) {
    const entry = entries.find((e) => e.iso_639_1 === language && e.iso_3166_1 === region);
    const title = cleanTitle(entry?.data?.title ?? entry?.data?.name);
    if (title) out.push({ language, title });
  }
  return out;
}

async function fetchTranslations(target: Target): Promise<TranslationEntry[] | undefined> {
  const url =
    `${TMDB_BASE_URL}/${target.mediaType}/${target.tmdbId}/translations` +
    `?api_key=${config.tmdbApiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  const data = (await response.json()) as TranslationsResponse;
  return data.translations;
}

async function getTargets(mediaFilter: string | null, all: boolean): Promise<Target[]> {
  const conditions: string[] = [];
  if (mediaFilter) conditions.push(`m.media_type = '${mediaFilter}'`);
  // Varsayılan: yalnızca hiç çevirisi olmayanlar. Betiği yarıda kesip yeniden
  // başlatmak kaldığı yerden devam etmek anlamına geliyor.
  if (!all) {
    conditions.push(
      'NOT EXISTS (SELECT 1 FROM movie_translations t WHERE t.movie_id = m.id)'
    );
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<{ id: number; tmdb_id: number; media_type: 'movie' | 'tv' }>(
    `SELECT id, tmdb_id, media_type FROM movies m ${where} ORDER BY id`
  );
  return result.rows.map((r) => ({ id: r.id, tmdbId: r.tmdb_id, mediaType: r.media_type }));
}

/** Biriken satırları tek sorguda yazar. */
async function flush(rows: { movieId: number; language: string; title: string }[]) {
  if (rows.length === 0) return;
  await pool.query(
    `INSERT INTO movie_translations (movie_id, language_code, title)
     SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
     ON CONFLICT (movie_id, language_code) DO UPDATE SET title = EXCLUDED.title`,
    [rows.map((r) => r.movieId), rows.map((r) => r.language), rows.map((r) => r.title)]
  );
}

async function main(): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('\n  ❌ TMDB_API_KEY ayarlı değil\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const mediaIndex = args.indexOf('--media');
  const mediaFilter = mediaIndex >= 0 ? args[mediaIndex + 1] : null;
  if (mediaFilter && mediaFilter !== 'movie' && mediaFilter !== 'tv') {
    console.error('\n  ❌ --media yalnızca "movie" veya "tv" olabilir\n');
    process.exit(1);
  }

  const targets = await getTargets(mediaFilter, all);

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                🈯 Muse — başlık çevirileri                           ║
╚══════════════════════════════════════════════════════════════════════╝

  İşlenecek:  ${targets.length} ${mediaFilter ?? 'başlık'}
  Kip:        ${all ? 'hepsini yeniden yaz' : 'yalnızca eksikler'}
`);

  let pending: { movieId: number; language: string; title: string }[] = [];
  const totals = { done: 0, written: 0, empty: 0, errors: 0 };
  const startedAt = Date.now();

  for (const [index, target] of targets.entries()) {
    try {
      await sleep(RATE_LIMIT_DELAY);
      const entries = await fetchTranslations(target);
      const translations = extractTranslations(entries);
      if (translations.length === 0) {
        totals.empty++;
      } else {
        for (const t of translations) {
          pending.push({ movieId: target.id, language: t.language, title: t.title });
        }
        totals.written++;
      }
    } catch {
      totals.errors++;
    }
    totals.done++;

    if (pending.length >= FLUSH_SIZE) {
      await flush(pending);
      pending = [];
    }

    if (totals.done % 50 === 0 || index === targets.length - 1) {
      const rate = totals.done / ((Date.now() - startedAt) / 1000);
      const left = Math.round((targets.length - totals.done) / Math.max(rate, 0.01) / 60);
      process.stdout.write(
        `\r  ${totals.done}/${targets.length}  çevirili ${totals.written}  çevirisiz ${totals.empty}  hata ${totals.errors}  ~${left} dk kaldı   `
      );
    }
  }

  await flush(pending);

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n\n  ✓ bitti — ${totals.written} başlığa çeviri yazıldı (${elapsed} sn)\n`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('\n  ❌', error);
  await pool.end();
  process.exit(1);
});
