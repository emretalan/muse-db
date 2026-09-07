-- Yapım şirketleri: "A24 gibi bir şey", "Ghibli", "Pixar".
--
-- Dizide bu soruyu `networks` zaten cevaplıyor (009 ile geldi) ve ince ayar
-- ekranında "Kim yaptı?" diye soruluyor. Filmde karşılığı yoktu: TMDB'nin
-- `production_companies` alanı seed'in **zaten çektiği** `/movie/{id}`
-- yanıtının içinde geliyordu ve okunmadan atılıyordu. Yani bu sütunun
-- dolması TMDB'ye tek bir ek istek bile getirmiyor.
--
-- Ayrı bir `companies` + `movie_companies` ikilisi yerine TEXT[]: aynı soruyu
-- cevaplayan `networks` (009) ve `directors` (008) da öyle duruyor ve ikisi
-- de GIN indeksiyle kesişim operatörü üzerinden sorgulanıyor. Junction tablo,
-- şirket kimliğine ya da logosuna ihtiyaç doğduğunda anlamlı olur; bugün
-- ihtiyaç yok ve `countries` tablosunun başına gelen tam olarak bu —
-- kimsenin okumadığı bir tablo.
--
-- Ham adlar tutuluyor, kovalanmış hâli değil: kovalar kütüphane büyüdükçe
-- oynayacak ve sunucuda yaşıyorlardı. Sütuna kova yazmak, her kova
-- değişikliğinde 14 bin satırı yeniden yazmak demekti.
--
-- SONRADAN: stüdyo kovaları (`services/studios.ts`) ve filmdeki "Kim yaptı?"
-- bölümü kaldırıldı — filmde o soruyu sağlayıcı bölümü zaten karşılıyor ve
-- iki bölüm aynı ekranda birbirini tekrar ediyordu. Sütun ve indeksi
-- **duruyor**, seed hâlâ dolduruyor: veri zaten çektiğimiz yanıtın içinde,
-- yani taşıma maliyeti sıfır, ama 107 dakikalık geri doldurmayı ikinci kez
-- yapmak istemeyiz. Bugün hiçbir sorgu okumuyor.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS companies TEXT[];

CREATE INDEX IF NOT EXISTS idx_movies_companies ON movies USING GIN(companies);
