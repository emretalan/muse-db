/**
 * Yayıncı kovaları — dizilere özel.
 *
 * `movies.networks` TMDB'nin ham kanal adlarını taşıyor ve ham hâliyle bir
 * filtre olamaz: kataloğun en kalabalık kanalları Tokyo MX (304), AT-X (192),
 * BS11 (137) — Japon anime yayın kanalları. Kimse "Tokyo MX dizisi izlemek
 * istiyorum" demiyor.
 *
 * Bu yüzden kovalar **platform** ekseninde: Netflix, HBO, Disney+. Kullanıcının
 * tanıdığı ve gerçekten bir beklenti taşıyan ad bu.
 *
 * ## Neden bölgesel kova yok
 *
 * Kore kanalları (tvN, SBS, JTBC) ya da Türkiye kanalları (Kanal D, Show TV)
 * için de kova açılabilirdi. Açılmadı, çünkü menşe ekranı aynı soruyu zaten
 * soruyor ve daha doğru soruyor: "Kore dizisi" demek tvN + SBS + MBC + KBS +
 * JTBC + Netflix'in Kore yapımları demek. Kanal listesi o sorunun eksik bir
 * kopyası olurdu.
 *
 * Kovaların yaşadığı yer menşe kovalarıyla aynı gerekçeyle sunucu: kütüphane
 * büyüdükçe sınırlar oynayacak ve bunun bir App Store sürümü beklemesi
 * anlamsız.
 */

export interface NetworkBucket {
  slug: string;
  /** `movies.networks` içinde birebir aranan adlar. TMDB aynı yayıncıyı
   *  yıllara göre farklı adlarla kaydediyor (HBO Max -> Max), o yüzden liste. */
  names: string[];
}

export const NETWORK_BUCKETS: NetworkBucket[] = [
  { slug: 'netflix', names: ['Netflix'] },
  {
    slug: 'prime',
    names: ['Prime Video', 'Amazon Prime Video', 'Amazon', 'Amazon Freevee'],
  },
  {
    slug: 'disney',
    names: ['Disney+', 'Disney Channel', 'Disney XD', 'Disney+ Hotstar', 'Disney Junior'],
  },
  {
    // Aynı yayıncının üç adı: HBO, HBO Max, Max. Ayrı kutular olsalardı
    // "Game of Thrones nerede" sorusu üç yere bakmayı gerektirirdi.
    slug: 'hbo',
    names: ['HBO', 'HBO Max', 'Max', 'HBO Europe', 'HBO España', 'Cinemax'],
  },
  { slug: 'appletv', names: ['Apple TV', 'Apple TV+'] },
  { slug: 'hulu', names: ['Hulu', 'Hulu Japan'] },
  {
    // ABD'nin ulusal kanalları ve kablo ağları. Tek tek kutulara bölünecek
    // kadar derin değiller (en kalabalığı NBC, 124 dizi) ama toplandıklarında
    // kataloğun en büyük ikinci yayıncı kümesi.
    slug: 'usnetworks',
    names: [
      'NBC', 'ABC', 'CBS', 'FOX', 'The CW', 'The WB', 'UPN',
      'AMC', 'AMC+', 'FX', 'FXX', 'USA Network', 'TNT', 'TBS',
      'Showtime', 'STARZ', 'Syfy', 'Paramount+', 'Paramount Network',
      'Peacock', 'Comedy Central', 'MTV', 'Adult Swim', 'Cartoon Network',
      'Nickelodeon', 'PBS', 'A&E', 'History', 'Discovery', 'Discovery+',
      'National Geographic', 'Bravo', 'Lifetime', 'truTV', 'Epix', 'CBS All Access',
    ],
  },
  {
    slug: 'britain',
    names: [
      'BBC One', 'BBC Two', 'BBC Three', 'BBC Four', 'BBC America', 'BBC',
      'ITV', 'ITV1', 'ITV2', 'ITVX', 'Channel 4', 'Channel 5', 'E4', 'More4',
      'Sky One', 'Sky Atlantic', 'Sky Max', 'Sky Comedy', 'BritBox',
    ],
  },
];

const BY_SLUG = new Map(NETWORK_BUCKETS.map((b) => [b.slug, b]));

/**
 * Slug listesini kanal adlarına açar.
 *
 * Tanınmayan slug **düşürülüyor**, menşedeki gibi ham değer sayılmıyor: kanal
 * adları serbest metin ve tanınmayan bir slug'ı kanal adı saymak, kullanıcının
 * gördüğü kutuyla sorgunun ilgisini koparırdı.
 */
export function expandNetworks(slugs: string[]): string[] {
  const names = new Set<string>();
  for (const slug of slugs) {
    const bucket = BY_SLUG.get(slug.trim().toLowerCase());
    if (bucket) for (const name of bucket.names) names.add(name);
  }
  return [...names];
}
