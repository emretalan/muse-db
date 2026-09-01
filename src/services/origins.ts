/**
 * Menşe kovaları — "Hollywood", "Avrupa", "Uzak Doğu" gibi.
 *
 * Tanımlar sunucuda duruyor, uygulamada değil. Sebebi: kütüphane büyüdükçe
 * kova sınırları ayarlanacak ve bunun bir App Store sürümü beklemesi anlamsız.
 * Uygulama yalnızca bir slug gönderiyor (`"europe"`), karşılığını burası
 * biliyor.
 *
 * Kovaların ülkeye dayanmasının sebebi bir hata: uygulamanın eski "Avrupa"
 * seçeneği 14 dilden oluşan bir listeydi ve içinde `pt` ile `es` vardı — yani
 * Brezilya ve Meksika yapımları Avrupa sayılıyordu. Ölçüldüğünde dil bazlı
 * "Avrupa" 587 dizi döndürüyordu, ülke bazlı doğru karşılığı 304.
 */

/** Bir menşe kovasının tanımı. Dil VEYA ülke eşleşmesi yeterli. */
export interface OriginBucket {
  slug: string;
  /** ISO 639-1. Ülke bilgisi eksik kayıtlar için emniyet ağı. */
  languages: string[];
  /** ISO 3166-1 alpha-2. Kovanın asıl ayırıcısı. */
  countries: string[];
  /**
   * Kovanın kendi dili İngilizce mi.
   *
   * `false` olan kovalarda tek başına ülke eşleşmesi **İngilizce** bir başlığı
   * içeri almaya yetmiyor. Sebebi: `production_countries` kültürel kökeni
   * değil finansmanı kaydediyor. Fight Club, Terminator 2 ve Harry Potter
   * Almanya/Fransa ortak yapımı göründükleri için "Avrupa" kovasına
   * düşüyorlardı — 1.053 filmin 356'sı bu türdendi. İngilizce başlıklar zaten
   * `hollywood` ve `britain` kovalarına kendi başlarına ulaşıyor.
   */
  anglophone: boolean;
}

export const ORIGIN_BUCKETS: OriginBucket[] = [
  // Dil listesi bilerek boş: `en` Hollywood'u Britanya'dan ayıramaz.
  {
    slug: 'hollywood',
    languages: [],
    countries: ['US', 'CA'],
    anglophone: true,
  },
  {
    slug: 'britain',
    languages: [],
    countries: ['GB', 'IE'],
    anglophone: true,
  },
  {
    // `es` ve `pt` burada YOK — ikisi de Latin Amerika'yı içeri sızdırır.
    // İspanya ve Portekiz kovaya ülke koduyla giriyor.
    slug: 'europe',
    languages: [
      'fr', 'it', 'de', 'sv', 'da', 'no', 'nl', 'fi', 'pl', 'cs',
      'hu', 'el', 'ro', 'is', 'sr', 'hr', 'uk', 'sk', 'bg', 'et',
      'lv', 'lt', 'sl', 'ca', 'eu', 'gl',
    ],
    countries: [
      'FR', 'IT', 'ES', 'DE', 'BE', 'SE', 'DK', 'NL', 'NO', 'FI',
      'PL', 'CH', 'AT', 'CZ', 'HU', 'GR', 'RO', 'PT', 'IS', 'RS',
      'HR', 'UA', 'SK', 'BG', 'EE', 'LV', 'LT', 'LU', 'SI', 'BA',
    ],
    anglophone: false,
  },
  {
    slug: 'far-east',
    languages: ['ja', 'ko', 'zh', 'cn', 'th', 'vi', 'id', 'tl', 'ms'],
    countries: ['JP', 'KR', 'CN', 'HK', 'TW', 'TH', 'VN', 'ID', 'SG', 'PH', 'MY'],
    anglophone: false,
  },
  {
    slug: 'india',
    languages: ['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'ur'],
    countries: ['IN', 'PK', 'BD', 'LK', 'NP'],
    anglophone: false,
  },
  {
    // İspanyolca burada da yok, aynı sebeple ters yönde: İspanya yapımlarını
    // Latin Amerika'ya taşırdı.
    slug: 'latin-america',
    languages: [],
    countries: [
      'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'VE', 'CU', 'DO',
      'BO', 'EC', 'CR', 'GT', 'PY', 'PA',
    ],
    anglophone: false,
  },
  {
    slug: 'turkiye',
    languages: ['tr'],
    countries: ['TR'],
    anglophone: false,
  },
];

const BUCKETS_BY_SLUG = new Map(ORIGIN_BUCKETS.map((b) => [b.slug, b]));

/**
 * Bir menşe listesini dil ve ülke kodlarına açar.
 *
 * Bilinen bir slug ise kovaya açılır; değilse ISO 639-1 dil kodu sayılır.
 * **Geriye dönük uyumun tamamı bu ayrımda:** yayındaki 1.0.9 menşe olarak
 * `["fr","it","es",…]` gönderiyor, hiçbiri slug değil, hepsi bugünkü gibi dil
 * olarak işleniyor.
 */
export function expandOrigin(values: string[]): {
  languages: string[];
  /** Ülke eşleşmesi tek başına yeterli. */
  countries: string[];
  /** Ülke eşleşmesi yalnızca başlığın dili İngilizce **değilse** yeterli. */
  nonEnglishCountries: string[];
} {
  const languages = new Set<string>();
  const countries = new Set<string>();
  const nonEnglishCountries = new Set<string>();

  for (const value of values) {
    const bucket = BUCKETS_BY_SLUG.get(value);
    if (bucket) {
      bucket.languages.forEach((l) => languages.add(l));
      const target = bucket.anglophone ? countries : nonEnglishCountries;
      bucket.countries.forEach((c) => target.add(c));
    } else {
      languages.add(value);
    }
  }

  return {
    languages: [...languages],
    countries: [...countries],
    nonEnglishCountries: [...nonEnglishCountries],
  };
}
