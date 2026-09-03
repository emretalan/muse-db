// Core domain types

export interface Movie {
  id: number;
  tmdbId: number;
  title: string;
  /** Yerelleştirilmiş başlıktan farklıysa göstermeye değer. */
  originalTitle: string | null;
  year: number;
  runtime: number;
  synopsis: string;
  /** Filmin tek cümlelik sloganı; TMDB'de çoğu filmde var, çoğunda yok. */
  tagline: string | null;
  posterUrl: string;
  /** Yatay sahne görseli. Afişin aksine detay ekranının arkasına ve
   *  paylaşım kartına uygun. */
  backdropUrl: string | null;
  voteAverage: number;
  genres: string[];
  directors: string[];
  /** Serbest etiketler ("time travel", "heist"). Tür 19 kutuya sıkışık,
   *  bunlar binlerce; ruh hâli temelli seçim için doğru katman. */
  keywords: string[];
  /** Tek bir yaş sınırı; ABD şeması tercih ediliyor. */
  certification: string | null;
  imdbId: string | null;

  /** 'movie' ya da 'tv'. Dizi satırlarında `runtime` ilk bölümün süresini,
   *  `year` ilk yayın yılını taşıyor. */
  mediaType: MediaType;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  networks: string[];
  firstEpisodeName: string | null;
  firstEpisodeOverview: string | null;
  firstEpisodeStillUrl: string | null;
  /** Dizinin son yayın yılı; hâlâ devam ediyorsa null. "2011–2019" gibi bir
   *  aralık göstermek için. */
  lastYear: number | null;

  /** Sözün hangi birim üzerine verileceği. Filmde `null`.
   *
   *  `'series'` — dizinin **tamamı**. Bitmiş ve toplamı bir akşam-üstü
   *  taahhüde sığan diziler; katalogda 5.617'nin 1.729'u böyle.
   *  `'episode'` — yalnızca **ilk bölüm**. 194 bölümlük bir telenovelaya
   *  "bitireceğim" dedirtmek söz değil yemin olurdu.
   *
   *  Kararın sunucuda olmasının sebebi: eşik bir uygulama sürümü beklemeden
   *  ayarlanabilsin, ve kural tek yerde yaşasın. Uygulamanın `Movie` modelinde
   *  `status` alanı zaten yok. */
  pledgeKind: PledgeKind | null;

  /** Dizinin kabaca toplam süresi (dakika). Filmde `null`.
   *
   *  **Tahmin.** `runtime` S01E01'in süresi ve uzun metraj pilotlar toplamı
   *  şişiriyor — ölçüldü: *Vinyl*'in pilotu 113 dk, tipik bölümü 60. Ekranda
   *  bu yüzden "≈" ile gösterilmeli. */
  totalMinutes: number | null;
}

/** Sözün birimi — bkz. `Movie.pledgeKind`. */
export type PledgeKind = 'episode' | 'series';

export interface MovieRow {
  id: number;
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number;
  runtime: number | null;
  synopsis: string | null;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult: boolean;
  created_at: Date;

  // 008_enrich_movies ile eklendi. Hepsi nullable: seed betiği ikinci kez
  // geçene kadar eski satırlarda boş kalıyorlar.
  backdrop_path: string | null;
  tagline: string | null;
  imdb_id: string | null;
  popularity: string | number | null;
  status: string | null;
  certification: string | null;
  directors: string[] | null;

  // 009_add_media_type ile eklendi.
  media_type: MediaType;
  first_air_date: Date | string | null;
  last_air_date: Date | string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  networks: string[] | null;
  first_episode_name: string | null;
  first_episode_overview: string | null;
  first_episode_still_path: string | null;

  // 013_refinement ile eklendi; ikisi de `scripts/derive-refinement.ts`
  // tarafından türetiliyor, TMDB'den gelmiyor.
  age_rating: number | null;
  moods: string[] | null;
}

export interface Genre {
  id: number;
  name: string;
}

export type Era = 'pre-1980' | '1980-1989' | '1990-1999' | '2000-2009' | '2010-2019' | '2020-now';

/** Kaderin ne seçeceği. Belirtilmezse 'movie' — yayındaki istemciler bu alanı
 *  hiç göndermiyor ve yalnızca film görmeye devam etmeli. */
export type MediaType = 'movie' | 'tv';

export interface PickFilters {
  mediaType?: MediaType;
  genreIds?: number[] | number;
  era?: Era;
  /** Menşe kovası slug'ı (`"europe"`, `"turkiye"` — bkz. `services/origins.ts`)
   *  **veya** ham ISO 639-1 dil kodu.
   *
   *  İkisinin bir arada kabul edilmesi geriye dönük uyum için: yayındaki
   *  1.0.9 hâlâ dil kodu listesi gönderiyor, ve slug tanımayan bir değer dil
   *  kodu sayıldığı için o sürüm bugünkü davranışını aynen görüyor. */
  origin?: string[] | string;
  /** ISO 3166-1 ülke kodları. `origin`'in açılımına eklenir ve onunla VEYA
   *  ilişkisinde çalışır. Slug'lar geldiğinden beri istemcinin bunu ayrıca
   *  göndermesi gerekmiyor; alan doğrudan ülke sormak isteyen çağrılar için
   *  duruyor. */
  originCountries?: string[] | string;
  minDuration?: number;
  maxDuration?: number;

  // --- İnce ayar katmanı (013_refinement) ---

  /** Ruh hâli slug'ları (`"cozy"`, `"dread"` — bkz. `services/moods.ts`).
   *  Birden fazlası VEYA ile birleşiyor: iki ruh hâli seçmek "ikisinden biri"
   *  demek, "ikisi birden" değil — kesişim çoğu bileşimde boş çıkıyor. */
  moods?: string[] | string;
  /** Yaş tavanı. `age_rating` bu değerden büyük olan **ve hiç
   *  sınıflandırılmamış** başlıklar eleniyor; gerekçesi `services/ratings.ts`
   *  içinde. */
  maxAge?: number;
  /** Bilinirlik kadranı. `famous` herkesin bildiklerini, `hidden` kimsenin
   *  bakmadıklarını getiriyor; verilmezse ikisi de. */
  popularity?: Popularity;
  /** Yayıncı kovası slug'ları (`"netflix"` — bkz. `services/networks.ts`).
   *  Yalnız dizide anlamlı; film satırlarında `networks` boş.
   *
   *  Uygulama bunu artık göndermiyor: aynı soruyu `providers` daha doğru
   *  soruyor (bkz. `services/providers.ts`). Alan duruyor çünkü `networks`
   *  sütunu hâlâ dolu ve "kim yayınladı" ile "nerede açabilirim" gerçekten
   *  iki ayrı soru. */
  networks?: string[] | string;

  /** TMDB sağlayıcı kimlikleri. Birden fazlası VEYA ile birleşiyor —
   *  "Netflix'im ya da Disney+'ım var" demek. */
  providers?: number[] | number;
  /** İzleme haklarının sorulacağı ülke (ISO 3166-1 alpha-2). Yalnızca
   *  `providers` ile birlikte anlamlı; verilmezse ABD.
   *
   *  Ayrı bir alan olması şart: hak bölgeye satılıyor ve bölgesiz bir
   *  sağlayıcı filtresi kullanıcıların çoğuna yalan söylerdi. */
  region?: string;
}

/** Bilinirlik kadranının durakları. Ortada durak yok: filtrenin kapalı hâli
 *  zaten "fark etmez". */
export type Popularity = 'famous' | 'hidden';

export interface PickRequest {
  sessionId: string;
  filters: PickFilters;
  /** Movie ids the caller never wants back — e.g. titles already watched.
   *  Merged with the session's own recent picks. Mirrors `/candidates`. */
  excludeMovieIds?: number[];
  /** Uygulamanın dili — başlık bu dilde döner. Gönderilmezse İngilizce. */
  lang?: string;
  /** Zevk vektörü — kaderin ağırlığını eğiyor (bkz. `services/taste.ts`).
   *
   *  `filters` içinde **değil**, bilerek: filtre bir şeyi eliyor, bu hiçbir
   *  şeyi elemiyor. Aynı sebeple gönderilmemesi tamamen geçerli bir durum ve
   *  yayındaki her sürümün gördüğü davranış bu. */
  taste?: unknown;
}

export interface PickResponse {
  movie: Movie | null;
  message?: string;
}

export interface GenresResponse {
  genres: Genre[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

// Candidate with weight for selection algorithm
export interface WeightedCandidate {
  movie: MovieRow;
  weight: number;
  genres: string[];
}
