/**
 * Oyuncu kadrosunu ve seri/üçleme bilgisini doldurur — film ve dizi.
 *
 * Kullanım:
 *   npx tsx scripts/seed-cast.ts              # eksik olanları tamamla
 *   npx tsx scripts/seed-cast.ts --all        # hepsini yeniden yaz
 *   npx tsx scripts/seed-cast.ts --media tv   # yalnızca diziler
 *
 * `seed-titles.ts` deseni: satır başına sıfır veritabanı sorgusu, yazımlar
 * gruplar hâlinde. Tam tazeleme (`seed-movies.ts --refresh`) da aynı veriyi
 * getirirdi ama satır başına altı sorgu atıyor ve zaten doğru olan altı sütunu
 * yeniden yazıyor.
 *
 * Filmde tek çağrı hem kadroyu hem seriyi getiriyor (`append_to_response`).
 * Dizide seri kavramı yok — bir dizi zaten kendisi bir seri — o yüzden yalnızca
 * `/credits` çağrılıyor ve yanıt belirgin şekilde küçük.
 */

import { pool } from '../src/db/client.js';
import { config } from '../src/config.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RATE_LIMIT_DELAY = 50;
/** Kaç kadro satırı biriktikten sonra yazılacağı. Başlık başına en fazla
 *  `CAST_LIMIT` satır düşüyor. */
const FLUSH_SIZE = 500;

/** Karakter adının ekranda duracağı en fazla uzunluk.
 *
 *  TMDB kimi kaydı toplu rol listesiyle dolduruyor ("Himself / Narrator /
 *  Various Roles / …") ve böyle bir değer 72 pt genişliğindeki bir kartta
 *  zaten okunmuyor. Şema tarafında da `text`e geçildi, yani bu kırpma bir
 *  koruma değil bir görgü kuralı — koruma migration 012'de. */
const CHARACTER_MAX = 120;

/** Detay ekranında kaç isim duracak.
 *
 *  TMDB kadroyu yüzlerce kişiyle döndürüyor; sekizinci isimden sonrası bir
 *  film ekranında bilgi değil gürültü. Sınır burada çünkü depolamanın kendisi
 *  de bedava değil: 20.202 başlık × 8 = ~160 bin satır. */
const CAST_LIMIT = 8;

interface TmdbCastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

interface TmdbCollection {
  id: number;
  name: string;
  poster_path?: string | null;
}

interface Target {
  id: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchFrom<T>(path: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${TMDB_BASE_URL}${path}${separator}api_key=${config.tmdbApiKey}`);
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  return (await response.json()) as T;
}

async function fetchDetails(target: Target): Promise<{
  cast: TmdbCastMember[];
  collection: TmdbCollection | null;
}> {
  if (target.mediaType === 'tv') {
    const data = await fetchFrom<{ cast?: TmdbCastMember[] }>(`/tv/${target.tmdbId}/credits`);
    return { cast: data.cast ?? [], collection: null };
  }
  const data = await fetchFrom<{
    credits?: { cast?: TmdbCastMember[] };
    belongs_to_collection?: TmdbCollection | null;
  }>(`/movie/${target.tmdbId}?append_to_response=credits`);
  return {
    cast: data.credits?.cast ?? [],
    collection: data.belongs_to_collection ?? null,
  };
}

/** TMDB `order` alanını her zaman göndermiyor; dizideki konum yedek sıra. */
function topCast(cast: TmdbCastMember[]): TmdbCastMember[] {
  return [...cast]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, CAST_LIMIT);
}

async function getTargets(mediaFilter: string | null, all: boolean): Promise<Target[]> {
  const conditions: string[] = [];
  if (mediaFilter) conditions.push(`m.media_type = '${mediaFilter}'`);
  // Varsayılan: kadrosu hiç yazılmamışlar. Betiği yarıda kesip yeniden
  // başlatmak kaldığı yerden devam etmek anlamına geliyor.
  if (!all) {
    conditions.push('NOT EXISTS (SELECT 1 FROM movie_cast c WHERE c.movie_id = m.id)');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<{ id: number; tmdb_id: number; media_type: 'movie' | 'tv' }>(
    `SELECT id, tmdb_id, media_type FROM movies m ${where} ORDER BY id`
  );
  return result.rows.map((r) => ({ id: r.id, tmdbId: r.tmdb_id, mediaType: r.media_type }));
}

interface CastRow {
  movieId: number;
  ord: number;
  personId: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}

interface CollectionRow {
  movieId: number;
  id: number;
  name: string;
  posterPath: string | null;
}

async function flush(cast: CastRow[], collections: CollectionRow[]): Promise<void> {
  if (cast.length > 0) {
    await pool.query(
      `INSERT INTO movie_cast (movie_id, ord, person_id, name, character, profile_path)
       SELECT * FROM unnest($1::int[], $2::smallint[], $3::int[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (movie_id, ord) DO UPDATE SET
         person_id    = EXCLUDED.person_id,
         name         = EXCLUDED.name,
         character    = EXCLUDED.character,
         profile_path = EXCLUDED.profile_path`,
      [
        cast.map((c) => c.movieId),
        cast.map((c) => c.ord),
        cast.map((c) => c.personId),
        cast.map((c) => c.name),
        cast.map((c) => c.character),
        cast.map((c) => c.profilePath),
      ]
    );
  }

  if (collections.length > 0) {
    await pool.query(
      `UPDATE movies m SET
         collection_id          = v.id,
         collection_name        = v.name,
         collection_poster_path = v.poster
       FROM unnest($1::int[], $2::int[], $3::text[], $4::text[]) AS v(movie_id, id, name, poster)
       WHERE m.id = v.movie_id`,
      [
        collections.map((c) => c.movieId),
        collections.map((c) => c.id),
        collections.map((c) => c.name),
        collections.map((c) => c.posterPath),
      ]
    );
  }
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
║              🎭 Muse — kadro ve seri bilgisi                         ║
╚══════════════════════════════════════════════════════════════════════╝

  İşlenecek:  ${targets.length} ${mediaFilter ?? 'başlık'}
  Kip:        ${all ? 'hepsini yeniden yaz' : 'yalnızca eksikler'}
`);

  let castBuffer: CastRow[] = [];
  let collectionBuffer: CollectionRow[] = [];
  const totals = { done: 0, withCast: 0, withCollection: 0, empty: 0, errors: 0 };
  const startedAt = Date.now();

  for (const [index, target] of targets.entries()) {
    try {
      await sleep(RATE_LIMIT_DELAY);
      const { cast, collection } = await fetchDetails(target);

      const top = topCast(cast);
      if (top.length > 0) {
        totals.withCast++;
        top.forEach((person, ord) => {
          castBuffer.push({
            movieId: target.id,
            ord,
            personId: person.id,
            name: person.name,
            character: person.character?.trim().slice(0, CHARACTER_MAX) || null,
            profilePath: person.profile_path ?? null,
          });
        });
      } else {
        totals.empty++;
      }

      if (collection) {
        totals.withCollection++;
        collectionBuffer.push({
          movieId: target.id,
          id: collection.id,
          name: collection.name,
          posterPath: collection.poster_path ?? null,
        });
      }
    } catch {
      totals.errors++;
    }
    totals.done++;

    if (castBuffer.length >= FLUSH_SIZE) {
      await flush(castBuffer, collectionBuffer);
      castBuffer = [];
      collectionBuffer = [];
    }

    if (totals.done % 50 === 0 || index === targets.length - 1) {
      const rate = totals.done / ((Date.now() - startedAt) / 1000);
      const left = Math.round((targets.length - totals.done) / Math.max(rate, 0.01) / 60);
      process.stdout.write(
        `\r  ${totals.done}/${targets.length}  kadrolu ${totals.withCast}  serili ${totals.withCollection}  kadrosuz ${totals.empty}  hata ${totals.errors}  ~${left} dk kaldı   `
      );
    }
  }

  await flush(castBuffer, collectionBuffer);

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `\n\n  ✓ bitti — ${totals.withCast} başlığa kadro, ${totals.withCollection} filme seri yazıldı (${elapsed} sn)\n`
  );
  await pool.end();
}

main().catch(async (error) => {
  console.error('\n  ❌', error);
  await pool.end();
  process.exit(1);
});
