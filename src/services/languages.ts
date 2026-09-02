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
