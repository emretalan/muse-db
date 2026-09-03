import type { Era, MediaType } from '../types/index.js';

/**
 * Zevk motoru — kalem 8, 15 ve 16'nın ortak çekirdeği.
 *
 * ## Neden sunucuda ve neden hafızasız
 *
 * Tepkiler kullanıcının cihazında ve kendi Firestore belgesinde duruyor;
 * sunucu onları **saklamıyor**. Uygulama her hesapta defteri baştan
 * gönderiyor, burası cevabı üretip unutuyor.
 *
 * İki sebep var. Birincisi zorunluluk: arşiv kaydında yalnızca `movieId` ve
 * tepki var — tür, ruh hâli, dönem ve menşe yalnızca burada. Bir profil ancak
 * ikisinin buluştuğu yerde çıkabiliyor. İkincisi tercih: zevk verisi için yeni
 * bir kişisel tablo açmadan da aynı sonuç alınıyor, ve hafızasız olduğu için
 * profil her zaman arşivin **bugünkü** hâliyle tutarlı — kullanıcı bir kaydı
 * sildiğinde profilden de siliniyor, temizlenecek bir kopya kalmıyor.
 *
 * ## Soğuk başlangıç
 *
 * Envanterde bu üç kalemin en dürüst uyarısı buydu: ilk haftalarda hiçbir şey
 * yapamaz. Bu yüzden iki ayrı eşik var ve ikisi de burada, tek yerde:
 * `MIN_ANSWERS_PROFILE` altında hiçbir şey söylenmiyor,
 * `MIN_ANSWERS_FATE` altında hiçbir şey **yapılmıyor**. Fark kasıtlı —
 * gördüğünü söylemek, ona göre davranmaktan daha az kanıt istiyor.
 */

export type ReactionKey = 'loved' | 'fine' | 'not_for_me';

const REACTION_WEIGHT: Record<ReactionKey, number> = {
  loved: 1,
  fine: 0,
  not_for_me: -1,
};

export function isReactionKey(value: unknown): value is ReactionKey {
  return value === 'loved' || value === 'fine' || value === 'not_for_me';
}

/** Uygulamanın gönderdiği defter satırı. */
export interface TasteEntry {
  movieId: number;
  reaction: ReactionKey;
}

/** Bir başlığın zevk hesabına giren nitelikleri; hepsi katalogdan. */
export interface TasteFacts {
  movieId: number;
  genreIds: number[];
  moods: string[];
  era: Era | null;
  origin: string | null;
  runtime: number | null;
  mediaType: MediaType;
}

export type TraitKind = 'genre' | 'mood' | 'era' | 'origin';

export interface TasteTrait {
  kind: TraitKind;
  /** Tür kimliği, ruh hâli slug'ı, dönem ya da menşe kovası. Adlandırma
   *  uygulamada: kutuların adları zaten orada çevrili duruyor. */
  key: string;
  /** −1 ile 1 arası. Pozitif "senin ortalamandan iyi", negatif tersi. */
  affinity: number;
  /** Kaç cevaplanmış başlık bu kutuya değiyor. */
  count: number;
}

/** Seçime taşınan sıkıştırılmış hâl. Kısa anahtarlar kasıtlı: bu sözlük her
 *  `/pick` isteğinde gidiyor. */
export interface TasteVector {
  g?: Record<string, number>;
  m?: Record<string, number>;
  e?: Record<string, number>;
}

export interface TasteProfile {
  answered: number;
  /** 0–1. Ekranda bir çubuk değil, bir cümle seçmek için: eşiğin altındayken
   *  "daha dinliyorum" demek gerekiyor. */
  confidence: number;
  totals: { loved: number; fine: number; notForMe: number };
  traits: TasteTrait[];
  /** Eşik dolmadıysa `null` — uygulamanın yanlışlıkla göndermesi imkânsız
   *  olsun diye boş sözlük değil, yokluk. */
  vector: TasteVector | null;
  /** Sevilenlerin ortalama süresi ile sevilmeyenlerinki arasındaki eğilim. */
  runtimeLean: 'short' | 'long' | null;
}

/** Altında hiçbir eğilim gösterilmiyor. */
export const MIN_ANSWERS_PROFILE = 6;
/** Altında kader hiç etkilenmiyor. Profilden yüksek: söylemek ile yapmak
 *  arasındaki fark. */
export const MIN_ANSWERS_FATE = 12;
/** Bu sayıya varınca güven 1. */
const CONFIDENCE_FULL = 20;

/**
 * Küçük örneklem cezası.
 *
 * Bölen `n + SHRINK` olmasa tek bir "bayıldım" o türü tavana çıkarırdı: bir
 * kez izlenmiş bir Western, on kez izlenmiş bir dram kadar kanıt sayılırdı.
 * 2 ile tek başlık 1'in üçte birine düşüyor, üç başlık %60'ına.
 */
const SHRINK = 2;

/**
 * Bir kutunun sayılması için gereken en az başlık.
 *
 * 2 ile denendi ve okunmaya değmiyordu: 18 cevabın 2'sine dayanan "2000'lere
 * hayır diyorsun" cümlesi bir örüntü değil bir tesadüf. 3, bir eğilimin
 * eğilim sayılabildiği en küçük sayı.
 *
 * Göstermek ile davranmak arasındaki fark burada değil, cevap eşiklerinde
 * taşınıyor (`MIN_ANSWERS_PROFILE` / `MIN_ANSWERS_FATE`) — kanıt çıtası bir
 * kutu için ikisinde de aynı olmalı, yoksa ekranda görünen bir eğilimin
 * kaderi etkilemediği bir aralık doğuyor ve bunu açıklamanın yolu yok.
 */
const MIN_COUNT = 3;
/** Gürültüyü ayıklıyor: bu değerin altındaki yakınlık ne söylenmeye ne
 *  uygulanmaya değer. */
const MIN_ABS_AFFINITY = 0.15;
/** Ekranda okunabilir kalan eğilim sayısı. */
const MAX_TRAITS = 6;

/**
 * Kaderin ağırlığını en fazla ne kadar eğebileceği.
 *
 * 0,5 ile çarpan 0,5× ile 1,5× arasında kalıyor. Üst sınırın kendisi kadar
 * **alt sınırın sıfır olmaması** da önemli: hiç sevilmemiş bir tür bile
 * seçilebilir kalıyor. Aksi hâlde adaptif kader sessizce bir filtreye dönüşür
 * ve ürünün iddiası ("kader seçer") ilk yanlış tahminde çöker.
 */
export const FATE_STRENGTH = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Bucket {
  sum: number;
  count: number;
}

function bump(map: Map<string, Bucket>, key: string, weight: number): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.sum += weight;
    bucket.count += 1;
  } else {
    map.set(key, { sum: weight, count: 1 });
  }
}

/**
 * Bir kutunun yakınlığı.
 *
 * Kullanıcının **kendi ortalaması** çıkarılıyor: her şeye bayılan bir
 * kullanıcıda bütün türler pozitif çıkardı ve profil hiçbir şey söylemezdi.
 * Çıkarılınca soru "bunu sevdin mi" değil, "bunu **diğerlerinden çok** mu
 * sevdin" oluyor — profilin söylediği de tam bu.
 */
function affinityOf(bucket: Bucket, mean: number): number {
  return clamp((bucket.sum - bucket.count * mean) / (bucket.count + SHRINK), -1, 1);
}

function traitsFrom(
  map: Map<string, Bucket>,
  kind: TraitKind,
  mean: number
): TasteTrait[] {
  const traits: TasteTrait[] = [];
  for (const [key, bucket] of map) {
    if (bucket.count < MIN_COUNT) continue;
    const affinity = affinityOf(bucket, mean);
    if (Math.abs(affinity) < MIN_ABS_AFFINITY) continue;
    traits.push({ kind, key, affinity, count: bucket.count });
  }
  return traits;
}

function vectorFrom(map: Map<string, Bucket>, mean: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, bucket] of map) {
    if (bucket.count < MIN_COUNT) continue;
    const affinity = affinityOf(bucket, mean);
    if (Math.abs(affinity) < MIN_ABS_AFFINITY) continue;
    out[key] = Math.round(affinity * 100) / 100;
  }
  return out;
}

/**
 * Defter + katalog niteliklerinden profil.
 *
 * Katalogda bulunmayan `movieId`'ler sessizce düşüyor: arşiv kullanıcının
 * cihazında yaşıyor ve orada bizde artık olmayan bir kimlik olabilir.
 */
export function buildTasteProfile(
  entries: TasteEntry[],
  facts: Map<number, TasteFacts>
): TasteProfile {
  const genres = new Map<string, Bucket>();
  const moods = new Map<string, Bucket>();
  const eras = new Map<string, Bucket>();
  const origins = new Map<string, Bucket>();

  const totals = { loved: 0, fine: 0, notForMe: 0 };
  let answered = 0;
  let weightSum = 0;

  // Süre eğilimi ayrı toplanıyor: kutu değil, bir ortalama karşılaştırması.
  let lovedRuntime = 0;
  let lovedRuntimeCount = 0;
  let dislikedRuntime = 0;
  let dislikedRuntimeCount = 0;

  const seen = new Set<number>();

  for (const entry of entries) {
    // Aynı başlığa iki kayıt (kullanıcı aynı filme iki kez söz verdiyse) bir
    // kez sayılıyor — yoksa tek bir film bir türü tek başına taşıyabiliyor.
    if (seen.has(entry.movieId)) continue;
    seen.add(entry.movieId);

    const fact = facts.get(entry.movieId);
    if (!fact) continue;

    const weight = REACTION_WEIGHT[entry.reaction];
    answered += 1;
    weightSum += weight;
    if (entry.reaction === 'loved') totals.loved += 1;
    else if (entry.reaction === 'fine') totals.fine += 1;
    else totals.notForMe += 1;

    for (const id of fact.genreIds) bump(genres, String(id), weight);
    for (const mood of fact.moods) bump(moods, mood, weight);
    if (fact.era) bump(eras, fact.era, weight);
    if (fact.origin) bump(origins, fact.origin, weight);

    if (fact.runtime && fact.mediaType === 'movie') {
      if (weight > 0) {
        lovedRuntime += fact.runtime;
        lovedRuntimeCount += 1;
      } else if (weight < 0) {
        dislikedRuntime += fact.runtime;
        dislikedRuntimeCount += 1;
      }
    }
  }

  const mean = answered > 0 ? weightSum / answered : 0;
  const confidence = clamp(answered / CONFIDENCE_FULL, 0, 1);

  const empty: TasteProfile = {
    answered,
    confidence,
    totals,
    traits: [],
    vector: null,
    runtimeLean: null,
  };

  if (answered < MIN_ANSWERS_PROFILE) return empty;

  const traits = [
    ...traitsFrom(genres, 'genre', mean),
    ...traitsFrom(moods, 'mood', mean),
    ...traitsFrom(eras, 'era', mean),
    ...traitsFrom(origins, 'origin', mean),
  ]
    .sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity))
    .slice(0, MAX_TRAITS);

  // Süre eğilimi yalnızca iki taraf da doluyken anlamlı ve fark yarım saati
  // geçmeliydi: 8 dakikalık bir fark istatistik değil gürültü.
  let runtimeLean: 'short' | 'long' | null = null;
  if (lovedRuntimeCount >= 2 && dislikedRuntimeCount >= 2) {
    const diff = lovedRuntime / lovedRuntimeCount - dislikedRuntime / dislikedRuntimeCount;
    if (diff >= 30) runtimeLean = 'long';
    else if (diff <= -30) runtimeLean = 'short';
  }

  let vector: TasteVector | null = null;
  if (answered >= MIN_ANSWERS_FATE) {
    const g = vectorFrom(genres, mean);
    const m = vectorFrom(moods, mean);
    const e = vectorFrom(eras, mean);
    const parts: TasteVector = {};
    if (Object.keys(g).length > 0) parts.g = g;
    if (Object.keys(m).length > 0) parts.m = m;
    if (Object.keys(e).length > 0) parts.e = e;
    if (Object.keys(parts).length > 0) vector = parts;
  }

  return { answered, confidence, totals, traits, vector, runtimeLean };
}

/** İstemciden gelen vektörün güvenli hâli. Sunucu kendi ürettiğine değil,
 *  eline geçene bakmak zorunda: değerler sınıra çekiliyor ve tanınmayan
 *  anahtarlar atılıyor. */
export function sanitizeVector(input: unknown): TasteVector | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const out: TasteVector = {};

  for (const axis of ['g', 'm', 'e'] as const) {
    const raw = source[axis];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const clean: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (key.length === 0 || key.length > 32) continue;
      clean[key] = clamp(value, -1, 1);
    }
    if (Object.keys(clean).length > 0) out[axis] = clean;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Bir adayın vektöre göre yakınlığı, −1 ile 1 arası.
 *
 * Eşleşen eksenlerin **ortalaması** alınıyor, toplamı değil: toplam olsaydı
 * beş türü olan bir film iki türü olandan yapısal olarak öne geçerdi ve
 * profil değil, tür sayısı seçim yapardı.
 */
export function candidateAffinity(
  vector: TasteVector,
  genreIds: number[],
  moods: string[],
  era: Era | null
): number {
  let sum = 0;
  let count = 0;

  if (vector.g) {
    for (const id of genreIds) {
      const score = vector.g[String(id)];
      if (score !== undefined) {
        sum += score;
        count += 1;
      }
    }
  }
  if (vector.m) {
    for (const mood of moods) {
      const score = vector.m[mood];
      if (score !== undefined) {
        sum += score;
        count += 1;
      }
    }
  }
  if (vector.e && era) {
    const score = vector.e[era];
    if (score !== undefined) {
      sum += score;
      count += 1;
    }
  }

  return count === 0 ? 0 : clamp(sum / count, -1, 1);
}
