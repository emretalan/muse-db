import { describe, expect, it } from 'vitest';
import { normalizeLanguage, tmdbLocale, TRANSLATION_TARGETS } from './languages.js';

/**
 * `normalizeLanguage` istemciden gelen serbest metni veritabanı anahtarına
 * çeviren tek nokta; yanlış cevap verirse sonuç sessizce İngilizceye düşmek
 * oluyor, yani hata gürültü çıkarmıyor. Kapsanan asıl şey bölge/yazı
 * ayrımı: fonksiyon eskiden ilk bileşeni alıp gerisini atıyordu ve o hâliyle
 * `pt-PT` ile `zh-Hant` hiçbir zaman eşleşemezdi.
 */
describe('normalizeLanguage', () => {
  it('düz alt etiketleri olduğu gibi tanır', () => {
    expect(normalizeLanguage('ru')).toBe('ru');
    expect(normalizeLanguage('ko')).toBe('ko');
    expect(normalizeLanguage('th')).toBe('th');
    expect(normalizeLanguage('vi')).toBe('vi');
  });

  it('bölge ve yazı sistemini korur', () => {
    expect(normalizeLanguage('pt-PT')).toBe('pt-PT');
    expect(normalizeLanguage('pt-BR')).toBe('pt-BR');
    expect(normalizeLanguage('zh-Hant')).toBe('zh-Hant');
    expect(normalizeLanguage('zh-Hans')).toBe('zh-Hans');
  });

  it('üçüncü bileşeni atar', () => {
    expect(normalizeLanguage('zh-Hant-TW')).toBe('zh-Hant');
    expect(normalizeLanguage('zh-Hans-CN')).toBe('zh-Hans');
  });

  it('bölge ekli düz dilleri alt etikete indirir', () => {
    expect(normalizeLanguage('ru-RU')).toBe('ru');
    expect(normalizeLanguage('de-AT')).toBe('de');
  });

  it('büyük harfe ve alt çizgiye duyarsız', () => {
    expect(normalizeLanguage('TR')).toBe('tr');
    expect(normalizeLanguage('pt_pt')).toBe('pt-PT');
    expect(normalizeLanguage('ZH-HANT')).toBe('zh-Hant');
    expect(normalizeLanguage('  ru  ')).toBe('ru');
  });

  // Mağazadaki eski sürümler hâlâ çıplak alt etiket yolluyor; bunlar
  // İngilizceye düşerse Portekizce ve Çince kullanıcılar başlıklarını
  // kaybeder.
  it('eski istemcilerin çıplak alt etiketlerini eski hedefe bağlar', () => {
    expect(normalizeLanguage('pt')).toBe('pt-BR');
    expect(normalizeLanguage('zh')).toBe('zh-Hans');
    expect(normalizeLanguage('pt-AO')).toBe('pt-BR');
  });

  it('İngilizce ve tanınmayan her şey için null döner', () => {
    expect(normalizeLanguage('en')).toBeNull();
    expect(normalizeLanguage('en-US')).toBeNull();
    expect(normalizeLanguage('xx')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
    expect(normalizeLanguage('---')).toBeNull();
  });

  it('kendi anahtarlarının hepsini geri verir', () => {
    for (const code of Object.keys(TRANSLATION_TARGETS)) {
      expect(normalizeLanguage(code)).toBe(code);
    }
  });
});

describe('tmdbLocale', () => {
  it('TMDB biçiminde dil-bölge üretir', () => {
    expect(tmdbLocale('zh-Hant')).toBe('zh-TW');
    expect(tmdbLocale('zh-Hans')).toBe('zh-CN');
    expect(tmdbLocale('pt-PT')).toBe('pt-PT');
    expect(tmdbLocale('pt-BR')).toBe('pt-BR');
    expect(tmdbLocale('ko')).toBe('ko-KR');
    expect(tmdbLocale('sv')).toBe('sv-SE');
    expect(tmdbLocale('hi')).toBe('hi-IN');
  });

  it('tanınmayan kodda İngilizceye düşer', () => {
    expect(tmdbLocale('xx')).toBe('en-US');
  });
});

describe('TRANSLATION_TARGETS', () => {
  // Bölge kodu iki büyük harf olmak zorunda: seed betikleri onu TMDB'nin
  // `iso_3166_1` alanıyla birebir karşılaştırıyor, tek harf farkı o dilin
  // hiçbir başlığının yazılmaması demek.
  it('her hedef geçerli ISO kodları taşır', () => {
    for (const [code, target] of Object.entries(TRANSLATION_TARGETS)) {
      expect(target.iso639, code).toMatch(/^[a-z]{2}$/);
      expect(target.region, code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('İngilizce tabloda yok — temel dil o', () => {
    expect(TRANSLATION_TARGETS.en).toBeUndefined();
  });
});
