/* Uji murni seleksi umur snapshot (hydrateGuard).
   Skenario inti: tarikan bootstrap yang berangkat SEBELUM tulisan lokal
   ("Tiba") sampai ke server membawa revisi LEBIH RENDAH — koleksi itu harus
   ditolak supaya layar tidak mundur ke keadaan basi satu putaran polling.
   Jalankan: node google-apps-script/local-tests/hydrate-guard.test.mjs */
import { selectFreshCollections } from '../../transaceh-react/src/lib/hydrateGuard.js';

let pass = 0, fail = 0;
const ok = (name, cond, ctx) => {
  if (cond) { pass += 1; console.log('  PASS ' + name); return; }
  fail += 1;
  console.log('  FAIL ' + name);
  console.log('    ' + JSON.stringify(ctx));
};

/* Baseline: semua segar (revisi sama/naik) → diterima semua. */
let r = selectFreshCollections(
  { schedules: [{ id: 's_1' }], bookings: [{ id: 'b_1' }] },
  { schedules: 7, bookings: 4 },
  { schedules: 7, bookings: 3 }
);
ok('revisi sama & naik diterima', r.accepted.has('schedules') && r.accepted.has('bookings'), r);

/* Kasus utama: tarikan basi — schedules rev 6 < kepastian lokal 7 → ditolak. */
r = selectFreshCollections(
  { schedules: [{ id: 's_1' }, { id: 's_2', tripStatus: 'scheduled' }] },
  { schedules: 6 },
  { schedules: 7 }
);
ok('koleksi revisi lebih rendah ditolak', !r.accepted.has('schedules'), r);
ok('koleksi ditolak: tidak menggeser revisi lokal', !('schedules' in r.revs), r.revs);
ok('koleksi ditolak: tidak membawa records', !('schedules' in r.records), r.records);

/* Campuran: satu basi, satu segar → hanya segar yang mengganti. */
r = selectFreshCollections(
  { schedules: [{ id: 's_1' }], routes: [{ id: 'r_1' }] },
  { schedules: 5, routes: 9 },
  { schedules: 7, routes: 4 }
);
ok('campuran: basi ditolak, segar diterima', !r.accepted.has('schedules') && r.accepted.has('routes'), r);

/* Koleksi baru di server (lokal belum tahu) → diterima walau revisi kecil. */
r = selectFreshCollections({ routes: [{ id: 'r_1' }] }, { routes: 2 }, {});
ok('koleksi baru diterima', r.accepted.has('routes'), r);

/* Revisi hilang dari snapshot untuk koleksi yang lokal sudah tahu lebih tinggi → ditolak. */
r = selectFreshCollections({ schedules: [{ id: 's_1' }] }, {}, { schedules: 5 });
ok('tanpa revisi & lokal lebih tinggi → ditolak', !r.accepted.has('schedules'), r);

/* Revisi hilang & lokal juga 0 → diterima (bootstrap pertama). */
r = selectFreshCollections({ schedules: [{ id: 's_1' }] }, {}, {});
ok('bootstrap pertama (0 vs 0) diterima', r.accepted.has('schedules'), r);

/* Koleksi ikut dihapus dari snapshot server (tabel lenyap) tapi revisinya segar
   → diterima tanpa records (semantik lenyap = diganti jadi kosong). */
r = selectFreshCollections({}, { routes: 9 }, { routes: 4 });
ok('koleksi lenyap dari server diterima tanpa records', r.accepted.has('routes') && !('routes' in r.records), r);

console.log('\nUji umur snapshot: PASS ' + pass + ', FAIL ' + fail);
process.exit(fail ? 1 : 0);
