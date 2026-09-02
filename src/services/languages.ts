import { config } from '../config.js';

/**
 * Uygulamanın konuştuğu diller ve TMDB'deki karşılıkları.
 *
 * Uygulama dil alt etiketi gönderiyor (`tr`, `pt`, `zh`), TMDB ise çevirileri
 * dil + bölge çiftiyle anahtarlıyor ve aynı dil için birden fazla bölge
 * tutabiliyor — `de-DE` ile `de-AT` ayrı iki kayıt. Hangi bölgenin
 * kullanılacağı burada bir kez seçiliyor.
 */

/** Uygulama dil alt etiketi -> TMDB bölge kodu. `en` yok: temel dil o, ve
 *  başlığı zaten `movies.title` sütununda duruyor. */
export const TRANSLATION_REGIONS: Record<string, string> = {
  tr: 'TR',
  de: 'DE',
  es: 'ES',
  fr: 'FR',
  it: 'IT',
  ja: 'JP',
  // Uygulama Brezilya Portekizcesi ve Basitleştirilmiş Çince taşıyor.
  pt: 'BR',
  zh: 'CN',
};

export const TRANSLATION_LANGUAGES = Object.keys(TRANSLATION_REGIONS);

/** İstemciden gelen dil değerini tablodaki alt etikete indirger.
 *  `pt-BR` -> `pt`, `zh-Hans` -> `zh`, `TR` -> `tr`. Tanımadığı her şey için
 *  `null` — çağıran taraf İngilizceye düşer. */
export function normalizeLanguage(value: string | undefined | null): string | null {
  if (!value) return null;
  const subtag = value.trim().toLowerCase().split(/[-_]/)[0];
  return subtag in TRANSLATION_REGIONS ? subtag : null;
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
