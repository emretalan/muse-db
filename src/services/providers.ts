/**
 * İzleme sağlayıcıları — hangi bölgeleri saklıyoruz, hangi kimlikler aynı
 * servis, hangileri hiç servis değil.
 *
 * Menşe ve yayıncı kovalarının aksine burada **elle kova tanımı yok.** Sebebi
 * ölçek: TMDB'de ABD'de 292, Almanya'da 195 sağlayıcı var ve listeler her ay
 * oynuyor. Yüz kovayı elle yazmak hem bitmeyen bir iş olurdu hem de yanlış
 * iş — kullanıcının gördüğü kutular kataloğun kendisinden çıkarılabiliyor
 * (`getRegionProviders`), yani liste veriyle birlikte büyüyor.
 *
 * Elle yapılan yalnızca iki şey, ve ikisi de ölçülerek gerekti:
 * takma kimlikleri birleştirmek, ve servis olmayanları elemek.
 */

/**
 * Sağlayıcı verisi saklanan bölgeler.
 *
 * Hepsi değil: TMDB başlık başına 131 bölge döndürüyor ve hepsini saklamak
 * satır sayısını beş katına çıkarırdı. Liste uygulamanın App Store
 * vitrinlerinden ve onların dil komşularından kuruldu — Almanca konuşan bir
 * kullanıcı Avusturya'da da olabilir.
 *
 * Büyümesi ucuz: yeni bir bölge eklemek satır sayısını ~%4 artırıyor ve
 * tazeleme turu zaten bütün bölgeleri aynı çağrıdan alıyor.
 */
export const STORED_REGIONS = [
  'TR',                                // Türkçe
  'US', 'GB', 'CA', 'IE', 'AU', 'NZ', 'IN', // İngilizce
  'DE', 'AT', 'CH',                    // Almanca
  'FR', 'BE',                          // Fransızca
  'ES', 'MX', 'AR', 'CL', 'CO',        // İspanyolca
  'IT',                                // İtalyanca
  'JP',                                // Japonca
  'BR', 'PT',                          // Portekizce
  'TW', 'HK',                          // Çince
] as const;

export type StoredRegion = (typeof STORED_REGIONS)[number];

const REGION_SET = new Set<string>(STORED_REGIONS);

/** Saklanmayan bir bölge istenirse buraya düşülüyor. */
export const DEFAULT_REGION = 'US';

/** İstemciden gelen bölge kodunu sakladığımız bir bölgeye indirger. */
export function normalizeRegion(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REGION;
  const code = raw.trim().toUpperCase();
  return REGION_SET.has(code) ? code : DEFAULT_REGION;
}

/**
 * Aynı servisin farklı bölgelerdeki farklı kimlikleri.
 *
 * TMDB'nin sağlayıcı kimlikleri servise değil, servis × bölge kaydına yakın
 * duruyor: Amazon Prime Video ABD ve Almanya'da 9, Türkiye ve Fransa'da 119.
 * Birleştirilmezse aynı kullanıcıya iki "Amazon Prime Video" kutusu çıkıyor ve
 * ikisi de kataloğun yarısını gösteriyor.
 *
 * Sağ taraf hedef kimlik. Yalnızca gerçekten aynı servis olanlar burada —
 * "HBO Max Amazon Channel" HBO Max değil, Amazon üzerinden satılan bir ek
 * paket; o birleştirilmiyor, eleniyor.
 */
const ALIASES: Record<number, number> = {
  119: 9,    // Amazon Prime Video (TR/FR/BR kaydı) -> Amazon Prime Video
  2100: 9,   // Amazon Prime Video with Ads
  613: 9,    // Amazon Prime Video Free with Ads
  384: 1899, // HBO Max (eski ABD kaydı) -> HBO Max
  118: 1899, // HBO Go
  31: 1899,  // HBO Now
  2303: 531, // Paramount Plus Premium -> Paramount Plus
  2616: 531, // Paramount Plus Essential
  2304: 531, // Paramount Plus Basic with Ads
  1968: 283, // Crunchyroll (ikinci kayıt)
  // Aynı aboneliğin ucuz kademesi ayrı bir kayıt olarak geliyor ve
  // birleştirilmezse her bölgede iki "Netflix" kutusu çıkıyordu — ikincisi
  // birincinin neredeyse tamamını taşıyarak.
  1796: 8,   // Netflix Standard with Ads
  175: 8,    // Netflix Kids
  421: 304,  // Joyn Plus -> Joyn
};

export function canonicalProviderId(id: number): number {
  return ALIASES[id] ?? id;
}

/**
 * Servis olmayan kayıtlar.
 *
 * İki tür var. Biri toplayıcı: `JustWatch TV` (2285) bir abonelik değil,
 * JustWatch'un kendi vitrini — her bölgede ilk beşte çıkıyor ve hiçbir şey
 * ifade etmiyor. Diğeri bayi: "HBO Max Amazon Channel", "MGM+ Roku Premium
 * Channel" gibi kayıtlar başka bir servisin içinden satılan ek paketler.
 * Elenmezlerse ABD'de tek bir film için "HBO Max" beş ayrı kutuda görünüyor.
 */
const EXCLUDED_IDS = new Set([
  2285, // JustWatch TV — toplayıcı, abonelik değil
  2284, // HBO Max on U-Next — U-NEXT içinden satılan paket, ayrı bir servis değil
]);
const EXCLUDED_NAME = /(Amazon Channel|Apple TV Channel|Roku Premium Channel|Channel$)/i;

export function isRealService(id: number, name: string): boolean {
  return !EXCLUDED_IDS.has(id) && !EXCLUDED_NAME.test(name);
}
