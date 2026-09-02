-- İnce ayar katmanı: ruh hâli ve yaş sınırı.
--
-- İkisi de **türetilmiş** sütun — TMDB'den yeni bir alan gelmiyor, elimizdeki
-- veriden hesaplanıyorlar. Sorgu anında da hesaplanabilirlerdi ve o yol
-- kuralları değiştirmeyi kolaylaştırırdı; ama her aday sorgusu 177.641
-- satırlık `movie_keywords` üzerinde bir birleşim daha demek olurdu, üstelik
-- facet sayımları bunu her ekranda tekrar yapardı. Kural değiştiğinde
-- `scripts/derive-refinement.ts` yeniden koşuyor — dakikalar sürüyor ve hiçbir
-- TMDB isteği harcamıyor.
--
-- Hiçbiri NOT NULL değil: betik geçene kadar mevcut 20.202 satır boş kalıyor
-- ve boş bir değer yalnızca ilgili filtre seçildiğinde eliyor.

-- Asgari yaş. `certification` dizesinin sayıya indirgenmiş hâli —
-- eşleme ve belirsiz harflerin gerekçesi src/services/ratings.ts içinde.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS age_rating SMALLINT;

-- Ruh hâli slug'ları ("light", "tearjerker"). Bir başlık birden fazlasına
-- girebiliyor: bir animasyon hem hafif hem ağlatan olabilir, ve zaten öyle.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS moods TEXT[];

CREATE INDEX IF NOT EXISTS idx_movies_age_rating ON movies(age_rating);
CREATE INDEX IF NOT EXISTS idx_movies_moods ON movies USING GIN(moods);

-- Kanal ve yönetmen sütunları 008/009 ile geldi ama hiç sorgulanmamıştı;
-- ikisi de artık filtre. Dizi sütunlarında `&&` (kesişim) operatörü
-- kullanılıyor ve GIN indeksi tam olarak onu hızlandırıyor.
CREATE INDEX IF NOT EXISTS idx_movies_networks ON movies USING GIN(networks);
CREATE INDEX IF NOT EXISTS idx_movies_directors ON movies USING GIN(directors);
