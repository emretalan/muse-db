import 'dotenv/config';

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/muse_dev',

  // TMDB (for seeding)
  tmdbApiKey: process.env.TMDB_API_KEY || '',

  // Selection algorithm constants
  selection: {
    // Oy eşikleri üç kademeli; kademelerin dil üyeliği ve gerekçesi
    // `services/languages.ts` içinde (TIER_TWO_LANGUAGES).
    //
    // İngilizce tarafı 500'de kalıyor — mevcut kullanıcıların gördüğü havuzun
    // %96'sı orası ve kalitesi düşmüyor.
    minVoteCount: 500,
    // Kademe 2 (fr, it, ja, es): TMDB'de havuzu geniş olan diller.
    minVoteCountNonEnglish: 150,
    // Kademe 3 (geri kalan her dil): havuzun kendisi zaten dar. 150 eşiği
    // Türkçe için TMDB'de yalnızca 39 film bırakıyordu; 50 ile 241 oluyor.
    minVoteCountTierThree: 50,

    // Diziler ayrı eşikler istiyor: TMDB'de bir dizi, aynı tanınırlıktaki bir
    // filmden belirgin şekilde daha az oy topluyor. Film eşikleri dizide
    // uygulanırsa seed'in eklediği satırların çoğu tabloya girip hiç
    // gösterilmez — filmde `movie_countries` ile yaşanan ölü veri durumunun
    // aynısı, ama bu kez baştan.
    //
    // Değerler seed taramalarının alt sınırlarıyla hizalı (seed-tv.ts):
    // dönem taramaları 200, bölge taramaları 50-100.
    minVoteCountTv: 200,
    minVoteCountTvNonEnglish: 50,
    minVoteCountTvTierThree: 20,
    minVoteAverage: 5.5,
    minRuntime: 60,
    // Bir bölüm için 60 dakika anlamsız — bir sitcom bölümü 22 dakika.
    // "Söz ilk bölüm üzerinedir" kararı gereği dizi satırlarındaki `runtime`
    // ilk bölümün süresi, ve filtre onun üzerinde çalışıyor.
    minRuntimeTv: 10,
    // Bilinirlik kadranının durakları — görünür kataloğun oy dağılımından
    // ölçüldü. Filmde medyan 547 oy, %85'lik dilim 2.637; dizide 138 ve 696.
    // "Herkesin bildikleri" üst %15, "kimsenin bakmadıkları" alt üçte bir.
    //
    // Dizi için ayrı değerler şart: aynı tanınırlıktaki bir dizi TMDB'de
    // filmden belirgin şekilde daha az oy topluyor, ve film eşiği diziye
    // uygulanırsa "herkesin bildikleri" kutusu 300 diziye düşüyor.
    famousVotes: 2500,
    famousVotesTv: 700,
    hiddenVotes: 250,
    hiddenVotesTv: 70,
    recentPicksLimit: 20,
    firstPickTopPercentile: 0.3,
  },

  // TMDB image base URLs
  tmdbImageBaseUrl: 'https://image.tmdb.org/t/p/w500',
  // Oyuncu portreleri detay ekranında ~64 pt genişliğinde yan yana duruyor;
  // afiş boyutu (w500) burada sekiz kat fazla.
  tmdbProfileBaseUrl: 'https://image.tmdb.org/t/p/w185',
  // Provider logos are small chips — w500 would be ~25x oversized
  tmdbLogoBaseUrl: 'https://image.tmdb.org/t/p/w92',
  // Backdrops are 16:9 and sit behind the whole detail screen, so they need
  // real width — w500 on a 3x phone would visibly soften.
  tmdbBackdropBaseUrl: 'https://image.tmdb.org/t/p/w1280',
  // Bölüm kareleri detay ekranında ~350 pt genişliğinde bir kartta duruyor,
  // backdrop gibi tam ekran değil. w1280 aynı görsel için iki katına yakın
  // veri indiriyordu (95 KB'a karşı 58 KB).
  tmdbStillBaseUrl: 'https://image.tmdb.org/t/p/w780',
} as const;

export function validateConfig(): void {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
}
