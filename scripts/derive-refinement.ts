/**
 * `movies.age_rating` ve `movies.moods` sütunlarını elimizdeki veriden türetir.
 *
 * Hiç TMDB isteği yapmıyor — girdisi zaten tabloda olan `certification`,
 * `movie_genres` ve `movie_keywords`. Bu yüzden kurallar değiştiğinde
 * (moods.ts ya da ratings.ts) betiği yeniden koşturmak dakikalar sürüyor ve
 * hiçbir kota harcamıyor.
 *
 * Yeniden koşturulabilir: her iki sütun da baştan hesaplanıp yazılıyor, yani
 * bir kural gevşerse eski değer üzerinde kalmıyor.
 *
 *   npx tsx scripts/derive-refinement.ts
 *   npx tsx scripts/derive-refinement.ts --dry   (yazmadan sayar)
 */

import { pool } from '../src/db/client.js';
import { certificationToAge } from '../src/services/ratings.js';
import { moodsFor, MOOD_SLUGS } from '../src/services/moods.js';

const DRY = process.argv.includes('--dry');

/** Tek seferde yazılan satır sayısı. `unnest` ile tek sorguya giriyorlar;
 *  5.000'de sorgu metni değil parametre dizisi büyüyor, ve orada bir sınır yok. */
const BATCH = 5000;

async function deriveAgeRatings(): Promise<void> {
  // Katalogda 60'tan fazla farklı sertifika dizesi var ama satır sayısı
  // 20.000. Her satır için ayrı UPDATE yerine **farklı değer başına** bir
  // eşleme kurulup tek sorguda uygulanıyor.
  const distinct = await pool.query<{ certification: string }>(
    `SELECT DISTINCT certification FROM movies
      WHERE certification IS NOT NULL AND certification <> ''`
  );

  const mapped: { cert: string; age: number }[] = [];
  const unknown: string[] = [];
  for (const row of distinct.rows) {
    const age = certificationToAge(row.certification);
    if (age === null) unknown.push(row.certification);
    else mapped.push({ cert: row.certification, age });
  }

  console.log(
    `  ${distinct.rows.length} farklı sertifika: ${mapped.length} çevrildi, ${unknown.length} tanınmadı`
  );
  if (unknown.length > 0) {
    console.log(`  tanınmayanlar: ${unknown.slice(0, 30).join(', ')}`);
  }

  if (DRY) return;

  // Önce hepsi sıfırlanıyor: bir dize artık tanınmıyorsa (kural değiştiyse)
  // eski değeri üzerinde kalmamalı.
  await pool.query('UPDATE movies SET age_rating = NULL WHERE age_rating IS NOT NULL');

  const result = await pool.query(
    `UPDATE movies m SET age_rating = v.age
       FROM (SELECT unnest($1::text[]) AS cert, unnest($2::smallint[]) AS age) v
      WHERE m.certification = v.cert`,
    [mapped.map((m) => m.cert), mapped.map((m) => m.age)]
  );
  console.log(`  ${result.rowCount} satıra yaş yazıldı`);
}

async function deriveMoods(): Promise<void> {
  // Tür ve anahtar kelime kimlikleri satır başına tek dizi hâlinde geliyor;
  // 177.641 bağlantı satırını tek tek okumak yerine veritabanı topluyor.
  const result = await pool.query<{
    id: number;
    genre_ids: number[] | null;
    keyword_ids: number[] | null;
  }>(
    `SELECT m.id,
            (SELECT array_agg(mg.genre_id)   FROM movie_genres   mg WHERE mg.movie_id = m.id) AS genre_ids,
            (SELECT array_agg(mk.keyword_id) FROM movie_keywords mk WHERE mk.movie_id = m.id) AS keyword_ids
       FROM movies m`
  );

  const ids: number[] = [];
  const moods: string[][] = [];
  const tally = new Map<string, number>(MOOD_SLUGS.map((s) => [s, 0]));
  let none = 0;

  for (const row of result.rows) {
    const list = moodsFor(row.genre_ids ?? [], row.keyword_ids ?? []);
    ids.push(row.id);
    moods.push(list);
    if (list.length === 0) none++;
    for (const slug of list) tally.set(slug, (tally.get(slug) ?? 0) + 1);
  }

  console.log(`  ${result.rows.length} başlık işlendi, ${none} tanesi hiçbir ruh hâline girmedi`);
  for (const [slug, count] of tally) console.log(`    ${slug.padEnd(12)} ${count}`);

  if (DRY) return;

  for (let i = 0; i < ids.length; i += BATCH) {
    const idChunk = ids.slice(i, i + BATCH);
    const moodChunk = moods.slice(i, i + BATCH);
    // `text[][]` bir dizinin dizisi olarak geçirilemiyor (Postgres çok boyutlu
    // dizilerde her satırın aynı uzunlukta olmasını istiyor), o yüzden
    // ruh hâlleri virgülle birleştirilip sorguda `string_to_array` ile
    // açılıyor. Boş dize boş diziye dönüşsün diye NULLIF var.
    await pool.query(
      `UPDATE movies m SET moods = COALESCE(string_to_array(NULLIF(v.csv, ''), ','), '{}')
         FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS csv) v
        WHERE m.id = v.id`,
      [idChunk, moodChunk.map((m) => m.join(','))]
    );
    console.log(`  ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }
}

async function main(): Promise<void> {
  console.log(DRY ? 'Kuru koşu — hiçbir şey yazılmayacak.\n' : '');
  console.log('Yaş sınırları:');
  await deriveAgeRatings();
  console.log('\nRuh hâlleri:');
  await deriveMoods();
  await pool.end();
  console.log('\nBitti.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
