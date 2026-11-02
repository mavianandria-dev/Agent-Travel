/* Seleksi koleksi bootstrap yang layak mengganti cache lokal.
   Aturan umur foto: koleksi dengan nomor revisi lebih RENDAH daripada yang
   lokal sudah tahu ditolak. Tanpa ini, tarikan bootstrap yang berangkat
   SEBELUM tulisan lokal (mis. "Tiba") sampai ke server bisa memutar balik
   layar ke keadaan basi selama satu putaran polling — padahal tulisannya
   sendiri sudah sah di server.
   Fungsi murni tanpa impor — bisa diuji Node langsung tanpa bundler. */

export function selectFreshCollections(records, revs, knownRevs) {
  const keys = new Set([...Object.keys(records || {}), ...Object.keys(revs || {})]);
  const freshRecords = {};
  const freshRevs = {};
  const accepted = new Set();
  keys.forEach((k) => {
    const incoming = Number(revs[k] || 0) || 0;
    if (incoming < (Number(knownRevs[k] || 0) || 0)) return; /* basi — lewati */
    accepted.add(k);
    if (records && Object.prototype.hasOwnProperty.call(records, k)) freshRecords[k] = records[k];
    freshRevs[k] = incoming;
  });
  return { records: freshRecords, revs: freshRevs, accepted };
}
