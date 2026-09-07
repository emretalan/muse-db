/**
 * Dönem kovaları.
 *
 * Menşe, ruh hâli, yaş ve stüdyo kovaları gibi burada yaşıyor: kova ailesi
 * `src/services/` altında, sorgu katmanı onu import ediyor. Ters yön yok, ve
 * bu sayede girdi temizleyicisi (`services/filters.ts`) de aynı tabloyu
 * `db/queries.ts`'e bağımlı kalmadan okuyabiliyor.
 */

import type { Era } from '../types/index.js';

/** Bütün dönemler. Sayım sorgusu hepsini birden istiyor; ayrıca gelen bir
 *  `era` değerinin tanınıp tanınmadığı buradan bakılıyor. */
export const ERA_KEYS: Era[] = [
  'pre-1980',
  '1980-1989',
  '1990-1999',
  '2000-2009',
  '2010-2019',
  '2020-now',
];

const RANGES: Record<Era, { start: number; end: number | null }> = {
  // Open-ended at the bottom: the library goes back to the 1940s.
  'pre-1980': { start: 0, end: 1979 },
  '1980-1989': { start: 1980, end: 1989 },
  '1990-1999': { start: 1990, end: 1999 },
  '2000-2009': { start: 2000, end: 2009 },
  '2010-2019': { start: 2010, end: 2019 },
  '2020-now': { start: 2020, end: null },
};

/**
 * Dönem slug'ının yıl aralığı; tanınmayan değerde `null`.
 *
 * Dönüş tipindeki `null` bilerek: tip imzası `Era` diyor ama gövde HTTP
 * gövdesinden geliyor ve orada her şey olabilir. Eskiden `ranges[era]`
 * doğrudan destructure ediliyordu ve `era: "2010s"` gönderen bir istek
 * `/candidates`'ı 500 ile düşürüyordu — kullanıcıyı törenin ortasında bırakan
 * bir çökme. Toplam bir fonksiyon, çağıranın koşulu hiç kurmamasını sağlıyor.
 */
export function eraToYearRange(era: Era): { start: number; end: number | null } | null {
  return RANGES[era] ?? null;
}

/**
 * Bir yılın hangi döneme düştüğü — `eraToYearRange`'in tersi.
 *
 * Aralıklar tek yerde dursun diye burada: profil ekranı "seksenlere hep evet
 * diyorsun" derken törenin dönem kutularıyla aynı sınırları kullanmak zorunda,
 * yoksa kullanıcı o kutuyu seçtiğinde başka bir liste görüyor.
 */
export function eraForYear(year: number | null): Era | null {
  if (year === null || !Number.isFinite(year)) return null;
  if (year <= 1979) return 'pre-1980';
  if (year <= 1989) return '1980-1989';
  if (year <= 1999) return '1990-1999';
  if (year <= 2009) return '2000-2009';
  if (year <= 2019) return '2010-2019';
  return '2020-now';
}
