-- Karakter adı için VARCHAR(300) yetmedi.
--
-- TMDB kimi kaydı toplu rol listesiyle dolduruyor ("Himself / Narrator /
-- Various Roles / …"). Böyle tek bir değer, 14.585 filmlik bir geçişi
-- 2.400'üncü satırda düşürdü — iki saatlik iş, tek bir dizeye takıldı.
--
-- Postgres'te `text` ile `varchar(n)` arasında başarım farkı yok; buradaki
-- sınırın tek işlevi işi durdurmaktı. Betik ayrıca ekranda okunabilir bir
-- uzunluğa kırpıyor, ama asıl koruma burada: kırpma unutulsa bile geçiş
-- çökmüyor.
ALTER TABLE movie_cast ALTER COLUMN character TYPE TEXT;

-- Aynı gerekçe. Koleksiyon adının 300'ü aşması beklenmiyor ama beklenmedik
-- olan da tam olarak yukarıdaki değerdi.
ALTER TABLE movies ALTER COLUMN collection_name TYPE TEXT;
