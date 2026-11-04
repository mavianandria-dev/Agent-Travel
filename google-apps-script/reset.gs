/**
 * reset.gs — Reset data operasional TransAceh.
 *
 * Mengosongkan data operasional (tiket, transaksi, jadwal keberangkatan,
 * notifikasi, ulasan, perawatan, tiket CS, audit) TANPA menyentuh data
 * master: akun, agensi + KYC, rute, usulan rute, armada, pengemudi,
 * pengaturan, fee, banner, dan gambar kota tetap utuh.
 *
 * Cara pakai:
 *   1. Buka spreadsheet backend → Extensions → Apps Script.
 *   2. Pilih fungsi `resetDataOperasional` di dropdown → Run.
 *   3. Konfirmasi dialog yang muncul; ringkasan baris terhapus tampil di
 *      akhir. Detail log ada di Executions / Logger.
 *
 * Catatan:
 *   - Semua klien (browser) perlu muat ulang setelah reset; revisi tiap
 *     koleksi sengaja DINAIKKAN agar sync lama tidak konflik dan bootstrap
 *     memberi koleksi kosong.
 *   - Kuota voucher (used) dikembalikan ke 0; vouchernya sendiri tetap ada.
 *   - Bila ada tab yang belum dibuat, jalankan dulu menu "Perbaiki skema
 *     (tanpa reset)".
 *   - File ini butuh `code.gs` (engine skema) dan `seed.gs` (helper
 *     requireSpreadsheet_/log_/alert_) dalam project yang sama.
 */

/** Koleksi operasional yang dikosongkan saat reset (tab anak ikut otomatis
 *  lewat apiWriteCollection_ — kursi, penumpang, fare, riwayat delay, dst). */
var RESET_CLEAR_KEYS_ = [
  'bookings', 'payments', 'ledger', 'schedules', 'notifications',
  'reviews', 'maintenanceRequests', 'supportTickets', 'audit'
];

/** Koleksi master yang DIKEPTAL saat reset (untuk pesan konfirmasi). */
var RESET_KEEP_KEYS_ = [
  'users', 'agencies', 'routes', 'routeRequests', 'vehicles', 'drivers',
  'settings', 'fees', 'banners', 'cityImages'
];

/**
 * Pintu masuk reset (dijalankan manual dari editor Apps Script).
 * Menampilkan dialog konfirmasi dulu; bila UI tidak tersedia (mis. dijalankan
 * dari harness), reset langsung dieksekusi tanpa dialog.
 */
function resetDataOperasional() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (err) { ui = null; }
  if (ui) {
    var answer = ui.alert(
      'Reset data operasional',
      'Semua TIKET, TRANSAKSI, JADWAL, notifikasi, ulasan, perawatan, ' +
      'tiket CS, dan audit akan DIHAPUS PERMANEN.\n\n' +
      'Akun, agensi, rute, armada, pengemudi, pengaturan, banner, dan ' +
      'gambar kota TIDAK disentuh.\n\nLanjutkan?',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) {
      log_('[TransAceh] Reset data operasional dibatalkan pengguna.');
      alert_('Reset dibatalkan', 'Tidak ada data yang dihapus.');
      return { ok: false, cancelled: true };
    }
  }
  var summary;
  try {
    summary = resetDataOperasional_();
  } catch (err) {
    alert_('Reset data operasional gagal', err.message || String(err));
    throw err;
  }
  alert_('Reset data operasional selesai', summary.message);
  return summary;
}

/** Inti reset: kosongkan koleksi operasional + naikkan revisinya. */
function resetDataOperasional_() {
  var ss = requireSpreadsheet_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('Spreadsheet sedang diproses oleh eksekusi lain. Coba lagi sebentar.');
  }
  try {
    /* 1) Kosongkan tiap koleksi operasional lewat engine skema — tab utama
     *    dan semua tab anaknya (kursi, penumpang, fare, delay, meta) ikut
     *    bersih dengan header tetap utuh. */
    var cleared = {};
    var total = 0;
    for (var i = 0; i < RESET_CLEAR_KEYS_.length; i++) {
      var key = RESET_CLEAR_KEYS_[i];
      var before = apiReadCollection_(ss, key).length;
      apiWriteCollection_(ss, key, []);
      cleared[key] = before;
      total += before;
    }

    /* 2) Voucher: kuota pemakaian (used) dikembalikan ke 0 — pemakaian lama
     *    menunjuk booking yang sudah terhapus, jadi harus dinolkan agar
     *    kuota bisa dipakai lagi. Vouchernya sendiri tidak dihapus. */
    var vouchers = apiReadCollection_(ss, 'vouchers');
    var voucherReset = 0;
    for (var v = 0; v < vouchers.length; v++) {
      if ((Number(vouchers[v].used || 0) || 0) > 0) {
        vouchers[v].used = 0;
        voucherReset++;
      }
    }
    if (voucherReset) apiWriteCollection_(ss, 'vouchers', vouchers);

    /* 3) Revisi tiap koleksi yang berubah DINAIKKAN (bukan dinolkan) supaya
     *    klien yang masih menyimpan data lama mendapat koleksi kosong lewat
     *    bootstrap, bukan konflik sync. */
    var meta = apiReadMeta_(ss);
    var updates = {};
    for (var r = 0; r < RESET_CLEAR_KEYS_.length; r++) {
      var k = RESET_CLEAR_KEYS_[r];
      updates['rev.' + k] = String((Number(meta['rev.' + k] || 0) || 0) + 1);
    }
    if (voucherReset) {
      updates['rev.vouchers'] = String((Number(meta['rev.vouchers'] || 0) || 0) + 1);
    }
    apiUpdateMeta_(ss, updates);

    /* 4) Ringkasan untuk log & dialog. */
    var parts = [];
    for (var c = 0; c < RESET_CLEAR_KEYS_.length; c++) {
      parts.push(RESET_CLEAR_KEYS_[c] + ': ' + cleared[RESET_CLEAR_KEYS_[c]] + ' baris');
    }
    if (voucherReset) parts.push('kuota voucher dinolkan: ' + voucherReset);
    var message = 'Total ' + total + ' baris operasional dihapus (' +
      parts.join(', ') + '). Muat ulang aplikasi untuk melihat keadaan bersih.';
    log_('[TransAceh] Reset data operasional selesai — ' + message);
    return {
      ok: true,
      cleared: cleared,
      vouchersReset: voucherReset,
      total: total,
      message: message
    };
  } finally {
    lock.releaseLock();
  }
}
