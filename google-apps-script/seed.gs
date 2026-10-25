/**
 * TransAceh — Seed database Google Sheets (produksi minimal).
 *
 * Script ini sengaja tidak membuat akun, armada, rute, jadwal, atau transaksi
 * contoh. Database produksi dimulai dari satu akun superadmin dan konfigurasi
 * dasar. Master operasional dibuat melalui aplikasi setelah `code.gs` terpasang.
 *
 * Pemasangan:
 * 1. Buka spreadsheet kosong.
 * 2. Extensions > Apps Script.
 * 3. Tambahkan file ini sebagai `seed.gs` dan `appsscript.json`.
 * 4. Isi Script Properties: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD.
 * 5. Jalankan `seedProduction()`.
 *
 * Jangan menaruh password di source code atau membagikan spreadsheet ini.
 */

var DB_SCHEMA_VERSION = '1';
var DB_SEED_VERSION = 'production-1';
var META_SHEET = '_meta';
var META_HEADERS = ['key', 'value'];
var COLLECTION_HEADERS = ['id', 'ord', 'json', 'updated_at'];
var MAX_JSON_CHARS = 45000;

var COLLECTION_KEYS = [
  'users',
  'agencies',
  'routes',
  'routeRequests',
  'vehicles',
  'drivers',
  'schedules',
  'maintenanceRequests',
  'bookings',
  'payments',
  'ledger',
  'vouchers',
  'reviews',
  'notifications',
  'audit',
  'banners',
  'supportTickets',
  'settings',
  'fees'
];

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('TransAceh')
      .addItem('Isi seed produksi', 'seedProduction')
      .addItem('Validasi database', 'validateDatabase')
      .addToUi();
  } catch (err) {
    log_('Menu TransAceh tidak bisa dipasang: ' + err.message);
  }
}

/**
 * Membuat database produksi minimal di spreadsheet aktif.
 * Aman dipanggil ulang: jika sudah ada data, proses dibatalkan.
 */
function seedProduction() {
  try {
    return seedProduction_();
  } catch (err) {
    alert_('Seed gagal', err.message || String(err));
    throw err;
  }
}

function seedProduction_() {
  var ss = requireSpreadsheet_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('Spreadsheet sedang diproses oleh eksekusi lain. Coba lagi sebentar.');
  }

  try {
    assertDatabaseEmpty_(ss);
    var config = readAdminConfig_();

    var now = new Date().toISOString();
    var admin = {
      id: 'U-SA',
      name: config.name,
      email: config.email,
      phone: config.phone,
      wa: config.phone,
      pass: config.password,
      role: 'superadmin',
      agencyId: null,
      status: 'active',
      photo: '',
      createdAt: now,
      updatedAt: now
    };

    var platformFee = {
      key: 'platformFee',
      value: { type: 'percent', value: 8 },
      updatedAt: now
    };

    var legacyFees = {
      defaultType: 'percent',
      defaultValue: 8,
      updatedAt: now
    };

    var audit = {
      id: 'LOG-SEED-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(),
      time: now,
      actor: 'system',
      action: 'seed_production',
      detail: 'Database produksi diinisialisasi dari seed.gs'
    };

    var dataByCollection = {
      users: [admin],
      settings: [platformFee],
      fees: [legacyFees],
      audit: [audit]
    };

    var metaSheet = getOrCreateSheet_(ss, META_SHEET);
    writeHeader_(metaSheet, META_HEADERS);
    metaSheet.setColumnWidth(1, 220);
    metaSheet.setColumnWidth(2, 520);

    var counts = {};
    COLLECTION_KEYS.forEach(function (key) {
      var sheet = getOrCreateSheet_(ss, key);
      var records = dataByCollection[key] || [];
      writeCollection_(sheet, key, records, now);
      counts[key] = records.length;
    });

    writeMeta_(metaSheet, config.email, now);
    removeBlankDefaultSheet_(ss);
    SpreadsheetApp.flush();

    var summary = {
      ok: true,
      schemaVersion: DB_SCHEMA_VERSION,
      seedVersion: DB_SEED_VERSION,
      seededBy: config.email,
      seededAt: now,
      counts: counts
    };
    log_(JSON.stringify(summary, null, 2));
    alert_(
      'Seed produksi selesai',
      'Database berhasil dibuat.\n\n' +
      'Superadmin: ' + config.email + '\n' +
      'Tab target: ' + COLLECTION_KEYS.length + ' koleksi + _meta\n\n' +
      'Jalankan "Validasi database" untuk memeriksa struktur.'
    );
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Memeriksa struktur database tanpa mengubah data.
 * Hasil juga dicetak ke Execution log.
 */
function validateDatabase() {
  var ss = requireSpreadsheet_();
  var problems = [];
  var warnings = [];
  var counts = {};

  var meta = ss.getSheetByName(META_SHEET);
  if (!meta) {
    problems.push('Tab ' + META_SHEET + ' tidak ditemukan.');
  } else {
    var metaValues = readRows_(meta, META_HEADERS, problems);
    var metaMap = {};
    metaValues.forEach(function (row) {
      if (row[0]) metaMap[row[0]] = row[1];
    });
    if (metaMap.seedVersion !== DB_SEED_VERSION) {
      problems.push('seedVersion tidak sesuai: ' + (metaMap.seedVersion || '(kosong)'));
    }
    if (metaMap.schemaVersion !== DB_SCHEMA_VERSION) {
      problems.push('schemaVersion tidak sesuai: ' + (metaMap.schemaVersion || '(kosong)'));
    }
    ['seededAt', 'seededBy', 'lastMutationAt'].forEach(function (key) {
      if (!metaMap[key]) problems.push('_meta.' + key + ' kosong.');
    });
    if (String(metaMap.collectionCount || '') !== String(COLLECTION_KEYS.length)) {
      problems.push('_meta.collectionCount tidak sesuai.');
    }
    COLLECTION_KEYS.forEach(function (key) {
      if (!metaMap['rev.' + key]) problems.push('_meta.rev.' + key + ' kosong.');
    });
  }

  var superadminCount = 0;
  var platformFeeFound = false;

  COLLECTION_KEYS.forEach(function (key) {
    var sheet = ss.getSheetByName(key);
    if (!sheet) {
      problems.push('Tab koleksi ' + key + ' tidak ditemukan.');
      counts[key] = 0;
      return;
    }

    var headers = sheet.getRange(1, 1, 1, COLLECTION_HEADERS.length).getDisplayValues()[0];
    if (headers.join('|') !== COLLECTION_HEADERS.join('|')) {
      problems.push(key + ': header harus ' + COLLECTION_HEADERS.join(', '));
      return;
    }

    var lastRow = sheet.getLastRow();
    var rows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, COLLECTION_HEADERS.length).getDisplayValues()
      : [];
    var seenIds = {};
    var seenOrd = {};
    var validRows = 0;

    rows.forEach(function (row, index) {
      var rowNumber = index + 2;
      if (!row.some(function (cell) { return String(cell || '').trim() !== ''; })) {
        warnings.push(key + ': baris ' + rowNumber + ' kosong.');
        return;
      }

      var id = String(row[0] || '').trim();
      var ord = String(row[1] || '').trim();
      var json = String(row[2] || '');
      var updatedAt = String(row[3] || '').trim();

      if (!id) problems.push(key + ': baris ' + rowNumber + ' tanpa id.');
      if (!/^\d+$/.test(ord)) problems.push(key + ': baris ' + rowNumber + ' ord tidak valid.');
      if (!updatedAt || isNaN(Date.parse(updatedAt))) {
        problems.push(key + ': baris ' + rowNumber + ' updated_at tidak valid.');
      }
      if (json.length > MAX_JSON_CHARS) {
        problems.push(key + ': baris ' + rowNumber + ' JSON melebihi ' + MAX_JSON_CHARS + ' karakter.');
      }

      var record = null;
      try {
        record = JSON.parse(json);
      } catch (err) {
        problems.push(key + ': baris ' + rowNumber + ' JSON rusak.');
      }
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        problems.push(key + ': baris ' + rowNumber + ' JSON harus berupa object.');
      }

      if (record) {
        var expectedId = record.id != null
          ? String(record.id)
          : (record.key != null ? String(record.key) : (key === 'fees' ? 'fees' : ''));
        if (expectedId && expectedId !== id) {
          problems.push(key + ': baris ' + rowNumber + ' id tidak cocok dengan isi JSON.');
        }
        if (key === 'users' && record.role === 'superadmin' && record.status === 'active') {
          superadminCount += 1;
        }
        if (key === 'settings' && record.key === 'platformFee') {
          platformFeeFound = true;
        }
      }

      if (seenIds[id]) problems.push(key + ': id duplikat ' + id + '.');
      seenIds[id] = true;
      if (seenOrd[ord]) problems.push(key + ': ord duplikat ' + ord + '.');
      seenOrd[ord] = true;
      validRows += 1;
    });

    counts[key] = validRows;
  });

  if (superadminCount < 1) problems.push('Tidak ada akun superadmin aktif.');
  if (!platformFeeFound) problems.push('settings.platformFee tidak ditemukan.');

  var report = {
    ok: problems.length === 0,
    schemaVersion: DB_SCHEMA_VERSION,
    seedVersion: DB_SEED_VERSION,
    counts: counts,
    problems: problems,
    warnings: warnings
  };
  log_(JSON.stringify(report, null, 2));

  var title = report.ok ? 'Database valid' : 'Validasi gagal';
  var lines = report.ok
    ? ['Semua tab dan record lolos validasi.', 'Total users: ' + counts.users]
    : problems.slice(0, 12);
  if (problems.length > 12) lines.push('... dan ' + (problems.length - 12) + ' masalah lain. Lihat Execution log.');
  alert_(title, lines.join('\n'));
  return report;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function requireSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Jalankan script dari spreadsheet yang aktif.');
  return ss;
}

function readAdminConfig_() {
  var props = PropertiesService.getScriptProperties();
  var name = String(props.getProperty('ADMIN_NAME') || '').trim();
  var email = String(props.getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  var phone = String(props.getProperty('ADMIN_PHONE') || '').trim();
  var password = String(props.getProperty('ADMIN_PASSWORD') || '');

  var missing = [];
  if (!name) missing.push('ADMIN_NAME');
  if (!email) missing.push('ADMIN_EMAIL');
  if (!phone) missing.push('ADMIN_PHONE');
  if (!password) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    throw new Error('Script Properties belum lengkap: ' + missing.join(', '));
  }

  if (name.length < 2) throw new Error('ADMIN_NAME minimal 2 karakter.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL tidak valid.');
  var phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 8 || phoneDigits.length > 15) throw new Error('ADMIN_PHONE tidak valid.');
  if (password !== password.trim()) throw new Error('ADMIN_PASSWORD tidak boleh diawali atau diakhiri spasi.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD minimal 12 karakter.');
  if (password.length > 200) throw new Error('ADMIN_PASSWORD maksimal 200 karakter.');

  return { name: name, email: email, phone: phone, password: password };
}

function assertDatabaseEmpty_(ss) {
  var meta = ss.getSheetByName(META_SHEET);
  if (meta && sheetHasData_(meta, META_HEADERS)) {
    throw new Error('Database sudah memiliki data di ' + META_SHEET + '. Seed tidak dijalankan ulang.');
  }

  COLLECTION_KEYS.forEach(function (key) {
    var sheet = ss.getSheetByName(key);
    if (sheet && sheetHasData_(sheet, COLLECTION_HEADERS)) {
      throw new Error('Tab ' + key + ' sudah memiliki data. Kosongkan dulu atau gunakan spreadsheet baru.');
    }
  });
}

function sheetHasData_(sheet, expectedHeaders) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return false;
  var lastCol = Math.max(sheet.getLastColumn(), expectedHeaders.length);
  var firstRows = sheet.getRange(1, 1, Math.min(lastRow, 2), lastCol).getDisplayValues();
  var firstRow = firstRows[0] || [];
  var isHeader = firstRow.slice(0, expectedHeaders.length).join('|') === expectedHeaders.join('|');
  if (lastRow <= 1) {
    var hasContent = firstRow.some(function (cell) { return String(cell || '').trim() !== ''; });
    if (!hasContent) return false;
    var extraContent = firstRow.slice(expectedHeaders.length)
      .some(function (cell) { return String(cell || '').trim() !== ''; });
    if (isHeader && !extraContent) return false;
  }
  return true;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeHeader_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#e8f1fb')
    .setFontColor('#0b2447');
  sheet.setFrozenRows(1);
}

function writeCollection_(sheet, key, records, now) {
  sheet.clearContents();
  writeHeader_(sheet, COLLECTION_HEADERS);
  sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat('0');
  sheet.getRange(1, 3, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(1, 4, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 60);
  sheet.setColumnWidth(3, 760);
  sheet.setColumnWidth(4, 190);

  if (!records.length) return;

  var rows = records.map(function (record, index) {
    var json = JSON.stringify(record);
    if (json.length > MAX_JSON_CHARS) {
      throw new Error(key + ': record ' + index + ' melebihi batas ' + MAX_JSON_CHARS + ' karakter.');
    }
    return [recordId_(key, record, index), index, json, now];
  });

  sheet.getRange(2, 1, rows.length, COLLECTION_HEADERS.length).setValues(rows);
}

function writeMeta_(sheet, seededBy, now) {
  var rows = [
    ['schemaVersion', DB_SCHEMA_VERSION],
    ['seedVersion', DB_SEED_VERSION],
    ['seededAt', now],
    ['seededBy', seededBy],
    ['databaseMode', 'production'],
    ['collectionCount', String(COLLECTION_KEYS.length)],
    ['collections', JSON.stringify(COLLECTION_KEYS)],
    ['lastMutationAt', now],
    ['seedSource', 'seed.gs']
  ];
  COLLECTION_KEYS.forEach(function (key) {
    rows.push(['rev.' + key, '1']);
  });

  sheet.clearContents();
  writeHeader_(sheet, META_HEADERS);
  sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function recordId_(key, record, index) {
  if (record && record.id != null && String(record.id) !== '') return String(record.id);
  if (record && record.key != null && String(record.key) !== '') return String(record.key);
  if (key === 'fees') return 'fees';
  return key + '-' + (index + 1);
}

function readRows_(sheet, headers, problems) {
  var actualHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (actualHeaders.join('|') !== headers.join('|')) {
    problems.push(sheet.getName() + ': header harus ' + headers.join(', '));
    return [];
  }
  if (sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
}

function removeBlankDefaultSheet_(ss) {
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet || ss.getSheets().length <= 1) return;
  if (sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
    try {
      ss.deleteSheet(sheet);
    } catch (err) {
      log_('Sheet1 kosong tidak bisa dihapus: ' + err.message);
    }
  }
}

function alert_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (err) {
    log_(title + '\n' + message);
  }
}

function log_(message) {
  try {
    console.log(message);
  } catch (err) {
    Logger.log(message);
  }
}
