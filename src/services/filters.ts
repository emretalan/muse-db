/**
 * Gelen filtre gövdesinin temizlenmesi.
 *
 * `PickFilters` bir **tip**, bir doğrulama değil: uçlar HTTP gövdesini
 * doğrudan o arayüze cast ediyor ve TypeScript ağ üzerinden gelen bir nesne
 * hakkında hiçbir şey garanti etmiyor. Ölçüldü — üretimde beş alan bozuk
 * değerde `/candidates`'ı 500 ile düşürüyordu:
 *
 *   era: "2010s"        -> dönem tablosunda karşılığı yok, destructuring patlıyor
 *   minDuration: "abc"  -> Postgres `smallint` dönüşümü hata veriyor
 *   maxDuration: {…}    -> aynı
 *   maxAge: "x"         -> aynı
 *   genreIds: ["a"]     -> aynı
 *
 * 500, kullanıcıyı törenin ortasında bırakıyor. Bu yüzden tanınmayan değer
 * **düşürülüyor**, istek reddedilmiyor: `origin` ve `networks`
 * zaten yıllardır böyle davranıyor, ve gevşemiş bir filtre çökmüş bir törenden
 * iyidir. Düşen alanlar `dropped` ile geri dönüyor ki uç sunucu günlüğüne
 * yazabilsin — istemci hatası sessizce kaybolmasın.
 *
 * `origin`'in tanınmayan değeri burada **düşmüyor**: orada ham dil kodu kabul
 * edilmesi bilinçli (yayındaki 1.0.9 dil kodu listesi gönderiyor) ve karar
 * `services/origins.ts`'e ait.
 */

import type { Commitment, MediaType, PickFilters, Popularity } from '../types/index.js';
import { ERA_KEYS } from './eras.js';
import { AGE_CEILINGS } from './ratings.js';

/** Metin ya da metin dizisi -> metin dizisi. Metin olmayan öğeler düşüyor;
 *  `normalizeList` dizinin öğelerinde `trim()` çağırdığı için sayı taşıyan bir
 *  dizi oraya kadar gitmemeli. */
function stringList(value: unknown): string[] | string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const list = value.filter((v): v is string => typeof v === 'string');
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

/** Sayı ya da sayı dizisi -> tam sayı dizisi. */
function intList(value: unknown): number[] | undefined {
  const raw = Array.isArray(value) ? value : [value];
  const list = raw.filter((v): v is number => Number.isInteger(v));
  return list.length > 0 ? list : undefined;
}

/** Sonlu, negatif olmayan tam sayı. Süre ve yaş tavanı için. */
function wholeNumber(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

export interface SanitizedFilters {
  filters: PickFilters;
  /** Bozuk olduğu için düşürülen alan adları. Boşsa gövde temizdi. */
  dropped: string[];
}

export function sanitizePickFilters(raw: unknown): SanitizedFilters {
  const dropped: string[] = [];
  const filters: PickFilters = {};

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { filters, dropped };
  }
  const input = raw as Record<string, unknown>;

  /** Alan varsa dönüştür; dönüşüm başarısızsa düşür ve kaydet. */
  const take = <T>(key: string, convert: (v: unknown) => T | undefined): T | undefined => {
    if (input[key] === undefined || input[key] === null) return undefined;
    const value = convert(input[key]);
    if (value === undefined) dropped.push(key);
    return value;
  };

  // Medya türü zaten sorgu katmanında güvenli ("tv" değilse film), ama burada
  // da normalleştiriliyor: `/refine/counts` bu alanı **doğrudan** okuyup
  // yayıncı mı stüdyo mu kutusu döndüreceğine karar veriyor.
  filters.mediaType = take<MediaType>('mediaType', (v) =>
    v === 'movie' || v === 'tv' ? v : undefined
  );

  filters.era = take('era', (v) =>
    typeof v === 'string' && (ERA_KEYS as string[]).includes(v)
      ? (v as PickFilters['era'])
      : undefined
  );

  filters.genreIds = take('genreIds', intList);
  filters.minDuration = take('minDuration', wholeNumber);
  filters.maxDuration = take('maxDuration', wholeNumber);

  filters.maxAge = take('maxAge', (v) =>
    Number.isInteger(v) && (AGE_CEILINGS as readonly number[]).includes(v as number)
      ? (v as number)
      : undefined
  );

  filters.popularity = take<Popularity>('popularity', (v) =>
    v === 'famous' || v === 'hidden' ? v : undefined
  );

  filters.commitment = take<Commitment>('commitment', (v) =>
    v === 'finishable' ? v : undefined
  );

  filters.moods = take('moods', stringList);
  filters.origin = take('origin', stringList);
  filters.originCountries = take('originCountries', stringList);
  filters.networks = take('networks', stringList);
  filters.providers = take('providers', intList);

  // Bölge metin olmalı; hangi bölgelerin tanındığına `normalizeRegion` karar
  // veriyor ve tanımadığında ABD'ye düşüyor, yani burada eleme gerekmiyor.
  filters.region = take('region', (v) => (typeof v === 'string' ? v : undefined));

  return { filters, dropped };
}
