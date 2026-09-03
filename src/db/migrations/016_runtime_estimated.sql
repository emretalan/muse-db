-- Süresi tahmin edilen dizi satırları.
--
-- 009'un yorumu şunu iddia ediyordu: *"TMDB'nin `episode_run_time` alanı
-- modern dizilerin çoğunda boş, ama S01E01'in kendi `runtime`'ı gerçek bir
-- sayı."* İkinci yarısı doğru, **birinci yarısı yanlış** — ve karar o yanlış
-- yarıya dayanıyordu. Ölçüldü (tablodan rastgele 400 dizi):
--
--   * `episode_run_time` dolu:            292/400  (%73)
--   * S01E01 süresi olmayan aday dizi:     98/113  (kaçırılanların %87'si)
--
-- Yani yedek kaynak "çoğunda boş" değil, çoğunda dolu; ve elenen dizilerin
-- yarısında (58/112) tek başına yeterli. Sonuç, kaçırılan başlıkların büyük
-- çoğunluğunun İspanyolca ve Portekizce telenovela olması: TMDB'de bölüm
-- belgeleri girilmemiş ama dizinin kendi sayfasında süre yazıyor.
--
-- Kestirimin doğruluğu ölçüldü (ikisinin de bilindiği 292 dizide,
-- `episode_run_time`'ın medyanı gerçek S01E01 süresine karşı):
--
--   tam isabet %49 · ±5 dk içinde %83 · medyan hata 1 dk · %25+ sapma %6
--
-- Sapmaların yönü de rastgele değil: hata yapılan yerlerde gerçek pilot
-- **daha uzun** (Miami Vice 97'ye 48, The Incredible Hulk 95'e 50, Dark Side
-- of the Moon 101'e 45) — yani uzun metraj pilotlar. Kestirim tipik bölümü
-- veriyor, pilot ise istisna. Bu yüzden sıra değişmiyor: gerçek S01E01 süresi
-- varsa her zaman o kullanılıyor, kestirim yalnızca o yokken devreye giriyor.
--
-- Bu sütun kestirimle gelen satırı işaretliyor; uygulama o süreyi "≈45 dk"
-- diye gösteriyor, "45 dk" diye değil.

ALTER TABLE movies ADD COLUMN IF NOT EXISTS runtime_estimated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN movies.runtime_estimated IS
  'true = runtime, S01E01 belgesinden değil dizinin episode_run_time alanından kestirildi';
