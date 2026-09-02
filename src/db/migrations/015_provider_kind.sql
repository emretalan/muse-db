-- Abonelik mi, herkese açık mı.
--
-- 014 üçünü ayırt etmeden saklıyordu: `flatrate` (aboneliğe dahil), `free`
-- ve `ads` (kimseye ödeme yapmadan). Üçü de "ek ödeme yapmadan açabilirsin"
-- demek olduğu için yeterli görünmüştü. Ölçünce görünmedi:
--
--   ABD listesinin ilk beşi Tubi TV, Kanopy, Hoopla, Plex ve Amazon Prime
--   Video oldu — Netflix altıncı sıraya düştü.
--
-- Sebep basit: reklamlı ve kütüphane servislerinin arka kataloğu çok geniş
-- (Kanopy 2.489 başlık) ve kutular başlık sayısına göre sıralanıyor. Kullanıcı
-- "nerede izleyebilirim" diye sorduğunda önce ödediği servisleri görmek
-- istiyor; Tubi'nin listede olması doğru, Netflix'in önünde olması değil.
--
-- Filtre hâlâ ikisini de eşit sayıyor — soru "nerede izleyebilirim", "neye
-- para veriyorum" değil. Değişen yalnızca kutuların sırası.

ALTER TABLE movie_providers ADD COLUMN IF NOT EXISTS kind CHAR(1);

COMMENT ON COLUMN movie_providers.kind IS
  'f = aboneliğe dahil (flatrate), a = herkese açık (free/ads)';
