-- Başlıkların uygulamanın dilinde gösterilebilmesi için.
--
-- Özet, slogan ve bölüm metinleri istek anında TMDB'den çevrili geliyordu ama
-- başlık hep İngilizce kalıyordu: Türk kullanıcı "Cehennem Silahı" yerine
-- "Lethal Weapon", Japon kullanıcı "リーサル・ウェポン" yerine yine "Lethal
-- Weapon" görüyordu. Ölçüldüğünde TMDB'de çevirisi olup bizim
-- göstermediğimiz başlıklar Türkçede 60'ta 38, Japoncada 60'ta 56 çıktı.
--
-- Başlık özetten farklı olarak yalnızca detay ekranında değil makarada,
-- arşivde, paylaşım kartında ve widget'ta da görünüyor — yani istek anında
-- çekilemez, satırla birlikte gelmesi gerekiyor.

CREATE TABLE IF NOT EXISTS movie_translations (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  -- Uygulamanın dil alt etiketi: tr, de, es, fr, it, ja, pt, zh.
  -- Bölge kodu taşınmıyor; hangi bölgenin çevirisinin alınacağına seed
  -- betiği karar veriyor (pt -> pt-BR, zh -> zh-CN).
  language_code VARCHAR(8) NOT NULL,
  title VARCHAR(500) NOT NULL,
  PRIMARY KEY (movie_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_movie_translations_lang
  ON movie_translations(language_code);
