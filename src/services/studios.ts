/**
 * Stüdyo kovaları — filmlere özel.
 *
 * `movies.companies` TMDB'nin ham `production_companies` adlarını taşıyor ve
 * yayıncılarla aynı sebepten ham hâliyle bir filtre olamaz. Kataloğun en sık
 * geçen adları ölçüldü: Universal (413), Warner Bros. (401), Paramount (345),
 * Columbia (336) — ve hemen ardından France 2 Cinéma (218), TF1 Films
 * Production (175), France 3 Cinéma (161), ARTE France Cinéma (148), Film i
 * Väst (131). Sondakiler Avrupa yayıncılarının ortak finansman kolları;
 * sübvansiyon yapısı yüzünden yüzlerce filmde görünüyorlar ve kimse
 * "France 2 Cinéma filmi izlemek istiyorum" demiyor.
 *
 * ## Neden büyük dağıtımcılar kova değil
 *
 * Universal ve Warner, sayıca en kalabalık adlar olmalarına rağmen listede
 * yok — ve bu, `networks.ts`'in Netflix'i kova yapmasıyla çelişmiyor. Bir
 * televizyon kanalı küratöryel bir kimlik taşıyor: "HBO dizisi" bir beklenti.
 * Büyük bir film dağıtımcısı taşımıyor; Universal aynı yıl *Nope*'u da
 * *Minions*'ı da dağıtıyor. Kova olmayı hak eden ad, kullanıcının bir söz
 * olarak duyduğu ad: Blumhouse korku, Marvel kostüm, A24 bağımsız.
 *
 * ## Neden animasyon evleri kova değil
 *
 * Pixar (31), Studio Ghibli (26), Illumination (17), Laika (6), Aardman (10)
 * ayrı kutular olabilirdi. Olmadılar: bu stüdyoların kütüphanedeki 156
 * filminin **154'ü** zaten Animasyon türü taşıyor. Var olan bir tür çipinin
 * içini bölmek için sekiz kutuluk bir bölümde beş yer harcamak, listedeki
 * gerçekten ayrı sorulara yer bırakmıyordu. Karşı görüş kayda değer —
 * "Ghibli" bir tür değil bir imza — ve kovalar burada yaşadığı için bu karar
 * bir App Store sürümü beklemeden geri alınabilir.
 *
 * Kovaların yaşadığı yer yayıncı ve menşe kovalarıyla aynı gerekçeyle sunucu:
 * kütüphane büyüdükçe sınırlar oynayacak ve bunun bir App Store sürümü
 * beklemesi anlamsız.
 */

export interface StudioBucket {
  slug: string;
  /** Kutunun üstündeki yazı. `NetworkBucket.label` ile aynı sözleşme:
   *  marka adları çevrilmiyor, çevrilebilir olan tek kovayı (`indie`)
   *  istemci kendi kataloğundan karşılıyor ve tanımadığı slug'da buraya
   *  düşüyor. */
  label: string;
  /** `movies.companies` içinde birebir aranan adlar. TMDB aynı stüdyoyu
   *  yıllara ve kollara göre farklı adlarla kaydediyor (Fox Searchlight ->
   *  Searchlight; Walt Disney Feature Animation -> Walt Disney Animation
   *  Studios), o yüzden liste.
   *
   *  Birebir eşleşme şart, `LIKE` değil: "Marvel" araması *Marvelous
   *  Productions*'ı, "Neon" araması Fransız *Neon Productions*'ı yakalıyor. */
  names: string[];
}

/** Kutuların yanındaki sayılar üretim veritabanından, 7 Eylül 2026. */
export const STUDIO_BUCKETS: StudioBucket[] = [
  {
    // Bağımsız prestij etiketleri. Tek tek kutu olacak kadar derin değiller
    // (en büyüğü Focus Features, 71) ama hepsi aynı sözü veriyor: büyük
    // stüdyonun yapmayacağı film. A24 bu listede **yok**, kendi kutusu var —
    // bir kutunun diğerinin tam üst kümesi olması, iki kutuyu da anlamsız
    // kılardı. 276 film.
    slug: 'indie', label: 'Indie labels',
    names: [
      'NEON', 'Neon', 'Annapurna Pictures', 'Focus Features',
      'Searchlight Pictures', 'Fox Searchlight Pictures', 'Sony Pictures Classics',
      'IFC Films', 'IFC FIlms', 'IFC Midnight', 'IFC Productions',
      'Magnolia Pictures', 'Miramax',
    ],
  },
  {
    // 247 film. Tür çipiyle kısmen örtüşüyor ama örtüşme kısmi: kovanın
    // yarıdan azı Animasyon, geri kalanı *Karayip Korsanları* ve *Mary
    // Poppins*.
    slug: 'disney', label: 'Disney',
    names: [
      'Walt Disney Pictures', 'Walt Disney Productions',
      'Walt Disney Animation Studios', 'Walt Disney Feature Animation',
      'DisneyToon Studios', 'Walt Disney Japan',
      'Disney Channel', 'Disney Television Animation',
    ],
  },
  {
    slug: 'dreamworks', label: 'DreamWorks',
    names: ['DreamWorks Pictures', 'DreamWorks Animation', 'DreamWorks', 'DreamWorks SKG'],
  },
  {
    // Japon sinemasının tek başına bir kova taşıyan tek stüdyosu (89 film).
    // Menşe ekranındaki "Japonya" ile örtüşüyor ama onun alt kümesi değil:
    // menşe bütün Japon filmlerini, bu kova Godzilla'yı ve Kurosawa'yı
    // getiriyor.
    slug: 'toho', label: 'TOHO',
    names: ['TOHO', 'Toho Pictures', 'TOHO-TOWA', 'Toho Company, Ltd.'],
  },
  {
    slug: 'blumhouse', label: 'Blumhouse',
    names: ['Blumhouse Productions', 'Blumhouse Television'],
  },
  {
    slug: 'marvel', label: 'Marvel',
    names: ['Marvel Studios', 'Marvel Entertainment', 'Marvel Enterprises'],
  },
  { slug: 'a24', label: 'A24', names: ['A24'] },
  {
    // 25 film — kovaların en küçüğü ama görünürlük eşiğinin (8) üç katı, ve
    // aradığı şey tek bir sözcükle söylenebiliyor: *Star Wars* ve
    // *Indiana Jones*.
    slug: 'lucasfilm', label: 'Lucasfilm',
    names: ['Lucasfilm Ltd.', 'Lucasfilm Animation', 'Lucasfilm'],
  },
];

const BY_SLUG = new Map(STUDIO_BUCKETS.map((b) => [b.slug, b]));

/**
 * Slug listesini şirket adlarına açar.
 *
 * Tanınmayan slug **düşürülüyor**, `expandNetworks` ile aynı gerekçeyle:
 * şirket adları serbest metin ve tanınmayan bir slug'ı şirket adı saymak,
 * kullanıcının gördüğü kutuyla sorgunun ilgisini koparırdı.
 */
export function expandStudios(slugs: string[]): string[] {
  const names = new Set<string>();
  for (const slug of slugs) {
    const bucket = BY_SLUG.get(slug.trim().toLowerCase());
    if (bucket) for (const name of bucket.names) names.add(name);
  }
  return [...names];
}
