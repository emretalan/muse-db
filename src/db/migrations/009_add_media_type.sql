-- Diziler için hazırlık.
--
-- Diziler ayrı bir tabloya DEĞİL, aynı `movies` tablosuna giriyor. Sebebi
-- kimlik çakışması: `movies.id` bir SERIAL ve bu değer sunucunun dışında
-- yaşıyor — kullanıcıların cihazındaki arşivde, Firestore'da, ve her tören
-- başında gönderilen `excludeMovieIds` listesinde. Ayrı bir `tv_series`
-- tablosu kendi serial'ini üretirdi ve `tv_series.id = 42` ile
-- `movies.id = 42` çakışırdı; dışlama listesi yanlış yapımı elerdi.
--
-- Aynı tabloda serial artmaya devam ediyor, mevcut 2.129 kimlik hiç
-- dokunulmadan kalıyor, çakışma imkânsız.

ALTER TABLE movies ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'movie';

-- Bir film ve bir dizi aynı TMDB kimliğini taşıyabilir — iki ayrı ad alanı.
-- Tekillik artık çift üzerinden.
ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_tmdb_id_key;
ALTER TABLE movies ADD CONSTRAINT movies_tmdb_id_media_type_key UNIQUE (tmdb_id, media_type);

CREATE INDEX IF NOT EXISTS idx_movies_media_type ON movies(media_type);

-- Dizilere özel alanlar. Hepsi nullable; film satırlarında boş kalıyor.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS first_air_date           DATE;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS last_air_date            DATE;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS number_of_seasons        SMALLINT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS number_of_episodes       SMALLINT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS networks                 TEXT[];
ALTER TABLE movies ADD COLUMN IF NOT EXISTS first_episode_name       TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS first_episode_overview   TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS first_episode_still_path VARCHAR(255);

-- Not: dizi satırlarında `runtime` ilk bölümün süresini, `year` ilk yayın
-- yılını tutuyor. Bu bir kısaltma değil, "söz ilk bölüm üzerinedir"
-- kararının doğrudan sonucu:
--
--   * Süre filtresi çalışıyor. TMDB'nin `episode_run_time` alanı modern
--     dizilerin çoğunda boş, ama S01E01'in kendi `runtime`'ı gerçek bir sayı.
--   * Dönem filtresi çalışıyor. `first_air_date` zaten ilk bölümün yayın
--     tarihi, yani "2010'lar" sorgusu aralık kesişimi mantığı gerektirmiyor.
--
-- Böylece era ve süre sorguları dizi için tek satır bile değişmeden çalışıyor.

-- TMDB'nin dizi türleri. Sekizi film listesiyle ortak (16, 35, 80, 99, 18,
-- 10751, 9648, 37) ve zaten burada; eksik olan sekizi ekleniyor.
--
-- Listeler birebir aynı değil: TMDB dizide Action ile Adventure'ı 10759'da,
-- Fantasy ile Sci-Fi'ı 10765'te birleştiriyor — ve Korku, Gerilim, Romantik
-- dizide tür olarak hiç yok.
INSERT INTO genres (id, name) VALUES
  (10759, 'Action & Adventure'),
  (10762, 'Kids'),
  (10763, 'News'),
  (10764, 'Reality'),
  (10765, 'Sci-Fi & Fantasy'),
  (10766, 'Soap'),
  (10767, 'Talk'),
  (10768, 'War & Politics')
ON CONFLICT (id) DO NOTHING;
