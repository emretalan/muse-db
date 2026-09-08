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
      hi: 'डर का महीना',
      id: 'Bulan ketakutan',
      ko: '공포의 달',
      nl: 'De maand van de angst',
      'pt-PT': 'O mês do medo',
      ru: 'Месяц страха',
      sv: 'Skräckens månad',
      th: 'เดือนแห่งความหวาดกลัว',
      vi: 'Tháng của nỗi sợ',
      'zh-Hant': '恐懼之月',
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
      hi: 'पाँच रातें जो आपको जगाए रखेंगी। हर एक को नियति चुनती है।',
      id: 'Lima malam yang membuatmu terjaga. Takdir memilih setiap satunya.',
      ko: '당신을 깨어 있게 할 다섯 밤. 하나하나를 운명이 고른다.',
      nl: 'Vijf nachten die je wakker houden. Het lot kiest ze allemaal.',
      'pt-PT': 'Cinco noites sem dormir. O destino escolhe cada uma.',
      ru: 'Пять ночей без сна. Каждую выбирает судьба.',
      sv: 'Fem nätter som håller dig vaken. Ödet väljer var och en.',
      th: 'ห้าคืนที่จะทำให้คุณนอนไม่หลับ โชคชะตาเลือกให้ทีละคืน',
      vi: 'Năm đêm khiến bạn thức trắng. Số phận chọn từng đêm một.',
      'zh-Hant': '五個讓你睡不著的夜晚，每一夜都由命運挑選。',
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
      hi: 'जो असल में हुआ',
      id: 'Yang benar-benar terjadi',
      ko: '실제로 일어난 일',
      nl: 'Wat er echt gebeurde',
      'pt-PT': 'O que aconteceu de facto',
      ru: 'Как всё было на самом деле',
      sv: 'Vad som faktiskt hände',
      th: 'สิ่งที่เกิดขึ้นจริง',
      vi: 'Những gì thật sự đã xảy ra',
      'zh-Hant': '真正發生過的事',
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
      hi: 'एक महीना वृत्तचित्रों का — वह ताक जिस तक आपका हाथ कभी नहीं जाता।',
      id: 'Sebulan penuh dokumenter — rak yang tak pernah kamu jangkau.',
      ko: '다큐멘터리로 채운 한 달 — 한 번도 손이 가지 않던 그 칸.',
      nl: 'Een maand documentaires — de plank waar je nooit naar reikt.',
      'pt-PT': 'Um mês de documentários — a prateleira a que nunca chegas.',
      ru: 'Месяц документального кино — полка, до которой ты никогда не дотягиваешься.',
      sv: 'En månad av dokumentärer — hyllan du aldrig sträcker dig efter.',
      th: 'หนึ่งเดือนกับสารคดี — ชั้นที่คุณไม่เคยเอื้อมถึง',
      vi: 'Một tháng phim tài liệu — kệ sách bạn chưa từng với tới.',
      'zh-Hant': '一整個月的紀錄片——你從來不去伸手的那一層。',
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
      hi: 'छह देश, छह रातें',
      id: 'Enam negara, enam malam',
      ko: '여섯 나라, 여섯 밤',
      nl: 'Zes landen, zes nachten',
      'pt-PT': 'Seis países, seis noites',
      ru: 'Шесть стран, шесть ночей',
      sv: 'Sex länder, sex nätter',
      th: 'หกประเทศ หกคืน',
      vi: 'Sáu quốc gia, sáu đêm',
      'zh-Hant': '六個國家，六個夜晚',
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
      hi: 'हॉलीवुड को छोड़कर सब कुछ। पासपोर्ट नियति के पास है।',
      id: 'Segalanya kecuali Hollywood. Paspor ada di tangan takdir.',
      ko: '할리우드만 빼고 전부. 여권은 운명이 쥐고 있다.',
      nl: 'Alles behalve Hollywood. Het lot heeft het paspoort.',
      'pt-PT': 'Tudo menos Hollywood. O passaporte está com o destino.',
      ru: 'Всё, кроме Голливуда. Паспорт у судьбы.',
      sv: 'Allt utom Hollywood. Ödet håller i passet.',
      th: 'ทุกที่ยกเว้นฮอลลีวูด หนังสือเดินทางอยู่ในมือโชคชะตา',
      vi: 'Mọi nơi trừ Hollywood. Hộ chiếu nằm trong tay số phận.',
      'zh-Hant': '好萊塢以外的一切。護照在命運手上。',
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
      hi: 'कुछ गर्माहट भरा',
      id: 'Sesuatu yang hangat',
      ko: '따뜻한 무언가',
      nl: 'Iets warms',
      'pt-PT': 'Algo quentinho',
      ru: 'Что-нибудь тёплое',
      sv: 'Något varmt',
      th: 'อะไรที่อบอุ่น',
      vi: 'Một thứ gì ấm áp',
      'zh-Hant': '溫暖的東西',
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
      hi: 'अँधेरे महीनों को कहानी का मोड़ नहीं, एक कम्बल चाहिए।',
      id: 'Bulan-bulan gelap ingin selimut, bukan kejutan alur.',
      ko: '어두운 달들이 원하는 건 반전이 아니라 담요다.',
      nl: 'De donkere maanden willen een deken, geen plotwending.',
      'pt-PT': 'Os meses escuros pedem um cobertor, não uma reviravolta.',
      ru: 'Тёмным месяцам нужен плед, а не поворот сюжета.',
      sv: 'De mörka månaderna vill ha en filt, inte en vändning.',
      th: 'เดือนที่มืดมิดต้องการผ้าห่ม ไม่ใช่หักมุม',
      vi: 'Những tháng tối cần một tấm chăn, không phải một cú lật.',
      'zh-Hant': '昏暗的月份要的是毯子，不是反轉。',
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
      hi: 'प्यार के चार रंग',
      id: 'Empat rupa cinta',
      ko: '네 가지 사랑',
      nl: 'Vier soorten liefde',
      'pt-PT': 'Quatro tipos de amor',
      ru: 'Четыре вида любви',
      sv: 'Fyra sorters kärlek',
      th: 'ความรักสี่แบบ',
      vi: 'Bốn kiểu yêu',
      'zh-Hant': '四種愛',
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
      hi: 'वह नहीं जो आप चुनते। बात ही यही है।',
      id: 'Bukan yang akan kamu pilih. Justru itu intinya.',
      ko: '당신이라면 고르지 않았을 한 편. 바로 그게 핵심이다.',
      nl: 'Niet degene die je zelf had gekozen. Daar gaat het juist om.',
      'pt-PT': 'Não o que terias escolhido. É precisamente esse o ponto.',
      ru: 'Не тот, что выбрал бы ты. В этом и смысл.',
      sv: 'Inte den du själv hade valt. Det är hela poängen.',
      th: 'ไม่ใช่เรื่องที่คุณจะเลือกเอง นั่นแหละคือประเด็น',
      vi: 'Không phải phim bạn sẽ tự chọn. Đó mới là điểm mấu chốt.',
      'zh-Hant': '不是你會挑的那一部。這正是重點。',
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
      hi: 'दोबारा देखने लायक फ़िल्में',
      id: 'Film yang minta ditonton dua kali',
      ko: '두 번 봐야 하는 영화들',
      nl: 'Films die een tweede blik vragen',
      'pt-PT': 'Filmes que pedem uma segunda vista',
      ru: 'Фильмы, которые нужно пересмотреть',
      sv: 'Filmer som kräver en andra titt',
      th: 'หนังที่ต้องดูซ้ำอีกรอบ',
      vi: 'Những phim cần xem lại lần nữa',
      'zh-Hant': '值得再看一次的片子',
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
      hi: 'एक महीना उन फ़िल्मों का जिन पर आप बाद में बहस करेंगे।',
      id: 'Sebulan penuh film yang akan kamu perdebatkan sesudahnya.',
      ko: '보고 나서 한참을 두고 다툴 영화들의 한 달.',
      nl: 'Een maand films waarover je achteraf zult discussiëren.',
      'pt-PT': 'Um mês de filmes sobre os quais vais discutir depois.',
      ru: 'Месяц фильмов, о которых ты будешь спорить потом.',
      sv: 'En månad av filmer du kommer att bråka om efteråt.',
      th: 'หนึ่งเดือนกับหนังที่คุณจะเถียงกันทีหลัง',
      vi: 'Một tháng của những phim bạn sẽ tranh cãi về sau.',
      'zh-Hant': '看完之後會爭論不休的一個月。',
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
  /**
   * Bu ay kaç kişi bu sezonun ritüelini başlattı.
   *
   * Eşiğin (`config.seasons.minStartersToShow`) altındaysa alan **hiç
   * gönderilmiyor** — istemcide ikinci bir eşik olmasın diye. Bir satırın
   * görünüp görünmeyeceği tek yerden, sunucudan ayarlanıyor.
   *
   * "Tamamladı" değil "başladı": tamamlama sinyali sunucuya hiç ulaşmıyor
   * (`isFulfilled` cihazda ve Firestore'da kalıyor). Ve bu daha doğru çerçeve
   * — yola çıkanların sayısı davet ediyor, tamamlayanlarınki kıyaslamaya
   * çağırıyor.
   */
  starters?: number;
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

const SEASON_SLUGS = new Set(SEASONS.map((s) => s.slug));

/**
 * Gelen slug gerçek bir sezona mı ait.
 *
 * Uçlar eskiden yalnızca **biçim** denetliyordu (`/^[a-z0-9-]{1,40}$/`) ve
 * gerekçesi "uydurulmuş bir değer kaderi etkilemiyor, en fazla kendi sezonunun
 * sayacını şişirir"di. Sayaç gerçekten çalışmaya başladığından beri o gerekçe
 * geçerli değil: uydurma bir slug artık var olmayan bir sezon için satır
 * yazardı.
 *
 * Ay kontrolü **yok**, bilerek: sezonun o ay açık olup olmadığına `/seasons`
 * karar veriyor ve ay sınırı istemcinin saat diliminden geliyor. Burada ayı da
 * denetlemek, ay dönümünde başlayan bir töreni sayıdan düşürürdü.
 */
export function isSeasonSlug(value: unknown): value is string {
  return typeof value === 'string' && SEASON_SLUGS.has(value);
}

/**
 * Sezon metinlerini tek dile indirir.
 *
 * `lang` doğrudan `normalizeLanguage`'ın çıktısı, yani buradaki sözlüklerin
 * anahtarlarıyla aynı yazımda (`pt-BR`, `zh-Hant`) ya da `null`. Bu yüzden
 * ne küçültme ne de alt etikete düşme var: kod eskiden `toLowerCase()`
 * ediliyordu ve `'pt-BR'` anahtarı `'pt-br'` aramasıyla **hiçbir zaman**
 * eşleşmiyordu — Portekizce ve Çince kullanıcılar sezon kartını hep
 * İngilizce görüyordu.
 */
export function localize(season: Season, lang: string | null): {
  title: string;
  subtitle: string;
} {
  const pick = (map: Record<string, string>) => (lang ? map[lang] : undefined) ?? map.en;
  return { title: pick(season.title), subtitle: pick(season.subtitle) };
}
