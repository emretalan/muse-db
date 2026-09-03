import type { PickFilters } from '../types/index.js';

/**
 * Tematik sezonlar — kalem 25.
 *
 * ## Neden sunucuda
 *
 * Sezonun tamamı bir küratörlük işi ve küratörlüğün her turu bir App Store
 * sürümü beklerse özellik ilk aydan sonra ölür. Menşe kovalarında verilen
 * kararın aynısı, daha güçlü gerekçeyle: kova sınırları yılda bir değişebilir,
 * sezon her ay değişiyor.
 *
 * Bu yüzden başlıklar da burada duruyor. Uygulamanın çeviri katalogunda
 * yaşasalardı, yeni bir sezon eklemek yine sürüm beklerdi.
 *
 * ## Neden ay
 *
 * Sezon bir zamana bağlı olmak zorunda, yoksa yalnızca başka bir filtre olur.
 * Ay, bir kullanıcıyı geri getirmek için yeterince kısa ve bir filmi bulup
 * izlemek için yeterince uzun.
 *
 * Her ayın sezonu yok ve olmamalı: her ay olan bir şey özel değildir.
 */

export interface Season {
  slug: string;
  /** 1–12. Sezonun göründüğü aylar. */
  months: number[];
  /** SF Symbol; uygulamanın çizdiği simge. */
  icon: string;
  /** Törenin bu sezon için hazır verdiği cevaplar. */
  filters: PickFilters;
  /** Sezonun tamamlanmış sayılması için kaç söz tutulmalı. */
  target: number;
  /** Dil kodu -> metin. `en` her zaman var ve tanınmayan dilin karşılığı. */
  title: Record<string, string>;
  subtitle: Record<string, string>;
}

export const SEASONS: Season[] = [
  {
    slug: 'dread',
    months: [10],
    icon: 'moon.stars.fill',
    filters: { moods: ['dread'] },
    target: 5,
    title: {
      en: 'The month of dread', tr: 'Korku ayı', de: 'Der Monat des Grauens',
      es: 'El mes del miedo', fr: 'Le mois de l’effroi', it: 'Il mese del terrore',
      ja: '恐怖の月', 'pt-BR': 'O mês do medo', 'zh-Hans': '恐惧之月',
    },
    subtitle: {
      en: 'Five nights that keep you up. Fate picks each one.',
      tr: 'Uykunu kaçıracak beş gece. Her birini kader seçiyor.',
      de: 'Fünf Nächte, die dich wachhalten. Das Schicksal wählt jede einzelne.',
      es: 'Cinco noches que te quitan el sueño. El destino elige cada una.',
      fr: 'Cinq nuits blanches. Le destin choisit chacune.',
      it: 'Cinque notti insonni. Il destino sceglie ognuna.',
      ja: '眠れない五つの夜。そのすべてを運命が選ぶ。',
      'pt-BR': 'Cinco noites sem sono. O destino escolhe cada uma.',
      'zh-Hans': '五个不眠之夜，每一夜都由命运挑选。',
    },
  },
  {
    slug: 'documentary',
    months: [5],
    icon: 'video',
    filters: { genreIds: [99] },
    target: 4,
    title: {
      en: 'What actually happened', tr: 'Gerçekten olanlar',
      de: 'Was wirklich geschah', es: 'Lo que de verdad pasó',
      fr: 'Ce qui s’est vraiment passé', it: 'Ciò che è davvero accaduto',
      ja: '実際に起きたこと', 'pt-BR': 'O que de fato aconteceu',
      'zh-Hans': '真实发生过的事',
    },
    subtitle: {
      en: 'A month of documentaries — the shelf you never reach for.',
      tr: 'Bir ay belgesel — hiç uzanmadığın raf.',
      de: 'Ein Monat Dokumentarfilme — das Regal, nach dem du nie greifst.',
      es: 'Un mes de documentales: el estante al que nunca llegas.',
      fr: 'Un mois de documentaires — l’étagère que tu n’ouvres jamais.',
      it: 'Un mese di documentari — lo scaffale che non apri mai.',
      ja: 'ドキュメンタリーの一か月。いつも手を伸ばさない棚。',
      'pt-BR': 'Um mês de documentários — a prateleira que você nunca alcança.',
      'zh-Hans': '一整月的纪录片——你从不去够的那层书架。',
    },
  },
  {
    slug: 'world-tour',
    months: [9],
    icon: 'globe',
    filters: { origin: ['europe', 'far-east', 'latin-america', 'india', 'turkiye'] },
    target: 6,
    title: {
      en: 'Six countries, six nights', tr: 'Altı ülke, altı gece',
      de: 'Sechs Länder, sechs Nächte', es: 'Seis países, seis noches',
      fr: 'Six pays, six nuits', it: 'Sei paesi, sei notti',
      ja: '六つの国、六つの夜', 'pt-BR': 'Seis países, seis noites',
      'zh-Hans': '六个国家，六个夜晚',
    },
    subtitle: {
      en: 'Everything but Hollywood. Fate holds the passport.',
      tr: 'Hollywood dışında her yer. Pasaport kaderde.',
      de: 'Alles außer Hollywood. Das Schicksal hält den Pass.',
      es: 'Todo menos Hollywood. El destino lleva el pasaporte.',
      fr: 'Tout sauf Hollywood. Le destin tient le passeport.',
      it: 'Tutto tranne Hollywood. Il passaporto ce l’ha il destino.',
      ja: 'ハリウッド以外のすべて。パスポートは運命が持っている。',
      'pt-BR': 'Tudo menos Hollywood. O destino tem o passaporte.',
      'zh-Hans': '好莱坞之外的一切。护照在命运手里。',
    },
  },
  {
    slug: 'cozy',
    months: [12, 1],
    icon: 'cup.and.saucer.fill',
    filters: { moods: ['cozy'] },
    target: 5,
    title: {
      en: 'Something warm', tr: 'Sıcak bir şey', de: 'Etwas Warmes',
      es: 'Algo cálido', fr: 'Quelque chose de doux', it: 'Qualcosa di caldo',
      ja: 'あたたかいもの', 'pt-BR': 'Algo aconchegante', 'zh-Hans': '温暖的东西',
    },
    subtitle: {
      en: 'The dark months want a blanket, not a plot twist.',
      tr: 'Karanlık aylar sürpriz değil, battaniye istiyor.',
      de: 'Die dunklen Monate wollen eine Decke, keine Wendung.',
      es: 'Los meses oscuros piden una manta, no un giro de guion.',
      fr: 'Les mois sombres veulent une couverture, pas un rebondissement.',
      it: 'I mesi bui vogliono una coperta, non un colpo di scena.',
      ja: '暗い季節が欲しいのはどんでん返しではなく毛布。',
      'pt-BR': 'Os meses escuros pedem um cobertor, não uma reviravolta.',
      'zh-Hans': '昏暗的月份要的是毯子，不是反转。',
    },
  },
  {
    slug: 'romance',
    months: [2],
    icon: 'heart.fill',
    filters: { genreIds: [10749] },
    target: 4,
    title: {
      en: 'Four kinds of love', tr: 'Dört türlü aşk', de: 'Vier Arten von Liebe',
      es: 'Cuatro clases de amor', fr: 'Quatre sortes d’amour',
      it: 'Quattro tipi d’amore', ja: '四つの愛のかたち',
      'pt-BR': 'Quatro tipos de amor', 'zh-Hans': '四种爱',
    },
    subtitle: {
      en: 'Not the one you would have picked. That is the point.',
      tr: 'Senin seçeceğin değil. Zaten mesele o.',
      de: 'Nicht der, den du gewählt hättest. Genau darum geht es.',
      es: 'No el que habrías elegido. De eso se trata.',
      fr: 'Pas celui que tu aurais choisi. C’est bien l’idée.',
      it: 'Non quello che avresti scelto. È proprio questo il punto.',
      ja: '自分では選ばない一本。それがこの月の意味。',
      'pt-BR': 'Não o que você teria escolhido. É justamente esse o ponto.',
      'zh-Hans': '不是你会挑的那部。这正是重点。',
    },
  },
  {
    slug: 'mindbender',
    months: [3],
    icon: 'brain',
    filters: { moods: ['mindbender'] },
    target: 4,
    title: {
      en: 'Films that need a second look', tr: 'İkinci kez bakmak gerekenler',
      de: 'Filme, die einen zweiten Blick brauchen',
      es: 'Películas que piden una segunda mirada',
      fr: 'Des films qu’il faut revoir', it: 'Film da guardare due volte',
      ja: '二度観たくなる作品', 'pt-BR': 'Filmes que pedem uma segunda olhada',
      'zh-Hans': '值得再看一遍的片子',
    },
    subtitle: {
      en: 'A month of films you will argue about afterwards.',
      tr: 'Sonrasında tartışacağın filmlerden bir ay.',
      de: 'Ein Monat voller Filme, über die du danach streiten wirst.',
      es: 'Un mes de películas sobre las que discutirás después.',
      fr: 'Un mois de films dont tu débattras après.',
      it: 'Un mese di film su cui discuterai dopo.',
      ja: '観終わったあとに語り合いたくなる一か月。',
      'pt-BR': 'Um mês de filmes sobre os quais você vai discutir depois.',
      'zh-Hans': '看完之后会争论一整月的电影。',
    },
  },
];

/** Sunucunun uygulamaya gönderdiği hâl — metinler tek dile inmiş. */
export interface ResolvedSeason {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  filters: PickFilters;
  target: number;
  /** Bu sezonda kaç başlık var. Sıfırsa sezon hiç gönderilmiyor. */
  poolSize: number;
}

/**
 * Verilen ayda geçerli sezonlar.
 *
 * Ay dışarıdan geliyor ki sunucunun saat dilimi kullanıcınınkini ezmesin:
 * 1 ekim sabahı Auckland'da korku ayı başlamışken sunucu hâlâ eylülde olabilir.
 */
export function seasonsForMonth(month: number): Season[] {
  return SEASONS.filter((s) => s.months.includes(month));
}

export function localize(season: Season, lang: string | null): {
  title: string;
  subtitle: string;
} {
  const code = (lang ?? 'en').toLowerCase();
  const pick = (map: Record<string, string>) =>
    map[code] ?? map[code.split('-')[0]] ?? map.en;
  return { title: pick(season.title), subtitle: pick(season.subtitle) };
}
