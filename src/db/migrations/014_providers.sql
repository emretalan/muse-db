-- İzleme sağlayıcıları: "bu akşam bunu nerede açabilirim".
--
-- Bugüne kadar bu bilgi yalnızca **canlı** çekiliyordu: detay ekranı açılınca
-- TMDB'ye gidip o filmin sağlayıcılarını soruyorduk (`/movies/:id/providers`).
-- Bir filtre için o yol kapalı — 14.133 filmi tek tek sormadan "Netflix'imde
-- ne var" sorusuna cevap verilemez. Bu yüzden veri artık bizde duruyor.
--
-- ## Neden bölge sütunu
--
-- İzleme hakları ülkeye göre satılıyor ve fark küçük değil: *Parasite* ABD'de
-- hiçbir abonelikte yokken Almanya'da on ayrı serviste. Bölgesiz bir tablo
-- kullanıcının yarısına yalan söylerdi.
--
-- ## Neden yalnızca abonelik
--
-- TMDB dört tür veriyor: `flatrate` (abonelik), `free`, `ads` (reklamlı) ve
-- `rent`/`buy`. İlk üçü saklanıyor, son ikisi saklanmıyor — neredeyse her film
-- kiralanabilir, yani "kiralanabilir" bir filtre olarak hiçbir şey elemiyor.
-- Kiralama bilgisi detay ekranında canlı olarak gösterilmeye devam ediyor.

CREATE TABLE IF NOT EXISTS providers (
  id        INTEGER PRIMARY KEY,
  name      VARCHAR(200) NOT NULL,
  logo_path VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS movie_providers (
  movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  -- ISO 3166-1 alpha-2.
  region      CHAR(2) NOT NULL,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, region, provider_id)
);

-- Aday sorgusu "bu bölgede bu sağlayıcılarda olan filmler" diye soruyor, yani
-- indeksin baş sütunu bölge olmalı; film kimliği birincil anahtardan zaten
-- geliyor.
CREATE INDEX IF NOT EXISTS idx_movie_providers_lookup
  ON movie_providers(region, provider_id, movie_id);

-- Sağlayıcı verisinin ne zaman tazelendiği. Satır satır değil, geçiş geçiş:
-- betik bir başlığı işlediğinde buraya yazıyor ve bir sonraki tazeleme
-- turunda en eskiden başlıyor. Katalogdaki `created_at` bu işi göremez —
-- o satırın ne zaman **eklendiğini** söylüyor, sağlayıcısının ne zaman
-- sorulduğunu değil.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS providers_synced_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_movies_providers_synced ON movies(providers_synced_at NULLS FIRST);
