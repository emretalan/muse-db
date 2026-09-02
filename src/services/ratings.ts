/**
 * Yaş sınırı — 60'tan fazla ülke şemasını tek bir sayıya indirir.
 *
 * `movies.certification` TMDB'nin verdiği ham dize: önce ABD, yoksa Birleşik
 * Krallık, yoksa yanıtta ne varsa. Sonuç kataloğumuzda 60'tan fazla farklı
 * değer — `R`, `12A`, `TV-MA`, `IIB`, `น 18+`, `MA 15+`. Bunların üzerinde
 * doğrudan filtre kurulamaz: kullanıcıya "IIB mi istersiniz" diye sorulmuyor.
 *
 * Bu yüzden her dize **asgari yaşa** çevriliyor ve filtre onun üzerinde
 * çalışıyor. Çeviri kayıplı: ABD'nin PG'si ile Almanya'nın 6'sı aynı şey
 * değil. Ama sorulan soru da o kadar hassas değil — "çocukla izlenir mi".
 *
 * ## Belirsiz harfler
 *
 * Aynı harf iki ülkede iki şey demek olabiliyor ve tabloda dizenin hangi
 * ülkeden geldiği yazmıyor. `A` Hindistan'da yetişkin, `AA` Kanada'da 14,
 * `T` İtalya'da herkes. Karar kuralı: **belirsizse yukarı yuvarla.** Yanlış
 * yönde hata yapmak, çocuk moduna yetişkin bir film sokmak demek olurdu.
 *
 * ## Bilinmeyen
 *
 * Değeri tanımayan ya da hiç sınıflandırılmamış (`NR`, boş) başlıklarda
 * `age_rating` NULL kalıyor ve **bir sınır seçildiğinde eleniyorlar.** Bu da
 * aynı yönde bir tercih: "çocukla izlenir" diyen kişiye "bilmiyoruz"
 * göndermek, sorunun cevabı değil.
 */

/** Ham sertifika dizesi -> asgari yaş. Tanınmayan değer null. */
export function certificationToAge(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (value.length === 0) return null;

  // Sınıflandırılmamış: bilgi yok, sıfır değil.
  if (['NR', 'UNRATED', 'UR', 'NOT RATED', 'NC', 'TBC', 'TBA'].includes(value)) return null;

  const table: Record<string, number> = {
    // ABD — sinema
    G: 0, PG: 8, 'PG-13': 13, R: 17, 'NC-17': 18, X: 18,
    // ABD — televizyon
    'TV-Y': 0, 'TV-Y7': 7, 'TV-G': 0, 'TV-PG': 8, 'TV-14': 14, 'TV-MA': 17,
    // Birleşik Krallık
    U: 0, UC: 0, '12A': 12, '15A': 15, R18: 18,
    // Avustralya / Yeni Zelanda
    M: 15, 'MA15+': 15, 'MA 15+': 15, 'R18+': 18, 'X18+': 18, RP13: 13, RP16: 16,
    // Kanada
    '14A': 14, '18A': 18, AA: 14, E: 0,
    // İspanya / Latin Amerika
    TP: 0, APTA: 0, ATP: 0, 'A/APTA': 0,
    // Hollanda / Belçika
    AL: 0,
    // Brezilya
    L: 0, LIVRE: 0,
    // İtalya
    T: 0, VM14: 14, VM18: 18,
    // Hindistan — `A` yetişkin demek; `UA` 12.
    UA: 12, 'U/A': 12, S: 18, A: 18,
    // Hong Kong
    I: 0, IIA: 12, IIB: 16, III: 18,
    // Singapur
    PG13: 13, NC16: 16, M18: 18, R21: 21,
    // Japonya
    PG12: 12, 'R15+': 15,
    // Kore
    ALL: 0, KIDS: 0,
    // Fransa
    'TOUS PUBLICS': 0,
    // Meksika — `B` 12, `B15` 15, `C` ve `D` yetişkin.
    B: 12, B15: 15, 'B-15': 15, C: 18, D: 18, AP: 0,
    // Kalan tekil şemalar; hepsi birlikte 30 satır, ama hepsi "herkes".
    BTL: 0, KN: 0, KT: 0, 'KT/EA': 0, 'E LIVRE': 0, SPG: 13,
    '전체관람가': 0, 'GENEL İZLEYICI': 0,
  };
  if (value in table) return table[value];

  // Tayland ("น 13+"), Rusya ("16+"), Almanya ("FSK 12"), Kore ("12세") ve
  // benzerleri: dizedeki ilk sayı zaten yaşın kendisi.
  const digits = value.match(/\d{1,2}/);
  if (digits) {
    const age = parseInt(digits[0], 10);
    if (age >= 0 && age <= 21) return age;
  }

  return null;
}

/**
 * Kullanıcıya sunulan tavanlar.
 *
 * Üç durak, çünkü dördüncüsünün karşılığı yok: "yalnız yetişkin" bir istek
 * değil, filtrenin kapalı hâli zaten onu kapsıyor.
 */
export const AGE_CEILINGS = [7, 12, 16] as const;
export type AgeCeiling = (typeof AGE_CEILINGS)[number];
