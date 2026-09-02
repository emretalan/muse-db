/**
 * Bağlantı tablosu yazımlarını biriktirip toplu yazan tampon.
 *
 * Neden var: seed betikleri satır başına altı ardışık sorgu atıyordu — film
 * upsert'i, tür, ülke, anahtar kelime sözlüğü, anahtar kelime bağı ve çeviri.
 * Yerel bir Postgres'te bu önemsiz; Railway'in genel uç noktası üzerinden her
 * sorgu bir gidiş-dönüş demek ve ölçüldüğünde film başına 20 saniyeye çıktı.
 * 13.600 yeni başlık bu hızla günler ederdi.
 *
 * `seed-titles.ts` aynı sorunu 200'lük gruplar hâlinde tek `unnest()` INSERT'i
 * ile çözüp ~13× hızlanmıştı. Burası o desenin beş tabloya genellenmiş hâli:
 * kaç başlık birikirse biriksin, boşaltma **beş sorgu** sürüyor.
 *
 * `movies` upsert'i tampona alınmıyor, çünkü dönen `id`'ye hemen ihtiyaç var —
 * bağlantı satırlarının hepsi onunla anahtarlanıyor.
 */

import { pool } from '../src/db/client.js';

/** Kaç bağlantı satırı biriktikten sonra yazılacağı. Bir başlık ortalama
 *  ~20 bağlantı satırı üretiyor (3 tür + 2 ülke + 13 anahtar kelime +
 *  8 çeviri), yani ~100 başlıkta bir boşaltma. */
const FLUSH_THRESHOLD = 2000;

export class LinkBuffer {
  private genres: [number, number][] = [];
  private countries: [number, string][] = [];
  /** Anahtar kelime sözlüğü paylaşılıyor: aynı "time travel" binlerce filmde
   *  geçiyor. Map, aynı boşaltma içinde tekrarları eliyor. */
  private keywordNames = new Map<number, string>();
  private movieKeywords: [number, number][] = [];
  private translations: [number, string, string][] = [];

  addGenres(movieId: number, genreIds: number[]): void {
    for (const id of genreIds) this.genres.push([movieId, id]);
  }

  addCountries(movieId: number, codes: string[]): void {
    for (const code of codes) this.countries.push([movieId, code]);
  }

  addKeywords(movieId: number, keywords: { id: number; name: string }[]): void {
    for (const k of keywords) {
      this.keywordNames.set(k.id, k.name);
      this.movieKeywords.push([movieId, k.id]);
    }
  }

  addTranslations(movieId: number, items: { language: string; title: string }[]): void {
    for (const t of items) this.translations.push([movieId, t.language, t.title]);
  }

  /** Biriken satır sayısı — çağıran taraf eşiği aşınca boşaltıyor. */
  get size(): number {
    return (
      this.genres.length +
      this.countries.length +
      this.movieKeywords.length +
      this.translations.length
    );
  }

  get shouldFlush(): boolean {
    return this.size >= FLUSH_THRESHOLD;
  }

  /** Birikeni beş sorguda yazar ve tamponu boşaltır. */
  async flush(): Promise<void> {
    if (this.size === 0) return;

    if (this.genres.length > 0) {
      await pool.query(
        `INSERT INTO movie_genres (movie_id, genre_id)
         SELECT * FROM unnest($1::int[], $2::int[])
         ON CONFLICT DO NOTHING`,
        [this.genres.map((g) => g[0]), this.genres.map((g) => g[1])]
      );
    }

    if (this.countries.length > 0) {
      // `countries` tablosunda sınırlı sayıda ülke var; listede olmayan bir
      // kod sessizce düşüyor — bu yüzden JOIN, doğrudan INSERT değil.
      await pool.query(
        `INSERT INTO movie_countries (movie_id, country_code)
         SELECT v.movie_id, c.code
         FROM unnest($1::int[], $2::text[]) AS v(movie_id, code)
         JOIN countries c ON c.code = v.code
         ON CONFLICT DO NOTHING`,
        [this.countries.map((c) => c[0]), this.countries.map((c) => c[1])]
      );
    }

    if (this.keywordNames.size > 0) {
      // Sözlük önce: `movie_keywords` buna yabancı anahtarla bağlı.
      const ids = [...this.keywordNames.keys()];
      await pool.query(
        `INSERT INTO keywords (id, name)
         SELECT * FROM unnest($1::int[], $2::text[])
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [ids, ids.map((id) => this.keywordNames.get(id)!)]
      );
      await pool.query(
        `INSERT INTO movie_keywords (movie_id, keyword_id)
         SELECT * FROM unnest($1::int[], $2::int[])
         ON CONFLICT DO NOTHING`,
        [this.movieKeywords.map((k) => k[0]), this.movieKeywords.map((k) => k[1])]
      );
    }

    if (this.translations.length > 0) {
      await pool.query(
        `INSERT INTO movie_translations (movie_id, language_code, title)
         SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
         ON CONFLICT (movie_id, language_code) DO UPDATE SET title = EXCLUDED.title`,
        [
          this.translations.map((t) => t[0]),
          this.translations.map((t) => t[1]),
          this.translations.map((t) => t[2]),
        ]
      );
    }

    this.genres = [];
    this.countries = [];
    this.keywordNames.clear();
    this.movieKeywords = [];
    this.translations = [];
  }
}
