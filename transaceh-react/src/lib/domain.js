import { DB } from './db.js';
import { uid, todayStr, SIM_TYPES, fmtRp } from './utils.js';
import { estimateRoute } from './geo.js';
import { pickupOptions } from './pickups.js';
import { getToken } from './sheetsApi.js';
export { uid, todayStr };

/* Diekstrak dari index.html — pure domain logic, tanpa DOM. */

export function simParse(d){ const cur=new Date().getFullYear();
  if(d&&(d.simType||d.simExp)) return {type:(typeof d.simType==='string'&&d.simType.trim())?d.simType.trim():'A',exp:Number(d.simExp)||cur+5};
  const m=d&&d.sim?/SIM\s*([A-Z0-9]+)\s*•\s*(?:(\d{4})\s*-)?(\d{4})/.exec(d.sim):null;
  return {type:m&&SIM_TYPES.includes(m[1])?m[1]:'A',exp:m?Number(m[3]):cur+5};
}

export function simLabel(d){ const s=simParse(d); return 'SIM '+s.type+' • s.d. '+s.exp; }

export function simExpired(d){ return simParse(d).exp<new Date().getFullYear(); }

const ACCOUNT_ROLE_LABELS = { pelanggan: 'Pelanggan', agen: 'Agen', pengemudi: 'Pengemudi', superadmin: 'Admin' };
const ACCOUNT_STATUS_LABELS = { active: 'Aktif', pending: 'Menunggu', suspended: 'Nonaktif' };

/** Normalisasi status akun lama (active/aktif, suspended/nonaktif, pending). */
export function accountStatusKind(u){
  const raw = typeof u === 'string' ? u : (u && u.status);
  const st = String(raw || 'active').toLowerCase();
  if (st === 'pending') return 'pending';
  if (['suspended','nonaktif','inactive','blocked','disabled'].includes(st)) return 'suspended';
  return 'active';
}

export function accountStatusLabel(u){ return ACCOUNT_STATUS_LABELS[accountStatusKind(u)] || 'Aktif'; }

export function accountRoleLabel(role){ return ACCOUNT_ROLE_LABELS[role] || role || 'Akun'; }

/** Akun nonaktif tidak boleh dipakai; agen pending tetap boleh masuk untuk melengkapi KYC. */
export function accountBlocked(u){
  if (!u) return false;
  const st = accountStatusKind(u);
  if (st === 'suspended') return true;
  if (st === 'pending' && u.role !== 'agen') return true;
  if (u.role === 'pengemudi' && driverParentIssue(u)) return true;
  return false;
}

export function checkAccountAccess(u){
  if (!u) return 'Akun tidak ditemukan';
  if (u.role === 'pengemudi') {
    const parentIssue = driverParentIssue(u);
    if (parentIssue) return parentIssue;
  }
  const st = accountStatusKind(u);
  if (st === 'suspended') {
    if (u.role === 'pengemudi') return 'Akun pengemudi dinonaktifkan — hubungi travel Anda';
    if (u.role === 'agen') return 'Akun agen dinonaktifkan - hubungi super admin';
    return 'Akun dinonaktifkan — hubungi super admin';
  }
  if (st === 'pending' && u.role !== 'agen') return 'Akun belum diaktifkan — hubungi super admin';
  return null;
}

export function currentUser(){
  if (DB.isRemote() && !getToken()) {
    try { localStorage.removeItem('at_session'); } catch { /* abaikan */ }
    return null;
  }
  const s = DB.load('session', null);
  if (!s) return null;
  const u = DB.load('users', []).find((x) => x.id === s.uid) || null;
  if (!u || accountBlocked(u)) {
    localStorage.removeItem('at_session');
    return null;
  }
  return u;
}

export function setSession(u){ if(u) DB.save('session',{uid:u.id}); else localStorage.removeItem('at_session'); }

function requireSuperadmin(){
  const me = currentUser();
  return me && me.role === 'superadmin' ? null : 'Hanya super admin yang dapat mengelola akun';
}

function driverHasActiveSchedule(driverId){
  return DB.load('schedules', []).some((s) => s.driverId === driverId && s.date >= todayStr(0) && s.status !== 'cancelled' && s.tripStatus !== 'cancelled' && !['arrived', 'missed'].includes(s.tripStatus));
}

/** Satu travel saat ini hanya punya satu akun agen; relasi sub-akun memakai agencyId. */
export function agentAccountForAgency(agencyId, users){
  const arr = users || DB.load('users', []);
  return arr.find((u) => u.role === 'agen' && u.agencyId === agencyId) || null;
}

function driverRecordForUser(u, drivers){
  const em = String((u && u.email) || '').toLowerCase();
  return (drivers || DB.load('drivers', [])).find((d) => String(d.userEmail || '').toLowerCase() === em) || null;
}

/** Alasan akun pengemudi tidak boleh dipakai karena akun agen/travel induknya bermasalah. */
export function driverParentIssue(u){
  if (!u || u.role !== 'pengemudi') return null;
  const ag = agencyById(u.agencyId);
  if (!ag) return 'Data travel pengemudi tidak ditemukan — hubungi super admin';
  const parent = agentAccountForAgency(u.agencyId);
  if (!parent) return 'Akun agen travel tidak ditemukan — pengemudi tidak bisa masuk';
  const parentStatus = accountStatusKind(parent);
  if (parentStatus === 'suspended') return 'Akun pengemudi dinonaktifkan karena akun agen travel nonaktif';
  if (parentStatus === 'pending') return 'Travel belum aktif — hubungi agen travel';
  if (ag.status === 'suspended') return 'Travel sedang dinonaktifkan — hubungi agen travel';
  if (ag.status === 'pending') return 'Travel belum aktif — hubungi agen travel';
  return null;
}

function agentActiveScheduleBlocker(agencyId){
  const drivers = DB.load('drivers', []).filter((d) => d.agencyId === agencyId);
  return drivers.find((d) => driverHasActiveSchedule(d.id)) || null;
}

function suspendAgencyChildren(agencyId, users, drivers){
  users.filter((u) => u.role === 'pengemudi' && u.agencyId === agencyId).forEach((u) => {
    if (accountStatusKind(u) !== 'active') return;
    u.status = 'suspended';
    u.suspendedByParent = true;
    const d = driverRecordForUser(u, drivers);
    if (d) {
      u.parentSuspendedDriverStatus = d.status || 'aktif';
      d.status = 'nonaktif';
    }
  });
}

function resumeAgencyChildren(agencyId, users, drivers){
  users.filter((u) => u.role === 'pengemudi' && u.agencyId === agencyId).forEach((u) => {
    if (u.suspendedByParent !== true) return;
    u.status = 'active';
    const d = driverRecordForUser(u, drivers);
    if (d) d.status = u.parentSuspendedDriverStatus || 'aktif';
    delete u.suspendedByParent;
    delete u.parentSuspendedDriverStatus;
  });
}

/** Tambah akun dari panel admin. Akun agen/pengemudi harus ditautkan ke data yang sudah ada. */
export function createManagedAccount({ name, email, phone, password, role, agencyId, driverId, status } = {}){
  const denied = requireSuperadmin(); if (denied) return { ok: false, msg: denied };
  const nm = String(name || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const ph = String(phone || '').trim();
  const pw = String(password || '');
  if (!nm) return { ok: false, msg: 'Nama lengkap wajib diisi' };
  if (!/.+@.+\..+/.test(em)) return { ok: false, msg: 'Format email belum benar' };
  if (!ph) return { ok: false, msg: 'No HP wajib diisi' };
  if (pw.length < 8) return { ok: false, msg: 'Password minimal 8 karakter' };
  if (!ACCOUNT_ROLE_LABELS[role]) return { ok: false, msg: 'Role akun tidak valid' };
  const users = DB.load('users', []);
  if (users.some((u) => String(u.email || '').toLowerCase() === em)) return { ok: false, msg: 'Email sudah terdaftar' };
  let st = status === 'pending' ? 'pending' : status === 'suspended' ? 'suspended' : 'active';
  let agId = null;
  let driver = null;
  let drivers = null;
  if (role === 'agen') {
    const ag = DB.load('agencies', []).find((a) => a.id === agencyId);
    if (!ag) return { ok: false, msg: 'Pilih travel agen terlebih dahulu' };
    if (users.some((u) => u.role === 'agen' && u.agencyId === ag.id)) return { ok: false, msg: 'Travel ini sudah punya akun agen' };
    agId = ag.id;
    if (ag.status === 'pending' && st === 'active') st = 'pending';
  } else if (role === 'pengemudi') {
    drivers = DB.load('drivers', []);
    driver = drivers.find((d) => d.id === driverId);
    if (!driver) return { ok: false, msg: 'Pilih data pengemudi terlebih dahulu' };
    if (driver.userEmail && String(driver.userEmail).toLowerCase() !== em) return { ok: false, msg: 'Email harus sama dengan email pada data pengemudi' };
    const parent = agentAccountForAgency(driver.agencyId, users);
    if (!parent) return { ok: false, msg: 'Travel ini belum punya akun agen — buat akun agen terlebih dahulu' };
    if (accountStatusKind(parent) !== 'active') return { ok: false, msg: 'Akun agen travel belum aktif — aktifkan akun agen terlebih dahulu' };
    const ag = agencyById(driver.agencyId);
    if (!ag || ag.status !== 'active') return { ok: false, msg: 'Travel belum aktif — aktifkan travel terlebih dahulu' };
    if (st !== 'active' && driverHasActiveSchedule(driver.id)) return { ok: false, msg: 'Pengemudi masih punya jadwal aktif — ganti pengemudi pada jadwal tersebut terlebih dahulu' };
    agId = driver.agencyId;
  }
  const u = { id: uid('U'), name: nm, email: em, phone: ph, wa: ph, pass: pw, role, agencyId: agId, status: st, photo: '' };
  if (role === 'pelanggan') u.favorites = [];
  if (driver) u.profileStep = 'done';
  users.push(u);
  DB.save('users', users);
  if (driver) {
    driver.userEmail = em;
    driver.status = st === 'active' ? 'aktif' : 'nonaktif';
    DB.save('drivers', drivers);
  }
  audit('account_create', em + ' • ' + role + (agId ? ' • ' + agId : ''));
  notify(em, 'Akun dibuat', 'Akun ' + accountRoleLabel(role) + ' Anda dibuat oleh super admin. Silakan masuk dengan password yang diberikan.', 'app');
  return { ok: true, user: u };
}

/** Edit data kontak akun + password opsional. Email, role, dan tautan travel/pengemudi sengaja tidak diubah. */
export function updateManagedAccount(id, { name, phone, password } = {}){
  const denied = requireSuperadmin(); if (denied) return { ok: false, msg: denied };
  const users = DB.load('users', []);
  const u = users.find((x) => x.id === id);
  if (!u) return { ok: false, msg: 'Akun tidak ditemukan' };
  const nm = String(name || '').trim();
  const ph = String(phone || '').trim();
  const pw = String(password || '');
  if (!nm) return { ok: false, msg: 'Nama lengkap wajib diisi' };
  if (!ph) return { ok: false, msg: 'No HP wajib diisi' };
  if (pw && pw.length < 8) return { ok: false, msg: 'Password minimal 8 karakter' };
  u.name = nm;
  u.phone = ph;
  u.wa = ph;
  if (pw) u.pass = pw;
  DB.save('users', users);
  if (u.role === 'pengemudi') {
    const drivers = DB.load('drivers', []);
    const d = drivers.find((x) => String(x.userEmail || '').toLowerCase() === String(u.email || '').toLowerCase());
    if (d) {
      d.name = nm;
      d.phone = ph;
      d.wa = ph;
      DB.save('drivers', drivers);
    }
  }
  audit('account_update', u.email + (pw ? ' • password diubah' : ''));
  if (pw) notify(u.email, 'Password direset', 'Password akun Anda diubah oleh super admin. Gunakan password baru untuk masuk.', 'app');
  return { ok: true };
}

export function resetManagedAccountPassword(id, password){
  const denied = requireSuperadmin(); if (denied) return { ok: false, msg: denied };
  const pw = String(password || '');
  if (pw.length < 8) return { ok: false, msg: 'Password minimal 8 karakter' };
  const users = DB.load('users', []);
  const u = users.find((x) => x.id === id);
  if (!u) return { ok: false, msg: 'Akun tidak ditemukan' };
  u.pass = pw;
  DB.save('users', users);
  audit('account_password_reset', u.email);
  notify(u.email, 'Password direset', 'Password akun Anda diubah oleh super admin. Gunakan password baru untuk masuk.', 'app');
  return { ok: true };
}

export function setManagedAccountStatus(id, status){
  const denied = requireSuperadmin(); if (denied) return { ok: false, msg: denied };
  const me = currentUser();
  const users = DB.load('users', []);
  const u = users.find((x) => x.id === id);
  if (!u) return { ok: false, msg: 'Akun tidak ditemukan' };
  const next = status === 'active' ? 'active' : 'suspended';
  if (u.id === me.id && next !== 'active') return { ok: false, msg: 'Tidak bisa menonaktifkan akun sendiri' };
  if (u.role === 'superadmin' && next !== 'active') {
    const activeAdmins = users.filter((x) => x.role === 'superadmin' && accountStatusKind(x) === 'active');
    if (activeAdmins.length <= 1) return { ok: false, msg: 'Admin aktif terakhir tidak bisa dinonaktifkan' };
  }
  if (u.role === 'agen' && next === 'suspended') {
    const blocker = agentActiveScheduleBlocker(u.agencyId);
    if (blocker) return { ok: false, msg: 'Pengemudi ' + blocker.name + ' masih punya jadwal aktif — ganti pengemudi pada jadwal tersebut terlebih dahulu' };
  }
  if (u.role === 'agen' && next === 'active') {
    const ag = DB.load('agencies', []).find((a) => a.id === u.agencyId);
    if (ag && ag.status === 'suspended') return { ok: false, msg: 'Travel masih dinonaktifkan — aktifkan travel di menu Agen terlebih dahulu' };
  }
  if (u.role === 'pengemudi') {
    const drivers = DB.load('drivers', []);
    const d = driverRecordForUser(u, drivers);
    if (next === 'active') {
      const parent = agentAccountForAgency(u.agencyId, users);
      if (!parent || accountStatusKind(parent) !== 'active') return { ok: false, msg: 'Akun agen travel masih nonaktif — aktifkan akun agen terlebih dahulu' };
      const ag = agencyById(u.agencyId);
      if (!ag || ag.status !== 'active') return { ok: false, msg: 'Travel belum aktif — aktifkan travel terlebih dahulu' };
    }
    if (d) {
      if (next === 'suspended' && driverHasActiveSchedule(d.id)) return { ok: false, msg: 'Pengemudi masih punya jadwal aktif — ganti pengemudi pada jadwal tersebut terlebih dahulu' };
      d.status = next === 'active' ? 'aktif' : 'nonaktif';
      DB.save('drivers', drivers);
    }
  }
  u.status = next;
  if (u.role === 'agen') {
    const drivers = DB.load('drivers', []);
    if (next === 'active') resumeAgencyChildren(u.agencyId, users, drivers);
    else suspendAgencyChildren(u.agencyId, users, drivers);
    DB.save('drivers', drivers);
  }
  if (u.role === 'pengemudi') {
    delete u.suspendedByParent;
    delete u.parentSuspendedDriverStatus;
  }
  DB.save('users', users);
  audit('account_status', u.email + ' → ' + next);
  notify(u.email, next === 'active' ? 'Akun diaktifkan' : 'Akun dinonaktifkan', next === 'active' ? 'Akun Anda sudah aktif kembali.' : 'Akun Anda dinonaktifkan oleh super admin.', 'app');
  return { ok: true };
}

/** Status travel dari menu Agen juga menurun ke akun agen dan seluruh sub-akun pengemudi. */
export function setAgencyStatusWithAccounts(id, status){
  const denied = requireSuperadmin(); if (denied) return { ok: false, msg: denied };
  const agencies = DB.load('agencies', []);
  const ag = agencies.find((a) => a.id === id);
  if (!ag) return { ok: false, msg: 'Travel tidak ditemukan' };
  const next = status === 'active' ? 'active' : 'suspended';
  if (next === 'suspended') {
    const blocker = agentActiveScheduleBlocker(id);
    if (blocker) return { ok: false, msg: 'Pengemudi ' + blocker.name + ' masih punya jadwal aktif — ganti pengemudi pada jadwal tersebut terlebih dahulu' };
  }
  ag.status = next;
  DB.save('agencies', agencies);
  const users = DB.load('users', []);
  const drivers = DB.load('drivers', []);
  users.filter((u) => u.role === 'agen' && u.agencyId === id).forEach((u) => { u.status = next; });
  if (next === 'active') resumeAgencyChildren(id, users, drivers);
  else suspendAgencyChildren(id, users, drivers);
  DB.save('users', users);
  DB.save('drivers', drivers);
  audit('agency_status', id + ' → ' + next);
  return { ok: true };
}

/** Alasan akun agen tidak boleh dihapus permanen karena sudah punya riwayat. */
export function agentDeleteBlockReason(agencyId){
  if (!agencyId) return 'Akun agen belum tertaut ke travel.';
  if (DB.load('schedules', []).some((s) => s.agencyId === agencyId)) return 'Travel sudah punya riwayat jadwal — gunakan Nonaktifkan, bukan hapus.';
  if (DB.load('ledger', []).some((l) => l.agencyId === agencyId)) return 'Travel sudah punya riwayat transaksi — gunakan Nonaktifkan, bukan hapus.';
  return null;
}

/** Hapus akun agen + seluruh akun login pengemudi di bawahnya. Data travel/pengemudi tetap disimpan. */
export function deleteManagedAgent(id){
  const denied = requireSuperadmin(); if (denied) return { ok: false, msg: denied };
  const users = DB.load('users', []);
  const u = users.find((x) => x.id === id);
  if (!u) return { ok: false, msg: 'Akun tidak ditemukan' };
  if (u.role !== 'agen') return { ok: false, msg: 'Hanya akun agen yang bisa dihapus dari halaman ini' };
  const reason = agentDeleteBlockReason(u.agencyId);
  if (reason) return { ok: false, msg: reason };
  const removed = users.filter((x) => x.agencyId === u.agencyId && (x.role === 'agen' || x.role === 'pengemudi'));
  DB.save('users', users.filter((x) => !removed.includes(x)));
  audit('account_delete_agent', u.email + ' + ' + Math.max(0, removed.length - 1) + ' sub-akun');
  return { ok: true, removed: removed.length };
}

export function agencyOf(u){ if(!u) return null; return DB.load('agencies',[]).find(a=>a.id===u.agencyId); }

/** Format alamat terstruktur KYC menjadi teks satu baris. */
export function formatAlamat(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return [a.jalan, a.rtRw && 'RT/RW ' + a.rtRw, a.kelurahan, a.kecamatan, a.kota, a.provinsi, a.kodePos].filter(Boolean).join(', ');
}

/** Field profil lama yang diturunkan dari KYC agar halaman publik tetap sinkron. */
export function agencyProfileFromKyc(k) {
  if (!k) return {};
  const isBadan = k.jenis === 'Badan Usaha (PT/CV)';
  const address = formatAlamat(isBadan ? k.alamatUsaha : k.alamat) || formatAlamat(k.alamat);
  const out = {};
  if (k.hp) out.phone = k.hp;
  if (address) out.address = address;
  if (k.bank && k.rekeningNo && k.rekeningNama) out.bank = [k.bank, k.rekeningNo, 'a.n. ' + k.rekeningNama].join(' ');
  return out;
}

/** Sinkronkan phone/address/bank pada agency dari data KYC terbaru. */
export function syncAgencyProfileFromKyc(ag) {
  if (!ag) return false;
  const patch = agencyProfileFromKyc(ag.kyc);
  let changed = false;
  Object.entries(patch).forEach(([key, val]) => {
    if (ag[key] !== val) { ag[key] = val; changed = true; }
  });
  return changed;
}

export function routeById(id){ return DB.load('routes',[]).find(r=>r.id===id); }

/* ---------- Grup rute pelanggan ----------
   Data rute tetap tersimpan per agen. Untuk tampilan pelanggan, rute dengan
   asal + tujuan yang sama digabung menjadi satu kartu. Arah tetap dibedakan. */
export function routeGroupKey(route){
  const norm=s=>String(s==null?'':s).trim().toLowerCase().replace(/\s+/g,' ');
  return route?norm(route.from)+'|'+norm(route.to):'';
}

export function groupRoutes(routes){
  const map=new Map();
  (Array.isArray(routes)?routes:[]).forEach(r=>{
    const key=routeGroupKey(r);
    if(!key||key==='|') return;
    if(!map.has(key)){
      map.set(key,{
        key,from:r.from,to:r.to,routeId:r.id,
        routes:[],routeIds:[],agencyIds:[],pickups:[],
        homePickup:false,basePrice:Infinity,
        distance:r.distance||'',duration:r.duration||'',
      });
    }
    const g=map.get(key);
    g.routes.push(r);
    if(!g.routeIds.includes(r.id)) g.routeIds.push(r.id);
    const ids=(r.agencyIds&&r.agencyIds.length)?r.agencyIds:(r.agencyId?[r.agencyId]:[]);
    ids.forEach(id=>{ if(id&&!g.agencyIds.includes(id)) g.agencyIds.push(id); });
    g.pickups=normalizePoints([...g.pickups,...(r.pickups||[])]);
    if(r.homePickup!==false) g.homePickup=true;
    const price=Number(r.basePrice);
    if(Number.isFinite(price)) g.basePrice=Math.min(g.basePrice,price);
  });
  return [...map.values()].map(g=>({...g,basePrice:Number.isFinite(g.basePrice)?g.basePrice:0}));
}

export function routesInRouteGroup(routeOrId,routes){
  const all=Array.isArray(routes)?routes:DB.load('routes',[]);
  const base=typeof routeOrId==='string'?all.find(r=>r.id===routeOrId):routeOrId;
  if(!base) return [];
  const key=routeGroupKey(base);
  return all.filter(r=>routeGroupKey(r)===key);
}

export function vehicleById(id){ return DB.load('vehicles',[]).find(v=>v.id===id); }

export function vehName(v){ return v?(((v.brand||'')+(v.model?' '+v.model:'')).trim()||'Armada'):''; }

/* Armada agen untuk rute baru. Default: aktif & belum dipakai rute mana pun.
   includeUsed=true dipakai saat armada yang sama boleh melayani beberapa rute;
   routeUsage berisi rute yang sudah memakai armada tersebut. */
export function fleetAvailable(agencyId, { includeUsed = false } = {}){
  const usage=new Map();
  DB.load('routes',[]).forEach(r=>(r.vehicleIds||[]).forEach(id=>{
    if(!usage.has(id)) usage.set(id,[]);
    usage.get(id).push(r);
  }));
  return DB.load('vehicles',[])
    .filter(v=>v.agencyId===agencyId&&v.status==='aktif'&&(includeUsed||!usage.has(v.id)))
    .map(v=>({...v,routeUsage:usage.get(v.id)||[]}));
}

export function driverById(id){ return DB.load('drivers',[]).find(d=>d.id===id); }

/** Record pengemudi yang tertaut ke akun login. Tidak memakai fallback agen
 *  supaya akun agen/admin tidak dianggap sebagai pengemudi. */
export function driverForUser(u){
  if(!u||!u.email) return null;
  const email=String(u.email).toLowerCase();
  return DB.load('drivers',[]).find(d=>d.userEmail&&String(d.userEmail).toLowerCase()===email)||null;
}

/* Identitas pengemudi tidak memakai nama sebagai kunci. Nama boleh sama,
   selama NIK/SIM/HP berbeda. */
const identityDigits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/** True bila dua record pengemudi adalah orang yang sama. */
export function sameDriver(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const aNik = identityDigits(a.nik);
  const bNik = identityDigits(b.nik);
  if (aNik.length === 16 && bNik.length === 16) return aNik === bNik;
  const aSim = identityDigits(a.simNumber);
  const bSim = identityDigits(b.simNumber);
  if (aSim.length >= 6 && bSim.length >= 6) return aSim === bSim;
  const aPhone = identityDigits(a.phone);
  const bPhone = identityDigits(b.phone);
  if (aPhone.length >= 9 && bPhone.length >= 9) return aPhone === bPhone;
  return false;
}

/** Label dropdown: nama + data pembeda agar nama kembar tidak tertukar. */
export function driverOptionLabel(d) {
  if (!d) return '';
  const sim = [d.simType, d.simNumber].filter(Boolean).join(' ');
  return [d.name || '', d.phone || '', sim ? 'SIM ' + sim : ''].filter(Boolean).join(' • ');
}

/** Cari record pengemudi dari snapshot nama/HP/SIM. Nama hanya dipakai bila tunggal. */
export function driverBySnapshot(agencyId, snap = {}) {
  const ds = DB.load('drivers', []).filter((d) => d.agencyId === agencyId);
  const phone = identityDigits(snap.phone ?? snap.drvPhone ?? snap.backPhone);
  const sim = identityDigits(snap.sim ?? snap.drvSim ?? snap.backSim);
  const pick = (hits) => hits.find((d) => d.status === 'aktif') || hits[0] || null;
  if (phone.length >= 9) {
    const hits = ds.filter((d) => identityDigits(d.phone) === phone);
    if (hits.length) return pick(hits);
  }
  if (sim.length >= 6) {
    const hits = ds.filter((d) => identityDigits(d.simNumber) === sim);
    if (hits.length) return pick(hits);
  }
  return null;
}

/** Pengemudi utama armada: utamakan tautan ID, lalu snapshot data lama. */
export function driverForVehicle(v) {
  if (!v) return null;
  if (v.driverId) {
    const d = driverById(v.driverId);
    if (d && d.agencyId === v.agencyId) return d;
  }
  return driverBySnapshot(v.agencyId, { name: v.drvName, phone: v.drvPhone, sim: v.drvSim });
}

/** Pengemudi pengganti armada (opsional). */
export function backupDriverForVehicle(v) {
  if (!v) return null;
  if (v.hasBackup !== 'Ya' && !v.backDriverId && !v.backName) return null;
  if (v.backDriverId) {
    const d = driverById(v.backDriverId);
    if (d && d.agencyId === v.agencyId) return d;
  }
  return driverBySnapshot(v.agencyId, { name: v.backName, phone: v.backPhone, sim: v.backSim });
}

/** Kendaraan yang dikawal seorang pengemudi: posisi utama dulu, lalu pengganti.
 *  Dipakai mis. untuk nomor polisi pada kartu ID pengemudi. */
export function vehicleForDriver(d) {
  if (!d || !d.id) return null;
  const vs = DB.load('vehicles', []);
  return vs.find((v) => v.driverId === d.id) || vs.find((v) => v.backDriverId === d.id) || null;
}

/* ---------- Profil driver: isi sendiri + verifikasi agen ----------
   Field yang langsung berlaku: kontak, alamat, rekening, foto profil.
   Field identitas/dokumen: disimpan sebagai usulan, berlaku setelah disetujui agen. */
export const DRIVER_DIRECT_FIELDS = ['phone', 'address', 'emName', 'emPhone', 'emRelation', 'bank', 'photo'];
export const DRIVER_VERIFY_FIELDS = ['nik', 'birthPlace', 'birthDate', 'gender', 'marital', 'education', 'simType', 'simNumber', 'simExp', 'simPhoto', 'ktpPhoto'];
export const DRIVER_FIELD_LABELS = {
  phone: 'No HP', address: 'Alamat', emName: 'Nama kontak darurat', emPhone: 'No HP kontak darurat',
  emRelation: 'Hubungan kontak darurat', bank: 'Rekening bank', photo: 'Foto profil',
  nik: 'NIK', birthPlace: 'Tempat lahir', birthDate: 'Tanggal lahir', gender: 'Jenis kelamin',
  marital: 'Status perkawinan', education: 'Pendidikan', simType: 'Jenis SIM', simNumber: 'Nomor SIM',
  simExp: 'Masa berlaku SIM', simPhoto: 'Dokumen SIM', ktpPhoto: 'Foto KTP',
};
export const driverFieldLabel = (k) => DRIVER_FIELD_LABELS[k] || k;

/** Status proposed driver: ada usulan yang menunggu verifikasi agen? */
export function driverProfileStatus(d) {
  const pending = (d && d.pendingProfile && typeof d.pendingProfile === 'object') ? d.pendingProfile : {};
  const keys = Object.keys(pending);
  return { hasPending: keys.length > 0, pendingCount: keys.length, pending, pendingAt: (d && d.pendingAt) || null };
}

/** Pastikan ada record driver yang tertaut ke akun login (dibuat otomatis bila belum). */
export function ensureDriverForUser(user) {
  if (!user || !user.email) return null;
  const arr = DB.load('drivers', []);
  const em = String(user.email).toLowerCase();
  let d = arr.find((x) => x.userEmail && String(x.userEmail).toLowerCase() === em);
  if (!d) {
    d = {
      id: uid('DR'), agencyId: user.agencyId || '', name: user.name || '', phone: user.phone || '',
      wa: user.wa || user.phone || '', photo: user.photo || '', userEmail: user.email,
      status: 'aktif', rating: 5, trips: 0, createdAt: new Date().toISOString(),
    };
    arr.push(d);
    DB.save('drivers', arr);
    audit('driver_profile_create', d.name + ' • ' + d.id);
  }
  return d;
}

/** Sinkronkan data kontak driver ke akun loginnya. */
function syncDriverUser(d) {
  if (!d || !d.userEmail) return;
  const us = DB.load('users', []);
  const u = us.find((x) => String(x.email || '').toLowerCase() === String(d.userEmail).toLowerCase());
  if (!u) return;
  let ch = false;
  if (d.phone && u.phone !== d.phone) { u.phone = d.phone; u.wa = d.phone; ch = true; }
  if (d.photo && u.photo !== d.photo) { u.photo = d.photo; ch = true; }
  if (d.name && u.name !== d.name) { u.name = d.name; ch = true; }
  if (ch) DB.save('users', us);
}

/** Simpan perubahan profil driver: sebagian langsung berlaku, sebagian jadi usulan ke agen. */
export function submitDriverProfile(driverId, changes = {}) {
  const arr = DB.load('drivers', []);
  const d = arr.find((x) => x.id === driverId);
  if (!d) return { ok: false, msg: 'Data driver tidak ditemukan' };
  const direct = {};
  const proposal = {};
  Object.entries(changes || {}).forEach(([k, v]) => {
    if (DRIVER_DIRECT_FIELDS.includes(k)) direct[k] = v;
    else if (DRIVER_VERIFY_FIELDS.includes(k)) proposal[k] = v;
  });
  Object.keys(direct).forEach((k) => { if (d[k] === direct[k]) delete direct[k]; });
  const pending = { ...(d.pendingProfile && typeof d.pendingProfile === 'object' ? d.pendingProfile : {}) };
  Object.entries(proposal).forEach(([k, v]) => { pending[k] = v; });
  Object.keys(pending).forEach((k) => { if (pending[k] === d[k]) delete pending[k]; });

  const now = new Date().toISOString();
  Object.assign(d, direct);
  d.updatedAt = now;
  d.pendingProfile = pending;
  d.pendingAt = Object.keys(pending).length ? now : null;
  DB.save('drivers', arr);
  syncDriverUser(d);

  const directKeys = Object.keys(direct);
  const pendingKeys = Object.keys(pending);
  if (pendingKeys.length) {
    DB.load('users', [])
      .filter((u) => u.role === 'agen' && u.agencyId === d.agencyId)
      .forEach((u) => notify(u.email, 'Usulan perubahan data driver',
        d.name + ' mengirim ' + pendingKeys.length + ' field untuk diverifikasi: ' + pendingKeys.map(driverFieldLabel).join(', ') + '.', 'app'));
  }
  audit('driver_profile_submit', d.name + ' • langsung: ' + (directKeys.join(',') || '-') + ' • usulan: ' + (pendingKeys.join(',') || '-'));
  return { ok: true, direct: directKeys, pending: pendingKeys };
}

/** Agen menyetujui usulan perubahan data driver. */
export function approveDriverProfile(driverId, by = 'agen') {
  const arr = DB.load('drivers', []);
  const d = arr.find((x) => x.id === driverId);
  if (!d) return { ok: false, msg: 'Data driver tidak ditemukan' };
  const pending = (d.pendingProfile && typeof d.pendingProfile === 'object') ? d.pendingProfile : {};
  /* Sisa usulan `selfie` dari data lama dibuang — field swafoto tidak lagi. */
  const keys = Object.keys(pending).filter((k) => k !== 'selfie');
  if (!keys.length) return { ok: false, msg: 'Tidak ada usulan perubahan' };
  keys.forEach((k) => { d[k] = pending[k]; });
  d.pendingProfile = {};
  d.pendingAt = null;
  d.profileVerifiedAt = new Date().toISOString();
  d.profileVerifiedBy = by;
  DB.save('drivers', arr);
  syncDriverUser(d);
  notify(d.userEmail, 'Data driver disetujui',
    'Perubahan data Anda (' + keys.length + ' field) sudah disetujui agen: ' + keys.map(driverFieldLabel).join(', ') + '.', 'app');
  audit('driver_profile_approve', d.name + ' • ' + keys.join(','));
  return { ok: true, count: keys.length };
}

/** Agen menolak usulan perubahan data driver. */
export function rejectDriverProfile(driverId, reason = '', by = 'agen') {
  const arr = DB.load('drivers', []);
  const d = arr.find((x) => x.id === driverId);
  if (!d) return { ok: false, msg: 'Data driver tidak ditemukan' };
  const pending = (d.pendingProfile && typeof d.pendingProfile === 'object') ? d.pendingProfile : {};
  /* Sisa usulan `selfie` dari data lama ikut dibuang saat penolakan. */
  const keys = Object.keys(pending).filter((k) => k !== 'selfie');
  if (!keys.length) return { ok: false, msg: 'Tidak ada usulan perubahan' };
  const why = String(reason || '').trim() || 'Tidak sesuai data yang tercatat di agen';
  d.pendingProfile = {};
  d.pendingAt = null;
  DB.save('drivers', arr);
  notify(d.userEmail, 'Usulan data driver ditolak',
    'Perubahan ' + keys.map(driverFieldLabel).join(', ') + ' tidak disetujui. Alasan: ' + why, 'app');
  audit('driver_profile_reject', d.name + ' • ' + keys.join(',') + ' • ' + why);
  return { ok: true, count: keys.length };
}

export function schedById(id){ return DB.load('schedules',[]).find(s=>s.id===id); }

export function agencyById(id){ return DB.load('agencies',[]).find(a=>a.id===id); }

export function bookingsOf(schedId){ return DB.load('bookings',[]).filter(b=>b.scheduleId===schedId && b.status!=='cancelled'); }

/** Penumpang yang kursinya benar-benar ada di booking. Data lama bisa punya
 *  penumpang "hantu" (kursi tidak dibeli); jangan pernah tampilkan mereka. */
export function bookedPassengers(b){
  const seats=Array.isArray(b?.seats)?b.seats:[];
  const list=Array.isArray(b?.passengers)?b.passengers:[];
  if(!seats.length) return [];
  const booked=new Set(seats.map(String));
  return list.filter(p=>p && p.seat && booked.has(String(p.seat)));
}

export function takenSeats(schedId){
  const sch=schedById(schedId); const out={paid:[],booked:[],hold:[],inactive:[],blocked:[]};
  const role = (currentUser() || {}).role;
  const useProjection = DB.isRemote() && !['agen','pengemudi','superadmin'].includes(role) && Array.isArray(sch?.takenSeats);
  if(useProjection){
    const all=Array.from(new Set(sch.takenSeats.map(String)));
    out.paid=all.slice(); out.booked=all.slice();
  } else {
    bookingsOf(schedId).forEach(b=>{ (b.seats||[]).forEach(s=>{ if(b.status==='paid'||b.status==='done'){ out.booked.push(s); out.paid.push(s); } else if(b.status==='pending') out.hold.push(s); }); });
  }
  (sch?.blockedSeats||[]).forEach(s=>{ if(!out.blocked.includes(s)) out.blocked.push(s); if(!out.paid.includes(s)) out.paid.push(s); });
  const veh=sch?vehicleById(sch.vehicleId):null;
  (veh?.inactiveSeats||[]).forEach(s=>{ if(!out.inactive.includes(s)) out.inactive.push(s); if(!out.paid.includes(s)) out.paid.push(s); });
  return out;
}

export function seatsLeft(schedId){
  const tk=takenSeats(schedId);
  /* Kapasitas sudah tidak menghitung kursi nonaktif (layout 'off').
     Jadi jangan kurangi kursi nonaktif lagi; cukup kursi terisi, hold, dan blokir. */
  const used=new Set([...tk.booked, ...tk.hold, ...tk.blocked].map(String));
  return Math.max(0, schedSeatCap(schedId) - used.size);
}

export function vehLayout(v){
  if(v&&Array.isArray(v.layout)&&v.layout.length===28) return v.layout.map(c=>({sid:c.sid||null,type:c.type||'empty'}));
  const L=Array.from({length:28},()=>({sid:null,type:'empty'}));
  const put=(i,type,sid)=>{L[i]={sid:sid||null,type};};
  put(2,'driver','DRV'); put(3,'driver','DRV2');
  ['A1','A2','A3','A4','A5','A6'].forEach((s,k)=>put([0,1,4,5,8,9][k],'seat',s));
  ((v&&v.inactiveSeats)||[]).forEach(s=>{const c=L.find(x=>x.sid===s); if(c) c.type='off';});
  [24,25,26,27].forEach(i=>put(i,'luggage',null));
  return L;
}

export function vehSeatCount(v){ return vehLayout(v).filter(c=>c.type==='seat').length; }

export function schedSeatCap(schedId){ const s=schedById(schedId); if(!s) return 6; return Math.max(1,vehSeatCount(vehicleById(s.vehicleId))); }

export function schedReady(s){
  if(!s||s.status!=='open') return false;
  if(['ontrip','arrived','missed','cancelled'].includes(s.tripStatus)) return false;
  if(scheduleIsPast(s,0)) return false;
  if(scheduleMaintenance(s)) return false;
  const v=s.vehicleId?vehicleById(s.vehicleId):null, d=s.driverId?driverById(s.driverId):null;
  return (!v||v.status==='aktif')&&(!d||d.status==='aktif');
}

/* ---------- Maintenance armada berbasis periode ----------
   Pengajuan dibuat pengemudi, disetujui agen. Periode hanya memblokir
   jadwal pada tanggal tersebut; tanggal lain tetap normal. */
export const MAINTENANCE_MAX_DAYS = 2;
const MAINT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const maintKey = (v) => String(v || '').slice(0, 10);
const maintMs = (v) => {
  const k = maintKey(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(k) ? new Date(k + 'T00:00:00').getTime() : NaN;
};
export function maintenanceDateLabel(value) {
  const k = maintKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return '-';
  const [y, m, d] = k.split('-');
  return Number(d) + ' ' + (MAINT_MONTHS[Number(m) - 1] || m) + ' ' + y;
}

export function maintenancePeriodLabel(req) {
  if (!req) return '';
  if (!req.from && !req.until) return 'Maintenance';
  return req.from === req.until
    ? maintenanceDateLabel(req.from)
    : maintenanceDateLabel(req.from) + ' – ' + maintenanceDateLabel(req.until);
}

export function maintenanceRequestStatusLabel(status) {
  return ({
    menunggu: 'Menunggu persetujuan',
    disetujui: 'Disetujui',
    ditolak: 'Ditolak',
    dibatalkan: 'Dibatalkan',
    selesai: 'Selesai',
  })[status] || status || '-';
}

export function maintenanceRequestById(id) {
  return DB.load('maintenanceRequests', []).find((r) => r.id === id) || null;
}

export function maintenanceRequestsForVehicle(vehicleId) {
  return DB.load('maintenanceRequests', [])
    .filter((r) => r.vehicleId === vehicleId)
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
}

export function maintenanceRequestsForAgency(agencyId) {
  return DB.load('maintenanceRequests', [])
    .filter((r) => r.agencyId === agencyId)
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
}

export function maintenanceRequestsForDriver(driverId, vehicleIds = []) {
  const vids = new Set(vehicleIds || []);
  return DB.load('maintenanceRequests', [])
    .filter((r) => r.driverId === driverId || vids.has(r.vehicleId))
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
}

/** Request maintenance yang aktif pada satu tanggal untuk kendaraan. */
export function vehicleMaintenanceOn(vehicleId, date) {
  const d = maintKey(date);
  if (!vehicleId || !d) return null;
  const hit = DB.load('maintenanceRequests', []).find(
    (r) => r.vehicleId === vehicleId && r.status === 'disetujui' && r.from <= d && r.until >= d
  );
  if (hit) return hit;
  const v = vehicleById(vehicleId);
  if (!v || v.status !== 'maintenance') return null;
  /* Status legacy memblokir semua tanggal; field periode lama diabaikan. */
  return {
    id: 'LEGACY-' + v.id, legacy: true, vehicleId, from: v.maintenanceFrom || '', until: v.maintenanceUntil || '',
    status: 'disetujui', reason: 'Status armada sedang maintenance',
  };
}

/** Maintenance yang berlaku untuk satu jadwal (period-aware). */
export function scheduleMaintenance(s) {
  if (!s) return null;
  if (s.maintenanceRequestId) {
    const r = maintenanceRequestById(s.maintenanceRequestId);
    if (r && r.status === 'disetujui' && (!r.from || (s.date >= r.from && s.date <= r.until))) return r;
  }
  return vehicleMaintenanceOn(s.vehicleId, s.date);
}

export function vehicleMaintenancePeriods(vehicleId) {
  return DB.load('maintenanceRequests', [])
    .filter((r) => r.vehicleId === vehicleId && r.status === 'disetujui' && r.until >= todayStr(0))
    .sort((a, b) => String(a.from).localeCompare(String(b.from)));
}

/** Ringkasan label maintenance untuk kartu armada. */
export function vehicleMaintenanceLabel(v) {
  if (!v) return '';
  if (v.status === 'maintenance') return 'Maintenance';
  const list = vehicleMaintenancePeriods(v.id);
  const today = todayStr(0);
  const hit = list.find((r) => r.from <= today && r.until >= today) || list[0];
  return hit ? maintenancePeriodLabel(hit) : '';
}

/** Jadwal yang akan terkena dampak periode maintenance (trip berjalan tidak diikutkan). */
export function maintenanceAffectedSchedules({ vehicleId, from, until }) {
  const f = maintKey(from), t = maintKey(until);
  if (!vehicleId || !f || !t) return [];
  return DB.load('schedules', [])
    .filter((s) => s.vehicleId === vehicleId
      && s.date >= f && s.date <= t
      && s.status !== 'cancelled'
      && !['cancelled', 'missed', 'arrived', 'ontrip'].includes(s.tripStatus || 'scheduled')
      && !scheduleIsPast(s, 0))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Dampak nyata sebelum/sesudah approval, dipakai halaman driver & agen. */
export function maintenanceImpact({ vehicleId, from, until }) {
  const f = maintKey(from), t = maintKey(until);
  const schedules = maintenanceAffectedSchedules({ vehicleId, from: f, until: t });
  const ids = new Set(schedules.map((s) => s.id));
  const allBookings = DB.load('bookings', []);
  /* Booking yang pernah dipindahkan tetap dihitung: jadwal barunya bisa
     terkena maintenance berikutnya. Booking yang sudah refund/batal berstatus
     cancelled sehingga otomatis tidak ikut. */
  const paidBookings = allBookings.filter((b) => ids.has(b.scheduleId) && b.status === 'paid' && !b.boarded);
  const pendingBookings = allBookings.filter((b) => ids.has(b.scheduleId) && b.status === 'pending');
  const refundTotal = paidBookings.reduce((n, b) => n + Math.max(0, Number(b.total) || 0), 0);
  const replacementCount = paidBookings.filter((b) => maintenanceReplacementCandidatesForBooking(b).length > 0).length;
  return {
    from: f, until: t, schedules, paidBookings, pendingBookings,
    paid: paidBookings.length, pending: pendingBookings.length,
    refundTotal, replacementCount,
  };
}

export function maintenanceRequestImpact(req) {
  if (!req) return null;
  if (req.status === 'menunggu') return maintenanceImpact(req);
  return {
    ...maintenanceImpact(req),
    ...(req.summary || {}),
  };
}

/** Pengemudi mengajukan maintenance untuk armadanya sendiri (utama/pengganti). */
export function createMaintenanceRequest({ vehicleId, from, until, reason } = {}) {
  const u = currentUser();
  if (!u || u.role !== 'pengemudi') return { ok: false, msg: 'Hanya pengemudi yang bisa mengajukan maintenance' };
  const me = driverForUser(u);
  if (!me) return { ok: false, msg: 'Data pengemudi tidak ditemukan' };
  const v = vehicleById(vehicleId);
  if (!v || v.agencyId !== me.agencyId) return { ok: false, msg: 'Armada tidak ditemukan di agensi Anda' };
  const main = driverForVehicle(v), backup = backupDriverForVehicle(v);
  if (!sameDriver(me, main) && !sameDriver(me, backup)) {
    return { ok: false, msg: 'Anda bukan pengemudi armada ini' };
  }

  const f = maintKey(from), t = maintKey(until);
  if (!Number.isFinite(maintMs(f)) || !Number.isFinite(maintMs(t))) return { ok: false, msg: 'Tanggal maintenance tidak valid' };
  if (f > t) return { ok: false, msg: 'Tanggal selesai harus setelah tanggal mulai' };
  if (f < todayStr(0)) return { ok: false, msg: 'Tanggal maintenance sudah lewat' };
  const dayCount = Math.round((maintMs(t) - maintMs(f)) / 86400000) + 1;
  if (dayCount > MAINTENANCE_MAX_DAYS) return { ok: false, msg: 'Maintenance maksimal ' + MAINTENANCE_MAX_DAYS + ' hari per pengajuan' };
  const why = String(reason || '').trim();
  if (why.length < 10) return { ok: false, msg: 'Alasan maintenance wajib diisi minimal 10 karakter' };
  if (vehicleMaintenanceOn(vehicleId, f) || vehicleMaintenanceOn(vehicleId, t)) {
    return { ok: false, msg: 'Armada sudah memiliki maintenance pada tanggal tersebut' };
  }

  const requests = DB.load('maintenanceRequests', []);
  const overlap = requests.find((r) => r.vehicleId === vehicleId
    && ['menunggu', 'disetujui'].includes(r.status)
    && !(r.until < f || r.from > t));
  if (overlap) return { ok: false, msg: 'Sudah ada pengajuan maintenance yang beririsan pada armada ini' };

  const impact = maintenanceImpact({ vehicleId, from: f, until: t });
  const req = {
    id: uid('MT'), agencyId: v.agencyId, vehicleId, vehicleName: vehName(v), vehiclePlate: v.plate || '',
    driverId: me.id, driverName: me.name, from: f, until: t, reason: why,
    status: 'menunggu', requestedAt: new Date().toISOString(), requestedBy: u.email,
    decidedAt: null, decidedBy: null, decisionNote: '',
    affectedScheduleIds: [], summary: null,
  };
  requests.unshift(req);
  DB.save('maintenanceRequests', requests);

  DB.load('users', [])
    .filter((x) => x.role === 'agen' && x.agencyId === v.agencyId)
    .forEach((x) => notify(x.email, 'Pengajuan maintenance armada',
      me.name + ' mengajukan maintenance ' + vehName(v) + ' (' + v.plate + ') ' + maintenancePeriodLabel(req) + '. Alasan: ' + why + '.', 'app', { requestId: req.id, kind: 'maintenance_request' }));
  audit('maintenance_request', req.id + ' • ' + vehName(v) + ' ' + maintenancePeriodLabel(req) + ' • ' + me.name);
  return { ok: true, request: req, impact };
}

/** Batas memilih refund / pindah armada. Minimal 2 jam sejak approval,
 *  tetapi tidak melewati 30 menit sebelum keberangkatan. */
export function maintenanceDeadlineFor(s, now = Date.now()) {
  if (!s) return new Date(now + 24 * 3600 * 1000).toISOString();
  const dep = scheduleEffectiveDepartureMs(s);
  let deadline = Number.isFinite(dep) ? dep - 24 * 3600 * 1000 : now + 24 * 3600 * 1000;
  if (deadline < now + 2 * 3600 * 1000) deadline = now + 2 * 3600 * 1000;
  if (Number.isFinite(dep) && deadline > dep - 30 * 60 * 1000) deadline = dep - 30 * 60 * 1000;
  // Jika batas 30 menit sebelum berangkat sudah lewat, approval langsung refund.
  return new Date(deadline).toISOString();
}

export function maintenanceDeadlineLabel(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '-';
}

function maintenanceCandidateLabel(t) {
  if (!t) return '';
  const v = vehicleById(t.vehicleId);
  return vehName(v) + (v && v.plate ? ' (' + v.plate + ')' : '') + ' • ' + (t.time || '-') + ' WIB';
}

/** Armada pengganti valid: agensi, arah rute, tanggal, dan harga sama,
 *  kursi cukup, bukan armada yang maintenance. */
export function maintenanceReplacementCandidatesForBooking(bookingOrId) {
  const b = typeof bookingOrId === 'string'
    ? DB.load('bookings', []).find((x) => x.id === bookingOrId)
    : bookingOrId;
  if (!b || b.status !== 'paid') return [];
  /* Pencarian pengganti selalu mengikuti jadwal booking saat ini. Untuk booking
     yang pernah dipindahkan, jadwal lama hanya dipakai sebagai riwayat tampilan. */
  const orig = schedById(b.scheduleId);
  if (!orig) return [];
  const origRoute = routeById(orig.routeId);
  const key = routeGroupKey(origRoute);
  if (!key || key === '|') return [];
  const need = Math.max(1, (b.seats || []).length);
  return DB.load('schedules', [])
    .filter((t) => t.id !== orig.id
      && t.vehicleId !== orig.vehicleId
      && t.agencyId === orig.agencyId
      && t.date === orig.date
      && t.status === 'open'
      && (t.tripStatus || 'scheduled') === 'scheduled'
      && Number(t.price) === Number(orig.price)
      && routeGroupKey(routeById(t.routeId)) === key
      && !isRouteSuspended(routeById(t.routeId), t.agencyId)
      && !scheduleMaintenance(t)
      && schedReady(t)
      && seatsLeft(t.id) >= need)
    .sort((a, b2) => String(a.time).localeCompare(String(b2.time)) || String(a.vehicleId).localeCompare(String(b2.vehicleId)));
}

export function maintenanceBookingInfo(b) {
  if (!b) return null;
  const request = b.maintenanceRequestId ? maintenanceRequestById(b.maintenanceRequestId) : null;
  const current = schedById(b.scheduleId);
  const fallbackRequest = request || scheduleMaintenance(current);
  if (!b.maintenanceState && !fallbackRequest) return null;
  const original = schedById(b.maintenanceOriginalScheduleId || b.scheduleId) || current;
  return {
    request: fallbackRequest,
    state: b.maintenanceState || 'active',
    originalSchedule: original,
    currentSchedule: current,
    deadline: b.maintenanceChoiceDeadline || null,
    candidates: b.maintenanceState === 'choice_pending' ? maintenanceReplacementCandidatesForBooking(b) : [],
    refundAmount: Math.max(0, Number(b.maintenanceRefundAmount ?? b.total) || 0),
  };
}

function applyMaintenanceCancelPending(b, payments, nowIso) {
  b.status = 'cancelled';
  b.tripStatus = 'cancelled';
  b.refundPct = 0;
  b.refundAmount = 0;
  b.refundScope = 'total';
  b.refundStatus = 'none';
  b.refundPaidAt = null;
  b.cancelReason = 'Jadwal maintenance armada (booking belum dibayar)';
  b.cancelledBy = 'sistem';
  b.cancelledAt = nowIso;
  b.maintenanceState = 'cancelled_unpaid';
  b.maintenanceResolvedAt = nowIso;
  restoreVoucher(b);
  updatePaymentRefund(payments, b, { refund: 0, pct: 0, scope: 'total', status: 'cancelled' });
}

function applyMaintenanceRefundRecord(b, payments, ledger, reason, by, nowIso) {
  const wasPaid = b.status === 'paid';
  const refund = wasPaid ? Math.max(0, Number(b.total) || 0) : 0;
  b.status = 'cancelled';
  b.tripStatus = 'cancelled';
  b.refundPct = wasPaid ? 100 : 0;
  b.refundAmount = refund;
  b.refundScope = 'total';
  b.refundStatus = refund > 0 ? 'pending' : 'none';
  b.refundPaidAt = null;
  b.cancelReason = 'Maintenance armada' + (reason ? ': ' + reason : '');
  b.cancelledBy = by;
  b.cancelledAt = nowIso;
  b.maintenanceState = 'refunded';
  b.maintenanceResolvedAt = nowIso;
  b.maintenanceChoiceDeadline = null;
  restoreVoucher(b);
  updatePaymentRefund(payments, b, { refund, pct: wasPaid ? 100 : 0, scope: 'total', status: wasPaid ? undefined : 'cancelled' });
  (ledger || []).forEach((e) => {
    if (e.bookingId === b.id && e.status !== 'dicairkan') {
      e.status = 'void';
      e.voidedAt = nowIso;
    }
  });
  return refund;
}

/** Agen menyetujui / menolak pengajuan maintenance. Approval hanya mengubah
 *  jadwal pada periode; jadwal di luar periode tetap normal. */
export function decideMaintenanceRequest(requestId, approve, { note = '', by = 'agen' } = {}) {
  const u = currentUser();
  if (u && !['agen', 'superadmin'].includes(u.role)) return { ok: false, msg: 'Hanya agen yang bisa memutuskan maintenance' };
  const requests = DB.load('maintenanceRequests', []);
  const req = requests.find((r) => r.id === requestId);
  if (!req) return { ok: false, msg: 'Pengajuan maintenance tidak ditemukan' };
  if (req.status !== 'menunggu') return { ok: false, msg: 'Pengajuan sudah diputuskan' };
  if (approve && req.until < todayStr(0)) return { ok: false, msg: 'Periode maintenance sudah lewat — tolak pengajuan ini' };
  if (u && u.role === 'agen' && u.agencyId !== req.agencyId) return { ok: false, msg: 'Pengajuan milik agensi lain' };

  const nowIso = new Date().toISOString();
  const driver = driverById(req.driverId);
  if (!approve) {
    req.status = 'ditolak';
    req.decidedAt = nowIso;
    req.decidedBy = u ? u.email : by;
    req.decisionNote = String(note || '').trim() || 'Tidak disetujui agen';
    DB.save('maintenanceRequests', requests);
    if (driver && driver.userEmail) {
      notify(driver.userEmail, 'Pengajuan maintenance ditolak',
        'Pengajuan maintenance ' + req.vehicleName + ' ' + maintenancePeriodLabel(req) + ' ditolak. Catatan: ' + req.decisionNote, 'app', { requestId: req.id, kind: 'maintenance_request' });
    }
    audit('maintenance_rejected', req.id + ' • ' + req.vehicleName + ' • ' + req.decisionNote);
    return { ok: true, request: req };
  }

  const v = vehicleById(req.vehicleId);
  if (!v || v.agencyId !== req.agencyId) return { ok: false, msg: 'Armada pengajuan tidak ditemukan' };
  const overlap = requests.find((r) => r.id !== req.id && r.vehicleId === req.vehicleId
    && ['menunggu', 'disetujui'].includes(r.status) && !(r.until < req.from || r.from > req.until));
  if (overlap) return { ok: false, msg: 'Sudah ada maintenance disetujui pada periode yang sama' };

  const schedules = DB.load('schedules', []);
  const bookings = DB.load('bookings', []);
  const payments = DB.load('payments', []);
  const ledger = DB.load('ledger', []);
  const affectedIds = new Set(maintenanceAffectedSchedules({ vehicleId: req.vehicleId, from: req.from, until: req.until }).map((s) => s.id));
  const affected = schedules.filter((s) => affectedIds.has(s.id));
  const rp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
  let paidCount = 0, pendingCount = 0, refundedCount = 0, choiceCount = 0, totalRefund = 0, replacementOffers = 0;

  affected.forEach((s) => {
    s.maintenanceRequestId = req.id;
    s.maintenanceFrom = req.from;
    s.maintenanceUntil = req.until;
    s.maintenanceStatus = 'active';
    s.maintenanceReason = req.reason;
    s.maintenanceUpdatedAt = nowIso;
  });

  affected.forEach((s) => {
    bookings.forEach((b) => {
      if (b.scheduleId !== s.id || b.boarded) return;
      if (b.status === 'pending') {
        b.maintenanceRequestId = req.id;
        b.maintenanceOriginalScheduleId = b.scheduleId;
        b.maintenanceFrom = req.from;
        b.maintenanceUntil = req.until;
        b.maintenanceRefundAmount = 0;
        applyMaintenanceCancelPending(b, payments, nowIso);
        pendingCount += 1;
        notify(b.userEmail || driver?.userEmail, 'Booking dibatalkan — ' + b.code,
          'Jadwal ' + s.date + ' ' + s.time + ' dibatalkan karena maintenance armada. Booking belum dibayar sehingga tidak ada refund.',
          'WA', { bookingId: b.id, kind: 'maintenance' });
        return;
      }
      if (b.status !== 'paid') return;
      paidCount += 1;
      b.maintenanceRequestId = req.id;
      b.maintenanceOriginalScheduleId = b.scheduleId;
      b.maintenanceFrom = req.from;
      b.maintenanceUntil = req.until;
      b.maintenanceRefundAmount = Math.max(0, Number(b.total) || 0);
      b.replacementScheduleId = null;
      b.replacementAt = null;
      b.replacementBy = null;
      b.maintenanceState = 'choice_pending';
      b.maintenanceResolvedAt = null;
      b.maintenanceChoiceDeadline = maintenanceDeadlineFor(s);
      const candidates = maintenanceReplacementCandidatesForBooking(b);
      if (candidates.length && b.userEmail && new Date(b.maintenanceChoiceDeadline).getTime() > Date.now()) {
        choiceCount += 1;
        replacementOffers += 1;
        const cand = candidates[0];
        notify(b.userEmail || driver?.userEmail, 'Jadwal maintenance — ' + b.code,
          'Jadwal ' + s.date + ' ' + s.time + ' dibatalkan karena maintenance armada. '
          + 'Refund 100% ' + rp(b.total) + '. Armada pengganti tersedia: ' + maintenanceCandidateLabel(cand) + '. '
          + 'Pilih refund atau pindah armada sebelum ' + maintenanceDeadlineLabel(b.maintenanceChoiceDeadline)
          + '. Jika tidak memilih, refund 100% otomatis. Jika armada pengganti tidak lagi tersedia, refund tetap 100%.',
          'WA', { bookingId: b.id, kind: 'maintenance' });
      } else {
        const refund = applyMaintenanceRefundRecord(b, payments, ledger, req.reason, 'sistem', nowIso);
        refundedCount += 1;
        totalRefund += refund;
        notify(b.userEmail || driver?.userEmail, 'Jadwal maintenance — ' + b.code,
          'Jadwal ' + s.date + ' ' + s.time + ' dibatalkan karena maintenance armada. '
          + (candidates.length && !b.userEmail
            ? 'Tiket ini dibuat pengemudi tanpa akun pelanggan, sehingga refund 100% ' + rp(refund) + ' diproses otomatis.'
            : 'Tidak ada armada pengganti valid atau batas pilihan sudah lewat. Refund 100% ' + rp(refund) + ' diproses otomatis.'),
          'WA', { bookingId: b.id, kind: 'maintenance' });
      }
    });
  });

  req.status = 'disetujui';
  req.decidedAt = nowIso;
  req.decidedBy = u ? u.email : by;
  req.decisionNote = String(note || '').trim();
  req.affectedScheduleIds = affected.map((s) => s.id);
  req.summary = {
    schedules: affected.length,
    paidBookings: paidCount,
    pendingBookings: pendingCount,
    refunded: refundedCount,
    choices: choiceCount,
    replacementOffers,
    refundTotal: totalRefund,
  };
  v.maintenanceFrom = req.from;
  v.maintenanceUntil = req.until;
  v.maintenanceRequestId = req.id;

  DB.save('schedules', schedules);
  DB.save('bookings', bookings);
  DB.save('payments', payments);
  DB.save('ledger', ledger);
  DB.save('maintenanceRequests', requests);
  DB.save('vehicles', DB.load('vehicles', []).map((x) => (x.id === v.id ? v : x)));

  if (driver && driver.userEmail) {
    notify(driver.userEmail, 'Pengajuan maintenance disetujui',
      'Maintenance ' + req.vehicleName + ' ' + maintenancePeriodLabel(req) + ' disetujui. '
      + affected.length + ' jadwal diblokir; booking pelanggan ditindaklanjuti otomatis.', 'app', { requestId: req.id, kind: 'maintenance_request' });
  }
  DB.load('users', [])
    .filter((x) => x.role === 'agen' && x.agencyId === req.agencyId)
    .forEach((x) => notify(x.email, 'Maintenance disetujui',
      req.vehicleName + ' ' + maintenancePeriodLabel(req) + ' • ' + affected.length + ' jadwal • ' + paidCount + ' booking lunas ditindaklanjuti.', 'app', { requestId: req.id, kind: 'maintenance_request' }));
  audit('maintenance_approved', req.id + ' • ' + req.vehicleName + ' ' + maintenancePeriodLabel(req)
    + ' • ' + affected.length + ' jadwal • ' + choiceCount + ' pilihan • ' + refundedCount + ' refund otomatis');

  return {
    ok: true, request: req,
    affected: affected.length, paid: paidCount, pending: pendingCount,
    choices: choiceCount, refunded: refundedCount, refundTotal: totalRefund,
  };
}

/** Pengemudi membatalkan pengajuan yang masih menunggu; agen juga boleh
 *  membersihkan antrean. Approval yang sudah berjalan tidak bisa dibatalkan. */
export function cancelMaintenanceRequest(requestId, { reason = '', by = 'pengemudi' } = {}) {
  const u = currentUser();
  const requests = DB.load('maintenanceRequests', []);
  const req = requests.find((r) => r.id === requestId);
  if (!req) return { ok: false, msg: 'Pengajuan maintenance tidak ditemukan' };
  if (req.status !== 'menunggu') return { ok: false, msg: 'Hanya pengajuan yang masih menunggu yang bisa dibatalkan' };
  if (u && u.role === 'pengemudi') {
    const me = driverForUser(u);
    if (!me || me.id !== req.driverId) return { ok: false, msg: 'Pengajuan ini bukan milik Anda' };
  } else if (u && u.role === 'agen' && u.agencyId !== req.agencyId) {
    return { ok: false, msg: 'Pengajuan milik agensi lain' };
  } else if (u && !['agen', 'superadmin'].includes(u.role)) {
    return { ok: false, msg: 'Anda tidak bisa membatalkan pengajuan ini' };
  }
  const nowIso = new Date().toISOString();
  req.status = 'dibatalkan';
  req.decidedAt = nowIso;
  req.decidedBy = u ? u.email : by;
  req.decisionNote = String(reason || '').trim() || 'Dibatalkan sebelum diputuskan';
  DB.save('maintenanceRequests', requests);
  const driver = driverById(req.driverId);
  if (u && u.role === 'pengemudi') {
    DB.load('users', [])
      .filter((x) => x.role === 'agen' && x.agencyId === req.agencyId)
      .forEach((x) => notify(x.email, 'Pengajuan maintenance dibatalkan',
        req.vehicleName + ' ' + maintenancePeriodLabel(req) + ' dibatalkan oleh pengemudi.', 'app', { requestId: req.id, kind: 'maintenance_request' }));
  } else if (driver && driver.userEmail) {
    notify(driver.userEmail, 'Pengajuan maintenance dibatalkan',
      'Pengajuan maintenance ' + req.vehicleName + ' ' + maintenancePeriodLabel(req) + ' dibatalkan. Catatan: ' + req.decisionNote, 'app', { requestId: req.id, kind: 'maintenance_request' });
  }
  audit('maintenance_cancelled', req.id + ' • ' + req.vehicleName + ' • ' + req.decisionNote);
  return { ok: true, request: req };
}

/** Pelanggan/agen memilih refund 100% untuk booking yang terkena maintenance. */
export function refundMaintenanceBooking(bookingId, { reason = '', by = 'pelanggan' } = {}) {
  const u = currentUser();
  const bookings = DB.load('bookings', []);
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { ok: false, msg: 'Booking tidak ditemukan' };
  if (u && !['pelanggan', 'agen', 'superadmin'].includes(u.role)) return { ok: false, msg: 'Anda tidak bisa memproses refund ini' };
  if (u && u.role === 'pelanggan' && (!b.userEmail || u.email !== b.userEmail)) return { ok: false, msg: 'Booking ini bukan milik akun Anda' };
  if (u && u.role === 'agen' && schedById(b.scheduleId)?.agencyId !== u.agencyId) return { ok: false, msg: 'Booking milik agensi lain' };
  if (b.maintenanceState === 'replaced') return { ok: false, msg: 'Booking sudah dipindahkan ke armada pengganti' };
  if (b.status === 'cancelled' && b.maintenanceState === 'refunded') {
    return { ok: true, refund: Number(b.refundAmount) || 0, already: true };
  }
  if (b.status !== 'paid') return { ok: false, msg: b.status === 'pending' ? 'Booking belum dibayar — dibatalkan tanpa refund' : 'Booking tidak bisa direfund pada status ini' };
  if (!b.maintenanceRequestId && !scheduleMaintenance(schedById(b.scheduleId))) {
    return { ok: false, msg: 'Booking ini tidak terkena maintenance' };
  }
  const nowIso = new Date().toISOString();
  const payments = DB.load('payments', []);
  const ledger = DB.load('ledger', []);
  const refund = applyMaintenanceRefundRecord(b, payments, ledger, reason || 'Pilihan pelanggan', by, nowIso);
  DB.save('bookings', bookings);
  DB.save('payments', payments);
  DB.save('ledger', ledger);
  notify(b.userEmail, 'Refund maintenance diproses — ' + b.code,
    'Refund 100% sebesar ' + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(refund)
    + ' diproses 1–3 hari kerja ke metode pembayaran awal.', 'WA', { bookingId: b.id, kind: 'maintenance' });
  audit('maintenance_refund', b.code + ' • ' + by + ' • ' + refund);
  return { ok: true, refund, booking: b };
}

/** Pindahkan booking lunas ke armada pengganti yang sudah divalidasi. */
export function moveMaintenanceBooking(bookingId, targetScheduleId, { by = 'pelanggan' } = {}) {
  const u = currentUser();
  const bookings = DB.load('bookings', []);
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { ok: false, msg: 'Booking tidak ditemukan' };
  if (u && !['pelanggan', 'agen', 'superadmin'].includes(u.role)) return { ok: false, msg: 'Anda tidak bisa memindahkan booking ini' };
  if (u && u.role === 'pelanggan' && (!b.userEmail || u.email !== b.userEmail)) return { ok: false, msg: 'Booking ini bukan milik akun Anda' };
  if (u && u.role === 'agen' && schedById(b.scheduleId)?.agencyId !== u.agencyId) return { ok: false, msg: 'Booking milik agensi lain' };
  if (b.maintenanceState !== 'choice_pending') return { ok: false, msg: 'Booking tidak dalam proses pilihan maintenance' };
  if (b.maintenanceChoiceDeadline && new Date(b.maintenanceChoiceDeadline).getTime() <= Date.now()) {
    return { ok: false, msg: 'Batas waktu memilih sudah lewat — refund 100% akan diproses otomatis' };
  }
  const candidates = maintenanceReplacementCandidatesForBooking(b);
  const target = candidates.find((x) => x.id === targetScheduleId);
  if (!target) return { ok: false, msg: 'Armada pengganti tidak tersedia atau sudah berubah' };
  const orig = schedById(b.maintenanceOriginalScheduleId || b.scheduleId);
  if (!orig) return { ok: false, msg: 'Jadwal asal tidak ditemukan' };

  const tk = takenSeats(target.id);
  const layout = vehLayout(vehicleById(target.vehicleId));
  const available = layout.filter((c) => c.type === 'seat' && c.sid
    && !tk.paid.includes(c.sid) && !tk.hold.includes(c.sid) && !tk.blocked.includes(c.sid) && !tk.inactive.includes(c.sid)).map((c) => c.sid);
  const oldSeats = [...(b.seats || [])];
  const nextSeats = oldSeats.filter((st) => available.includes(st));
  for (const st of available) {
    if (nextSeats.length >= oldSeats.length) break;
    if (!nextSeats.includes(st)) nextSeats.push(st);
  }
  if (nextSeats.length < oldSeats.length) return { ok: false, msg: 'Kursi pada armada pengganti tidak mencukupi' };

  const oldPax = Array.isArray(b.passengers) ? b.passengers : [];
  b.passengers = oldSeats.map((oldSeat, i) => {
    const p = oldPax.find((x) => x.seat === oldSeat) || oldPax[i] || { name: 'Penumpang', phone: '-' };
    return { ...p, seat: nextSeats[i] };
  });
  b.maintenanceOriginalScheduleId = orig.id;
  b.scheduleId = target.id;
  b.seats = nextSeats;
  b.status = 'paid';
  b.tripStatus = 'scheduled';
  b.boarded = false;
  b.maintenanceState = 'replaced';
  b.replacementScheduleId = target.id;
  b.replacementAt = new Date().toISOString();
  b.replacementBy = by;
  b.maintenanceChoiceDeadline = null;
  b.maintenanceResolvedAt = b.replacementAt;
  b.fare = splitFare(target, nextSeats.length, b.discount || 0, b.source);

  const ledger = DB.load('ledger', []);
  ledger.forEach((e) => {
    if (e.bookingId !== b.id || e.status === 'dicairkan') return;
    const fare = splitFare(target, nextSeats.length, b.discount || 0, b.source);
    e.scheduleId = target.id;
    e.agencyId = target.agencyId;
    e.driverId = target.driverId || null;
    e.seats = [...nextSeats];
    e.ticket = fare.ticket;
    e.service = fare.service;
    e.fee = fare.fee;
    e.total = fare.total;
    e.replacedFromScheduleId = orig.id;
    e.updatedAt = b.replacementAt;
  });
  DB.save('bookings', bookings);
  DB.save('ledger', ledger);

  const v = vehicleById(target.vehicleId);
  notify(b.userEmail, 'Pindah armada berhasil — ' + b.code,
    'Tiket dipindahkan ke ' + vehName(v) + ' (' + (v.plate || '-') + ') pukul ' + target.time + ' WIB, tanggal ' + target.date
    + '. Kursi baru: ' + nextSeats.join(', ') + '. Harga dan pembayaran tetap sama.', 'WA', { bookingId: b.id, kind: 'maintenance' });
  DB.load('users', [])
    .filter((x) => x.role === 'agen' && x.agencyId === target.agencyId)
    .forEach((x) => notify(x.email, 'Pelanggan pindah armada',
      b.code + ' dipindahkan dari ' + orig.date + ' ' + orig.time + ' ke ' + target.date + ' ' + target.time + '.', 'app', { bookingId: b.id, kind: 'maintenance' }));
  audit('maintenance_replaced', b.code + ' • ' + orig.id + ' → ' + target.id + ' • kursi ' + nextSeats.join(','));
  return { ok: true, booking: b, target, oldSchedule: orig, seats: nextSeats };
}

/* Fallback nama lama: aman hanya bila nama tunggal; nama kembar wajib driverId/NIK/SIM/HP. */
export function driverByName(agencyId, name){
  const n=String(name||'').trim().toLowerCase();
  if(!n||!agencyId) return null;
  const ds=DB.load('drivers',[]).filter(d=>d.agencyId===agencyId&&String(d.name||'').trim().toLowerCase()===n);
  return ds.length===1?ds[0]:null;
}

export function drvBlocks(L){ let n=0; for(let r=0;r<7;r++){ const a=L[r*4+2],b=L[r*4+3]; if(a&&b&&a.type==='driver'&&b.type==='driver') n++; } return n; }

/* ---------- Siklus hidup jadwal ---------- */
export const SCHEDULE_GRACE_HOURS = 3;
export const MAX_DEPARTURE_DELAY_MINUTES = 180;

/** Waktu keberangkatan jadwal dalam milidetik (zona waktu lokal). */
export function scheduleDepartureMs(s) {
  if (!s || !s.date) return NaN;
  return new Date(s.date + 'T' + (s.time || '00:00') + ':00').getTime();
}

/** Waktu keberangkatan efektif: jadwal asli atau estimasi delay bila lebih lambat. */
export function scheduleEffectiveDepartureMs(s) {
  const base = scheduleDepartureMs(s);
  const delayed = s && s.delayUntil ? new Date(s.delayUntil).getTime() : NaN;
  return Number.isFinite(delayed) && (!Number.isFinite(base) || delayed > base) ? delayed : base;
}

/** Posisi waktu terhadap jam keberangkatan efektif.
 *  minutes > 0 = masih lebih awal; minutes < 0 = sudah lewat. */
export function departureTiming(s, now = Date.now()) {
  const target = scheduleEffectiveDepartureMs(s);
  if (!Number.isFinite(target)) return { state: 'unknown', minutes: 0 };
  const minutes = Math.round((target - now) / 60000);
  if (minutes > 60) return { state: 'early', minutes };
  if (minutes < -120) return { state: 'late', minutes };
  return { state: 'normal', minutes };
}

/** True bila jadwal sudah melewati jam keberangkatan efektif + masa tenggang. */
export function scheduleIsPast(s, graceHours = 0, now = Date.now()) {
  const t = scheduleEffectiveDepartureMs(s);
  return Number.isFinite(t) && now > t + Number(graceHours || 0) * 3600000;
}

/** Jadwal yang sudah selesai/tidak lagi berjalan masuk ke tab Riwayat. */
export function scheduleInHistory(s) {
  if (!s) return false;
  if (['arrived', 'missed'].includes(s.tripStatus) || s.status === 'cancelled') return true;
  const delayActive = s.delayUntil && new Date(s.delayUntil).getTime() > Date.now();
  return !delayActive && String(s.date || '') < todayStr(0);
}

/** Jadwal lampau yang belum ditutup dan perlu keputusan pengemudi/admin. */
export function scheduleNeedsReview(s) {
  if (!s || s.reviewedAt || s.tripStatus === 'arrived' || s.status === 'cancelled') return false;
  if (s.tripStatus === 'ontrip') return !!s.date && String(s.date) < todayStr(0);
  if (s.tripStatus === 'missed') return true;
  if (!s.tripStatus || s.tripStatus === 'scheduled') {
    const delayActive = s.delayUntil && new Date(s.delayUntil).getTime() > Date.now();
    return scheduleIsPast(s, SCHEDULE_GRACE_HOURS) || (!delayActive && !!s.date && String(s.date) < todayStr(0));
  }
  return false;
}

/** Durasi rute ("±3 jam", "2,5 jam", "90 menit") → menit.
 *  Mengembalikan 0 bila durasi tidak diketahui. */
export function routeDurationMinutes(route) {
  const parse = (txt) => {
    if (!txt || txt === '-') return 0;
    let total = 0;
    let m = /([\d.,]+)\s*jam/i.exec(txt);
    if (m) total += parseFloat(m[1].replace(',', '.')) * 60;
    m = /([\d.,]+)\s*menit/i.exec(txt);
    if (m) total += parseFloat(m[1].replace(',', '.'));
    return Math.round(total);
  };
  let mins = parse(route && route.duration);
  if (!mins) {
    const est = estimateRoute(route && route.from, route && route.to);
    mins = parse(est && est.duration);
  }
  return mins || 0;
}

/** Durasi untuk tampilan/progres; fallback lama 180 menit. */
export function durMinutes(route) {
  return routeDurationMinutes(route) || 180;
}

/* Jeda aman setelah tiba sebelum armada boleh berangkat lagi. */
export const SCHEDULE_BUFFER_MINUTES = 30;

/* Jadwal yang masih dihitung untuk kapasitas armada.
   Jadwal batal dan missed tidak menghabiskan slot. */
export function countedSchedule(s) {
  return !!s && s.status !== 'cancelled' && s.tripStatus !== 'cancelled' && s.tripStatus !== 'missed';
}

const localDateKeyOf = (ms) => {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

/**
 * Status satu tanggal untuk armada + rute + jam yang sedang dipilih.
 * Aturan: maksimal 2 keberangkatan aktif per tanggal (00:00–23:59),
 * semua rute, ditambah cek durasi perjalanan + jeda 30 menit.
 */
export function scheduleDateStatus({ vehicleId, routeId, date, time, schedules = DB.load('schedules', []), routes = DB.load('routes', []), selectedDates = [], now = Date.now() }) {
  if (!vehicleId) return { state: 'blocked', count: 0, reason: 'Pilih armada dulu' };
  const route = routes.find((r) => r.id === routeId);
  if (!route) return { state: 'blocked', count: 0, reason: 'Pilih rute dulu' };
  const durationMin = routeDurationMinutes(route);
  if (!durationMin) return { state: 'blocked', count: 0, reason: 'Durasi rute belum diketahui — jadwal tidak bisa disimpan' };

  const start = new Date(date + 'T' + (time || '00:00') + ':00').getTime();
  if (!Number.isFinite(start)) return { state: 'blocked', count: 0, reason: 'Tanggal atau jam tidak valid' };
  if (String(date) < localDateKeyOf(now)) return { state: 'past', count: 0, reason: 'Tanggal sudah lewat' };
  if (start <= now) return { state: 'past-time', count: 0, reason: 'Jam keberangkatan sudah lewat' };
  const mt = vehicleMaintenanceOn(vehicleId, date);
  if (mt) return { state: 'maintenance', count: 0, reason: 'Armada maintenance ' + maintenancePeriodLabel(mt) };

  const routeMap = new Map(routes.map((r) => [r.id, r]));
  const active = schedules.filter(countedSchedule).filter((s) => s.vehicleId === vehicleId);
  const count = active.filter((s) => localDateKeyOf(scheduleEffectiveDepartureMs(s)) === date).length;
  if (count >= 2) return { state: 'full', count, reason: 'Sudah ' + count + ' keberangkatan pada tanggal ini' };

  const spans = active.map((s) => {
    const r = routeMap.get(s.routeId);
    const dep = scheduleEffectiveDepartureMs(s);
    if (!Number.isFinite(dep) || !r) return null;
    const mins = routeDurationMinutes(r) || durMinutes(r);
    return { dep, end: dep + (mins + SCHEDULE_BUFFER_MINUTES) * 60000, s };
  }).filter(Boolean);

  const candStart = start;
  const candEnd = start + (durationMin + SCHEDULE_BUFFER_MINUTES) * 60000;
  const clash = spans.find((x) => candStart < x.end && x.dep < candEnd);
  if (clash) {
    return { state: 'duration', count, reason: 'Durasi perjalanan bertabrakan dengan jadwal ' + clash.s.date + ' ' + clash.s.time };
  }

  const selectedClash = selectedDates.filter((d) => d !== date).find((d) => {
    const ms = new Date(d + 'T' + (time || '00:00') + ':00').getTime();
    if (!Number.isFinite(ms)) return false;
    const end = ms + (durationMin + SCHEDULE_BUFFER_MINUTES) * 60000;
    return candStart < end && ms < candEnd;
  });
  if (selectedClash) return { state: 'selected-conflict', count, reason: 'Bentrok dengan tanggal ' + selectedClash + ' yang juga dipilih' };

  if (count === 1) return { state: 'limited', count, reason: 'Sudah 1 keberangkatan; masih bisa tambah 1' };
  return { state: 'available', count, reason: 'Belum ada keberangkatan' };
}

/** Progres perjalanan berbasis waktu: berangkat → estimasi tiba.
 *  Info keterlambatan in-trip tidak ikut mengubah ETA (hanya informasi). */
export function tripProgress(s, route, now = Date.now()) {
  if (!s) return null;
  let start = s.departedAt ? new Date(s.departedAt).getTime() : NaN;
  if (!Number.isFinite(start)) start = new Date(`${s.date || ''}T${(s.time || '00:00')}:00`).getTime();
  if (!Number.isFinite(start)) return null;
  const totalMin = durMinutes(route);
  const end = start + totalMin * 60000;
  const arrived = s.tripStatus === 'arrived' || !!s.arrivedAt;
  const raw = ((now - start) / (end - start)) * 100;
  const pct = arrived ? 100 : Math.max(0, Math.min(99, Math.round(raw)));
  return { pct, start, end, totalMin, arrived, remainMin: Math.max(0, Math.round((end - now) / 60000)) };
}

/** Tindak lanjut otomatis maintenance:
 *  - pilihan pelanggan yang melewati deadline / kehilangan armada pengganti → refund 100%;
 *  - periode yang sudah lewat → request selesai dan tidak lagi memblokir tanggal lain. */
export function syncMaintenanceResolutions(now = Date.now()) {
  const requests = DB.load('maintenanceRequests', []);
  const bookings = DB.load('bookings', []);
  const payments = DB.load('payments', []);
  const ledger = DB.load('ledger', []);
  const vehicles = DB.load('vehicles', []);
  const schedules = DB.load('schedules', []);
  const nowIso = new Date(now).toISOString();
  let reqChanged = false, bookChanged = false, payChanged = false, ledgerChanged = false, vehicleChanged = false, schedChanged = false;

  bookings.forEach((b) => {
    if (b.maintenanceState !== 'choice_pending') return;
    const deadline = b.maintenanceChoiceDeadline ? new Date(b.maintenanceChoiceDeadline).getTime() : NaN;
    const candidates = maintenanceReplacementCandidatesForBooking(b);
    const expired = Number.isFinite(deadline) && now >= deadline;
    if (!expired && candidates.length) return;
    const reason = candidates.length ? 'Batas waktu memilih habis' : 'Armada pengganti tidak lagi tersedia';
    const refund = applyMaintenanceRefundRecord(b, payments, ledger, reason, 'sistem', nowIso);
    bookChanged = true; payChanged = true; ledgerChanged = true;
    notify(b.userEmail, 'Refund maintenance otomatis — ' + b.code,
      'Pilihan refund/pindah armada ditutup (' + reason.toLowerCase() + '). Refund 100% sebesar '
      + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(refund)
      + ' diproses otomatis.', 'WA', { bookingId: b.id, kind: 'maintenance' });
    audit('maintenance_auto_refund', b.code + ' • ' + reason + ' • ' + refund);
  });

  requests.forEach((r) => {
    if (r.status !== 'disetujui' || !r.until || r.until >= todayStr(0)) return;
    r.status = 'selesai';
    r.completedAt = nowIso;
    reqChanged = true;
    vehicles.forEach((v) => {
      if (v.id === r.vehicleId && v.maintenanceRequestId === r.id) {
        delete v.maintenanceFrom;
        delete v.maintenanceUntil;
        delete v.maintenanceRequestId;
        vehicleChanged = true;
      }
    });
    schedules.forEach((s) => {
      if (s.maintenanceRequestId !== r.id && !(s.vehicleId === r.vehicleId && s.date >= r.from && s.date <= r.until)) return;
      s.maintenanceStatus = 'done';
      if (s.tripStatus === 'scheduled' && s.date < todayStr(0)) {
        s.tripStatus = 'cancelled';
        s.status = 'closed';
        s.cancelReason = 'Maintenance armada';
        s.cancelledBy = 'sistem';
        s.cancelledAt = nowIso;
        s.reviewedAt = nowIso;
        s.reviewResult = 'maintenance';
        schedChanged = true;
      }
    });
  });

  if (reqChanged) DB.save('maintenanceRequests', requests);
  if (bookChanged) DB.save('bookings', bookings);
  if (payChanged) DB.save('payments', payments);
  if (ledgerChanged) DB.save('ledger', ledger);
  if (vehicleChanged) DB.save('vehicles', vehicles);
  if (schedChanged) DB.save('schedules', schedules);
  return reqChanged || bookChanged || payChanged || ledgerChanged || vehicleChanged || schedChanged;
}

/** Tandai jadwal terlambat sebagai Terlewat dan tutup dari pencarian.
 *  Jadwal tanpa penumpang aktif langsung ditutup (tidak masuk antrean admin/sopir). */
export function syncScheduleLifecycle() {
  const arr = DB.load('schedules', []);
  const bookings = DB.load('bookings', []);
  const active = new Set(bookings.filter((b) => ['paid', 'pending'].includes(b.status)).map((b) => b.scheduleId));
  let changed = false;
  let bookingsChanged = false;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  arr.forEach((s) => {
    if (!s.tripStatus) { s.tripStatus = 'scheduled'; changed = true; }
    /* Jadwal yang sedang maintenance tidak boleh dianggap terlewat.
       Tindak lanjut refund/pilihan ditangani syncMaintenanceResolutions. */
    if (scheduleMaintenance(s) && s.status !== 'cancelled') return;
    const datePassed = !!s.date && String(s.date) < todayStr(0);
    const delayActive = s.delayUntil && new Date(s.delayUntil).getTime() > now;
    if (s.tripStatus === 'scheduled' && (scheduleIsPast(s, SCHEDULE_GRACE_HOURS, now) || (!delayActive && datePassed))) {
      const boarded = bookings.some((b) => b.scheduleId === s.id && b.boarded
        && ['paid', 'pending'].includes(b.status) && b.tripStatus !== 'cancelled');
      if (boarded) {
        /* Penumpang sudah naik: jangan tampilkan pesan terlewat/refund; minta pengemudi menutup trip. */
        s.tripStatus = 'ontrip';
        s.startedAt = s.startedAt || nowIso;
        changed = true;
        bookings.forEach((b) => {
          if (b.scheduleId !== s.id || !b.boarded || !['paid', 'pending'].includes(b.status) || b.tripStatus === 'cancelled') return;
          b.tripStatus = 'ontrip';
          bookingsChanged = true;
        });
      } else {
        s.tripStatus = 'missed';
        s.missedAt = nowIso;
        s.status = 'closed';
        changed = true;
        bookings.forEach((b) => {
          if (b.scheduleId !== s.id || !['paid', 'pending'].includes(b.status) || b.tripStatus === 'cancelled') return;
          b.tripStatus = 'missed';
          bookingsChanged = true;
          notify(
            b.userEmail,
            'Jadwal terlewat - ' + b.code,
            b.status === 'paid'
              ? 'Jadwal ' + s.date + ' ' + s.time + ' terlewat. Admin akan menindaklanjuti refund sesuai kebijakan.'
              : 'Jadwal ' + s.date + ' ' + s.time + ' terlewat. Booking belum dibayar; tidak ada refund.',
            'WA'
          );
        });
      }
    }
    /* Data lama yang sudah missed tetapi belum reviewed juga harus auto-close bila kosong. */
    if (s.tripStatus === 'missed' && !s.reviewedAt && !active.has(s.id)) {
      s.reviewedAt = nowIso;
      s.reviewResult = 'empty';
      changed = true;
    }
    if (['ontrip', 'arrived', 'missed'].includes(s.tripStatus) && s.status !== 'closed' && s.status !== 'cancelled') {
      s.status = 'closed';
      changed = true;
    }
  });
  if (changed) DB.save('schedules', arr);
  if (bookingsChanged) DB.save('bookings', bookings);
  return changed || bookingsChanged;
}

function delayTimeLabel(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function notifyScheduleCustomers(sid, statuses, build) {
  DB.load('bookings', [])
    .filter((b) => b.scheduleId === sid && statuses.includes(b.status) && b.tripStatus !== 'cancelled')
    .forEach((b) => {
      const n = build(b);
      notify(b.userEmail, n.title, n.msg, 'WA');
    });
}

function notifyScheduleStakeholders(s, title, msg) {
  DB.load('users', [])
    .filter((u) => u.role === 'superadmin' || (u.role === 'agen' && u.agencyId === s.agencyId))
    .forEach((u) => notify(u.email, title, msg, 'app'));
}

/** Delay sebelum berangkat: menggeser batas jadwal dianggap terlewat. */
export function setScheduleDelay(sid, minutes, reason, note, by = 'pengemudi') {
  const schedules = DB.load('schedules', []);
  const s = schedules.find((x) => x.id === sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (s.status !== 'open' || s.reviewedAt) return { ok: false, msg: 'Jadwal tidak aktif untuk delay' };
  if (scheduleMaintenance(s)) return { ok: false, msg: 'Jadwal maintenance — delay tidak diperlukan' };
  if (s.tripStatus && s.tripStatus !== 'scheduled') return { ok: false, msg: 'Delay hanya bisa dicatat sebelum berangkat' };

  const mins = Math.round(Number(minutes));
  if (!Number.isFinite(mins) || mins < 1) return { ok: false, msg: 'Durasi delay minimal 1 menit' };
  if (mins > MAX_DEPARTURE_DELAY_MINUTES) {
    return { ok: false, msg: 'Tambahan delay maksimal ' + MAX_DEPARTURE_DELAY_MINUTES + ' menit' };
  }

  const why = String(reason || '').trim();
  if (!why) return { ok: false, msg: 'Alasan delay wajib diisi' };

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const original = scheduleDepartureMs(s);
  const currentUntil = s.delayUntil ? new Date(s.delayUntil).getTime() : NaN;
  const base = Math.max(
    nowMs,
    Number.isFinite(original) ? original : 0,
    Number.isFinite(currentUntil) ? currentUntil : 0
  );
  const until = base + mins * 60000;
  const total = Number.isFinite(original) ? Math.max(0, Math.round((until - original) / 60000)) : mins;
  if (total > MAX_DEPARTURE_DELAY_MINUTES) {
    return { ok: false, msg: 'Total delay maksimal ' + MAX_DEPARTURE_DELAY_MINUTES + ' menit. Hubungi admin untuk penundaan lebih lama.' };
  }

  const delayNote = String(note || '').trim().slice(0, 200);
  s.tripStatus = s.tripStatus || 'scheduled';
  s.delayUntil = new Date(until).toISOString();
  s.delayMinutes = total;
  s.delayAddedMinutes = mins;
  s.delayReason = why;
  s.delayNote = delayNote;
  s.delayedAt = nowIso;
  s.delayedBy = by;
  s.delayHistory = [{
    type: 'departure', at: nowIso, minutes: mins, until: s.delayUntil, reason: why, note: delayNote, by,
  }, ...(Array.isArray(s.delayHistory) ? s.delayHistory : [])].slice(0, 20);
  DB.save('schedules', schedules);

  const label = delayTimeLabel(s.delayUntil);
  notifyScheduleCustomers(sid, ['paid', 'pending'], (b) => ({
    title: 'Jadwal delay — ' + b.code,
    msg: 'Jadwal ' + s.date + ' ' + s.time + ' delay ' + total + ' menit. Estimasi keberangkatan ' + label + '. Alasan: ' + why + '.'
      + (b.status === 'paid' ? ' Mohon menunggu.' : ' Pembayaran masih dapat dilakukan sampai estimasi baru.'),
  }));
  notifyScheduleStakeholders(
    s,
    'Jadwal delay — ' + s.date + ' ' + s.time,
    'Pengemudi mencatat delay ' + total + ' menit (est. ' + label + '). Alasan: ' + why
  );
  audit('schedule_delay', sid + ' • +' + mins + ' mnt • ' + why + ' • est ' + label);
  return { ok: true, until: s.delayUntil, total, added: mins };
}

/** Info keterlambatan saat perjalanan; tidak mengubah estimasi tiba maupun status. */
export function reportTripDelay(sid, reason, note, by = 'pengemudi') {
  const schedules = DB.load('schedules', []);
  const s = schedules.find((x) => x.id === sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (s.tripStatus !== 'ontrip') return { ok: false, msg: 'Info delay hanya bisa dikirim saat perjalanan berlangsung' };

  const why = String(reason || '').trim();
  if (!why) return { ok: false, msg: 'Alasan keterlambatan wajib diisi' };

  const nowIso = new Date().toISOString();
  const delayNote = String(note || '').trim().slice(0, 200);
  s.tripDelayInfo = [{
    type: 'ontrip', at: nowIso, reason: why, note: delayNote, by,
  }, ...(Array.isArray(s.tripDelayInfo) ? s.tripDelayInfo : [])].slice(0, 20);
  s.tripDelayUpdatedAt = nowIso;
  DB.save('schedules', schedules);

  notifyScheduleCustomers(sid, ['paid'], (b) => ({
    title: 'Info keterlambatan — ' + b.code,
    msg: 'Pengemudi melaporkan keterlambatan: ' + why + (delayNote ? ' • ' + delayNote : '') + '. Estimasi tiba tidak berubah; mohon menunggu informasi berikutnya.',
  }));
  notifyScheduleStakeholders(
    s,
    'Info keterlambatan — ' + s.date + ' ' + s.time,
    'Pengemudi melaporkan: ' + why + (delayNote ? ' • ' + delayNote : '') + '. Estimasi tiba tidak diubah.'
  );
  audit('trip_delay_info', sid + ' • ' + why + (delayNote ? ' • ' + delayNote : ''));
  return { ok: true };
}

/** True bila jadwal punya riwayat booking/ledger yang tidak boleh dihapus. */
export function scheduleHasTransactions(sid) {
  return DB.load('bookings', []).some((b) => b.scheduleId === sid)
    || DB.load('ledger', []).some((e) => e.scheduleId === sid);
}

export function seatBookedFuture(vid,sid){
  return DB.load('schedules',[]).filter(s=>s.vehicleId===vid&&s.date>=todayStr(0)).some(s=>bookingsOf(s.id).some(b=>(b.seats||[]).includes(sid)));
}

export function cleanupHolds(){
  const arr=DB.load('bookings',[]);
  const expired=[];
  const now=Date.now();
  const nowIso=new Date(now).toISOString();
  arr.forEach((b)=>{
    if(b.status!=='pending'||!b.holdExpiry||now<=new Date(b.holdExpiry).getTime()) return;
    b.status='cancelled';
    b.tripStatus='cancelled';
    b.refundPct=0;
    b.refundAmount=0;
    b.refundScope='ticket';
    b.refundStatus='none';
    b.refundPaidAt=null;
    b.cancelReason='Hold kedaluwarsa (15 mnt)';
    b.cancelledBy='sistem';
    b.cancelledAt=nowIso;
    restoreVoucher(b);
    expired.push(b);
  });
  if(!expired.length) return;
  DB.save('bookings',arr);
  const pays=DB.load('payments',[]);
  let payChanged=false;
  expired.forEach((b)=>{ if(updatePaymentRefund(pays,b,{refund:0,pct:0,scope:'ticket',status:'cancelled'})) payChanged=true; });
  if(payChanged) DB.save('payments',pays);
}

export function feeFor(agencyId, amount){ const a=agencyById(agencyId); if(!a) return Math.round(amount*0.08); return a.feeType==='flat'? a.feeValue : Math.round(amount*a.feeValue/100); }

export function audit(action, detail){ if(DB.isRemote()) return; const l=DB.load('audit',[]); const u=currentUser(); l.unshift({id:uid('LOG'),time:new Date().toISOString(),actor:u?u.email+' ('+u.role+')':'guest',action,detail:detail||''}); DB.save('audit',l.slice(0,300)); }

export function notify(userEmail, title, msg, ch, meta){
  if(!userEmail) return null;
  /* Mode Sheets: klien hanya boleh membuat notifikasi untuk dirinya sendiri.
     Notifikasi untuk agen/pengemudi/superadmin dibuat oleh alur server atau
     tampil lewat data transaksi masing-masing. */
  let me = null;
  if(DB.isRemote()){
    me = currentUser();
    if(!me || (me.role === 'agen' && me.status === 'pending')) return null;
  }
  const n=DB.load('notifications',[]);
  const item={id:uid('NTF'),to:userEmail,title,msg,ch:ch||'app',time:new Date().toISOString(),read:false,...(meta&&typeof meta==='object'?meta:{})};
  if(DB.isRemote() && String(item.to||'').toLowerCase() !== String(me.email||'').toLowerCase()) return null;
  n.unshift(item);
  DB.save('notifications', DB.isRemote() ? n : n.slice(0, 200));
  return item;
}

export const hm=t=>{const[a,b]=t.split(':').map(Number);return a*60+b;};

/* Split settlement: tiket (pengemudi) + jasa (agen) + fee (platform).
   schedule.price = TOTAL all-in per kursi yg dilihat pelanggan. */
export const DEFAULT_SERVICE=10000;
export const DEFAULT_PLATFORM_FEE = { type: 'percent', value: 8 };

export function priceForAgency(route,agencyId){ return Number(route?.prices?.[agencyId]??route?.basePrice??0)||0; }
export function servicePerSeat(s){ const a=s?agencyById(s.agencyId):null; return Number(a?.serviceFee??DEFAULT_SERVICE)||0; }

/* Fee platform GLOBAL — diatur oleh admin, tidak per agen. */
export function platformFeeOf(){
  const s = DB.load('settings', []);
  const f = s.find((x) => x.key === 'platformFee');
  return f && f.value ? f.value : { ...DEFAULT_PLATFORM_FEE };
}
export function savePlatformFee(fee){
  const arr = DB.load('settings', []);
  const i = arr.findIndex((x) => x.key === 'platformFee');
  const entry = { key: 'platformFee', value: fee };
  if (i >= 0) arr[i] = entry; else arr.push(entry);
  DB.save('settings', arr);
  audit('platform_fee', JSON.stringify(fee));
  return fee;
}

export function splitFare(s,nSeats=1,discount=0, source='pelanggan'){
  if(!s) return {ticket:0,service:0,fee:0,total:0};
  const n=Math.max(1,Number(nSeats)||1);
  const paid=Math.max(0,(Number(s.price)||0)*n-(Number(discount)||0));
  const pf = platformFeeOf();
  const base = pf.type === 'flat'
    ? Math.max(0, paid - Number(pf.value || 0))
    : paid / (1 + (Number(pf.value) || 8) / 100);
  const S = servicePerSeat(s);
  const service = source === 'driver' ? 0 : Math.min(S * n, Math.round(base));
  const ticket = Math.max(0, Math.round(base) - service);
  const fee = Math.max(0, paid - ticket - service);
  return {ticket,service,fee,total:paid};
}

/* ---------- Kebijakan refund tiket ----------
   Diatur super admin per agen. Refund pelanggan hanya komponen tiket;
   jasa agen & fee platform tidak dikembalikan. Pembatalan sepihak oleh
   operator (sopir/agen) sebelum berangkat = 100% total pembayaran. */
export const DEFAULT_REFUND_POLICY = Object.freeze([
  { minH: 72, pct: 100 },
  { minH: 24, pct: 50 },
  { minH: 0, pct: 0 },
]);

/** Normalisasi tier refund: jam & persen bulat, unik, urut menurun, selalu ada tier 0 jam. */
export function normalizeRefundPolicy(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((t) => {
    const minH = Math.max(0, Math.round(Number(t && t.minH) || 0));
    const pct = Math.max(0, Math.min(100, Math.round(Number(t && t.pct) || 0)));
    if (seen.has(minH)) return;
    seen.add(minH);
    out.push({ minH, pct });
  });
  if (!seen.has(0)) out.push({ minH: 0, pct: 0 });
  return out.sort((a, b) => b.minH - a.minH);
}

/** Kebijakan aktif agen; fallback ke default platform bila data kosong. */
export function refundPolicyOf(agencyId) {
  const a = agencyById(agencyId);
  const pol = a && Array.isArray(a.refundPolicy) ? a.refundPolicy : [];
  return pol.length
    ? normalizeRefundPolicy(pol)
    : DEFAULT_REFUND_POLICY.map((p) => ({ ...p }));
}

/** Tier refund yang berlaku untuk jadwal pada waktu tertentu. */
export function refundRuleFor(agencyId, s, now = Date.now()) {
  const hours = s ? Math.max(0, (scheduleEffectiveDepartureMs(s) - now) / 36e5) : 0;
  const policy = refundPolicyOf(agencyId);
  const rule = policy.find((p) => hours >= p.minH) || policy[policy.length - 1];
  return { ...(rule || { minH: 0, pct: 0 }), hours };
}

/** Teks ringkas kebijakan untuk pelanggan/agen, mis. "≥3 hari: 100% • ≥1 hari: 50% • <1 hari: 0%". */
export function refundPolicyText(policy) {
  const pol = normalizeRefundPolicy(Array.isArray(policy) && policy.length ? policy : DEFAULT_REFUND_POLICY);
  const days = (minH) => String(Math.round(((Number(minH) || 0) / 24) * 10) / 10).replace('.', ',');
  return pol
    .map((p, i) => (p.minH <= 0
      ? '<' + days(pol[i - 1] ? pol[i - 1].minH : 24) + ' hari: ' + p.pct + '%'
      : '≥' + days(p.minH) + ' hari: ' + p.pct + '%'))
    .join(' • ');
}

/** Simpan kebijakan refund agen (khusus super admin). */
export function saveRefundPolicy(agencyId, list) {
  const arr = DB.load('agencies', []);
  const a = arr.find((x) => x.id === agencyId);
  if (!a) return { ok: false, msg: 'Agen tidak ditemukan' };
  const raw = Array.isArray(list) ? list : [];
  const seen = new Set();
  for (const t of raw) {
    const minH = Math.max(0, Math.round(Number(t && t.minH) || 0));
    if (seen.has(minH)) return { ok: false, msg: 'Ambang minimal tidak boleh sama' };
    seen.add(minH);
  }
  const policy = normalizeRefundPolicy(raw);
  a.refundPolicy = policy;
  DB.save('agencies', arr);
  audit('refund_policy', a.name + ' • ' + refundPolicyText(policy));
  return { ok: true, policy };
}
/* Ledger: ditahan (bayar) → layak (trip tiba) → dicairkan (admin) ; void bila refund */
export function createLedger(booking){
  if(!booking||booking.status!=='paid') return null;
  if(DB.load('ledger',[]).some(x=>x.bookingId===booking.id)) return null;
  const s=schedById(booking.scheduleId); if(!s) return null;
  const f=splitFare(s,(booking.seats||[]).length,booking.discount||0, booking.source);
  const e={id:uid('LG'),bookingId:booking.id,scheduleId:s.id,agencyId:s.agencyId,driverId:s.driverId||null,userEmail:booking.userEmail,seats:[...(booking.seats||[])],ticket:f.ticket,service:f.service,fee:f.fee,total:f.total,status:'ditahan',createdAt:new Date().toISOString(),releasedAt:null,paidOutAt:null};
  const arr=DB.load('ledger',[]); arr.unshift(e); DB.save('ledger',arr);
  audit('ledger_hold',booking.code+' • T'+f.ticket+' J'+f.service+' F'+f.fee);
  return e;
}
export function releaseLedger(scheduleId){
  const arr=DB.load('ledger',[]); let ch=false;
  arr.forEach(e=>{ if(e.scheduleId===scheduleId&&e.status==='ditahan'){ e.status='layak'; e.releasedAt=new Date().toISOString(); ch=true; } });
  if(ch){ DB.save('ledger',arr); audit('ledger_release',scheduleId); }
  return ch;
}
export function voidLedger(bookingId){
  const arr=DB.load('ledger',[]); let ch=false;
  arr.forEach(e=>{ if(e.bookingId===bookingId&&e.status!=='dicairkan'){ e.status='void'; ch=true; } });
  if(ch){ DB.save('ledger',arr); audit('ledger_void',bookingId); }
  return ch;
}

/** Kembalikan kuota voucher yang terpakai saat booking dibatalkan/kedaluwarsa. */
function restoreVoucher(b) {
  const code = b && (b.voucher || b.voucherCode);
  if (!code || !(Number(b.discount) > 0)) return;
  const vs = DB.load('vouchers', []);
  const v = vs.find((x) => x.code === String(code).toUpperCase());
  if (v && Number(v.used) > 0) {
    v.used = Number(v.used) - 1;
    DB.save('vouchers', vs);
  }
}

/** Catat status refund pada data pembayaran agar laporan dan antrean admin sinkron.
 *  Status pembayaran TIDAK langsung menjadi 'refunded'; itu baru terjadi setelah
 *  admin menandai dana benar-benar dikirim (markRefundPaid). */
function updatePaymentRefund(pays, b, { refund, pct, scope, status }) {
  const p = pays.find((x) => x.bookingId === b.id);
  if (!p) return false;
  const at = new Date().toISOString();
  p.refundAmount = refund;
  p.refundPct = pct;
  p.refundScope = scope;
  p.refundStatus = refund > 0 ? 'pending' : 'none';
  p.refundRequestedAt = at;
  p.refundedAt = null;
  p.refundPaidAt = null;
  if (status) p.status = status;
  return true;
}

/** Booking pending lama yang belum punya hold diberi hold sekali.
 *  Hold yang sudah ada TIDAK diperpanjang saat modal pembayaran dibuka. */
export function ensureHoldExpiry(b) {
  if (!b || b.status !== 'pending' || b.holdExpiry) return b;
  return { ...b, holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
}

/** Booking pending masih bisa dibayar: hold aktif, jadwal masih terbuka dan belum berangkat. */
export function canPayBooking(b, s, { ignoreHold = false, now = Date.now() } = {}) {
  if (!b || !s || b.status !== 'pending') return false;
  if (!ignoreHold && b.holdExpiry && new Date(b.holdExpiry).getTime() <= now) return false;
  if (s.status !== 'open') return false;
  if (scheduleMaintenance(s)) return false;
  if (['ontrip', 'arrived', 'missed', 'cancelled'].includes(s.tripStatus)) return false;
  return !scheduleIsPast(s, 0, now);
}

/** Booking masih boleh dibatalkan: belum jalan/terlewat, belum boarding. */
export function canCancelBooking(b, s) {
  if (!b || !s) return false;
  if (!['pending', 'paid'].includes(b.status) || b.boarded) return false;
  if (b.maintenanceState === 'choice_pending') return false;
  if (['ontrip', 'arrived', 'missed', 'cancelled'].includes(s.tripStatus)) return false;
  if (s.status === 'cancelled') return false;
  return !scheduleIsPast(s, 0);
}

/**
 * Pembatalan oleh pelanggan / agen atas permintaan pelanggan.
 * Refund hanya komponen tiket sesuai kebijakan agen; booking pending = Rp0.
 */
export function cancelBooking(bookingId, { reason = '', by = 'pelanggan' } = {}) {
  const bookings = DB.load('bookings', []);
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { ok: false, msg: 'Booking tidak ditemukan' };
  if (b.status === 'cancelled') return { ok: false, msg: 'Booking sudah dibatalkan' };
  if (b.status === 'done') return { ok: false, msg: 'Perjalanan selesai — booking tidak bisa dibatalkan' };
  if (b.maintenanceState === 'choice_pending') {
    return { ok: false, msg: 'Gunakan pilihan refund 100% / pindah armada pada halaman tiket maintenance' };
  }
  const s = schedById(b.scheduleId);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (!canCancelBooking(b, s)) return { ok: false, msg: 'Pembatalan ditutup — jadwal sudah berangkat atau terlewat' };

  const wasPaid = b.status === 'paid';
  const fare = b.fare || splitFare(s, (b.seats || []).length, b.discount || 0);
  const rule = wasPaid ? refundRuleFor(s.agencyId, s) : { minH: 0, pct: 0, hours: 0 };
  const refund = wasPaid ? Math.round((Number(fare.ticket) || 0) * rule.pct / 100) : 0;
  const now = new Date().toISOString();
  const why = String(reason || '').trim() || (by === 'agen' ? 'Dibatalkan oleh agen' : 'Dibatalkan oleh pelanggan');

  b.status = 'cancelled';
  b.tripStatus = 'cancelled';
  b.refundPct = rule.pct;
  b.refundAmount = refund;
  b.refundScope = 'ticket';
  b.refundStatus = refund > 0 ? 'pending' : 'none';
  b.refundPaidAt = null;
  b.cancelReason = why;
  b.cancelledBy = by;
  b.cancelledAt = now;
  DB.save('bookings', bookings);
  restoreVoucher(b);
  voidLedger(b.id);

  const pays = DB.load('payments', []);
  if (updatePaymentRefund(pays, b, { refund, pct: rule.pct, scope: 'ticket', status: wasPaid ? undefined : 'cancelled' })) {
    DB.save('payments', pays);
  }

  notify(
    b.userEmail,
    'Booking dibatalkan — ' + b.code,
    refund > 0
      ? 'Refund ' + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(refund) + ' (' + rule.pct + '% tiket) diproses 1–3 hari kerja.'
      : 'Tidak ada refund untuk booking ini (belum dibayar / kebijakan 0%).',
    'WA'
  );
  audit('booking_cancel', b.code + ' • ' + by + ' • refund ' + rule.pct + '%');
  return { ok: true, refund, pct: rule.pct, pending: !wasPaid };
}

/** Admin mulai memproses refund (pending → diproses). */
export function startRefundProcessing(bookingId, by = 'admin') {
  const bookings = DB.load('bookings', []);
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { ok: false, msg: 'Booking tidak ditemukan' };
  const amount = Number(b.refundAmount) || 0;
  if (amount <= 0) return { ok: false, msg: 'Tidak ada nominal refund untuk booking ini' };
  if (b.refundStatus === 'done') return { ok: false, msg: 'Refund sudah selesai' };
  if (b.refundStatus === 'diproses') return { ok: false, msg: 'Refund sedang diproses' };

  const now = new Date().toISOString();
  b.refundStatus = 'diproses';
  b.refundProcessedAt = now;
  b.refundProcessedBy = by;
  DB.save('bookings', bookings);

  const pays = DB.load('payments', []);
  const p = pays.find((x) => x.bookingId === b.id);
  if (p) {
    p.refundStatus = 'diproses';
    p.refundProcessedAt = now;
    DB.save('payments', pays);
  }

  notify(b.userEmail, 'Refund sedang diproses — ' + b.code, 'Refund ' + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount) + ' sedang diproses admin.', 'WA');
  audit('refund_process', b.code + ' • ' + by + ' • ' + amount);
  return { ok: true, amount };
}

/** Admin menandai dana refund sudah benar-benar dikembalikan ke pelanggan. */
export function markRefundPaid(bookingId, by = 'admin') {
  const bookings = DB.load('bookings', []);
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { ok: false, msg: 'Booking tidak ditemukan' };
  const amount = Number(b.refundAmount) || 0;
  if (amount <= 0) return { ok: false, msg: 'Tidak ada nominal refund untuk booking ini' };
  if (b.refundStatus === 'done') return { ok: false, msg: 'Refund sudah ditandai selesai' };

  const now = new Date().toISOString();
  b.refundStatus = 'done';
  b.refundPaidAt = now;
  b.refundProcessedBy = by;
  DB.save('bookings', bookings);

  const pays = DB.load('payments', []);
  const p = pays.find((x) => x.bookingId === b.id);
  if (p) {
    p.refundStatus = 'done';
    p.refundPaidAt = now;
    p.refundedAt = now;
    p.status = 'refunded';
    DB.save('payments', pays);
  }

  notify(
    b.userEmail,
    'Refund telah diproses — ' + b.code,
    'Refund ' + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount) + ' telah dikembalikan ke metode pembayaran awal.',
    'WA'
  );
  audit('refund_paid', b.code + ' • ' + by + ' • ' + amount);
  return { ok: true, amount };
}

/**
 * Pembatalan sepihak oleh operator (sopir/agen) sebelum keberangkatan.
 * Wajib alasan; seluruh booking lunas direfund 100% dari total pembayaran.
 */
export function cancelScheduleByOperator(sid, reason, by = 'pengemudi') {
  const why = String(reason || '').trim();
  if (!why) return { ok: false, msg: 'Alasan pembatalan wajib diisi' };
  const schedules = DB.load('schedules', []);
  const s = schedules.find((x) => x.id === sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (scheduleMaintenance(s) && (s.tripStatus || 'scheduled') === 'scheduled') {
    return { ok: false, msg: 'Jadwal sudah ditandai maintenance — tidak perlu dibatalkan. Selesaikan lewat alur maintenance.' };
  }
  if (s.status === 'cancelled' || s.tripStatus === 'cancelled') return { ok: false, msg: 'Jadwal sudah dibatalkan' };
  if (s.tripStatus === 'ontrip') return { ok: false, msg: 'Perjalanan sudah dimulai — tidak bisa dibatalkan' };
  if (s.tripStatus === 'arrived') return { ok: false, msg: 'Perjalanan sudah selesai' };
  if (s.tripStatus === 'missed' || scheduleIsPast(s, 0)) {
    return { ok: false, msg: 'Jadwal sudah lewat — selesaikan lewat antrean admin' };
  }

  const ledger = DB.load('ledger', []);
  if (ledger.some((e) => e.scheduleId === sid && e.status === 'dicairkan')) {
    return { ok: false, msg: 'Dana jadwal ini sudah dicairkan — hubungi admin' };
  }

  const bookings = DB.load('bookings', []);
  const payments = DB.load('payments', []);
  const now = new Date().toISOString();
  const rp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  let count = 0;
  let pending = 0;
  let total = 0;
  let payChanged = false;

  bookings.forEach((b) => {
    if (b.scheduleId !== sid) return;
    if (b.status === 'paid') {
      const fare = b.fare || splitFare(s, (b.seats || []).length, b.discount || 0);
      const refund = Math.max(0, Number(b.total) || Number(fare.total) || 0);
      b.status = 'cancelled';
      b.tripStatus = 'cancelled';
      b.refundPct = 100;
      b.refundAmount = refund;
      b.refundScope = 'total';
      b.refundStatus = refund > 0 ? 'pending' : 'none';
      b.refundPaidAt = null;
      b.cancelReason = why;
      b.cancelledBy = by;
      b.cancelledAt = now;
      count += 1;
      total += refund;
      if (updatePaymentRefund(payments, b, { refund, pct: 100, scope: 'total' })) payChanged = true;
      restoreVoucher(b);
      notify(
        b.userEmail,
        'Jadwal dibatalkan — ' + b.code,
        'Jadwal dibatalkan operator (' + why + '). Refund 100% ' + rp(refund) + ' diproses 1–3 hari kerja.',
        'WA'
      );
    } else if (b.status === 'pending') {
      b.status = 'cancelled';
      b.tripStatus = 'cancelled';
      b.refundPct = 0;
      b.refundAmount = 0;
      b.refundScope = 'total';
      b.refundStatus = 'none';
      b.refundPaidAt = null;
      b.cancelReason = 'Jadwal dibatalkan operator: ' + why;
      b.cancelledBy = by;
      b.cancelledAt = now;
      pending += 1;
      if (updatePaymentRefund(payments, b, { refund: 0, pct: 0, scope: 'total', status: 'cancelled' })) payChanged = true;
      restoreVoucher(b);
      notify(
        b.userEmail,
        'Jadwal dibatalkan — ' + b.code,
        'Jadwal dibatalkan operator (' + why + '). Booking belum dibayar, tidak ada refund.',
        'WA'
      );
    }
  });

  ledger.forEach((e) => {
    if (e.scheduleId === sid && e.status !== 'dicairkan' && e.status !== 'void') {
      e.status = 'void';
      e.voidedAt = now;
    }
  });

  s.tripStatus = 'cancelled';
  s.status = 'cancelled';
  s.cancelReason = why;
  s.cancelledBy = by;
  s.cancelledAt = now;
  s.reviewedAt = now;
  s.reviewResult = 'operator_cancel';
  s.refundPct = 100;

  DB.save('schedules', schedules);
  DB.save('bookings', bookings);
  DB.save('ledger', ledger);
  if (payChanged) DB.save('payments', payments);

  DB.load('users', [])
    .filter((u) => u.role === 'superadmin')
    .forEach((u) => notify(u.email, 'Jadwal dibatalkan operator', sid + ' • ' + why + ' • refund ' + rp(total), 'app'));

  audit('schedule_operator_cancel', sid + ' • ' + by + ' • ' + count + ' booking • refund ' + total);
  return { ok: true, count, pending, total };
}

/** Pembuatan tiket oleh pengemudi untuk penumpang yang tidak pakai aplikasi.
 *  Disimpan sebagai booking 'pending' (15 menit hold) dan harus dibayar online
 *  terlebih dahulu. Ledger baru dibuat setelah pembayaran berhasil. */
export function createDriverBooking(sid, { passengers = [], seats = [], driverId = '', payMethod = 'QRIS', discount = 0, pickup = '' } = {}) {
  const s = schedById(sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (s.status !== 'open') return { ok: false, msg: 'Jadwal tidak terbuka' };
  if (scheduleMaintenance(s)) return { ok: false, msg: 'Jadwal maintenance — penjualan tiket ditutup' };
  if (['ontrip', 'arrived', 'missed', 'cancelled'].includes(s.tripStatus)) return { ok: false, msg: 'Jadwal sudah berjalan/selesai — penjualan tiket ditutup' };
  if (scheduleIsPast(s, 0)) return { ok: false, msg: 'Jadwal sudah lewat' };

  const tk = takenSeats(s.id);
  const taken = new Set([...tk.paid, ...tk.hold, ...(s.blockedSeats || []), ...tk.inactive]);
  const layout = vehLayout(vehicleById(s.vehicleId));
  const available = layout.filter((c) => c.type === 'seat' && c.sid && !taken.has(c.sid)).map((c) => c.sid);

  const n = Math.max(1, Number(seats.length || passengers.length || 0));
  if (!seats.length) {
    if (n > available.length) return { ok: false, msg: 'Kursi tidak mencukupi' };
    seats = available.slice(0, n);
  } else {
    seats = [...new Set(seats)];
    if (seats.some((st) => !available.includes(st))) return { ok: false, msg: 'Kursi tidak tersedia atau sudah ditempati' };
    if (seats.length !== passengers.length) return { ok: false, msg: 'Data penumpang harus sama dengan jumlah kursi' };
  }

  const r = routeById(s.routeId);
  const pickupPoint = String(pickup || '').trim() || pickupOptions(r)[0] || '-';
  const now = new Date().toISOString();
  const fare = splitFare(s, seats.length, discount, 'driver');
  const total = Math.max(0, Number(fare.total) || 0);
  const code = 'TA-' + Math.random().toString(36).slice(2, 7).toUpperCase();

  const booking = {
    id: uid('BK'), code, scheduleId: sid, userEmail: null, userPhone: null,
    passengers: passengers.map((p, i) => ({
      name: String(p.name || '').trim() || 'Penumpang',
      phone: String(p.phone || '').trim() || '-',
      seat: seats[i],
      pickup: pickupPoint,
      pickupCoords: '',
    })),
    seats,
    subtotal: Math.max(0, Number(s.price || 0) * seats.length),
    discount: Math.max(0, Number(discount) || 0),
    total,
    status: 'pending',
    payMethod,
    voucher: '',
    source: 'driver',
    createdBy: driverId || null,
    createdAt: now,
    paidAt: null,
    holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    tripStatus: 'scheduled',
    boarded: false,
  };

  const arr = DB.load('bookings', []);
  arr.unshift(booking);
  DB.save('bookings', arr);

  const pays = DB.load('payments', []);
  pays.unshift({ id: uid('PAY'), bookingId: booking.id, amount: total, method: payMethod, status: 'pending', time: now, fee: fare.fee });
  DB.save('payments', pays);

  audit('booking_driver_create', code + ' • ' + sid + ' • ' + seats.join(','));
  return { ok: true, booking, fare };
}

/** Tandai booking driver sebagai lunas setelah pembayaran online berhasil, lalu buat ledger. */
export function confirmDriverBookingPayment(bookingId){
  const bookings = DB.load('bookings', []);
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { ok: false, msg: 'Booking tidak ditemukan' };
  if (b.status !== 'pending') return { ok: false, msg: 'Booking belum dalam status menunggu bayar' };
  const s = schedById(b.scheduleId);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (scheduleMaintenance(s)) return { ok: false, msg: 'Pembayaran ditutup — jadwal maintenance' };
  if (s.status === 'cancelled' || ['arrived', 'missed', 'cancelled'].includes(s.tripStatus)) {
    return { ok: false, msg: 'Pembayaran ditutup — jadwal sudah selesai/dibatalkan' };
  }
  if (b.holdExpiry && new Date(b.holdExpiry).getTime() <= Date.now()) {
    return { ok: false, msg: 'Hold kedaluwarsa — buat pesanan baru' };
  }

  const now = new Date().toISOString();
  b.status = 'paid';
  b.paidAt = now;
  b.holdExpiry = null;
  const fare = splitFare(s, (b.seats || []).length, b.discount || 0, b.source);
  b.fare = fare;
  DB.save('bookings', bookings);

  const pays = DB.load('payments', []);
  const p = pays.find((x) => x.bookingId === b.id);
  if (p) { p.status = 'paid'; p.fee = fare.fee; DB.save('payments', pays); }

  createLedger(b);

  notify(b.userEmail, 'Pembayaran berhasil — ' + b.code, 'E-tiket QR terbit. Tunjukkan ke pengemudi saat boarding.', 'WA+Email');
  audit('booking_driver_paid', b.code + ' • ' + fmtRp(b.total));
  return { ok: true, booking: b, fare };
}

/** Blokir / buka satu kursi pada jadwal (per jadwal, sementara).
 *  Kursi yang sudah ada penumpangnya tidak boleh diblokir — harus lewat pembatalan booking. */
export function toggleScheduleSeatBlock(sid, seat, { reason = '', by = 'agen' } = {}) {
  const arr = DB.load('schedules', []);
  const s = arr.find((x) => x.id === sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (scheduleMaintenance(s) && (s.tripStatus || 'scheduled') === 'scheduled') {
    return { ok: false, msg: 'Jadwal maintenance — kursi tidak bisa diubah' };
  }
  if (s.status === 'cancelled' || ['ontrip', 'arrived', 'missed', 'cancelled'].includes(s.tripStatus) || scheduleIsPast(s, 0)) {
    return { ok: false, msg: 'Jadwal sudah berjalan/selesai — kursi tidak bisa diubah' };
  }
  const blocked = Array.isArray(s.blockedSeats) ? [...s.blockedSeats] : [];
  const removing = blocked.includes(seat);

  if (!removing) {
    const why = String(reason || '').trim();
    if (!why) return { ok: false, msg: 'Alasan blokir kursi wajib diisi' };
    const tk = takenSeats(sid);
    const occupied = new Set([...tk.paid, ...tk.hold, ...tk.inactive].filter((x) => !blocked.includes(x)));
    if (occupied.has(seat)) return { ok: false, msg: 'Kursi ' + seat + ' sudah terisi/ditahan — batalkan booking-nya dulu' };
    blocked.push(seat);
  } else {
    const i = blocked.indexOf(seat);
    blocked.splice(i, 1);
  }
  s.blockedSeats = blocked;
  s.seatBlockLog = [{ seat, action: removing ? 'buka' : 'blokir', reason: String(reason || '').trim() || null, by, at: new Date().toISOString() }, ...(Array.isArray(s.seatBlockLog) ? s.seatBlockLog : [])].slice(0, 30);
  DB.save('schedules', arr);
  audit('seat_block', sid + ' ' + seat + ' • ' + (removing ? 'buka' : 'blokir') + ' • ' + (String(reason || '').trim() || '-') + ' • ' + by);

  if (!removing) {
    DB.load('users', [])
      .filter((u) => u.role === 'agen' && u.agencyId === s.agencyId)
      .forEach((u) => notify(u.email, 'Kursi diblokir — ' + s.date + ' ' + s.time,
        'Pengemudi memblokir kursi ' + seat + '. Alasan: ' + String(reason || '').trim() + '.', 'app'));
    if (s.driverId) {
      const dv = driverById(s.driverId);
      if (dv && dv.userEmail) notify(dv.userEmail, 'Kursi diblokir di jadwal Anda', 'Kursi ' + seat + ' diblokir oleh agen. Alasan: ' + String(reason || '').trim() + '.', 'app');
    }
  } else if (s.driverId) {
    const dv = driverById(s.driverId);
    if (dv && dv.userEmail) notify(dv.userEmail, 'Kursi dibuka kembali', 'Kursi ' + seat + ' pada jadwal ' + s.date + ' ' + s.time + ' sudah bisa dipakai lagi.', 'app');
  }
  return { ok: true, blocked: !removing, seat };
}

/** Ubah status trip jadwal; dipakai pengemudi maupun admin. */
export function setScheduleTripStatus(sid, st, { reason = '', by = '' } = {}) {
  if (!['ontrip', 'arrived'].includes(st)) return false;
  const arr = DB.load('schedules', []);
  const s = arr.find((x) => x.id === sid);
  if (!s || s.tripStatus === st) return false;
  if (st === 'ontrip' && scheduleMaintenance(s) && (s.tripStatus || 'scheduled') === 'scheduled') return false;
  if (s.reviewedAt && s.reviewResult === 'no_show') return false;
  const prev = s.tripStatus || 'scheduled';
  const now = new Date().toISOString();
  s.tripStatus = st;
  s.status = 'closed';
  if (st === 'ontrip') {
    s.departedAt = now;
    if (by) s.departedBy = by;
    if (String(reason || '').trim()) s.earlyStartReason = String(reason).trim();
  }
  if (st === 'arrived') {
    s.arrivedAt = now;
    if (prev === 'missed' || scheduleIsPast(s, SCHEDULE_GRACE_HOURS)) s.lateCompletion = true;
  }
  DB.save('schedules', arr);
  if (st === 'arrived') releaseLedger(sid);

  const bk = DB.load('bookings', []);
  const cancelledPending = [];
  bk.forEach((b) => {
    if (b.scheduleId !== sid) return;
    if (b.status === 'pending') {
      b.status = 'cancelled';
      b.tripStatus = 'cancelled';
      b.refundPct = 0;
      b.refundAmount = 0;
      b.refundScope = 'ticket';
      b.refundStatus = 'none';
      b.refundPaidAt = null;
      b.cancelReason = st === 'ontrip' ? 'Jadwal sudah berangkat' : 'Jadwal sudah selesai';
      b.cancelledBy = 'sistem';
      b.cancelledAt = now;
      restoreVoucher(b);
      cancelledPending.push(b);
      return;
    }
    if (b.status !== 'paid') return;
    b.tripStatus = st;
    if (st === 'arrived') b.status = 'done';
  });
  DB.save('bookings', bk);

  if (cancelledPending.length) {
    const pays = DB.load('payments', []);
    let payChanged = false;
    cancelledPending.forEach((b) => {
      if (updatePaymentRefund(pays, b, { refund: 0, pct: 0, scope: 'ticket', status: 'cancelled' })) payChanged = true;
      notify(
        b.userEmail,
        'Booking dibatalkan otomatis — ' + b.code,
        'Booking belum dibayar dan jadwal sudah ' + (st === 'ontrip' ? 'berangkat' : 'selesai') + '. Tidak ada refund.',
        'WA'
      );
    });
    if (payChanged) DB.save('payments', pays);
  }

  bk.filter((b) => b.scheduleId === sid && b.status !== 'cancelled').forEach((b) => {
    notify(
      b.userEmail,
      st === 'ontrip' ? 'Perjalanan dimulai' : 'Kamu telah tiba',
      st === 'ontrip' ? 'Armada berangkat. Selamat jalan!' : 'Terima kasih - jangan lupa beri rating.',
      'WA'
    );
  });
  audit('trip_update', sid + ' → ' + st + (s.lateCompletion ? ' • terlambat' : '') + (String(reason || '').trim() ? ' • ' + String(reason).trim() : ''));
  return true;
}

/**
 * Admin menandai jadwal tidak berangkat dan memproses refund secara manual.
 * Jadwal tidak berangkat = kegagalan operator, jadi refund dihitung dari TOTAL
 * pembayaran (tiket + jasa agen + fee platform) sesuai persentase yang dipilih admin.
 */
export function resolveScheduleNoShow(sid, refundPct = 100) {
  const schedules = DB.load('schedules', []);
  const s = schedules.find((x) => x.id === sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (!scheduleNeedsReview(s)) return { ok: false, msg: 'Jadwal sudah diselesaikan atau belum masuk antrean' };

  const ledger = DB.load('ledger', []);
  if (ledger.some((e) => e.scheduleId === sid && e.status === 'dicairkan')) {
    return { ok: false, msg: 'Dana jadwal ini sudah dicairkan — refund tidak dapat diproses otomatis' };
  }

  const bookings = DB.load('bookings', []);
  if (bookings.some((b) => b.scheduleId === sid && b.status === 'done')) {
    return { ok: false, msg: 'Sudah ada booking selesai pada jadwal ini' };
  }

  const payments = DB.load('payments', []);
  const pct = Math.max(0, Math.min(100, Number(refundPct) || 0));
  const now = new Date().toISOString();
  let count = 0;
  let total = 0;
  let payChanged = false;

  bookings.forEach((b) => {
    if (b.scheduleId !== sid) return;
    if (b.status === 'paid') {
      const fare = b.fare || splitFare(s, (b.seats || []).length, b.discount || 0);
      /* Jadwal tidak berangkat = kegagalan operator, jadi dasar refund = TOTAL pembayaran
         (tiket + jasa agen + fee platform), bukan hanya komponen tiket. */
      const base = Math.max(0, Number(b.total) || Number(fare.total) || 0);
      const refund = Math.round(base * pct / 100);
      const scope = pct >= 100 ? 'total' : 'partial';
      b.status = 'cancelled';
      b.tripStatus = 'missed';
      b.refundPct = pct;
      b.refundAmount = refund;
      b.refundScope = scope;
      b.refundStatus = refund > 0 ? 'pending' : 'none';
      b.refundPaidAt = null;
      b.cancelReason = 'Jadwal terlewat / tidak berangkat';
      b.cancelledBy = 'admin';
      b.cancelledAt = now;
      count += 1;
      total += refund;
      if (updatePaymentRefund(payments, b, { refund, pct, scope, status: refund > 0 ? undefined : 'cancelled' })) payChanged = true;
      restoreVoucher(b);
      notify(
        b.userEmail,
        'Jadwal tidak berangkat — ' + b.code,
        refund > 0
          ? 'Refund ' + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(refund) + ' (' + pct + '% dari total) diproses 1–3 hari kerja.'
          : 'Booking dibatalkan. Tidak ada refund untuk booking ini (0%).',
        'WA'
      );
    } else if (b.status === 'pending') {
      b.status = 'cancelled';
      b.tripStatus = 'missed';
      b.refundPct = 0;
      b.refundAmount = 0;
      b.refundScope = 'total';
      b.refundStatus = 'none';
      b.refundPaidAt = null;
      b.cancelReason = 'Jadwal terlewat / tidak berangkat';
      b.cancelledBy = 'admin';
      b.cancelledAt = now;
      if (updatePaymentRefund(payments, b, { refund: 0, pct: 0, scope: 'total', status: 'cancelled' })) payChanged = true;
      restoreVoucher(b);
    }
  });

  ledger.forEach((e) => {
    if (e.scheduleId === sid && e.status !== 'dicairkan' && e.status !== 'void') {
      e.status = 'void';
      e.voidedAt = now;
    }
  });

  s.tripStatus = 'missed';
  s.status = 'cancelled';
  s.reviewedAt = now;
  s.reviewResult = 'no_show';
  s.refundPct = pct;
  s.cancelReason = 'Jadwal terlewat / tidak berangkat';
  s.cancelledBy = 'admin';
  s.cancelledAt = now;

  DB.save('schedules', schedules);
  DB.save('bookings', bookings);
  DB.save('ledger', ledger);
  if (payChanged) DB.save('payments', payments);

  DB.load('users', [])
    .filter((u) => u.role === 'agen' && u.agencyId === s.agencyId)
    .forEach((u) => notify(u.email, 'Jadwal ditandai tidak berangkat', 'Jadwal ' + sid + ' ditutup dengan refund tiket ' + pct + '%.', 'app'));

  audit('schedule_no_show', sid + ' • refund ' + pct + '% • ' + count + ' booking • ' + total);
  return { ok: true, count, total, pct };
}
export function settleLedger(ids){
  const arr=DB.load('ledger',[]); let n=0;
  (ids||[]).forEach(id=>{ const e=arr.find(x=>x.id===id); if(e&&e.status==='layak'){ e.status='dicairkan'; e.paidOutAt=new Date().toISOString(); n++; } });
  if(n){ DB.save('ledger',arr); audit('ledger_settle',n+' pos'); }
  return n;
}
export function ledgerByDriver(driverId){ return DB.load('ledger',[]).filter(e=>e.driverId===driverId); }
/* Layak cair = trip tiba + kliring 24 jam */
export function ledgerEligible(e){
  if(!e||e.status!=='layak') return false;
  const s=schedById(e.scheduleId);
  const at=s?.arrivedAt||e.releasedAt;
  if(!at) return true;
  return Date.now()-new Date(at).getTime()>=24*3600*1000;
}

/* Normalisasi titik jemput: trim, buang kosong & duplikat (abaikan besar/kecil huruf) */
export function normalizePoints(list){
  const seen=new Set(); const out=[];
  (Array.isArray(list)?list:[]).forEach(p=>{ const v=String(p==null?'':p).trim(); if(!v) return; const k=v.toLowerCase(); if(seen.has(k)) return; seen.add(k); out.push(v); });
  return out;
}

/* Suspend rute per Agen-Rute (admin): r.suspensions={[agencyId]:{reason,at}} */
export function isRouteSuspended(route,agencyId){ return !!(route&&agencyId&&route.suspensions&&route.suspensions[agencyId]); }
export function routeOfferedTo(route,agencyId){ return !!(route&&route.active&&(route.agencyIds||[]).includes(agencyId)&&!isRouteSuspended(route,agencyId)); }
export function routeBookable(route){ if(!route||!route.active) return false; const ids=route.agencyIds||[]; return !ids.length||ids.some(a=>!isRouteSuspended(route,a)); }
export function suspendAgencyRoute(routeId,agencyId,reason){
  const rs=DB.load('routes',[]); const r=rs.find(x=>x.id===routeId);
  const why=(reason||'').trim();
  if(!r||!why||!(r.agencyIds||[]).includes(agencyId)) return false;
  r.suspensions={...(r.suspensions||{}),[agencyId]:{reason:why,at:new Date().toISOString()}};
  DB.save('routes',rs);
  audit('route_suspend',r.from+' → '+r.to+' • '+agencyId+' • '+why);
  DB.load('users',[]).filter(u=>u.role==='agen'&&u.agencyId===agencyId).forEach(u=>notify(u.email,'Rute disuspend admin',r.from+' → '+r.to+' • '+why,'app'));
  return true;
}
export function activateAgencyRoute(routeId,agencyId){
  const rs=DB.load('routes',[]); const r=rs.find(x=>x.id===routeId);
  if(!r||!isRouteSuspended(r,agencyId)) return false;
  const n={...(r.suspensions||{})}; delete n[agencyId]; r.suspensions=n;
  DB.save('routes',rs);
  audit('route_activate',r.from+' → '+r.to+' • '+agencyId);
  DB.load('users',[]).filter(u=>u.role==='agen'&&u.agencyId===agencyId).forEach(u=>notify(u.email,'Rute diaktifkan kembali',r.from+' → '+r.to,'app'));
  return true;
}

/* Usulan rute agen → admin (model hibrida: agen usul, admin eksekusi) */
export function saveRouteRequest({ agencyId, type, routeId, from, to, pickup, pickups, note, price, homePickup, distance, duration, vehicleIds }){
  const arr=DB.load('routeRequests',[]);
  const list=normalizePoints(pickups);
  if(!list.length&&(pickup||'').trim()) list.push((pickup||'').trim());
  /* armada hanya milik agen pengusul dan harus aktif — id lain dibuang */
  const fleet=DB.load('vehicles',[]);
  const vids=Array.isArray(vehicleIds)?vehicleIds.filter(vid=>fleet.some(v=>v.id===vid&&v.agencyId===agencyId&&v.status==='aktif')):[];
  const r={id:uid('RQ'),agencyId,type,routeId:routeId||null,from,to,pickup:list[0]||'',pickups:list,note:(note||'').trim(),price:Number(price)||0,homePickup:homePickup!==false,distance:(distance||'').trim(),duration:(duration||'').trim(),vehicleIds:vids,status:'pending',adminNote:'',createdAt:new Date().toISOString(),decidedAt:null};
  arr.unshift(r); DB.save('routeRequests',arr);
  audit('route_request',type+' '+from+' → '+to+' • '+agencyId);
  DB.load('users',[]).filter(u=>u.role==='superadmin').forEach(u=>notify(u.email,'Usulan rute baru',(agencyById(agencyId)?.name||agencyId)+' mengusulkan '+(type==='rute-baru'?'rute baru':'titik jemput')+': '+from+' → '+to,'app'));
  return r;
}
export function decideRouteRequest(id,approve,adminNote){
  const arr=DB.load('routeRequests',[]);
  const r=arr.find(x=>x.id===id);
  if(!r||r.status!=='pending') return null;
  let validVehicleIds=null;
  if(approve&&r.type==='rute-baru'){
    const fleet=DB.load('vehicles',[]);
    validVehicleIds=(Array.isArray(r.vehicleIds)?r.vehicleIds:[]).filter(vid=>fleet.some(v=>v.id===vid&&v.agencyId===r.agencyId&&v.status==='aktif'));
    if(!validVehicleIds.length) return {error:'Armada usulan tidak valid untuk agen ini'};
  }
  r.status=approve?'approved':'rejected';
  r.adminNote=(adminNote||'').trim();
  r.decidedAt=new Date().toISOString();
  let createdRouteId=null;
  if(approve){
    if(r.type==='rute-baru'){
      const routes=DB.load('routes',[]);
      const pts=normalizePoints(Array.isArray(r.pickups)&&r.pickups.length?r.pickups:(r.pickup?[r.pickup]:[]));
      const allPts=normalizePoints(pts.length?['Terminal '+r.from,...pts]:['Terminal '+r.from,'Terminal '+r.to]);
      const est=estimateRoute(r.from,r.to)||{};
      const nr={id:uid('R'),from:r.from,to:r.to,distance:(r.distance||'').trim()||est.distance||'-',duration:(r.duration||'').trim()||est.duration||'-',basePrice:Number(r.price)>0?Number(r.price):0,prices:Number(r.price)>0?{[r.agencyId]:Number(r.price)}:{},homePickup:r.homePickup!==false,pickups:allPts,vehicleIds:validVehicleIds||[],active:true,agencyId:r.agencyId,agencyIds:[r.agencyId],driverId:null,driverIds:[]};
      routes.push(nr); DB.save('routes',routes);
      createdRouteId=nr.id;
    }else if(r.type==='ubah-harga'){
      const routes=DB.load('routes',[]);
      const tgt=routes.find(x=>x.id===r.routeId)||routes.find(x=>x.from===r.from&&x.to===r.to&&(x.agencyIds||[]).includes(r.agencyId));
      if(tgt&&Number(r.price)>0){ tgt.prices={...(tgt.prices||{}),[r.agencyId]:Number(r.price)}; DB.save('routes',routes); }
    }else{
      const routes=DB.load('routes',[]);
      const tgt=routes.find(x=>x.id===r.routeId)||routes.find(x=>x.from===r.from&&x.to===r.to&&(x.agencyIds||[]).includes(r.agencyId));
      const pts=normalizePoints(Array.isArray(r.pickups)&&r.pickups.length?r.pickups:(r.pickup?[r.pickup]:[]));
      if(tgt&&pts.length){
        const cur=normalizePoints(tgt.pickups); let ch=false;
        pts.forEach(p=>{ if(!cur.some(x=>x.toLowerCase()===p.toLowerCase())){ cur.push(p); ch=true; } });
        if(ch){ tgt.pickups=cur; DB.save('routes',routes); }
      }
    }
  }
  DB.save('routeRequests',arr);
  audit('route_request_'+r.status,r.type+' '+r.from+' → '+r.to+' • '+r.agencyId);
  DB.load('users',[]).filter(u=>u.agencyId===r.agencyId&&u.role==='agen').forEach(u=>notify(u.email,approve?'Usulan rute disetujui':'Usulan rute ditolak',r.from+' → '+r.to+(r.adminNote?' • '+r.adminNote:''),'app'));
  return {req:r,createdRouteId};
}

/* ---------- KYC / kelengkapan data agen travel ----------
   Dialur setelah agen mendaftar: login tetap bisa, tapi akun baru bisa
   ber-operasi penuh setelah kelengkapan data disetujui super admin. */

export const KYC_MIN_AGE = 21;
export const KYC_JENIS = ['Perorangan / Freelance', 'Badan Usaha (PT/CV)'];
export const KYC_BENTUK = ['PT', 'CV', 'Firma', 'Koperasi'];
export const KYC_AGAMA = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'];
export const KYC_HUBUNGAN = ['Istri / Suami', 'Anak', 'Orang Tua', 'Saudara', 'Lainnya'];
export const KYC_BANKS = ['Bank Aceh Syariah', 'BCA', 'Mandiri', 'BRI', 'BSI', 'BNI', 'BNI Syariah', 'CIMB Niaga', 'Permata', 'Lainnya'];

const digits = (v) => String(v || '').replace(/\D/g, '');
export const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** True kalau user agen belum boleh memakai fitur/menu agen. */
export function agencyPending(u) {
  if (!u || u.role !== 'agen') return false;
  const st = u.status || 'active';
  if (st === 'suspended') return false; /* nonaktif: ditolak saat login, bukan pending */
  const ag = agencyOf(u);
  if (st === 'pending' || (ag && ag.status === 'pending')) return true;
  /* Agen lama yang sudah aktif tetap harus melengkapi KYC (termasuk NPWP). */
  return !!(ag && !kycLengkap(ag));
}

/** Usia (tahun) pada tanggal lahir; null bila tidak bisa dihitung. */
export function kycAge(tgl) {
  const d = new Date(String(tgl || '') + 'T00:00');
  if (!tgl || isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

/** Gate login agen: pending boleh masuk, suspended / data hilang ditolak. */
export function checkAgenAccess(u) {
  if (!u || u.role !== 'agen') return null;
  const ag = agencyById(u.agencyId);
  if (!ag) return 'Data travel tidak ditemukan - hubungi super admin';
  if ((u.status || 'active') === 'suspended' || ag.status === 'suspended') return 'Akun agen dinonaktifkan - hubungi super admin';
  return null;
}

const g = (k, f) => String(((k || {})[f]) || '').trim();

/* Cek satu blok alamat berjenjang (domisili maupun lokasi usaha).
   awalan dipakai untuk pesan agar tidak ambigu saat dua blok sama-sama kosong. */
const ALAMAT_FIELDS = [['provinsi', 'Provinsi'], ['kota', 'Kota/Kabupaten'], ['kecamatan', 'Kecamatan'], ['kelurahan', 'Kelurahan'], ['rtRw', 'RT/RW'], ['jalan', 'Alamat jalan']];
/** Validasi satu blok alamat berjenjang; dipakai KYC dan Tambah Pengemudi. */
export function cekAlamat(al, awalan) {
  const a = al || {};
  for (const [f, l] of ALAMAT_FIELDS) if (!String(a[f] || '').trim()) return awalan + l + ' wajib diisi';
  if (!/^\d{5}$/.test(String(a.kodePos || '').trim())) return awalan + 'Kode pos harus 5 digit angka';
  return null;
}

/** Validasi Tahap 1 (kelengkapan data). Return null bila valid, atau pesan pertama. */
export function validateKycStep1(k) {
  if (!k || !k.jenis) return 'Pilih jenis agen';
  if (!g(k, 'nama')) return 'Nama lengkap wajib diisi';
  if (!g(k, 'nik')) return 'NIK wajib diisi';
  if (!/^\d{16}$/.test(g(k, 'nik'))) return 'NIK harus 16 digit angka';
  if (!g(k, 'tmpLahir')) return 'Tempat lahir wajib diisi';
  if (!g(k, 'tglLahir')) return 'Tanggal lahir wajib diisi';
  const age = kycAge(g(k, 'tglLahir'));
  if (age === null || age < KYC_MIN_AGE) return 'Usia minimal ' + KYC_MIN_AGE + ' tahun';
  if (!g(k, 'gender')) return 'Pilih jenis kelamin';
  if (!g(k, 'agama')) return 'Pilih agama';
  const al = k.alamat || {};
  const errAlamat = cekAlamat(al, '');
  if (errAlamat) return errAlamat;
  if (digits(k.hp).length < 9) return 'No HP utama minimal 9 digit angka';
  
  if (!g(k, 'email')) return 'Email wajib diisi';
  if (!/.+@.+\..+/.test(g(k, 'email'))) return 'Format email belum benar';
  const dg = k.darurat || {};
  if (!String(dg.nama || '').trim()) return 'Nama kontak darurat wajib diisi';
  if (!String(dg.hubungan || '').trim()) return 'Hubungan kontak darurat wajib diisi';
  if (digits(dg.hp).length < 9) return 'No HP darurat minimal 9 digit angka';
  if (k.jenis === 'Badan Usaha (PT/CV)') {
    if (!g(k, 'badanNama')) return 'Nama badan usaha wajib diisi';
    if (!g(k, 'badanBentuk')) return 'Pilih bentuk usaha';
    if (!g(k, 'aktaNo')) return 'Nomor akta pendirian wajib diisi';
    if (!/^\d{15,16}$/.test(g(k, 'npwpUsaha'))) return 'NPWP badan usaha harus 15 atau 16 digit angka';
    if (!/^\d{13}$/.test(g(k, 'nib'))) return 'NIB harus 13 digit angka';
    if (!g(k, 'direktur')) return 'Nama direktur / penanggung jawab wajib diisi';
    const errAlamatUsaha = cekAlamat(k.alamatUsaha, 'Alamat usaha — ');
    if (errAlamatUsaha) return errAlamatUsaha;
  }
  if (!g(k, 'bank')) return 'Pilih nama bank';
  if (digits(k.rekeningNo).length < 6) return 'Nomor rekening wajib diisi';
  if (!g(k, 'rekeningNama')) return 'Nama pemilik rekening wajib diisi';
  /* Nama pemilik rekening mengikuti jenis agen: Perorangan menyamai nama
     pemohon, Badan Usaha menyamai nama badan usaha (sesuai akta). */
  const isBadanUsaha = k.jenis === 'Badan Usaha (PT/CV)';
  const rekeningOwner = normName(isBadanUsaha ? k.badanNama : k.nama);
  if (normName(k.rekeningNama) !== rekeningOwner) {
    return 'Nama pemilik rekening harus sama dengan nama ' + (isBadanUsaha ? 'badan usaha' : 'pemohon');
  }
  /* NPWP pemohon hanya untuk Perorangan — Badan Usaha memakai NPWP badan usaha.
     Default tidak memakai NIK: wajib isi nomor, kecuali checkbox sama dengan KTP dicentang.
     Bila memakai NIK, NIK 16 digit sudah menjadi NPWP sehingga tidak perlu nomor lain. */
  if (k.jenis !== 'Badan Usaha (PT/CV)' && k.npwpSamaKtp !== true) {
    if (!g(k, 'npwp')) return 'Nomor NPWP wajib diisi bila berbeda dari nomor KTP';
    if (!/^\d{15,16}$/.test(digits(k.npwp))) return 'NPWP harus 15 atau 16 digit angka';
  }
  return null;
}

/** Grup dokumen unggahan per jenis agen — wajib/opsional + petunjuk singkat. */
export function kycDocGroups(jenis) {
  if (jenis === 'Badan Usaha (PT/CV)') {
    return [
      { grup: 'Identitas Penanggung Jawab', docs: [
        { key: 'ktp', label: 'KTP Penanggung Jawab / Direktur', wajib: true, hint: 'Foto KTP asli, semua sudut terlihat' },
      ] },
      { grup: 'Legalitas Usaha', docs: [
        { key: 'npwpUsaha', label: 'NPWP Perusahaan', wajib: true, hint: 'Kartu NPWP atas nama badan usaha' },
        { key: 'nib', label: 'NIB', wajib: true, hint: 'Nomor Induk Berusaha' },
        { key: 'akta', label: 'Akta Pendirian Perusahaan', wajib: true, hint: 'Halaman akta pendirian' },
      ] },
      { grup: 'Rekening Bank', docs: [
        { key: 'bukuTabungan', label: 'Buku Tabungan / Rekening', wajib: true, hint: 'Halaman pertama yang memuat nama pemilik rekening' },
      ] },
      { grup: 'Kantor', docs: [
        { key: 'kantorDepan', label: 'Foto Kantor Tampak Depan', wajib: true, hint: 'Terlihat papan nama / plang usaha' },
        { key: 'kantorDalam', label: 'Foto Kantor Tampak Dalam', wajib: true, hint: 'Ruangan kerja / area pelayanan' },
      ] },
    ];
  }
  return [
    { grup: 'Identitas Pemohon', docs: [
      { key: 'ktp', label: 'KTP Pemohon', wajib: true, hint: 'Foto KTP asli, semua sudut terlihat' },
      { key: 'pasfoto', label: 'Pasfoto Terbaru', wajib: true, hint: 'Latar merah atau biru' },
    ] },
    { grup: 'Rekening & NPWP', docs: [
      { key: 'bukuTabungan', label: 'Buku Tabungan / Rekening', wajib: true, hint: 'Halaman pertama yang memuat nama pemilik' },
      { key: 'npwpPribadi', label: 'NPWP Pribadi', wajib: true, hint: 'Kartu NPWP / NPWP elektronik — wajib' },
    ] },
  ];
}

/** Daftar dokumen [key, label] untuk ringkasan kelengkapan & tampilan admin. */
export function kycDocList(jenis) {
  return kycDocGroups(jenis).flatMap((g) => g.docs.map((d) => [d.key, d.label]));
}

/** Key dokumen wajib — syarat sebelum pengajuan boleh dikirim. */
export function kycDocWajib(jenis) {
  return kycDocGroups(jenis).flatMap((g) => g.docs.filter((d) => d.wajib).map((d) => d.key));
}

/** True kalau data, dokumen wajib, dan S&K sudah lengkap. */
export function kycLengkap(ag) {
  return !!kycSummary(ag).lengkap;
}

/** Ringkasan kelengkapan untuk kartu admin & halaman status. */
export function kycSummary(ag) {
  const k = (ag && ag.kyc) || {};
  const wajib = kycDocWajib(k.jenis);
  const docs = k.docs || {};
  const filled = wajib.filter((key) => !!docs[key]).length;
  const need = wajib.length;
  return {
    status: k.status || 'draft',
    step: k.step || 1,
    submittedAt: k.submittedAt || null,
    dataOk: !validateKycStep1(k),
    docsOk: filled >= need,
    docsFilled: filled,
    docsTotal: need,
    termsOk: !!k.terms,
    lengkap: !validateKycStep1(k) && filled >= need && !!k.terms,
  };
}
