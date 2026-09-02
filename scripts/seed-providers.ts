/**
 * İzleme sağlayıcılarını doldurur — "bu akşam bunu nerede açabilirim".
 *
 * Kullanım:
 *   npx tsx scripts/seed-providers.ts             # hiç sorulmamışları sor
 *   npx tsx scripts/seed-providers.ts --refresh   # en eski sorulanlardan başla
 *   npx tsx scripts/seed-providers.ts --limit 500 # ilk N başlıkla sınırla
 *
 * ## Neden bu betik diğerlerinden hızlı koşmak zorunda
 *
 * İzleme hakları oynuyor: bu ay Netflix'te olan film gelecek ay Prime'da.
 * Yani kadro ya da anahtar kelimeden farklı olarak bu veri **tazelenmek**
 * zorunda ve bu, envanterdeki tek sürekli maliyet. Kadro betiği başlık
 * başına ~250 ms ile 20.202 satırı 84 dakikada geziyordu; ayda bir tekrar
 * edilecek bir iş için bu uzun. Burada eşzamanlılık var (`CONCURRENCY`) ve
 * tur ~15 dakikaya iniyor.
 *
 * ## Tek çağrı, yirmi dört bölge
 *
 * `watch/providers` bölge bazlı değil: tek yanıt 131 bölgeyi birden taşıyor.
 * Yani bölge sayısını artırmak TMDB tarafında hiçbir şeye mal olmuyor,
 * yalnızca yazdığımız satır sayısını değiştiriyor.
 *
 * ## Tazelemede önce silmek şart
 *
 * Bir başlık bir servisten **çıkabiliyor**. Yalnızca INSERT yapılsaydı
 * katalog zamanla yalnızca büyüyen, hiç küçülmeyen bir "vaktiyle şurada
 * vardı" listesine dönüşürdü. Her grup, yazmadan önce kendi başlıklarının
 * eski satırlarını siliyor.
 */

import { pool } from '../src/db/client.js';
import { config } from '../src/config.js';
import {
  STORED_REGIONS,
  canonicalProviderId,
  isRealService,
} from '../src/services/providers.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/** Aynı anda kaç TMDB isteği. TMDB saniyede ~50 isteğe izin veriyor; sekiz
 *  eşzamanlı istek ~200 ms gecikmeyle saniyede 40 ediyor, yani sınırın
 *  altında ve ona yakın. */
const CONCURRENCY = 8;

/** Kaç başlık biriktikten sonra yazılacağı. Başlık başına ~30 satır düşüyor
 *  (24 bölge × ortalama 1,3 sağlayıcı), yani grup başına ~7.500 satır. */
const BATCH_SIZE = 250;

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

interface TmdbRegion {
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
}

interface Target {
  id: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

interface Link {
  movieId: number;
  region: string;
  providerId: number;
  /** `f` aboneliğe dahil, `a` herkese açık. Kutuların sırasını belirliyor;
   *  filtre ikisini de eşit sayıyor. */
  kind: 'f' | 'a';
}

/** Sözlük: kimlik -> ad ve logo. Aynı sağlayıcı binlerce başlıkta geçiyor,
 *  bu yüzden satır satır değil grup grup yazılıyor.
 *
 *  Koşu boyunca **hiç temizlenmiyor**, ve bu bir savurganlık değil bir
 *  düzeltme: temizlenirken bir yabancı anahtar ihlali çıktı. Sözlük yazımı
 *  ile temizleme arasında bir `await` var, ve o aralıkta başka bir işçi
 *  sözlüğe yeni bir sağlayıcı ekleyebiliyor; temizleme onu da siliyor, ama
 *  işçinin yazdığı bağlantı satırı bir sonraki grupta duruyordu. Sözlük
 *  yüzlerce satır, her grupta yeniden yazmanın maliyeti ölçülemez. */
const dictionary = new Map<number, { name: string; logoPath: string | null }>();

async function fetchProviders(target: Target): Promise<Record<string, TmdbRegion>> {
  const url =
    `${TMDB_BASE_URL}/${target.mediaType}/${target.tmdbId}/watch/providers` +
    `?api_key=${config.tmdbApiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  const data = (await response.json()) as { results?: Record<string, TmdbRegion> };
  return data.results ?? {};
}

/**
 * Bir başlığın bütün bölgelerdeki izleme satırları.
 *
 * `flatrate`, `free` ve `ads` birlikte alınıyor: üçü de "ek ödeme yapmadan
 * açabilirsin" demek ve filtre üçünü eşit sayıyor. Ayrıldıkları tek yer
 * kutuların sırası — gerekçesi migration 015'te. `rent`/`buy` hiç alınmıyor:
 * neredeyse her film kiralanabilir, yani bir filtre olarak hiçbir şey elemiyor.
 */
function extractLinks(movieId: number, results: Record<string, TmdbRegion>): Link[] {
  const links: Link[] = [];
  for (const region of STORED_REGIONS) {
    const entry = results[region];
    if (!entry) continue;

    // Aynı servis hem `flatrate` hem `ads` altında görünebiliyor. Kimlik
    // sadeleştikten sonra tekilleştiriliyor ve abonelik kaydı kazanıyor —
    // sırayı belirleyen o.
    const seen = new Map<number, Link>();
    const groups: [TmdbProvider[] | undefined, 'f' | 'a'][] = [
      [entry.flatrate, 'f'],
      [entry.free, 'a'],
      [entry.ads, 'a'],
    ];

    for (const [list, kind] of groups) {
      for (const provider of list ?? []) {
        if (!isRealService(provider.provider_id, provider.provider_name)) continue;
        const id = canonicalProviderId(provider.provider_id);
        if (seen.has(id)) continue;
        seen.set(id, { movieId, region, providerId: id, kind });

        if (!dictionary.has(id)) {
          dictionary.set(id, {
            name: provider.provider_name,
            logoPath: provider.logo_path ?? null,
          });
        }
      }
    }
    links.push(...seen.values());
  }
  return links;
}

async function flush(movieIds: number[], links: Link[]): Promise<void> {
  if (movieIds.length === 0) return;

  // Sözlük önce: `movie_providers.provider_id` ona referans veriyor.
  if (dictionary.size > 0) {
    const ids = [...dictionary.keys()];
    await pool.query(
      `INSERT INTO providers (id, name, logo_path)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, logo_path = EXCLUDED.logo_path`,
      [ids, ids.map((i) => dictionary.get(i)!.name), ids.map((i) => dictionary.get(i)!.logoPath)]
    );
  }

  // Bir başlık bir servisten çıkmış olabilir; tazeleme ancak silerek doğru.
  await pool.query('DELETE FROM movie_providers WHERE movie_id = ANY($1)', [movieIds]);

  if (links.length > 0) {
    await pool.query(
      `INSERT INTO movie_providers (movie_id, region, provider_id, kind)
       SELECT * FROM unnest($1::int[], $2::char(2)[], $3::int[], $4::char(1)[])
       ON CONFLICT DO NOTHING`,
      [
        links.map((l) => l.movieId),
        links.map((l) => l.region),
        links.map((l) => l.providerId),
        links.map((l) => l.kind),
      ]
    );
  }

  await pool.query(
    'UPDATE movies SET providers_synced_at = NOW() WHERE id = ANY($1)',
    [movieIds]
  );
}

async function getTargets(refresh: boolean, limit: number | null): Promise<Target[]> {
  // Varsayılan: hiç sorulmamışlar — betik yarıda kesilip yeniden
  // başlatılabiliyor. `--refresh` ise en eski sorulanlardan başlıyor, yani
  // yarıda kesilen bir tazeleme turu da kaldığı yerden devam ediyor.
  const where = refresh ? '' : 'WHERE providers_synced_at IS NULL';
  const order = refresh ? 'providers_synced_at NULLS FIRST, id' : 'id';
  const result = await pool.query<{ id: number; tmdb_id: number; media_type: 'movie' | 'tv' }>(
    `SELECT id, tmdb_id, media_type FROM movies ${where} ORDER BY ${order}` +
      (limit ? ` LIMIT ${limit}` : '')
  );
  return result.rows.map((r) => ({ id: r.id, tmdbId: r.tmdb_id, mediaType: r.media_type }));
}

async function main(): Promise<void> {
  if (!config.tmdbApiKey) {
    console.error('\n  ❌ TMDB_API_KEY ayarlı değil\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : null;

  const targets = await getTargets(refresh, limit);

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              📺 Muse — izleme sağlayıcıları                          ║
╚══════════════════════════════════════════════════════════════════════╝

  İşlenecek:  ${targets.length} başlık
  Bölge:      ${STORED_REGIONS.length}
  Kip:        ${refresh ? 'tazeleme (en eskiden başla)' : 'yalnızca hiç sorulmamışlar'}
`);

  const totals = { done: 0, withProviders: 0, empty: 0, errors: 0, links: 0 };
  const startedAt = Date.now();

  let batchIds: number[] = [];
  let batchLinks: Link[] = [];

  // Sabit büyüklükte bir işçi havuzu: `Promise.all` ile 20.202 isteği birden
  // açmak TMDB'yi de belleği de bozardı.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= targets.length) return;
      const target = targets[index];

      try {
        const results = await fetchProviders(target);
        const links = extractLinks(target.id, results);
        if (links.length > 0) totals.withProviders++;
        else totals.empty++;
        totals.links += links.length;

        batchIds.push(target.id);
        batchLinks.push(...links);
      } catch {
        totals.errors++;
        // Hata alan başlık `providers_synced_at` almıyor; bir sonraki tur
        // onu yeniden deniyor.
      }
      totals.done++;

      if (batchIds.length >= BATCH_SIZE) {
        const ids = batchIds;
        const links = batchLinks;
        batchIds = [];
        batchLinks = [];
        await flush(ids, links);

        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = totals.done / elapsed;
        const remaining = Math.round((targets.length - totals.done) / rate / 60);
        console.log(
          `  ${totals.done}/${targets.length}  ` +
            `sağlayıcılı ${totals.withProviders}  boş ${totals.empty}  ` +
            `satır ${totals.links}  hata ${totals.errors}  ` +
            `~${remaining} dk kaldı`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flush(batchIds, batchLinks);

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`
  Bitti — ${minutes} dakika
  Sağlayıcısı olan:  ${totals.withProviders}
  Hiçbir bölgede yok: ${totals.empty}
  Yazılan satır:     ${totals.links}
  Hata:              ${totals.errors}
`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
