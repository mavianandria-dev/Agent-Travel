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
 * Migrasi deployment lama (tanpa reset): salin kedua file versi terbaru ke
 * project versi lama, jalankan `ensureSchema()` sekali, lalu
 * `validateDatabase()`. Data yang sudah ada dibaca ulang tanpa reset;
 * fungsi ini MEMBLOKIR seed ulang bila database sudah terisi.
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
      .addItem('Perbaiki skema (tanpa reset)', 'ensureSchema')
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
 * Menambahkan tab skema yang belum ada TANPA menyentuh data.
 * Jalankan sekali setelah memasang versi code.gs yang menambah tab baru
 * (mis. `agency_kyc_doc_blob` untuk chunk dokumen KYC), lalu jalankan
 * `validateDatabase()`. Untuk `agency_kyc_docs` versi lama (kolom dataUrl
 * inline), isinya dimigrasikan ke tab blob secara otomatis.
 */
function ensureSchema() {
  try {
    return ensureSchema_();
  } catch (err) {
    alert_('ensureSchema gagal', err.message || String(err));
    throw err;
  }
}

function ensureSchema_() {
  var ss = requireSpreadsheet_();
  var described = requireSchema_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('Spreadsheet sedang diproses oleh eksekusi lain. Coba lagi sebentar.');
  }
  try {
    var fixes = [];
    /* Kolom swafoto (`selfie`) dihapus sungguhan dari skema drivers. Migrasi
       berjalan sebelum pemeriksaan header agar tab produksi lama yang masih
       memuat kolom itu tidak memicu gagal "header tidak sesuai". */
    var selfieFix = migrateSelfieColumn_(ss, described.tables);
    if (selfieFix) fixes.push(selfieFix);
    described.tables.forEach(function (table) {
      var sheet = ss.getSheetByName(table.name);
      if (!sheet) {
        sheet = ss.insertSheet(table.name);
        writeHeader_(sheet, table.headers);
        sheet.setColumnWidth(1, table.name === META_SHEET ? 220 : 180);
        sheet.setColumnWidth(2, table.kind === 'main' ? 60 : 110);
        fixes.push('tab ' + table.name + ' dibuat');
        return;
      }
      var lastCol = Math.max(sheet.getLastColumn(), table.headers.length);
      var header = (sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] || [])
        .slice(0, table.headers.length).join('|');
      if (header === table.headers.join('|')) return;
      if (table.name === 'agency_kyc_docs') {
        migrateDocsBlob_(ss, sheet, table, described.tables);
        fixes.push('agency_kyc_docs dimigrasi ke skema blob (dataUrl dipindah ke agency_kyc_doc_blob)');
        return;
      }
      throw new Error('Header tab ' + table.name + ' tidak sesuai skema dan tidak ada jalur migrasi otomatis. /' + header);
    });

    /* Foto pengemudi/kendaraan versi lama masih berupa dataURL langsung di
       kolom utama; pindahkan ke tab blob (idempoten). */
    var photoFix = migratePhotoBlob_(ss, described.tables);
    if (photoFix) fixes.push(photoFix);

    var metaSheet = ss.getSheetByName(META_SHEET) || ss.insertSheet(META_SHEET);
    updateMetaTableCount_(metaSheet, described);
    SpreadsheetApp.flush();

    var msg = fixes.length ? fixes.join('; ') : 'Tidak ada perubahan — semua tab sudah sesuai skema.';
    log_('[ensureSchema] ' + msg);
    alert_('ensureSchema selesai', msg + '\n\nJalankan "Validasi database" untuk memeriksa struktur.');
    return { ok: true, fixes: fixes };
  } finally {
    lock.releaseLock();
  }
}

function updateMetaTableCount_(metaSheet, described) {
  var lastRow = metaSheet.getLastRow();
  var rows = lastRow > 1
    ? metaSheet.getRange(2, 1, lastRow - 1, META_HEADERS.length).getValues()
    : [];
  var want = String(described.tables.length);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === 'tableCount') {
      var rowNumber = i + 2;
      metaSheet.getRange(rowNumber, 2).setNumberFormat('@');
      metaSheet.getRange(rowNumber, 2).setValue(want);
      return;
    }
  }
  var appendRow = metaSheet.getLastRow() + 1;
  metaSheet.getRange(appendRow, 1, 1, META_HEADERS.length).setNumberFormat('@');
  metaSheet.getRange(appendRow, 1, 1, META_HEADERS.length).setValues([['tableCount', want]]);
}

/**
 * Penghapusan kolom swafoto (`selfie`) dari tab drivers versi lama, tanpa
 * reset: kolom dihapus sungguhan setelah memvalidasi header lama dikurangi
 * `selfie` persis sama dengan skema baru, lalu baris chunk `field=selfie`
 * di driver_doc_blob dibersihkan agar data swafoto benar-benar keluar dari
 * database. Idempoten: header tanpa `selfie` tanpa baris chunk `selfie`
 * menghasilkan null (tidak ada catatan perubahan).
 */
function migrateSelfieColumn_(ss, tables) {
  var fixes = [];
  var driversTable = null;
  var blobTable = null;
  tables.forEach(function (t) {
    if (t.name === 'drivers') driversTable = t;
    if (t.name === 'driver_doc_blob') blobTable = t;
  });
  if (!driversTable || !blobTable) return null;
  var expected = driversTable.headers;

  var sheet = ss.getSheetByName('drivers');
  if (sheet && sheet.getLastColumn() > 0) {
    var hdr = (sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0] || []);
    var selfieIdx = -1;
    for (var i = 0; i < hdr.length; i++) {
      if (String(hdr[i]).trim() === 'selfie') { selfieIdx = i; break; }
    }
    if (selfieIdx >= 0) {
      var minus = hdr.slice(0, selfieIdx).concat(hdr.slice(selfieIdx + 1));
      var match = minus.length >= expected.length;
      for (var c = 0; match && c < expected.length; c++) {
        if (String(minus[c]).trim() !== String(expected[c])) match = false;
      }
      if (!match) {
        throw new Error('Kolom selfie ditemukan di tab drivers, tetapi susunan kolom lainnya tidak sesuai skema; migrasi dihentikan agar data tidak bergeser. /' + hdr.join('|'));
      }
      sheet.deleteColumn(selfieIdx + 1);
      fixes.push('kolom selfie dihapus dari tab drivers');
    }
  }

  /* Bersihkan pecahan swafoto yang pernah tersimpan sebagai chunk blob. */
  var blobSheet = ss.getSheetByName(blobTable.name);
  if (blobSheet && blobSheet.getLastRow() > 1) {
    var width = Math.max(blobSheet.getLastColumn(), blobTable.headers.length);
    var blobHdr = (blobSheet.getRange(1, 1, 1, width).getDisplayValues()[0] || []);
    var fieldIdx = blobHdr.indexOf('field');
    if (fieldIdx >= 0) {
      var rows = blobSheet.getRange(2, 1, blobSheet.getLastRow() - 1, width).getDisplayValues();
      var removed = 0;
      for (var r = rows.length - 1; r >= 0; r--) {
        if (String(rows[r][fieldIdx]).trim() === 'selfie') {
          blobSheet.deleteRow(r + 2);
          removed++;
        }
      }
      if (removed) fixes.push(removed + ' baris swafoto dibersihkan dari ' + blobTable.name);
    }
  }

  return fixes.length ? fixes.join('; ') : null;
}

/**
 * Migrasi satu arah agency_kyc_docs versi lama (dataUrl inline di kolom)
 * ke agency_kyc_doc_blob (baris chunk ≤ MAX_CELL_CHARS_), lalu tulis ulang
 * header + isi tab docs ke bentuk baru. Idempoten: pasangan parent|key yang
 * sudah punya baris blob tidak dimigrasikan lagi.
 */
function migrateDocsBlob_(ss, docsSheet, docsTable, tables) {
  var blobDef = null;
  tables.forEach(function (t) { if (t.name === 'agency_kyc_doc_blob') blobDef = t; });
  if (!blobDef) throw new Error('Definisi tab agency_kyc_doc_blob tidak ditemukan pada skema.');

  var lastRow = docsSheet.getLastRow();
  var headerRow = docsSheet.getLastColumn() > 0
    ? (docsSheet.getRange(1, 1, 1, docsSheet.getLastColumn()).getDisplayValues()[0] || [])
    : [];
  var dataUrlIdx = headerRow.indexOf('dataUrl');
  var rows = lastRow > 1
    ? docsSheet.getRange(2, 1, lastRow - 1, Math.max(docsSheet.getLastColumn(), docsTable.headers.length)).getValues()
    : [];

  /* baris blob yang sudah ada — jejas idempotensi */
  var blobSheet = ss.getSheetByName(blobDef.name);
  var existingBlob = {};
  if (blobSheet) {
    var br = blobSheet.getLastRow();
    var bvals = br > 1
      ? blobSheet.getRange(2, 1, br - 1, blobDef.headers.length).getValues()
      : [];
    bvals.forEach(function (r) {
      var pid = String(r[0] == null ? '' : r[0]).trim();
      var key = String(r[1] == null ? '' : r[1]).trim();
      if (pid && key) existingBlob[pid + '|' + key] = true;
    });
  }

  var blobRows = [];
  var docsRows = [];
  rows.forEach(function (row) {
    var pid = String(row[0] == null ? '' : row[0]).trim();
    var key = String(row[1] == null ? '' : row[1]).trim();
    var empty = row.every(function (cell) { return String(cell == null ? '' : cell).trim() === ''; });
    if (empty) return;
    if (dataUrlIdx >= 0 && pid && key) {
      var big = String(row[dataUrlIdx] == null ? '' : row[dataUrlIdx]);
      if (big && !existingBlob[pid + '|' + key]) {
        for (var off = 0; off < big.length; off += MAX_CELL_CHARS_) {
          blobRows.push([pid, key, String(Math.floor(off / MAX_CELL_CHARS_) + 1),
            big.slice(off, off + MAX_CELL_CHARS_)]);
        }
      }
    }
    docsRows.push(docsTable.headers.map(function (name) {
      if (name === 'parent_id') return pid;
      if (name === 'key') return key;
      var oldIdx = headerRow.indexOf(name);
      return oldIdx >= 0 && row[oldIdx] != null ? row[oldIdx] : '';
    }));
  });

  /* tulis ulang tab docs dengan header versi baru */
  docsSheet.clearContents();
  writeHeader_(docsSheet, docsTable.headers);
  if (docsRows.length) {
    var range = docsSheet.getRange(2, 1, docsRows.length, docsTable.headers.length);
    range.setNumberFormat('@');
    range.setValues(docsRows);
  }

  /* tulis baris blob hasil pemecahan */
  if (!blobSheet) {
    blobSheet = ss.insertSheet(blobDef.name);
    writeHeader_(blobSheet, blobDef.headers);
    blobSheet.setColumnWidth(1, 180);
    blobSheet.setColumnWidth(2, 110);
  }
  if (blobRows.length) {
    var appendRange = blobSheet.getRange(blobSheet.getLastRow() + 1, 1, blobRows.length, blobDef.headers.length);
    appendRange.setNumberFormat('@');
    appendRange.setValues(blobRows);
  }
  log_('[ensureSchema] migrasi docs: ' + docsRows.length + ' baris metadata, ' + blobRows.length + ' baris blob.');
}

/* Kolom foto utama yang pindah ke tab blob; kolom utamanya tetap ada sebagai
   penjaga header (selalu dikosongkan). */
var PHOTO_BLOB_TABLES_ = [
  { main: 'drivers', blob: 'driver_doc_blob',
    fields: ['photo', 'simPhoto', 'ktpPhoto'] },
  { main: 'vehicles', blob: 'vehicle_doc_blob',
    fields: ['photo', 'stnkPhoto', 'ktpOwnerPhoto'] }
];

/**
 * Pindahkan dataURL besar yang masih tertanam di kolom utama drivers/
 * vehicles ke baris chunk tab blob masing-masing, lalu kosongkan selnya.
 * Idempoten: pasangan parent|field yang sudah punya baris blob tidak
 * dipecah lagi (sel lama tetap dikosongkan agar bacaannya konsisten).
 */
function migratePhotoBlob_(ss, tables) {
  var touched = 0;
  var movedCells = 0;
  PHOTO_BLOB_TABLES_.forEach(function (cfg) {
    var mainDef = null;
    var blobDef = null;
    tables.forEach(function (t) {
      if (t.name === cfg.main) mainDef = t;
      if (t.name === cfg.blob) blobDef = t;
    });
    if (!mainDef || !blobDef) {
      throw new Error('Skema foto blob tidak lengkap: ' + cfg.main + '/' + cfg.blob);
    }
    var sheet = ss.getSheetByName(cfg.main);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var rows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, mainDef.headers.length).getValues()
      : [];

    var existing = {};
    var blobSheet = ss.getSheetByName(cfg.blob);
    if (blobSheet && blobSheet.getLastRow() > 1) {
      var bvals = blobSheet.getRange(2, 1, blobSheet.getLastRow() - 1,
        blobDef.headers.length).getValues();
      bvals.forEach(function (r) {
        var pid = String(r[0] == null ? '' : r[0]).trim();
        var fkey = String(r[1] == null ? '' : r[1]).trim();
        if (pid && fkey) existing[pid + '|' + fkey] = true;
      });
    }

    var newBlobRows = [];
    var dirtyRows = false;
    rows.forEach(function (row) {
      var id = String(row[0] == null ? '' : row[0]).trim();
      var empty = row.every(function (cell) {
        return String(cell == null ? '' : cell).trim() === '';
      });
      if (!id || empty) return;
      cfg.fields.forEach(function (fName) {
        var idx = mainDef.headers.indexOf(fName);
        if (idx < 0) return;
        var big = String(row[idx] == null ? '' : row[idx]).trim();
        if (!big) return;
        if (!existing[id + '|' + fName]) {
          for (var off = 0; off < big.length; off += MAX_CELL_CHARS_) {
            newBlobRows.push([id, fName, String(Math.floor(off / MAX_CELL_CHARS_) + 1),
              big.slice(off, off + MAX_CELL_CHARS_)]);
          }
          movedCells += 1;
        }
        row[idx] = '';
        dirtyRows = true;
      });
    });

    if (dirtyRows) {
      var writeRange = sheet.getRange(2, 1, rows.length, mainDef.headers.length);
      writeRange.setNumberFormat('@');
      writeRange.setValues(rows);
      touched += 1;
    }
    if (newBlobRows.length) {
      if (!blobSheet) {
        blobSheet = ss.insertSheet(cfg.blob);
        writeHeader_(blobSheet, blobDef.headers);
        blobSheet.setColumnWidth(1, 180);
        blobSheet.setColumnWidth(2, 110);
      }
      var aRange = blobSheet.getRange(blobSheet.getLastRow() + 1, 1,
        newBlobRows.length, blobDef.headers.length);
      aRange.setNumberFormat('@');
      aRange.setValues(newBlobRows);
    }
  });
  if (!touched) return null;
  return 'foto ' + movedCells + ' sel drivers/vehicles dipindah ke tab blob ' +
    '(sel utama dikosongkan)';
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
      /* kind 'one' tidak punya kolom slot/key: kolom ke-2 adalah data dan
         boleh kosong. Cek penanda hanya untuk list/map/blob. */
      if (table.kind !== 'one' && !String(row[1] == null ? '' : row[1]).trim()) {
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
