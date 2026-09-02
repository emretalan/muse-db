/**
 * Ruh hâli katmanı.
 *
 * Tür, "ne izliyorum" sorusuna cevap veriyor; ruh hâli "bu akşam ne
 * hissetmek istiyorum" sorusuna. İkisi aynı şey değil ve birbirini kesiyor:
 * ağlatan bir film Dram da olabilir Animasyon da, Savaş da olabilir Romantik
 * de. Bu yüzden ruh hâli türün *yerine* değil, yanına geliyor.
 *
 * ## Neden TMDB'nin kendi ruh hâli etiketleri yetmiyor
 *
 * TMDB'de gerçekten duygu adı taşıyan bir etiket ailesi var — `amused`,
 * `suspenseful`, `hopeful`, `melodramatic`. Ama seyrek: en kalabalığı
 * (`amused`) 20.202 başlığın 450'sinde, çoğu 100'ün altında. Tek başına
 * kullanılırsa yedi kutunun altısı boş çıkar.
 *
 * ## Puanlama
 *
 * Bir başlık, kuralın eşiğini aşacak kadar puan toplarsa o ruh hâline girer:
 *
 *   çekirdek tür        2 puan
 *   güçlü etiket        2 puan (her biri)
 *   destek etiketi      1 puan (her biri)
 *   etiketlerden en çok 4 puan
 *
 * İki kademeli etiket, ölçerek öğrenilmiş bir düzeltme. İlk sürümde bütün
 * etiketler eşitti ve "ağlatan" kutusuna *The Prestige* ile *Mary Poppins*
 * düştü: birincisi `dying and death` + `suicide`, ikincisi `sympathetic` +
 * `parent child relationship` taşıyor. `terminal illness` ile
 * `parent child relationship` aynı ağırlıkta olamaz.
 *
 * `requireGenres` de aynı ölçümden geldi: *National Treasure* ve
 * *The Spiderwick Chronicles* etiket toplamıyla ağlatan çıkıyordu. Ağlatan bir
 * yapım Dram, Romantik, Animasyon ya da Pembe Dizi olmak zorunda — macera
 * filminin duygusal etiketleri onu ağlatan yapmıyor.
 *
 * ## Neden türetilmiş bir sütun
 *
 * Kural sorgu anında da çalıştırılabilirdi, ama her aday sorgusu 177.641
 * satırlık `movie_keywords` üzerinde ek bir birleşim demek olurdu — üstelik
 * facet sayımları bunu her ekranda tekrar yapardı. `movies.moods TEXT[]` bir
 * GIN indeksiyle sabit maliyetli. Kural değişince `derive-refinement.ts`
 * yeniden koşuyor: dakikalar sürüyor, hiçbir TMDB isteği harcamıyor.
 */

export interface MoodRule {
  /** İstemciyle paylaşılan kimlik. Ekrandaki metin uygulamada yaşıyor. */
  slug: string;
  /** Bu türlerden biri 2 puan getiriyor. */
  genres: number[];
  /** Verildiyse: bu türlerden birinde değilsen kutuya hiç giremiyorsun,
   *  kaç puan toplarsan topla. */
  requireGenres?: number[];
  /** Bu türlerden birindeysen kutuya giremiyorsun. "Hafif" bir komedi-korku
   *  hafif değil. */
  excludeGenres?: number[];
  /** Ruh hâlinin kendisini söyleyen etiketler — 2 puan. */
  strongKeywords: number[];
  /** Yalnız başına yetmeyen, ama birikince anlam kazanan etiketler — 1 puan. */
  keywords: number[];
  /** Kutuya girmek için gereken puan. */
  threshold: number;
}

/** Çekirdek tür eşleşmesinin puanı. */
const GENRE_POINTS = 2;
/** Güçlü etiketin puanı. */
const STRONG_POINTS = 2;
/** Etiketlerden toplanabilecek en yüksek puan. Sınır olmasa 30 etiketli bir
 *  yapım her kutuya birden girerdi; ruh hâli o zaman ayırt etmiyor. */
const KEYWORD_CAP = 4;

export const MOOD_RULES: MoodRule[] = [
  {
    // Gülmek istiyorum, ağırlık istemiyorum.
    slug: 'light',
    genres: [35, 16, 10751, 10762],
    excludeGenres: [27, 53, 80, 10752, 10768],
    strongKeywords: [
      320420, // hilarious
      325765, // amused
      9755,   // parody
      8201,   // satire
      167541, // buddy comedy
      325844, // ridiculous
      193171, // sitcom
      9253,   // slapstick comedy
      288816, // lighthearted
      322268, // comedy
      225012, // satirical
    ],
    keywords: [
      309974, // absurd
      319397, // witty
      325782, // cheerful
      325832, // joyful
      303310, // joyous
      325813, // exuberant
      259376, // playful
      324713, // whimsical
      325856, // vibrant
      325781, // celebratory
      325809, // enthusiastic
      12648,  // bromance
      6513,   // cartoon
      11477,  // anthropomorphism
      207317, // christmas
      65,     // holiday
      13027,  // wedding
      9713,   // friends
      3205,   // fairy tale
      209220, // live action and animation
      10181,  // based on play or musical
      4344,   // musical
    ],
    threshold: 3,
  },
  {
    // Ağlamak istiyorum.
    slug: 'tearjerker',
    genres: [],
    // Ağlatan yapım bir dram, romantik, animasyon ya da pembe dizi olmak
    // zorunda. Macera filminin duygusal etiketleri onu ağlatan yapmıyor.
    requireGenres: [18, 10749, 16, 10766],
    excludeGenres: [27, 28, 12, 878, 10759, 10765],
    strongKeywords: [
      156924, // tearjerker
      9872,   // grief
      6564,   // terminal illness
      10163,  // cancer
      293016, // melodrama
      325835, // melodramatic
      10614,  // tragedy
      325854, // tragic
      697,    // loss of loved one
      3737,   // dying and death
      323809, // depressing
      325801, // distressing
      6203,   // loss
      236,    // suicide
      1252,   // suicide attempt
      516,    // child abuse
      41329,  // mental illness
      894,    // depression
      4232,   // melancholy
    ],
    keywords: [
      34079,  // death
      13014,  // orphan
      319319, // sentimental
      4129,   // widow
      9957,   // loneliness
      2754,   // trauma
      15160,  // divorce
      14768,  // single mother
      10048,  // unrequited love
      3691,   // forbidden love
      190142, // angst
      325806, // empathetic
      325853, // sympathetic
      10041,  // dysfunctional family
      199524, // disturbed
      1803,   // drug addiction
      7464,   // alcoholism
      11612,  // hospital
      225219, // reflective
    ],
    threshold: 2,
  },
  {
    slug: 'adrenaline',
    genres: [28, 53, 10759],
    excludeGenres: [99, 10762],
    strongKeywords: [
      321464, // intense
      314730, // suspenseful
      288394, // suspense
      325812, // exhilarated
      316832, // tense
      316362, // thriller
      322496, // action
      3713,   // chase
      10051,  // heist
      13116,  // one man army
      219404, // action hero
      202371, // aggressive
    ],
    keywords: [
      14601,  // explosion
      12371,  // gunfight
      10950,  // shootout
      782,    // assassin
      2708,   // hitman
      470,    // spy
      4289,   // secret agent
      5265,   // espionage
      325811, // excited
      1721,   // fight
      14955,  // fighting
      14643,  // battle
      13015,  // terrorism
      1562,   // hostage
      1930,   // kidnapping
      10562,  // on the run
      10685,  // escape
      10084,  // rescue
      1568,   // undercover
      642,    // robbery
      15363,  // bank robbery
      325778, // bold
      325773, // audacious
      7002,   // vigilante
      779,    // martial arts
      780,    // kung fu
      9725,   // sword fight
      1419,   // gun
      162365, // military
      13065,  // soldier
      10617,  // disaster
      10349,  // survival
      14707,  // brutality
    ],
    threshold: 3,
  },
  {
    // Kafamı karıştırsın, sonunda bir şey anlayayım.
    slug: 'mindbender',
    genres: [878, 9648, 10765],
    excludeGenres: [10762],
    strongKeywords: [
      4379,   // time travel
      4565,   // dystopia
      243230, // parallel universe
      4563,   // virtual reality
      2423,   // simulation
      272553, // psychological
      12565,  // psychological thriller
      309029, // psychological drama
      490,    // philosophy
      212737, // philosophical
      181324, // existentialism
      325763, // ambiguous
      326438, // twist ending
      316332, // mystery
      9887,   // surrealism
      12570,  // whodunit
      207046, // murder mystery
      207268, // neo-noir
      239797, // complex
    ],
    keywords: [
      10937,  // memory
      1453,   // amnesia
      1566,   // dreams
      3030,   // nightmare
      2340,   // paranoia
      10410,  // conspiracy
      310,    // artificial intelligence
      14544,  // robot
      12190,  // cyberpunk
      4458,   // post-apocalyptic future
      2964,   // future
      9882,   // space
      3801,   // space travel
      9951,   // alien
      186189, // hidden identity
      1308,   // secret identity
      5340,   // investigation
      703,    // detective
      325787, // complicated
      4375,   // transformation
      5484,   // reincarnation
      1706,   // experiment
      237451, // isekai
      197582, // mysterious
      210434, // thoughtful
      325776, // baffled
      325777, // bewildered
      10941,  // disappearance
    ],
    threshold: 3,
  },
  {
    // Kendimi iyi hissedeyim, kimse ölmesin.
    slug: 'cozy',
    genres: [10749, 10751],
    excludeGenres: [27, 53, 80, 10752, 10768],
    strongKeywords: [
      325784, // comforting
      325824, // hopeful
      324429, // romantic
      325762, // adoring
      9840,   // romance
      9799,   // romcom
      9914,   // slice of life
      10683,  // coming of age
      281585, // inspirational
      164246, // nostalgic
      209673, // calm
      292593, // intimate
      254167, // loving
      288816, // lighthearted
    ],
    keywords: [
      6054,   // friendship
      9673,   // love
      1415,   // small town
      10235,  // family relationships
      325786, // compassionate
      157303, // first love
      13072,  // falling in love
      12392,  // best friend
      160246, // childhood friends
      5248,   // female friendship
      3230,   // male friendship
      9713,   // friends
      6038,   // marriage
      13027,  // wedding
      548,    // countryside
      5331,   // village
      1946,   // restaurant
      207317, // christmas
      65,     // holiday
      15162,  // dog
      977,    // cat
      10508,  // teacher
      190116, // school life
      13088,  // summer
      966,    // beach
      325782, // cheerful
    ],
    threshold: 3,
  },
  {
    slug: 'dread',
    genres: [27],
    strongKeywords: [
      315058, // horror
      256183, // supernatural horror
      50009,  // survival horror
      325825, // horrified
      325818, // frightened
      325839, // ominous
      10292,  // gore
      12339,  // slasher
      163053, // found footage
      177895, // dark fantasy
      6259,   // psychopath
      10714,  // serial killer
    ],
    keywords: [
      6152,   // supernatural
      162846, // ghost
      3358,   // haunted house
      9712,   // possession
      15001,  // demon
      12377,  // zombie
      3133,   // vampire
      1299,   // monster
      13031,  // creature
      11100,  // giant monster
      616,    // witch
      10541,  // curse
      13006,  // torture
      3030,   // nightmare
      4426,   // sadism
      14707,  // brutality
      188957, // virus
      199524, // disturbed
      15127,  // killer
    ],
    threshold: 3,
  },
  {
    // Uydurma olmasın. Eşik 2: çekirdek türler (Belgesel 364 + Tarih 928)
    // zaten dar, daralttıkça kutu boşalır.
    slug: 'true',
    genres: [99, 36],
    strongKeywords: [
      9672,   // based on true story
      5565,   // biography
      33722,  // true crime
      159289, // historical event
      325830, // informative
      12995,  // historical fiction
      192772, // historical drama
    ],
    keywords: [
      15126,  // historical
      15060,  // period drama
      6078,   // politics
      736,    // journalist
      2652,   // nazi
      1956,   // world war ii
      273967, // war
      154802, // silent film
      417,    // corruption
    ],
    threshold: 2,
  },
];

export const MOOD_SLUGS = MOOD_RULES.map((m) => m.slug);

/** Bir başlığın tür ve anahtar kelime kimliklerinden ruh hâllerini çıkarır. */
export function moodsFor(genreIds: number[], keywordIds: number[]): string[] {
  const genres = new Set(genreIds);
  const keywords = new Set(keywordIds);
  const result: string[] = [];

  for (const rule of MOOD_RULES) {
    if (rule.excludeGenres?.some((g) => genres.has(g))) continue;
    if (rule.requireGenres && !rule.requireGenres.some((g) => genres.has(g))) continue;

    const genrePoints = rule.genres.some((g) => genres.has(g)) ? GENRE_POINTS : 0;
    const strong = rule.strongKeywords.filter((k) => keywords.has(k)).length * STRONG_POINTS;
    const weak = rule.keywords.filter((k) => keywords.has(k)).length;
    const score = genrePoints + Math.min(strong + weak, KEYWORD_CAP);

    if (score >= rule.threshold) result.push(rule.slug);
  }

  return result;
}
