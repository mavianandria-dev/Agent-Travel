import { DB } from './db.js';
import { uid, todayStr, SIM_TYPES, fmtRp } from './utils.js';
import { estimateRoute } from './geo.js';
import { PICKUP_ORIGIN } from './pickups.js';
export { uid, todayStr };

/* Diekstrak dari index.html — pure domain logic, tanpa DOM. */

export function simParse(d){ const cur=new Date().getFullYear();
  if(d&&(d.simType||d.simExp)) return {type:(typeof d.simType==='string'&&d.simType.trim())?d.simType.trim():'A',exp:Number(d.simExp)||cur+5};
  const m=d&&d.sim?/SIM\s*([A-Z0-9]+)\s*•\s*(?:(\d{4})\s*-)?(\d{4})/.exec(d.sim):null;
  return {type:m&&SIM_TYPES.includes(m[1])?m[1]:'A',exp:m?Number(m[3]):cur+5};
}

export function simLabel(d){ const s=simParse(d); return 'SIM '+s.type+' • s.d. '+s.exp; }

export function simExpired(d){ return simParse(d).exp<new Date().getFullYear(); }

export function currentUser(){ const s=DB.load('session',null); if(!s) return null; return DB.load('users',[]).find(u=>u.id===s.uid)||null; }

export function setSession(u){ if(u) DB.save('session',{uid:u.id}); else localStorage.removeItem('at_session'); }

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

export function vehicleById(id){ return DB.load('vehicles',[]).find(v=>v.id===id); }

export function vehName(v){ return v?(((v.brand||'')+(v.model?' '+v.model:'')).trim()||'Armada'):''; }

/* Armada agen yang tersedia untuk rute baru: status aktif & belum dipakai rute mana pun. */
export function fleetAvailable(agencyId){
  const used=new Set();
  DB.load('routes',[]).forEach(r=>(r.vehicleIds||[]).forEach(id=>used.add(id)));
  return DB.load('vehicles',[]).filter(v=>v.agencyId===agencyId&&v.status==='aktif'&&!used.has(v.id));
}

export function driverById(id){ return DB.load('drivers',[]).find(d=>d.id===id); }

/* ---------- Profil driver: isi sendiri + verifikasi agen ----------
   Field yang langsung berlaku: kontak, alamat, rekening, foto profil.
   Field identitas/dokumen: disimpan sebagai usulan, berlaku setelah disetujui agen. */
export const DRIVER_DIRECT_FIELDS = ['phone', 'address', 'emName', 'emPhone', 'emRelation', 'bank', 'photo'];
export const DRIVER_VERIFY_FIELDS = ['nik', 'birthPlace', 'birthDate', 'gender', 'marital', 'education', 'simType', 'simNumber', 'simExp', 'simPhoto', 'ktpPhoto', 'selfie'];
export const DRIVER_FIELD_LABELS = {
  phone: 'No HP', address: 'Alamat', emName: 'Nama kontak darurat', emPhone: 'No HP kontak darurat',
  emRelation: 'Hubungan kontak darurat', bank: 'Rekening bank', photo: 'Foto profil',
  nik: 'NIK', birthPlace: 'Tempat lahir', birthDate: 'Tanggal lahir', gender: 'Jenis kelamin',
  marital: 'Status perkawinan', education: 'Pendidikan', simType: 'Jenis SIM', simNumber: 'Nomor SIM',
  simExp: 'Masa berlaku SIM', simPhoto: 'Dokumen SIM', ktpPhoto: 'Foto KTP', selfie: 'Swafoto',
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
  const keys = Object.keys(pending);
  if (!keys.length) return { ok: false, msg: 'Tidak ada usulan perubahan' };
  Object.entries(pending).forEach(([k, v]) => { d[k] = v; });
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
  const keys = Object.keys(pending);
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

export function takenSeats(schedId){
  const sch=schedById(schedId); const out={paid:[],hold:[],inactive:[]};
  bookingsOf(schedId).forEach(b=>{ (b.seats||[]).forEach(s=>{ if(b.status==='paid'||b.status==='done') out.paid.push(s); else if(b.status==='pending') out.hold.push(s); }); });
  (sch?.blockedSeats||[]).forEach(s=>{ if(!out.paid.includes(s)) out.paid.push(s); });
  const veh=sch?vehicleById(sch.vehicleId):null;
  (veh?.inactiveSeats||[]).forEach(s=>{ if(!out.paid.includes(s)) out.paid.push(s); if(!out.inactive.includes(s)) out.inactive.push(s); });
  return out;
}

export function seatsLeft(schedId){ return schedSeatCap(schedId) - takenSeats(schedId).paid.length - takenSeats(schedId).hold.length; }

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
  const v=s.vehicleId?vehicleById(s.vehicleId):null, d=s.driverId?driverById(s.driverId):null;
  return (!v||v.status==='aktif')&&(!d||d.status==='aktif');
}

/* Pemetaan nama pengemudi dari data armada → data pengemudi agen (penjadwalan otomatis). */
export function driverByName(agencyId, name){
  const n=String(name||'').trim().toLowerCase();
  if(!n||!agencyId) return null;
  const ds=DB.load('drivers',[]).filter(d=>d.agencyId===agencyId&&String(d.name||'').trim().toLowerCase()===n);
  return ds.find(d=>d.status==='aktif')||ds[0]||null;
}
/* Bentrok jadwal: tanggal sama + (armada/pengemudi sama, ID atau nama) + jeda keberangkatan < 4 jam. */
export function schedConflict(date,time,vehicleId,driverId,driverName){
  const nm=String(driverName||'').trim().toLowerCase();
  return DB.load('schedules',[]).find(s=>{
    if(s.date!==date) return false;
    if(Math.abs(hm(s.time)-hm(time))>=240) return false;
    if(vehicleId&&s.vehicleId===vehicleId) return true;
    if(driverId&&s.driverId===driverId) return true;
    const dd=s.driverId?driverById(s.driverId):null;
    const sn=String(s.driverName||(dd?dd.name:'')||'').trim().toLowerCase();
    return !!(nm&&sn&&nm===sn);
  })||null;
}
/* Jam kembar: di koridor (DARI→KE) yang sama, satu tanggal tidak boleh punya 2 jadwal dengan jam sama.
   Dicek per agen travel — jadwal agen lain tidak saling mengunci. */
export function corridorClash(date,time,routeId,agencyId){
  const r=routeById(routeId);
  if(!r) return null;
  return DB.load('schedules',[]).find(s=>{
    if(s.agencyId!==agencyId) return false;
    if(s.date!==date||s.time!==time) return false;
    const r2=routeById(s.routeId);
    return !!(r2&&r2.from===r.from&&r2.to===r.to);
  })||null;
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
  const released=new Set();
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
    released.add(b.scheduleId);
  });
  if(!expired.length) return;
  DB.save('bookings',arr);
  const pays=DB.load('payments',[]);
  let payChanged=false;
  expired.forEach((b)=>{ if(updatePaymentRefund(pays,b,{refund:0,pct:0,scope:'ticket',status:'cancelled'})) payChanged=true; });
  if(payChanged) DB.save('payments',pays);
  released.forEach(processWaiting);
}

export function processWaiting(schedId){
  const w=DB.load('waiting',[]); const idx=w.findIndex(x=>x.scheduleId===schedId);
  if(idx>=0 && seatsLeft(schedId)>0){ const item=w.splice(idx,1)[0]; DB.save('waiting',w); notify(item.userEmail,'Kursi tersedia!','Kursi pada jadwal '+schedId+' kini tersedia ('+seatsLeft(schedId)+' sisa). Segera booking.','WA'); }
}

export function feeFor(agencyId, amount){ const a=agencyById(agencyId); if(!a) return Math.round(amount*0.08); return a.feeType==='flat'? a.feeValue : Math.round(amount*a.feeValue/100); }

export function audit(action, detail){ const l=DB.load('audit',[]); const u=currentUser(); l.unshift({id:uid('LOG'),time:new Date().toISOString(),actor:u?u.email+' ('+u.role+')':'guest',action,detail:detail||''}); DB.save('audit',l.slice(0,300)); }

export function notify(userEmail, title, msg, ch){
  const n=DB.load('notifications',[]);
  n.unshift({id:uid('NTF'),to:userEmail,title,msg,ch:ch||'app',time:new Date().toISOString(),read:false});
  DB.save('notifications',n.slice(0,200));
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
  const hours = s ? Math.max(0, (scheduleDepartureMs(s) - now) / 36e5) : 0;
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

/** Catat status refund pada data pembayaran agar laporan dan antrean admin sinkron. */
function updatePaymentRefund(pays, b, { refund, pct, scope, status }) {
  const p = pays.find((x) => x.bookingId === b.id);
  if (!p) return false;
  const at = new Date().toISOString();
  p.refundAmount = refund;
  p.refundPct = pct;
  p.refundScope = scope;
  p.refundStatus = refund > 0 ? 'pending' : 'none';
  p.refundedAt = at;
  p.refundPaidAt = null;
  if (status) p.status = status;
  return true;
}

/** Booking pending masih bisa dibayar: hold aktif, jadwal masih terbuka dan belum berangkat. */
export function canPayBooking(b, s, { ignoreHold = false, now = Date.now() } = {}) {
  if (!b || !s || b.status !== 'pending') return false;
  if (!ignoreHold && b.holdExpiry && new Date(b.holdExpiry).getTime() <= now) return false;
  if (s.status !== 'open') return false;
  if (['ontrip', 'arrived', 'missed', 'cancelled'].includes(s.tripStatus)) return false;
  return !scheduleIsPast(s, 0, now);
}

/** Booking masih boleh dibatalkan: belum jalan/terlewat, belum boarding. */
export function canCancelBooking(b, s) {
  if (!b || !s) return false;
  if (!['pending', 'paid'].includes(b.status) || b.boarded) return false;
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
  processWaiting(b.scheduleId);
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
      if (updatePaymentRefund(payments, b, { refund, pct: 100, scope: 'total', status: 'refunded' })) payChanged = true;
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
export function createDriverBooking(sid, { passengers = [], seats = [], driverId = '', payMethod = 'QRIS', discount = 0 } = {}) {
  const s = schedById(sid);
  if (!s) return { ok: false, msg: 'Jadwal tidak ditemukan' };
  if (s.status !== 'open') return { ok: false, msg: 'Jadwal tidak terbuka' };
  if (['arrived', 'missed', 'cancelled'].includes(s.tripStatus)) return { ok: false, msg: 'Jadwal sudah selesai/ditutup' };
  if (s.tripStatus !== 'ontrip' && scheduleIsPast(s, 0)) return { ok: false, msg: 'Jadwal sudah lewat' };

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
  const pickup = (PICKUP_ORIGIN[r?.from] || [])[0] || (r?.pickups || [])[0] || '-';
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
      pickup,
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

/** Ubah status trip jadwal; dipakai pengemudi maupun admin. */
export function setScheduleTripStatus(sid, st) {
  if (!['ontrip', 'arrived'].includes(st)) return false;
  const arr = DB.load('schedules', []);
  const s = arr.find((x) => x.id === sid);
  if (!s || s.tripStatus === st) return false;
  if (s.reviewedAt && s.reviewResult === 'no_show') return false;
  const prev = s.tripStatus || 'scheduled';
  const now = new Date().toISOString();
  s.tripStatus = st;
  s.status = 'closed';
  if (st === 'ontrip') s.departedAt = now;
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
  audit('trip_update', sid + ' → ' + st + (s.lateCompletion ? ' • terlambat' : ''));
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
      if (updatePaymentRefund(payments, b, { refund, pct, scope, status: refund > 0 ? 'refunded' : 'cancelled' })) payChanged = true;
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
  /* armada hanya milik agen pengusul — id armada agen lain dibuang */
  const fleet=DB.load('vehicles',[]);
  const vids=Array.isArray(vehicleIds)?vehicleIds.filter(vid=>fleet.some(v=>v.id===vid&&v.agencyId===agencyId)):[];
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
      const nr={id:uid('R'),from:r.from,to:r.to,distance:(r.distance||'').trim()||est.distance||'-',duration:(r.duration||'').trim()||est.duration||'-',basePrice:Number(r.price)>0?Number(r.price):0,prices:Number(r.price)>0?{[r.agencyId]:Number(r.price)}:{},homePickup:r.homePickup!==false,pickups:allPts,vehicleIds:Array.isArray(r.vehicleIds)?r.vehicleIds.filter(Boolean):[],active:true,agencyId:r.agencyId,agencyIds:[r.agencyId],driverId:null,driverIds:[]};
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
function cekAlamat(al, awalan) {
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
  const owners = [normName(k.nama), normName(k.badanNama)].filter(Boolean);
  if (!owners.includes(normName(k.rekeningNama))) return 'Nama pemilik rekening harus sama dengan nama pemohon / badan usaha';
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
