import { config } from '../config.js';

/**
 * Uygulamanın konuştuğu diller ve TMDB'deki karşılıkları.
 *
 * TMDB çevirileri **dil + bölge** çiftiyle anahtarlıyor ve aynı dil için
 * birden fazla bölge tutabiliyor — `de-DE` ile `de-AT` ayrı iki kayıt. Hangi
 * bölgenin kullanılacağı burada bir kez seçiliyor.
 */

/**
 * Uygulama dil kodu -> TMDB'deki dil ve bölge kodu.
 *
 * **Anahtarlar `MuseApp.swift`'teki `AppLanguage` ham değerleriyle birebir
 * aynı** ve `movie_translations.language_code`'a olduğu gibi yazılıyor.
 * Uygulama bu kodu `Bundle.preferredLocalizations` üzerinden, yani gerçekten
 * açtığı `.lproj` klasörünün adından üretiyor; iki tarafın ayrışması mümkün
 * değil.
 *
 * Anahtar neden alt etiket değil: Portekizce ve Çince'nin iki hedefi var ve
 * ikisinin de TMDB dil kodu aynı (`pt`, `zh`). Ayrımı yalnızca bölge taşıyor —
 * Brezilya/Portekiz, Basitleştirilmiş/Geleneksel. Tablo alt etiketle
 * anahtarlansaydı bu dört dil ikiye inerdi.
 *
 * `en` yok: temel dil o, ve başlığı zaten `movies.title` sütununda duruyor.
 */
export interface TranslationTarget {
  /** TMDB'nin `iso_639_1` alanı. */
  iso639: string;
  /** TMDB'nin `iso_3166_1` alanı. */
  region: string;
}

export const TRANSLATION_TARGETS: Record<string, TranslationTarget> = {
  de: { iso639: 'de', region: 'DE' },
  es: { iso639: 'es', region: 'ES' },
  fr: { iso639: 'fr', region: 'FR' },
  hi: { iso639: 'hi', region: 'IN' },
  id: { iso639: 'id', region: 'ID' },
  it: { iso639: 'it', region: 'IT' },
  ja: { iso639: 'ja', region: 'JP' },
  ko: { iso639: 'ko', region: 'KR' },
  nl: { iso639: 'nl', region: 'NL' },
  'pt-BR': { iso639: 'pt', region: 'BR' },
  'pt-PT': { iso639: 'pt', region: 'PT' },
  ru: { iso639: 'ru', region: 'RU' },
  sv: { iso639: 'sv', region: 'SE' },
  th: { iso639: 'th', region: 'TH' },
  tr: { iso639: 'tr', region: 'TR' },
  vi: { iso639: 'vi', region: 'VN' },
  'zh-Hans': { iso639: 'zh', region: 'CN' },
  'zh-Hant': { iso639: 'zh', region: 'TW' },
};

/** Tabloda duran bütün dil kodları — seed betiklerinin hedef sorgusu bunu
 *  parametre olarak alıyor. */
export const TRANSLATION_LANGUAGES = Object.keys(TRANSLATION_TARGETS);

/** Büyük/küçük harf duyarsız arama için: küçük harfli kod -> tablodaki kod. */
const CANONICAL = new Map(TRANSLATION_LANGUAGES.map((code) => [code.toLowerCase(), code]));

/**
 * Eski istemciler için takma adlar.
 *
 * Uygulama uzun süre yalnızca alt etiket yolladı (`pt`, `zh`) ve mağazadaki
 * eski sürümler bunu yollamaya devam ediyor. O çağrılar sessizce İngilizceye
 * düşmesin diye, alt etiket eskiden neyi ifade ediyorsa oraya bağlanıyor.
 */
const LEGACY_ALIASES: Record<string, string> = {
  pt: 'pt-BR',
  zh: 'zh-Hans',
};

/**
 * İstemciden gelen dil değerini tablodaki koda indirger.
 *
 * `pt-PT` -> `pt-PT`, `zh-Hant-TW` -> `zh-Hant`, `RU` -> `ru`,
 * `pt` -> `pt-BR` (eski istemci). Tanımadığı her şey için `null` — çağıran
 * taraf İngilizceye düşer.
 *
 * Bu fonksiyon eskiden `split(/[-_]/)[0]` yapıp bölgeyi tamamen atıyordu. O
 * hâliyle `pt-PT` ve `zh-Hant` **hiçbir zaman** eşleşemezdi: ikisi de bir
 * bileşene indirgenip zaten var olan `pt`/`zh` anahtarına düşerdi. Bu yüzden
 * önce iki bileşene, sonra tek bileşene bakılıyor.
 */
export function normalizeLanguage(value: string | undefined | null): string | null {
  if (!value) return null;

  const parts = value.trim().toLowerCase().split(/[-_]/).filter(Boolean);
  if (parts.length === 0) return null;

  // Uzundan kısaya: "zh-hant-tw" -> "zh-hant" -> "zh".
  for (let length = Math.min(parts.length, 2); length >= 1; length -= 1) {
    const candidate = parts.slice(0, length).join('-');
    const canonical = CANONICAL.get(candidate) ?? LEGACY_ALIASES[candidate];
    if (canonical) return canonical;
  }

  return null;
}

/**
 * TMDB'nin `language=` parametresinin beklediği biçim — `zh-Hant` -> `zh-TW`.
 *
 * Bu eşleme eskiden `synopsis.ts` içinde ikinci bir tablo olarak duruyordu ve
 * bayattı: `zh` anahtarı hiç yoktu, o yüzden yedek dal geçersiz bir `zh-ZH`
 * üretiyor ve **Çince kullanıcılar hiç özet alamıyordu**. Tek kaynaktan
 * türetilince o sınıf hatanın tekrarı mümkün değil.
 */
export function tmdbLocale(code: string): string {
  const target = TRANSLATION_TARGETS[code];
  return target ? `${target.iso639}-${target.region}` : 'en-US';
}

// ---------------------------------------------------------------------------
// Tanınırlık kademeleri
// ---------------------------------------------------------------------------

/**
 * Bir başlığın gösterilebilmesi için gereken oy sayısı dile göre değişiyor.
 *
 * Sebebi TMDB'nin oy tabanının ezici çoğunlukla İngilizce konuşması: 200 oy
 * almış bir Türk filmi, kendi izleyicisi içinde 2.000 oy almış İngilizce bir
 * film kadar tanınmış demek. Tek eşik bu yüzden İngilizce olmayan sinemayı
 * orantısız eliyordu.
 *
 * İki kademe bunu yalnızca yarı yarıya çözdü. TMDB'de 150 oyu geçen Türk
 * filmi sayısı **39**; yani ikinci kademe Türkçe için pratikte hiçbir şey
 * açmıyordu. Üçüncü kademe tam olarak bu havuzlar için var: aynı sorguda
 * Türkçe 39'dan 241'e çıkıyor.
 *
 * Kademe 2'nin üyeliği ölçülmüş bir kurala dayanıyor — **TMDB'de ≥150 oylu
 * havuzu 250 başlıktan büyük olan diller**. Ölçümde yalnızca dördü geçti:
 * fr 1.237, it 719, ja 571, es 475. Beşinci sıradaki ko 235 ile eşiğin
 * altında kaldı ve kademe 3'e düştü.
 */
export const TIER_TWO_LANGUAGES = ['fr', 'it', 'ja', 'es'] as const;

/** Kademe 1: tek başına bir dil. */
export const TIER_ONE_LANGUAGE = 'en';

/** SQL'e gömmeye hazır, tırnaklanmış liste — `'fr','it','ja','es'`.
 *  Değerler bu dosyada sabit ve harf dışında karakter içermiyor, o yüzden
 *  parametreleştirilmeden gömülmeleri güvenli. */
export const TIER_TWO_SQL = TIER_TWO_LANGUAGES.map((l) => `'${l}'`).join(',');

/**
 * Bir başlığın gösterilebilmesi için gereken oy sayısı.
 *
 * Seed betikleri bunu bir alt sınır olarak kullanıyor: bir tarama kendi
 * eşiğini yükseltebilir ama bunun altına inemez. Aksi hâlde satır tabloya
 * girer ve hiçbir sorgu onu döndürmez — filmde `movie_countries` ile
 * yaşadığımız ölü veri durumunun aynısı.
 */
export function minVotesForLanguage(language: string, mediaType: 'movie' | 'tv'): number {
  const s = config.selection;
  const isTv = mediaType === 'tv';
  if (language === TIER_ONE_LANGUAGE) {
    return isTv ? s.minVoteCountTv : s.minVoteCount;
  }
  if ((TIER_TWO_LANGUAGES as readonly string[]).includes(language)) {
    return isTv ? s.minVoteCountTvNonEnglish : s.minVoteCountNonEnglish;
  }
  return isTv ? s.minVoteCountTvTierThree : s.minVoteCountTierThree;
}
