import fs from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, Timestamp,
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

console.log(`\n${pass} geçti, ${fail} kaldı\n`);
await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
