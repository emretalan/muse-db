-- movie_translations.language_code artık uygulamanın tam dil kodunu taşıyor.
--
-- Tablo `pt` ve `zh` diye anahtarlanmıştı, çünkü uygulama yalnızca alt etiket
-- yolluyordu ve her alt etiketin tek bir hedefi vardı. Portekiz Portekizcesi
-- ve Geleneksel Çince eklenince bu düştü: `pt` artık iki hedefin,
-- `zh` de iki hedefin alt etiketi.
--
-- Satırlar yerinde güncellenmiyor, **kopyalanıyor**. Sebebi kesinti penceresi:
-- bu göç ile yeni API kodunun yayına girmesi arasında eski kod hâlâ
-- `language_code = 'pt'` arıyor. Taşınsalardı o aralıkta Portekizce ve Çince
-- kullanıcılar İngilizce başlık görürdü. Kopyada iki anahtar da bir süre
-- yan yana duruyor ve pencere hiç açılmıyor.
--
-- Eski `pt`/`zh` satırları yayın doğrulandıktan sonra ayrıca siliniyor.

INSERT INTO movie_translations (movie_id, language_code, title)
SELECT movie_id, 'pt-BR', title
FROM movie_translations
WHERE language_code = 'pt'
ON CONFLICT (movie_id, language_code) DO NOTHING;

INSERT INTO movie_translations (movie_id, language_code, title)
SELECT movie_id, 'zh-Hans', title
FROM movie_translations
WHERE language_code = 'zh'
ON CONFLICT (movie_id, language_code) DO NOTHING;
