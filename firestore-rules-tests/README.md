# Firestore kuralları için sınama

Kuralları emülatörde koşturur. Kural dosyası **uygulama deposunda**
(`../../muse-app-main/firestore.rules`); `RULES_PATH` ile değiştirilebilir.

```bash
npm install
npm test
```

Java gerekiyor (Firestore emülatörü için) ve `firebase-tools` kurulu olmalı.

## Neden burada, kuralların yanında değil

Uygulama deposunda bir `node_modules` klasörü Xcode'un dosya sistemi grubuna
takılıyor: paketlerin `LICENSE` ve `README.md` dosyaları uygulama paketine
kopyalanmaya çalışılıyor ve derleme "Multiple commands produce" ile kırılıyor.
Xcode klasör düzeyinde dışlamayı kabul etmiyor, dosya düzeyinde listelemek de
binlerce satır demek. Sınama, Node araç zincirinin zaten bulunduğu yere taşındı.

## Neden var

Kurallar ortak sözde beş ayrı yazma yolu taşıyor: konuk koltuğuna oturmak,
üçüncü koltuğa oturmak, kendi imzasını atmak, kapıyı kapatmak ve kaderi
çağırmak. Beşi de aynı belgeye yazıyor ve hangisinin hangi alana
dokunabileceği elle okunarak doğrulanamıyor.

Sınama iki gerçek hata buldu:

1. Koltuk başına ayrı kural yazıldığında her yazma denemesinde hepsi
   değerlendiriliyor ve Firestore'un **1000 ifadelik bütçesi doluyordu**.
   Bütçe dolunca sonuç "reddet" oluyor — yani meşru bir imza da
   reddedilebilirdi. Kurallar üçe indirildi.
2. Kapıyı ev sahibinden başkasının da kapatabildiği bir aralık.

Kural değiştirmeden önce ve sonra koşturulmalı.
