import { defineConfig } from 'vitest/config';

/**
 * `npm test` yalnızca bu paketin testlerini koşar.
 *
 * `firestore-rules-tests/` ayrı bir npm paketi ve Firestore emülatörünün
 * ayakta olmasını şart koşuyor; kendi komutuyla çalıştırılıyor
 * (`firebase emulators:exec … 'node rules.test.mjs'`). Varsayılan keşif onu da
 * topluyor ve emülatör kapalıyken `npm test` her seferinde kırmızı dönüyordu —
 * yani kırmızının bir şey ifade etmediği bir test komutu.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
