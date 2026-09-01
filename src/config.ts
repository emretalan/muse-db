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
    minVoteCount: 500,
    // TMDB'nin oy tabanı ezici çoğunlukla İngilizce konuşuyor, o yüzden tek
    // bir oy eşiği İngilizce olmayan sinemayı orantısız eliyor: 200 oy almış
    // bir Türk filmi, kendi izleyicisi içinde 2.000 oy almış İngilizce bir
    // film kadar tanınmış demek. Tek eşikle kütüphanedeki Japon filmlerinin
    // üçte biri, Türk filmlerinin yarısı hiç gösterilmiyordu.
    //
    // İngilizce tarafı 500'de kalıyor — mevcut kullanıcıların gördüğü havuzun
    // %96'sı orası ve kalitesi düşmüyor.
    minVoteCountNonEnglish: 150,

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
    minVoteAverage: 5.5,
    minRuntime: 60,
    // Bir bölüm için 60 dakika anlamsız — bir sitcom bölümü 22 dakika.
    // "Söz ilk bölüm üzerinedir" kararı gereği dizi satırlarındaki `runtime`
    // ilk bölümün süresi, ve filtre onun üzerinde çalışıyor.
    minRuntimeTv: 10,
    recentPicksLimit: 20,
    firstPickTopPercentile: 0.3,
  },

  // TMDB image base URLs
  tmdbImageBaseUrl: 'https://image.tmdb.org/t/p/w500',
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
