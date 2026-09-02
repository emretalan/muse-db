-- Oyuncu kadrosu ve seri/üçleme bilgisi.
--
-- İkisi de TMDB'nin bize *zaten gönderdiği* veriden geliyor: seed betiği film
-- detayını `append_to_response=credits` ile çekiyor ve yanıtın içinden yalnızca
-- `crew`'daki yönetmeni alıp `cast`i ve `belongs_to_collection`ı atıyordu.
-- Yeni bir istek türü değil, atılanı saklamak.

-- Kadro. Ayrı bir `people` tablosu kurulmuyor: bugünkü ihtiyaç detay ekranında
-- beş-sekiz isim göstermek, kişi bazlı seçim değil. Kişi sayfası (kalem 12'nin
-- ikinci yarısı) gerektiğinde `person_id` zaten burada duruyor.
CREATE TABLE IF NOT EXISTS movie_cast (
  movie_id     INTEGER  NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  -- TMDB'nin kendi sıralaması. Birincil anahtarın parçası olması yeniden
  -- seed'i fikirsiz kılıyor: aynı sıra üzerine yazılıyor, kadro büyümüyor.
  ord          SMALLINT NOT NULL,
  person_id    INTEGER  NOT NULL,
  name         VARCHAR(200) NOT NULL,
  -- Karakter adı, TMDB'de İngilizce. Ekranda oyuncunun altında küçük punto
  -- duracak; çevirisi yok ve özel isim olduğu için çoğunlukla gerekmiyor.
  character    VARCHAR(300),
  profile_path VARCHAR(255),
  PRIMARY KEY (movie_id, ord)
);

CREATE INDEX IF NOT EXISTS idx_movie_cast_person ON movie_cast(person_id);

-- Seri / üçleme. Yalnızca filmlerde: TMDB dizide `belongs_to_collection`
-- taşımıyor, bir dizi zaten kendisi bir seri.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_id          INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_name        VARCHAR(300);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_poster_path VARCHAR(255);

-- "Bu serinin diğer filmleri" sorgusu bunun üzerinden gidiyor.
CREATE INDEX IF NOT EXISTS idx_movies_collection ON movies(collection_id);

-- Anahtar kelime örtüşmesiyle "buna benzer" sorgusu `movie_keywords`i ters
-- yönde tarıyor (verilen filmin etiketlerini paylaşan başka filmler). Var olan
-- indeks keyword_id üzerinde ve tam da bu yönü karşılıyor; yeni indeks
-- gerekmiyor.
