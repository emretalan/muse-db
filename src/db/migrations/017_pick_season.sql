-- Sezon başlangıçlarını sayabilmek için.
--
-- Ana ekrandaki sezon kartı bugün yalnızca kişisel ilerlemeyi gösteriyor
-- (`4/6`) ve o sayı tamamen cihazda hesaplanıyor. Karta bir de toplu satır
-- gelecek: "bu ay N kişi yola çıktı."
--
-- Sayının kaynağı yeni bir tablo değil, zaten yazılan `user_picks`: satır
-- kader filmi seçtiği anda düşüyor, yani "başladı" sinyali elimizde. Eksik
-- olan tek şey o satırın hangi sezona ait olduğu.
--
-- Sezonu filtre imzasından çıkarsamak da mümkündü (`filters @> '...'`) ve
-- denenmedi, çünkü kırılgan: sezon dışından aynı filtreleri elle seçen
-- kullanıcı ayırt edilemiyor, ve `filters` her istekte `region` taşıdığı için
-- imza kişiden kişiye değişiyor. Slug'ı açıkça taşımak hem kesin hem ucuz.
--
-- **Tamamlama sayılamıyor ve sayılmayacak.** `isFulfilled` sunucuya hiç
-- ulaşmıyor; yalnızca cihazda ve Firestore'da. Bu bir eksiklik değil, doğru
-- çerçeve: "yola çıktı" davet ediyor, "tamamladı" kıyaslamaya çağırıyor.

ALTER TABLE user_picks ADD COLUMN IF NOT EXISTS season_slug TEXT;

-- Sorgu her zaman "şu sezon, şu ay" biçiminde geliyor.
CREATE INDEX IF NOT EXISTS idx_user_picks_season
  ON user_picks (season_slug, created_at)
  WHERE season_slug IS NOT NULL;

COMMENT ON COLUMN user_picks.season_slug IS
  'Seçim bir tematik sezonun ritüelinden geldiyse o sezonun slug''ı; yoksa NULL';
