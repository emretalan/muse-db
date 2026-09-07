-- Sezon başlangıçlarını gerçekten sayabilmek için.
--
-- Migration 017 bu sayacı `user_picks.season_slug` üzerinden kurmuştu ve
-- gerekçesi "sayının kaynağı yeni bir tablo değil, zaten yazılan `user_picks`"
-- idi. O dayanak çöktü: `user_picks`e yazan tek yer `/pick`, ve `/pick`
-- uygulamada yalnızca ortak söz yolundan çağrılıyor. Tek kişilik tören —
-- yani sezon kartına dokunan herkesin gittiği yol — `/candidates` kullanıyor
-- ve o uç hiçbir şey kaydetmiyor. Ölçüldü: 017'den bu yana `user_picks`teki
-- 323 satırın 0'ında `season_slug` dolu.
--
-- `/candidates` `user_picks`e yazamaz da: `movie_id` NOT NULL ve movies'e
-- referans, ama kazananı sunucu bilmiyor — makaranın kazananını uygulama
-- yerelde seçiyor. Uydurma bir film kimliği yazmak zararlı olurdu, çünkü
-- `getRecentPickMovieIds` o kimliği okuyup kullanıcının hiç görmediği bir
-- filmi ileride elerdi.
--
-- Sayacın sorduğu soru zaten filmi içermiyor: "bu ay kaç **kişi** bu sezona
-- yola çıktı". Bu yüzden ayrı ve dar bir tablo.
--
-- `UNIQUE` günlük: `prefetchCandidates` tören boyunca birden fazla kez
-- çağrılabiliyor (`PactView`'da üç ayrı yerden) ve aynı törenin üç satır
-- yazması gerekmiyor. Sayım zaten `DISTINCT session_id` üzerinden gidiyor,
-- yani tekrar satır sayıyı bozmazdı; ama tabloyu şişirmesinin de anlamı yok.
--
-- Ay sınırı sunucu tarihinden geliyor (`CURRENT_DATE`). Bu bir gerileme değil:
-- 017'nin `created_at` tabanlı sorgusu da sunucu zamanlıydı. Ay başındaki
-- birkaç satırlık kayma ayrı bir konu.

CREATE TABLE IF NOT EXISTS season_starts (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  season_slug TEXT NOT NULL,
  started_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, season_slug, started_on)
);

-- Sorgu her zaman "şu sezon, şu ay" biçiminde geliyor.
CREATE INDEX IF NOT EXISTS idx_season_starts_month
  ON season_starts (season_slug, started_on);

COMMENT ON TABLE season_starts IS
  'Bir kişinin bir sezonun ritüelini başlattığı gün; sezon kartındaki "bu ay N kişi yola çıktı" satırının kaynağı.';
