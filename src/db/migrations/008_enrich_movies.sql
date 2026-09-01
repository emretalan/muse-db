-- TMDB'nin film detayında zaten duran ama seed betiğinin hiç açmadığı alanlar.
--
-- Hepsi nullable: mevcut 2.129 satır olduğu gibi kalır, seed betiği ikinci kez
-- çalıştığında ON CONFLICT ile doldurulur. Tablo hiçbir noktada temizlenmez —
-- `movies.id` kullanıcıların cihazındaki arşivde ve Firestore'da duruyor.

ALTER TABLE movies ADD COLUMN IF NOT EXISTS backdrop_path  VARCHAR(255);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tagline        TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS imdb_id        VARCHAR(20);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS popularity     DECIMAL(12,4);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS status         VARCHAR(32);

-- Kullanıcının bölgesine göre yaş sınırı ("PG-13", "18", "12A"). TMDB bunu
-- release_dates altında ülke ülke veriyor; seed betiği ABD'yi taban alıp
-- yoksa ilk dolu değere düşüyor.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS certification  VARCHAR(16);

-- Yönetmen(ler). credits.crew içinde job = 'Director' olan herkes — bir filmin
-- birden fazla yönetmeni olabilir (Coen kardeşler, Russo kardeşler), o yüzden
-- dizi. Ayrı bir people tablosu kurmuyoruz: bugün ihtiyaç ekranda bir isim
-- göstermek, kişi bazlı seçim değil.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS directors      TEXT[];

CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies(popularity);

-- Anahtar kelimeler: tür 19 kutuya sıkışık, bunlar binlerce. genres/movie_genres
-- ile aynı desen.
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS movie_keywords (
  movie_id   INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_movie_keywords_keyword_id ON movie_keywords(keyword_id);
