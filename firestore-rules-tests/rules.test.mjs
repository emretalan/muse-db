import fs from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, Timestamp, increment,
} from 'firebase/firestore';

// Kurallar uygulama deposunda yaşıyor (`firebase.json` ve dağıtım orada), ama
// sınama burada: uygulama deposunda bir `node_modules` klasörü Xcode'un dosya
// sistemi grubuna takılıyor ve paketlerin LICENSE/README dosyaları uygulama
// paketine kopyalanmaya çalışılıyor. Xcode klasör düzeyinde dışlamayı kabul
// etmiyor, dosya düzeyinde listelemek de binlerce satır demek.
const RULES = process.env.RULES_PATH
  ?? new URL('../../muse-app-main/firestore.rules', import.meta.url).pathname;

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${String(e).split('\n')[0]}`); fail++; }
}

const env = await initializeTestEnvironment({
  projectId: 'muse-rules-test',
  firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
});

const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const ref = (d, code) => doc(d, 'sharedPacts', code);

const future = () => Timestamp.fromDate(new Date(Date.now() + 3600e3));

async function seed(code, extra = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sharedPacts', code), {
      code, status: 'awaitingGuest', createdAt: Timestamp.now(), expiresAt: future(),
      hostUid: 'host', hostFilters: { mediaType: 'movie' }, ...extra,
    });
  });
}

console.log('\nİKİ KİŞİLİK SÖZ — bugünkü davranış korunuyor mu');
await env.clearFirestore();
await check('ev sahibi söz açabiliyor', async () => {
  await assertSucceeds(setDoc(ref(db('host'), 'AAA111'), {
    code: 'AAA111', status: 'awaitingGuest', createdAt: Timestamp.now(),
    expiresAt: future(), hostUid: 'host', hostFilters: {}, allowsGroup: false,
  }));
});
await check('başkasının adına söz açılamıyor', async () => {
  await assertFails(setDoc(ref(db('mallory'), 'AAA112'), {
    code: 'AAA112', status: 'awaitingGuest', createdAt: Timestamp.now(),
    expiresAt: future(), hostUid: 'host', hostFilters: {},
  }));
});
await seed('BBB222');
await check('boş koltuğa oturulabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('guest'), 'BBB222'), {
    guestUid: 'guest', status: 'awaitingSignatures', guestName: 'Ali',
  }));
});
await check('konuk kendi imzasını atabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('guest'), 'BBB222'), {
    guestFilters: { mediaType: 'tv' }, guestSignedAt: Timestamp.now(),
  }));
});
await check('konuk ev sahibinin imzasını atamıyor', async () => {
  await assertFails(updateDoc(ref(db('guest'), 'BBB222'), {
    hostSignedAt: Timestamp.now(),
  }));
});
await check('ev sahibi konuğun imzasını atamıyor', async () => {
  await assertFails(updateDoc(ref(db('host'), 'BBB222'), {
    guestSignedAt: Timestamp.now(),
  }));
});
await check('yabancı dolu iki kişilik sözü okuyamıyor', async () => {
  await assertFails(getDoc(ref(db('mallory'), 'BBB222')));
});
await check('yabancı üçüncü koltuğa oturamıyor (masa küçük)', async () => {
  await assertFails(updateDoc(ref(db('mallory'), 'BBB222'), {
    'extras.mallory': { joinedAt: Timestamp.now() },
  }));
});
await check('giriş yapmamış kullanıcı hiçbir şey yapamıyor', async () => {
  await assertFails(getDoc(ref(anon(), 'BBB222')));
});

console.log('\nGRUP SÖZÜ');
await env.clearFirestore();
await seed('CCC333', { allowsGroup: true, guestUid: 'guest', status: 'awaitingSignatures' });
await check('üçüncü kişi kodu okuyabiliyor', async () => {
  await assertSucceeds(getDoc(ref(db('c'), 'CCC333')));
});
await check('üçüncü kişi kendi koltuğuna oturabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('c'), 'CCC333'), {
    'extras.c': { joinedAt: Timestamp.now(), name: 'Can' },
  }));
});
await check('üçüncü kişi kendi imzasını atabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('c'), 'CCC333'), {
    'extras.c.signedAt': Timestamp.now(), 'extras.c.filters': { mediaType: 'movie' },
  }));
});
await check('üçüncü kişi masadan kalkabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('c'), 'CCC333'), { 'extras.c': deleteField() }));
});
await check('dördüncü kişi de oturabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('d'), 'CCC333'), {
    'extras.d': { joinedAt: Timestamp.now() },
  }));
});
await check('bir katılımcı başkasının koltuğunu yazamıyor', async () => {
  await assertFails(updateDoc(ref(db('d'), 'CCC333'), {
    'extras.e': { joinedAt: Timestamp.now() },
  }));
});
await check('bir katılımcı başkasının imzasını atamıyor', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'sharedPacts', 'CCC333'), {
      'extras.e': { joinedAt: Timestamp.now() },
    });
  });
  await assertFails(updateDoc(ref(db('d'), 'CCC333'), {
    'extras.e.signedAt': Timestamp.now(),
  }));
});
await check('üçüncü kişi konuğun imzasını atamıyor', async () => {
  await assertFails(updateDoc(ref(db('d'), 'CCC333'), { guestSignedAt: Timestamp.now() }));
});
await check('üçüncü kişi süreyi uzatamıyor', async () => {
  await assertFails(updateDoc(ref(db('d'), 'CCC333'), { expiresAt: future() }));
});

console.log('\nKADERİ ÇAĞIRMA');
await check('üçüncü kişi kaderi talep edebiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('d'), 'CCC333'), { pickClaimedBy: 'd' }));
});
await check('üçüncü kişi sonucu yazabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('d'), 'CCC333'), {
    resultMovie: { id: 1, title: 'X' }, status: 'sealed',
  }));
});
await check('masada olmayan biri sonucu yazamıyor', async () => {
  await assertFails(updateDoc(ref(db('mallory'), 'CCC333'), {
    resultMovie: { id: 2, title: 'Y' },
  }));
});

console.log('\nMASAYI KAPATMA');
await env.clearFirestore();
await seed('EEE555', { allowsGroup: true, guestUid: 'guest', status: 'awaitingSignatures',
                       extras: { c: { joinedAt: Timestamp.now() } } });
await check('konuk kapıyı kapatamıyor', async () => {
  await assertFails(updateDoc(ref(db('guest'), 'EEE555'), { tableClosed: true }));
});
await check('üçüncü kişi kapıyı kapatamıyor', async () => {
  await assertFails(updateDoc(ref(db('c'), 'EEE555'), { tableClosed: true }));
});
await check('masaya oturan biri kapıyı kapatamıyor', async () => {
  await assertFails(updateDoc(ref(db('d'), 'EEE555'), {
    'extras.d': { joinedAt: Timestamp.now() }, tableClosed: true,
  }));
});
await check('ev sahibi kapıyı kapatabiliyor', async () => {
  await assertSucceeds(updateDoc(ref(db('host'), 'EEE555'), { tableClosed: true }));
});

console.log('\nSÜRESİ DOLMUŞ / İPTAL');
await env.clearFirestore();
await check('hiçbir söz silinemiyor', async () => {
  await seed('DDD444', { allowsGroup: true, guestUid: 'g', status: 'awaitingSignatures' });
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(ref(db('host'), 'DDD444')));
});

console.log('\nSÖZ GEÇMİŞİ');
await env.clearFirestore();
const hist = (d, uid, code) => doc(d, 'users', uid, 'pactHistory', code);
const record = { code: 'ZZZ999', sealedAt: Timestamp.now(), movieId: 550,
                 movieTitle: 'X', moviePosterUrl: 'p', mediaType: 'movie',
                 others: [{ uid: 'ali', name: 'Ali' }] };
await check('kendi geçmişine yazabiliyor', async () => {
  await assertSucceeds(setDoc(hist(db('me'), 'me', 'ZZZ999'), record));
});
await check('kendi geçmişini okuyabiliyor', async () => {
  await assertSucceeds(getDoc(hist(db('me'), 'me', 'ZZZ999')));
});
await check('başkasının geçmişini okuyamıyor', async () => {
  await assertFails(getDoc(hist(db('ali'), 'me', 'ZZZ999')));
});
await check('başkasının geçmişine yazamıyor', async () => {
  await assertFails(setDoc(hist(db('ali'), 'me', 'AAA000'), record));
});
await check('kimsesiz kayıt yazılamıyor', async () => {
  await assertFails(setDoc(hist(db('me'), 'me', 'BBB000'), { ...record, others: [] }));
});
await check('tanınmayan alan yazılamıyor', async () => {
  await assertFails(setDoc(hist(db('me'), 'me', 'CCC000'), { ...record, secret: 1 }));
});

// ---------------------------------------------------------------------------
// ARŞİV — bulut yedeği
//
// Bu bölüm sınama takımına sonradan eklendi ve eklenir eklenmez bir hata
// buldu: `validDealData()` beyaz listesinde `reaction` yoktu, ama uygulama
// her `syncDeal` çağrısında o anahtarı gönderiyor. Yani kalem 14'ten beri
// arşivin bulut yedeği tümüyle reddediliyordu.
//
// Aynı sınıftan ikinci hataydı — birincisi `trackingEpoch` ile yaşanmıştı ve
// `MainContainerView.backfillArchiveIfNeeded` onu anlatıyor. İkisinin de tek
// sebebi var: `deals` için hiç sınama yoktu.
console.log('\nARŞİV — sözün bulut yedeği');
await env.clearFirestore();

const dealRef = (d, uid, id) => doc(d, 'users', uid, 'deals', id);

/** Uygulamanın `FirestoreService.syncDeal` ile yazdığı belgenin aynısı. */
// `FirestoreService.syncDeal`in gönderdiği haritanın birebir kopyası —
// **bütün anahtarlarıyla**. Değeri nil olan alanlar da haritada duruyor
// (`deal.pledgeKind as Any` NSNull'a köprüleniyor ve Firestore null bir alan
// yazıyor), ve `hasOnly` fazladan tek bir anahtarda bütün yazmayı reddediyor.
// Yardımcıyı eksik tutmak bu sınamayı işe yaramaz yapar: kaçırdığı anahtar
// tam da beyaz listeye eklenmesi unutulan anahtar olurdu.
const deal = (extra = {}) => ({
  movieTitle: 'Küçük Cadı Kiki',
  movieYear: '1989',
  moviePosterUrl: 'p.jpg',
  dealDate: Timestamp.now(),
  isFulfilled: false,
  fulfilledDate: null,
  movieId: 16859,
  mediaType: 'tv',
  reaction: null,
  pledgeKind: null,
  startedAt: null,
  seriesOutcome: null,
  episodeTarget: null,
  seasonSlug: null,
  trackingEpoch: 1,
  syncedAt: serverTimestamp(),
  ...extra,
});

await check('uygulamanın gerçekten yazdığı belge kabul ediliyor', async () => {
  await assertSucceeds(setDoc(dealRef(db('me'), 'me', 'd1'), deal()));
});
await check('cevaplanmış söz yazılabiliyor', async () => {
  await assertSucceeds(setDoc(dealRef(db('me'), 'me', 'd2'), deal({ reaction: 'loved' })));
});
await check('başkasının arşivine yazılamıyor', async () => {
  await assertFails(setDoc(dealRef(db('ali'), 'me', 'd3'), deal()));
});
await check('başkasının arşivi okunamıyor', async () => {
  await assertFails(getDoc(dealRef(db('ali'), 'me', 'd1')));
});
await check('tanınmayan alan reddediliyor', async () => {
  await assertFails(setDoc(dealRef(db('me'), 'me', 'd4'), deal({ secret: 1 })));
});
await check('yanlış tip reddediliyor', async () => {
  await assertFails(setDoc(dealRef(db('me'), 'me', 'd5'), deal({ isFulfilled: 'evet' })));
});

// Dizi sözünün birimi — yeni alanlar
await check('bölüm sözü yazılabiliyor', async () => {
  await assertSucceeds(setDoc(dealRef(db('me'), 'me', 'd6'), deal({
    pledgeKind: 'episode', startedAt: null, seriesOutcome: null, episodeTarget: null,
  })));
});
await check('bitirme sözü ve ilerlemesi yazılabiliyor', async () => {
  await assertSucceeds(setDoc(dealRef(db('me'), 'me', 'd7'), deal({
    pledgeKind: 'series', startedAt: Timestamp.now(), episodeTarget: 6,
  })));
});
await check('dizi sonucu yazılabiliyor', async () => {
  await assertSucceeds(setDoc(dealRef(db('me'), 'me', 'd8'), deal({
    pledgeKind: 'episode', seriesOutcome: 'dropped',
  })));
});
await check('bölüm hedefi sayı olmak zorunda', async () => {
  await assertFails(setDoc(dealRef(db('me'), 'me', 'd9'), deal({ episodeTarget: 'altı' })));
});
await check('başlama anı tarih olmak zorunda', async () => {
  await assertFails(setDoc(dealRef(db('me'), 'me', 'd10'), deal({ startedAt: 'dün' })));
});
await check('sezon slug\'ı yazılabiliyor', async () => {
  await assertSucceeds(setDoc(dealRef(db('me'), 'me', 'd11'), deal({ seasonSlug: 'world-tour' })));
});
await check('sezon slug\'ı metin olmak zorunda', async () => {
  await assertFails(setDoc(dealRef(db('me'), 'me', 'd12'), deal({ seasonSlug: 7 })));
});


// ---------------------------------------------------------------------------
// KULLANICI BELGESİ
//
// `deals` için sınama olmaması, beyaz listeyi uygulamanın gerisinde bırakmış ve
// bulut yedeğini haftalarca sessizce kırmıştı. `users` ve `pactHistory` aynı
// boşlukta duruyordu. Aşağıdaki yazmalar `FirestoreService`'in **gerçekten**
// gönderdiği haritaların kopyası — alan listesini tahmin eden bir sınama aynı
// hatayı bir kez daha kaçırırdı.
// ---------------------------------------------------------------------------
const userRef = (d, uid) => doc(d, 'users', uid);

/** `ensureUserProfile`, belge yokken. */
const fullProfile = (extra = {}) => ({
  createdAt: serverTimestamp(),
  lastActiveAt: serverTimestamp(),
  trackingEpoch: 1,
  trackingStartedAt: serverTimestamp(),
  totalPicks: 0,
  isPremium: false,
  isAnonymous: true,
  ...extra,
});

async function seedUser(uid, data = fullProfile()) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), data);
  });
}

console.log('\nKULLANICI BELGESİ');

await check('yeni profil oluşturulabiliyor (ensureUserProfile)', async () => {
  await assertSucceeds(setDoc(userRef(db('u1'), 'u1'), fullProfile()));
});

await check('başkasının profiline yazılamıyor', async () => {
  await assertFails(setDoc(userRef(db('u1'), 'u2'), fullProfile()));
});

await check('var olan profilde etkinlik damgası tazelenebiliyor', async () => {
  await seedUser('u3');
  await assertSucceeds(setDoc(userRef(db('u3'), 'u3'), {
    lastActiveAt: serverTimestamp(), isAnonymous: true,
  }, { merge: true }));
});

await check('premium durumu güncellenebiliyor', async () => {
  await seedUser('u4');
  await assertSucceeds(setDoc(userRef(db('u4'), 'u4'), {
    isPremium: true, lastActiveAt: serverTimestamp(),
  }, { merge: true }));
});

await check('seçim sayacı artırılabiliyor', async () => {
  await seedUser('u5');
  await assertSucceeds(setDoc(userRef(db('u5'), 'u5'), {
    totalPicks: increment(1), lastActiveAt: serverTimestamp(), trackingEpoch: 1,
  }, { merge: true }));
});

await check('Apple ile giriş, profili olan kullanıcıda geçiyor', async () => {
  await seedUser('u6');
  await assertSucceeds(setDoc(userRef(db('u6'), 'u6'), {
    lastActiveAt: serverTimestamp(), isAnonymous: false, trackingEpoch: 1,
    email: 'a@b.c', displayName: 'Ada',
  }, { merge: true }));
});

// `validUserData()` beş alanı koşulsuz istiyor ve kural güncellemede yazma
// **sonrası** belgeye bakıyor. Belge henüz yokken eksik bir profil göndermek
// bu yüzden reddediliyor — ve reddedilmesi doğru. `createOrUpdateUserProfile`
// eskiden tam olarak bunu gönderiyordu; Apple ile ilk girişte kimlik
// dinleyicisiyle yarışı kaybettiğinde profil sessizce yazılamıyor, e-posta ve
// ad kayboluyordu. Kural değil uygulama düzeltildi; aşağıdaki iki sınama o
// kararı birlikte tutuyor.
await check('belge yokken eksik profil reddediliyor', async () => {
  await assertFails(setDoc(userRef(db('u7'), 'u7'), {
    lastActiveAt: serverTimestamp(), isAnonymous: false, trackingEpoch: 1,
    email: 'a@b.c', displayName: 'Ada',
  }, { merge: true }));
});

await check('Apple ile giriş, profili olmayan kullanıcıda eksiksiz yazıyor', async () => {
  await assertSucceeds(setDoc(userRef(db('u10'), 'u10'), {
    lastActiveAt: serverTimestamp(), isAnonymous: false, trackingEpoch: 1,
    email: 'a@b.c', displayName: 'Ada',
    createdAt: serverTimestamp(), totalPicks: 0, isPremium: false,
    trackingStartedAt: serverTimestamp(),
  }, { merge: true }));
});

// `ensureUserProfile`in güncelleme dalı da yarım belgeyi tamamlıyor: eksik
// bırakırsa kendi yazması da reddedilir ve profil bir daha hiç düzelmez.
await check('yarım kalmış belge tamamlanarak güncellenebiliyor', async () => {
  await seedUser('u11', { lastActiveAt: serverTimestamp(), isAnonymous: true });
  await assertSucceeds(setDoc(userRef(db('u11'), 'u11'), {
    lastActiveAt: serverTimestamp(), isAnonymous: true,
    createdAt: serverTimestamp(), totalPicks: 0, isPremium: false,
  }, { merge: true }));
});

await check('bilinmeyen alan reddediliyor', async () => {
  await assertFails(setDoc(userRef(db('u8'), 'u8'), fullProfile({ nickname: 'x' })));
});

await check('totalPicks metin olamaz', async () => {
  await assertFails(setDoc(userRef(db('u9'), 'u9'), fullProfile({ totalPicks: 'üç' })));
});

// ---------------------------------------------------------------------------
// SÖZ GEÇMİŞİ — kişisel kopya
// ---------------------------------------------------------------------------
const histRef = (d, uid, code) => doc(d, 'users', uid, 'pactHistory', code);

/** `PactHistoryService.record`in gönderdiği haritanın kopyası. */
const historyRecord = (extra = {}) => ({
  code: 'ABC123',
  sealedAt: Timestamp.now(),
  movieId: 16859,
  movieTitle: 'Küçük Cadı Kiki',
  moviePosterUrl: 'p.jpg',
  mediaType: 'movie',
  others: [{ uid: 'friend', name: 'Ada' }],
  ...extra,
});

console.log('\nSÖZ GEÇMİŞİ — kişisel kopya');

await check('kendi ağacına yazılabiliyor', async () => {
  await assertSucceeds(setDoc(histRef(db('me'), 'me', 'ABC123'), historyRecord()));
});

await check('adı olmayan katılımcı da yazılabiliyor', async () => {
  await assertSucceeds(setDoc(histRef(db('me'), 'me', 'ABC124'), historyRecord({
    others: [{ uid: 'friend' }],
  })));
});

await check('mediaType olmadan da yazılabiliyor', async () => {
  const r = historyRecord(); delete r.mediaType;
  await assertSucceeds(setDoc(histRef(db('me'), 'me', 'ABC125'), r));
});

await check('başkasının ağacına yazılamıyor', async () => {
  await assertFails(setDoc(histRef(db('me'), 'other', 'ABC126'), historyRecord()));
});

await check('boş katılımcı listesi reddediliyor', async () => {
  await assertFails(setDoc(histRef(db('me'), 'me', 'ABC127'), historyRecord({ others: [] })));
});

await check('bilinmeyen alan reddediliyor', async () => {
  await assertFails(setDoc(histRef(db('me'), 'me', 'ABC128'), historyRecord({ note: 'x' })));
});


console.log(`\n${pass} geçti, ${fail} kaldı\n`);
await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
