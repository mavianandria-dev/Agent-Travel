/**
 * TransAceh — Seed database Google Sheets (produksi minimal, storage v2).
 *
 * Script ini membaca definisi tab dari code.gs (apiDescribeStore_()) supaya
 * header kolom selalu sama persis dengan yang dibaca api engine. Tab terdiri
 * atas tab koleksi utama + tab anak untuk field bertingkat (normalisasi 1NF).
 *
 * Script ini sengaja tidak membuat akun, armada, rute, jadwal, atau transaksi
 * contoh. Database produksi dimulai dari satu akun superadmin, pengaturan
 * platformFee, fees legacy, dan satu entri audit.
 *
 * Urutan pemasangan:
 * 1. Buka spreadsheet kosong.
 * 2. Extensions > Apps Script.
 * 3. Tambahkan `code.gs`, `seed.gs`, dan `appsscript.json` ke project.
 * 4. Jalankan `setupBackend()` (membuat secret di Script Properties).
 * 5. Isi Script Properties: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE,
 *    ADMIN_PASSWORD.
 * 6. Jalankan `seedProduction()` lalu `validateDatabase()`.
 *
 * Password admin di-hash terlebih dahulu (tidak pernah plaintext di sheet).
 * Jangan menaruh password di source code atau membagikan spreadsheet ini.
 */

var DB_SCHEMA_VERSION = '2';
var DB_SEED_VERSION = 'production-2';
var META_SHEET = '_meta';
var META_HEADERS = ['key', 'value'];
var MAX_CELL_CHARS_ = 45000;

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

/** Pastikan code.gs (skema + engine) sudah ikut terpasang di project ini. */
function requireSchema_() {
  if (typeof apiDescribeStore_ !== 'function' ||
      typeof apiWriteCollection_ !== 'function' ||
      typeof apiCollectionKeys_ !== 'function') {
    throw new Error(
      'Skema backend tidak tersedia. Pastikan `code.gs` 1.3.0 ikut ' +
      'ditambahkan ke project Apps Script ini sebelum menjalankan seed.');
  }
  var described = apiDescribeStore_();
  if (String(described.schemaVersion) !== DB_SCHEMA_VERSION) {
    throw new Error(
      'Versi skema code.gs (' + described.schemaVersion + ') tidak cocok ' +
      'dengan seed.gs (' + DB_SCHEMA_VERSION + '). Perbarui kedua file ' +
      'bersamaan.');
  }
  return described;
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
  var described = requireSchema_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('Spreadsheet sedang diproses oleh eksekusi lain. Coba lagi sebentar.');
  }

  try {
    assertDatabaseEmpty_(ss, described);
    var config = readAdminConfig_();
    /* Pepper dari setupBackend() — password di-hash sebelum menyentuh sheet. */
    var runtime = apiConfig_();
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
    apiHashForUser_(admin, config.password, runtime);

    var platformFee = {
      id: 'platformFee',
      key: 'platformFee',
      value: { type: 'percent', value: 8 },
      updatedAt: now
    };

    var legacyFees = {
      id: 'fees',
      defaultType: 'percent',
      defaultValue: 8,
      updatedAt: now
    };

    var audit = {
      id: 'LOG-SEED-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(),
      time: now,
      actor: 'system',
      action: 'seed_production',
      detail: 'Database produksi diinisialisasi dari seed.gs (storage v2)'
    };

    var dataByCollection = {
      users: [admin],
      settings: [platformFee],
      fees: [legacyFees],
      audit: [audit]
    };

    /* Buat semua tab (utama + anak) dari skema dengan header yang sama. */
    described.tables.forEach(function (table) {
      var sheet = ss.getSheetByName(table.name);
      if (sheet) {
        sheet.clearContents();
      } else {
        sheet = ss.insertSheet(table.name);
      }
      writeHeader_(sheet, table.headers);
      sheet.setColumnWidth(1, table.name === META_SHEET ? 220 : 180);
      sheet.setColumnWidth(2, table.kind === 'main' ? 60 : 110);
    });

    var metaSheet = ss.getSheetByName(META_SHEET) || ss.insertSheet(META_SHEET);
    metaSheet.clearContents();
    writeHeader_(metaSheet, META_HEADERS);
    metaSheet.setColumnWidth(1, 220);
    metaSheet.setColumnWidth(2, 520);

    var counts = {};
    apiCollectionKeys_().forEach(function (key) {
      var records = dataByCollection[key] || [];
      apiWriteCollection_(ss, key, records);
      counts[key] = records.length;
    });

    writeMeta_(metaSheet, described, config.email, now);
    removeBlankDefaultSheet_(ss);
    SpreadsheetApp.flush();

    var summary = {
      ok: true,
      schemaVersion: DB_SCHEMA_VERSION,
      seedVersion: DB_SEED_VERSION,
      storage: 'columns-v2',
      tables: described.tables.length,
      collections: apiCollectionKeys_().length,
      seededBy: config.email,
      seededAt: now,
      counts: counts
    };
    log_(JSON.stringify(summary, null, 2));
    alert_(
      'Seed produksi selesai',
      'Database berhasil dibuat (skema kolom v2, ' + described.tables.length +
      ' tab).\n\n' +
      'Superadmin: ' + config.email + '\n\n' +
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
  var described = requireSchema_();
  var problems = [];
  var warnings = [];
  var counts = {};

  var meta = ss.getSheetByName(META_SHEET);
  var metaMap = {};
  if (!meta) {
    problems.push('Tab ' + META_SHEET + ' tidak ditemukan.');
  } else {
    var metaValues = readRows_(meta, META_HEADERS, problems);
    metaValues.forEach(function (row) {
      if (row[0]) metaMap[row[0]] = row[1];
    });
    if (metaMap.seedVersion !== DB_SEED_VERSION) {
      problems.push('seedVersion tidak sesuai: ' + (metaMap.seedVersion || '(kosong)'));
    }
    if (metaMap.schemaVersion !== DB_SCHEMA_VERSION) {
      problems.push('schemaVersion tidak sesuai: ' + (metaMap.schemaVersion || '(kosong)'));
    }
    if (metaMap.storage !== 'columns-v2') {
      problems.push('_meta.storage tidak sesuai (harus columns-v2).');
    }
    ['seededAt', 'seededBy', 'lastMutationAt'].forEach(function (key) {
      if (!metaMap[key]) problems.push('_meta.' + key + ' kosong.');
    });
    if (String(metaMap.collectionCount || '') !== String(apiCollectionKeys_().length)) {
      problems.push('_meta.collectionCount tidak sesuai.');
    }
    if (String(metaMap.tableCount || '') !== String(described.tables.length)) {
      problems.push('_meta.tableCount tidak sesuai.');
    }
    apiCollectionKeys_().forEach(function (key) {
      if (!metaMap['rev.' + key]) problems.push('_meta.rev.' + key + ' kosong.');
    });
  }

  /* Header + isi tiap tab sesuai skema. */
  var recordIds = {};      /* collection -> {id: true} untuk cek orphan */
  described.tables.forEach(function (table) {
    recordIds[table.name] = {};
  });

  var mainTables = described.tables.filter(function (t) { return t.kind === 'main'; });
  var childTables = described.tables.filter(function (t) { return t.kind !== 'main'; });

  /* Tab wajib ada dan header cocok. */
  described.tables.forEach(function (table) {
    var sheet = ss.getSheetByName(table.name);
    if (!sheet) {
      problems.push('Tab ' + table.name + ' tidak ditemukan.');
      return;
    }
    var lastCol = table.headers.length;
    var header = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] || [];
    if (header.join('|') !== table.headers.join('|')) {
      problems.push(table.name + ': header harus [' + table.headers.join(', ') + '].');
    }
  });

  /* Tab utama: baris id|ord|updated_at wajib valid. */
  mainTables.forEach(function (table) {
    var sheet = ss.getSheetByName(table.name);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var rows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, table.headers.length).getValues()
      : [];
    var seenIds = {};
    var seenOrd = {};
    var validRows = 0;

    rows.forEach(function (row, index) {
      var rowNumber = index + 2;
      var id = String(row[0] == null ? '' : row[0]).trim();
      var ord = String(row[1] == null ? '' : row[1]).trim();
      var updatedAt = String(row[table.headers.length - 1] == null ? '' : row[table.headers.length - 1]).trim();

      var emptyRow = row.every(function (cell) { return String(cell == null ? '' : cell).trim() === ''; });
      if (emptyRow) {
        warnings.push(table.name + ': baris ' + rowNumber + ' kosong.');
        return;
      }
      if (!id) problems.push(table.name + ': baris ' + rowNumber + ' tanpa id.');
      if (!/^\d+$/.test(ord)) problems.push(table.name + ': baris ' + rowNumber + ' ord tidak valid.');
      if (!updatedAt || isNaN(Date.parse(updatedAt))) {
        problems.push(table.name + ': baris ' + rowNumber + ' updated_at tidak valid.');
      }

      row.forEach(function (cell, ci) {
        if (String(cell == null ? '' : cell).length > MAX_CELL_CHARS_) {
          problems.push(table.name + ': baris ' + rowNumber + ' kolom ' +
            table.headers[ci] + ' melebihi ' + MAX_CELL_CHARS_ + ' karakter.');
        }
      });

      if (id) {
        if (seenIds[id]) problems.push(table.name + ': id duplikat ' + id + '.');
        seenIds[id] = true;
        recordIds[table.collection][id] = true;
      }
      if (ord && seenOrd[ord]) problems.push(table.name + ': ord duplikat ' + ord + '.');
      if (ord) seenOrd[ord] = true;
      validRows += 1;
    });

    checkUsersPassHash_(table, sheet, rows, problems);

    counts[table.name] = validRows;
  });

  /* Tab anak: parent_id wajib merujuk record tab utamanya. */
  childTables.forEach(function (table) {
    var sheet = ss.getSheetByName(table.name);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var rows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, table.headers.length).getValues()
      : [];
    rows.forEach(function (row, index) {
      var rowNumber = index + 2;
      var parentId = String(row[0] == null ? '' : row[0]).trim();
      var emptyRow = row.every(function (cell) { return String(cell == null ? '' : cell).trim() === ''; });
      if (emptyRow) return;
      if (!parentId) {
        problems.push(table.name + ': baris ' + rowNumber + ' tanpa parent_id.');
      } else if (!recordIds[table.collection][parentId]) {
        problems.push(table.name + ': baris ' + rowNumber + ' parent_id ' + parentId +
          ' tidak ada di tab ' + table.collection + '.');
      }
      if (!String(row[1] == null ? '' : row[1]).trim()) {
        problems.push(table.name + ': baris ' + rowNumber + ' batch/slot kosong.');
      }
    });
    counts[table.name] = rows.filter(function (row) {
      return !row.every(function (cell) { return String(cell == null ? '' : cell).trim() === ''; });
    }).length;
  });

  /* Baca ulang lewat engine: percorrupt konversi tipe langsung terdeteksi. */
  apiCollectionKeys_().forEach(function (key) {
    try {
      apiReadCollection_(ss, key);
    } catch (err) {
      problems.push(key + ': gagal dibaca engine — ' + (err.message || err));
    }
  });

  if (!hasActiveSuperadmin_(ss, described)) {
    problems.push('Tidak ada akun superadmin aktif.');
  }
  if (!hasPlatformFee_(ss)) {
    problems.push('settings.platformFee tidak ditemukan.');
  }

  var report = {
    ok: problems.length === 0,
    schemaVersion: DB_SCHEMA_VERSION,
    seedVersion: DB_SEED_VERSION,
    storage: 'columns-v2',
    counts: counts,
    problems: problems,
    warnings: warnings
  };
  log_(JSON.stringify(report, null, 2));

  var title = report.ok ? 'Database valid' : 'Validasi gagal';
  var lines = report.ok
    ? ['Semua tab dan record lolos validasi.', 'Total tab: ' + described.tables.length]
    : problems.slice(0, 12);
  if (problems.length > 12) lines.push('... dan ' + (problems.length - 12) + ' masalah lain. Lihat Execution log.');
  alert_(title, lines.join('\n'));
  return report;
}

/* ------------------------------------------------------------------ */
/* Checks perihal isi (lebih enak dibaca dipisah dari loop utama)      */
/* ------------------------------------------------------------------ */

/** Superadmin aktif wajib punya passHash (bisa login). */
function checkUsersPassHash_(table, sheet, rows, problems) {
  if (table.name !== 'users' || !sheet) return;
  var col = headerIndexMap_(sheet, table.headers);
  rows.forEach(function (row, index) {
    var email = String(row[col.email] == null ? '' : row[col.email]).trim().toLowerCase();
    if (!email) return;
    var role = String(row[col.role] == null ? '' : row[col.role]).trim();
    var status = String(row[col.status] == null ? '' : row[col.status]).trim();
    var hasHash = String(row[col.passHash] == null ? '' : row[col.passHash]).trim() !== '';
    if (role === 'superadmin' && status === 'active' && !hasHash) {
      problems.push('users: baris ' + (index + 2) + ' superadmin ' + email +
        ' aktif tanpa passHash.');
    }
  });
}

/** Peta nama header -> indeks kolom berdasar baris 1 tab. */
function headerIndexMap_(sheet, fallbackHeaders) {
  var headers = fallbackHeaders;
  var names = ['email', 'role', 'status', 'passHash'];
  var map = {};
  names.forEach(function (name) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]) === name) { map[name] = i; return; }
    }
    map[name] = -1;
  });
  return map;
}

/** True bila ada minimal satu users.role=superadmin & status=active. */
function hasActiveSuperadmin_(ss, described) {
  var sheet = ss.getSheetByName('users');
  if (!sheet) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var table = described.tables.filter(function (t) { return t.name === 'users'; })[0];
  var width = table ? table.headers.length : 4;
  var rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var col = headerIndexMap_(sheet, table ? table.headers : []);
  return rows.some(function (row) {
    return String(row[col.role]) === 'superadmin' && String(row[col.status]) === 'active';
  });
}

/** True bila tab settings berisi pasangan key=platformFee. */
function hasPlatformFee_(ss) {
  var sheet = ss.getSheetByName('settings');
  if (!sheet) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  return rows.some(function (row) {
    return String(row[0]).trim() === 'platformFee' || String(row[2]).trim() === 'platformFee';
  });
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

function assertDatabaseEmpty_(ss, described) {
  var meta = ss.getSheetByName(META_SHEET);
  if (meta && sheetHasData_(meta, META_HEADERS)) {
    throw new Error('Database sudah memiliki data di ' + META_SHEET + '. Seed tidak dijalankan ulang.');
  }
  described.tables.forEach(function (table) {
    var sheet = ss.getSheetByName(table.name);
    if (sheet && sheetHasData_(sheet, table.headers)) {
      throw new Error('Tab ' + table.name + ' sudah memiliki data. Kosongkan dulu atau gunakan spreadsheet baru.');
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

/** Hapus tab default kosong ("Sheet1") bila ada tab lain. */
function removeBlankDefaultSheet_(ss) {
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet || ss.getSheets().length < 2) return;
  if (sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
    ss.deleteSheet(sheet);
  }
}

/** Hapus tab default kosong ("Sheet1") bila ada tab lain. */
function removeBlankDefaultSheet_(ss) {
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet || ss.getSheets().length < 2) return;
  if (sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
    ss.deleteSheet(sheet);
  }
}

function writeHeader_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#e8f1fb')
    .setFontColor('#0b2447');
  sheet.setFrozenRows(1);
}

function writeMeta_(sheet, described, seededBy, now) {
  var rows = [
    ['schemaVersion', DB_SCHEMA_VERSION],
    ['seedVersion', DB_SEED_VERSION],
    ['storage', 'columns-v2'],
    ['systemVersion', (typeof API_VERSION === 'string' ? API_VERSION : 'unknown')],
    ['seededAt', now],
    ['seededBy', seededBy],
    ['databaseMode', 'production'],
    ['collectionCount', String(apiCollectionKeys_().length)],
    ['tableCount', String(described.tables.length)],
    ['collections', JSON.stringify(apiCollectionKeys_())],
    ['lastMutationAt', now],
    ['seedSource', 'seed.gs']
  ];
  apiCollectionKeys_().forEach(function (key) {
    rows.push(['rev.' + key, '1']);
  });
  sheet.getRange(2, 1, rows.length, META_HEADERS.length).setNumberFormat('@');
  sheet.getRange(2, 1, rows.length, META_HEADERS.length).setValues(rows);
}

function readRows_(sheet, headers, problems) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
}

function log_(message) {
  try { console.log(message); } catch (err) { /* log opsional */ }
}

function alert_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title + '\n\n' + message);
  } catch (err) {
    log_(title + ': ' + message);
  }
}
