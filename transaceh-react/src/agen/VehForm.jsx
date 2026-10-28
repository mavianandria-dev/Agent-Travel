import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, vehicleById, driverById, driverForVehicle, backupDriverForVehicle, sameDriver, driverOptionLabel, vehLayoutRaw, drvBlocks, seatBookedFuture, bookingsOf, schedSeatCap, audit, notify } from '@/lib/domain.js';
import { todayStr, uid, SEAT_LABELS, V_OWN, V_TYPES, V_FAC, V_SERVICES, VTOOLS, VCELLCLS, VCELLICON, inC } from '@/lib/utils.js';
import { Icon, Sec, PillRadios, CheckPills, UpBox } from '@/components/ui.jsx';

function vCellLabel(c) {
  if (c.type === 'seat') return c.sid || '';
  if (c.type === 'driver') return 'PENGEMUDI';
  if (c.type === 'door') return 'PINTU';
  if (c.type === 'luggage') return 'BAGASI';
  if (c.type === 'off') return (c.sid || '') + ' OFF';
  return '';
}

function defaultVLAY() {
  const L = Array.from({ length: 28 }, () => ({ sid: null, type: 'empty' }));
  L[2] = { sid: 'DRV', type: 'driver' };
  L[3] = { sid: 'DRV2', type: 'driver' };
  return L;
}

export default function VehForm() {
  const { user, vehEdit, setVehEdit, setAgenTab, go, tick } = useApp();
  void tick;
  void schedSeatCap;
  const agId = (vehEdit && (vehEdit.agId || vehEdit.agencyId)) || user?.agencyId;
  const vid = (vehEdit && (vehEdit.vid || vehEdit.id)) || null;
  const oldV = vid ? vehicleById(vid) : null;
  const ag = agencyOf(user);
  if (!ag || !agId || ag.id !== agId || (vid && (!oldV || oldV.agencyId !== agId))) {
    return (
      <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
        <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-7 text-center font-bold text-slate-500">Data tidak ditemukan</div>
        <button onClick={() => { setVehEdit(null); setAgenTab('fleet'); go('agen'); }} className="mt-3 w-full bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Kembali</button>
      </div>
    );
  }
  return <VehFormInner key={vid || 'new'} agId={agId} oldV={oldV} vid={vid} />;
}

function VehFormInner({ agId, oldV, vid }) {
  const { setVehEdit, setAgenTab, go, toast, refresh } = useApp();
  const v = Object.assign({ brand: '', model: '', year: '', color: '', plate: '', chassis: '', engine: '', vtype: '', vtypeOther: '', baggage: 'Sedang', tax: 'Aktif', stnkExp: '', kir: '', condition: 'Baik', photo: '', facilities: [], status: '', ownerName: '', ownerBiz: '', ownerNik: '', ownerAddr: '', ownerPhone: '', ownerEmail: '', ownership: '', docs: [], docOther: '', stnkPhoto: '', ktpOwnerPhoto: '', mainRoute: '', origin: '', dest: '', freq: 'Setiap hari', freqOther: '', services: [], opSchedule: '', coopTariff: '', coopSys: 'Bagi hasil', coopOther: '', fleetCount: 1, hasDriver: 'Ya', driverId: '', backDriverId: '', drvName: '', drvPhone: '', drvSim: '', drvSimExp: '', drvExp: '', hasBackup: '' }, oldV || {});
  const agDrivers = DB.load('drivers', []).filter((d) => d.agencyId === agId);
  const otherVehicles = DB.load('vehicles', []).filter((x) => x.agencyId === agId && x.id !== vid);
  const usedPeople = [];
  otherVehicles.forEach((x) => {
    const d = driverForVehicle(x);
    if (d) usedPeople.push({ driver: d, plate: x.plate || x.id });
    const b = backupDriverForVehicle(x);
    if (b) usedPeople.push({ driver: b, plate: x.plate || x.id });
  });
  const usedPlateFor = (d) => (usedPeople.find((x) => sameDriver(x.driver, d)) || {}).plate || '';
  const driverOptions = agDrivers.map((d) => {
    const usedAt = usedPlateFor(d);
    return <option key={d.id} value={d.id} disabled={!!usedAt}>{driverOptionLabel(d)}{usedAt ? ' • sudah dipakai ' + usedAt : ''}</option>;
  });
  const [ownership, setOwnership] = useState(v.ownership || '');
  const [ownerName, setOwnerName] = useState(v.ownerName || '');
  const [ownerBiz, setOwnerBiz] = useState(v.ownerBiz || '');
  const [coopDriverId, setCoopDriverId] = useState(v.coopDriverId || '');
  const [ownerNik, setOwnerNik] = useState(v.ownerNik || '');
  const [ownerPhone, setOwnerPhone] = useState(v.ownerPhone || '');
  const [ownerAddr, setOwnerAddr] = useState(v.ownerAddr || '');
  const [hasEmail, setHasEmail] = useState(v.hasEmail || '');
  const [ownerEmail, setOwnerEmail] = useState(v.ownerEmail || '');
  const [brand, setBrand] = useState(v.brand || '');
  const [model, setModel] = useState(v.model || '');
  const [year, setYear] = useState(v.year || '');
  const [color, setColor] = useState(v.color || '');
  const [plate, setPlate] = useState(v.plate || '');
  const [vtype, setVtype] = useState(V_TYPES.includes(v.vtype) ? v.vtype : (v.vtype ? 'Lainnya' : ''));
  const [vtypeOther, setVtypeOther] = useState(v.vtypeOther || '');
  const [stnkExp, setStnkExp] = useState(v.stnkExp || '');
  const [status, setStatus] = useState(v.status || '');
  const [facilities, setFacilities] = useState(v.facilities || []);
  const [photo, setPhoto] = useState(v.photo || '');
  const [services, setServices] = useState(v.services || []);
  const [drvSelId, setDrvSelId] = useState(() => {
    const hit = driverForVehicle({ ...v, agencyId: v.agencyId || agId });
    if (hit) return hit.id;
    if (v.drvName) return '__custom__';
    return '';
  });
  const [drvPhone, setDrvPhone] = useState(v.drvPhone || '');
  const [drvSim, setDrvSim] = useState(v.drvSim || '');
  const [drvSimExp, setDrvSimExp] = useState(v.drvSimExp || '');
  const [hasBackup, setHasBackup] = useState(v.hasBackup || '');
  const [backSelId, setBackSelId] = useState(() => {
    const hit = backupDriverForVehicle({ ...v, agencyId: v.agencyId || agId });
    if (hit) return hit.id;
    if (v.backName) return '__custom__';
    return '';
  });
  const [backPhone, setBackPhone] = useState(v.backPhone || '');
  const [backSim, setBackSim] = useState(v.backSim || '');
  const [backSimExp, setBackSimExp] = useState(v.backSimExp || '');
  const [docs, setDocs] = useState({});
  const [autofill, setAutofill] = useState(false);
  const [seatWarn, setSeatWarn] = useState('');
  const [VTOOL, setVTOOL] = useState('seat');
  const [VLAY, setVLAY] = useState(() => {
    if (vid) return vehLayoutRaw(vehicleById(vid)).map((c) => ({ sid: c.sid, type: c.type }));
    return defaultVLAY();
  });
  const [VSEQ, setVSEQ] = useState(() => (oldV?.seatSeq) || VLAY.reduce((a, c) => { const m = c.sid && /^A(\d+)$/.exec(c.sid); return m ? Math.max(a, +m[1]) : a; }, 6));

  const vehBack = () => { setVehEdit(null); setAgenTab('fleet'); go('agen'); };

  const handleOwn = (val) => {
    setOwnership(val);
    const isCoop = val === 'Milik Pengemudi';
    const hasOwn = !!val;
    if (!isCoop && hasOwn && autofill) {
      setAutofill(false);
      setOwnerNik(''); setOwnerPhone(''); setOwnerAddr(''); setOwnerEmail(''); setDrvPhone(''); setDrvSim(''); setDrvSimExp('');
      setCoopDriverId(''); setDrvSelId(''); setHasEmail('');
      toast('Isian otomatis milik pengemudi dikosongkan — silakan isi manual', 'info');
    }
  };

  const vehCoopFill = (id) => {
    setCoopDriverId(id);
    if (!id) return;
    const d = driverById(id);
    if (!d) return;
    if (d.nik) setOwnerNik(d.nik);
    if (d.phone) setOwnerPhone(d.phone);
    if (d.address) setOwnerAddr(d.address);
    const em = d.userEmail || (DB.load('users', []).find((x) => x.role === 'pengemudi' && x.agencyId === d.agencyId && (((x.phone || '') === (d.phone || '')) || ((x.name || '').toLowerCase() === (d.name || '').toLowerCase()))) || {}).email || '';
    if (em) { setOwnerEmail(em); setHasEmail('Ya'); }
    else toast('Pengemudi ini belum punya email di datanya — silakan ketik manual', 'warn');
    setDrvSelId(d.id);
    if (d.phone) setDrvPhone(d.phone);
    const simTxt = ((d.simType || '') + (d.simNumber ? ' - ' + d.simNumber : '')).trim();
    if (simTxt) setDrvSim(simTxt);
    if (d.simExp) { const y = String(d.simExp).slice(0, 4); if (/^\d{4}$/.test(y)) setDrvSimExp(y + '-01-01'); }
    setAutofill(true);
    toast('Form terisi dari data pengemudi: ' + d.name);
  };

  const vehDrvFill = (id) => {
    setDrvSelId(id);
    if (!id || id === '__custom__') return;
    const d = driverById(id);
    if (!d) return;
    if (d.phone) setDrvPhone(d.phone);
    const simTxt = ((d.simType || '') + (d.simNumber ? ' - ' + d.simNumber : '')).trim();
    if (simTxt) setDrvSim(simTxt);
    if (d.simExp) { const y = String(d.simExp).slice(0, 4); if (/^\d{4}$/.test(y)) setDrvSimExp(y + '-01-01'); }
    toast('Data pengemudi terisi: ' + d.name);
  };

  const vehBackFill = (id) => {
    setBackSelId(id);
    if (!id || id === '__custom__') return;
    const d = driverById(id);
    if (!d) return;
    if (d.phone) setBackPhone(d.phone);
    const simTxt = ((d.simType || '') + (d.simNumber ? ' - ' + d.simNumber : '')).trim();
    if (simTxt) setBackSim(simTxt);
    if (d.simExp) { const y = String(d.simExp).slice(0, 4); if (/^\d{4}$/.test(y)) setBackSimExp(y + '-01-01'); }
    toast('Data pengganti terisi: ' + d.name);
  };

  const doRenumber = (arr) => {
    let n = 1;
    arr.forEach((c) => { if (c.type === 'seat' || c.type === 'off') c.sid = 'A' + (n++); });
    setVSEQ(Math.max(6, n - 1));
    return arr;
  };

  const vPaintCell = (i) => {
    const next = VLAY.map((c) => ({ ...c }));
    const c = next[i];
    if (!c) return;
    if (VTOOL === 'driver') {
      const r = Math.floor(i / 4), a = r * 4 + 2, b = r * 4 + 3;
      if (next[a].type === 'driver' && next[b].type === 'driver') { setVLAY(doRenumber(next)); return; }
      for (const k of [a, b]) {
        const s = next[k];
        if (s && (s.type === 'seat' || s.type === 'off') && s.sid && vid && seatBookedFuture(vid, s.sid)) { toast('Bangku ' + s.sid + ' sudah terbooking — pilih baris lain untuk pengemudi', 'err'); return; }
      }
      next.forEach((x) => { if (x.type === 'driver') { x.type = 'empty'; x.sid = null; } });
      next[a] = { sid: 'DRV', type: 'driver' };
      next[b] = { sid: 'DRV2', type: 'driver' };
      setVLAY(doRenumber(next));
      return;
    }
    let idx = [i];
    if (c.type === 'driver') {
      const r = Math.floor(i / 4), a = r * 4 + 2, b = r * 4 + 3;
      if (next[a] && next[a].type === 'driver' && next[b] && next[b].type === 'driver') idx = [a, b];
    }
    for (const k of idx) {
      const s = next[k];
      if (VTOOL === 'seat') {
        if (s.type === 'seat') continue;
        if (s.type === 'off') { s.type = 'seat'; continue; }
        const used = new Set(next.map((x) => x.sid));
        let n = 1;
        while (used.has('A' + n)) n++;
        used.add('A' + n);
        s.type = 'seat';
        s.sid = 'A' + n;
      } else if (VTOOL === 'off') {
        if (s.type !== 'seat') { if (idx.length === 1) toast('Alat Nonaktif hanya untuk sel kursi', 'warn'); }
        else s.type = 'off';
      } else if (VTOOL === 'empty') { s.type = 'empty'; s.sid = null; }
      else { s.type = VTOOL; s.sid = null; }
    }
    setVLAY(doRenumber(next));
  };

  const saveVeh = () => {
    if (!agId) { toast('Sesi form kedaluwarsa — ulangi lagi', 'err'); return; }
    const arr = DB.load('vehicles', []);
    const seats = VLAY.filter((cc) => cc.type === 'seat');
    if (!seats.length) { toast('Minimal 1 petak kursi', 'err'); return; }
    if (drvBlocks(VLAY) !== 1) { toast('Pengemudi harus 1 blok gabungan kolom 3–4 dalam satu baris', 'err'); return; }
    const off = VLAY.filter((cc) => cc.type === 'off').map((cc) => cc.sid).filter(Boolean);
    const newSeatSids = seats.map((cc) => cc.sid);
    const old = vid ? arr.find((x) => x.id === vid) : null;
    const oldSeatSids = old ? (Array.isArray(old.layout) && old.layout.length === 28 ? old.layout.filter((cc) => cc.type === 'seat' || cc.type === 'off').map((cc) => cc.sid).filter(Boolean) : SEAT_LABELS) : [];
    const offIds = [...off, ...oldSeatSids.filter((s) => !newSeatSids.includes(s) && !off.includes(s))];
    if (vid) {
      const futSched = DB.load('schedules', []).filter((s) => s.vehicleId === vid && s.date >= todayStr(0));
      const clash = [];
      futSched.forEach((s) => { bookingsOf(s.id).forEach((b) => { (b.seats || []).forEach((st) => { if (offIds.includes(st)) clash.push(b.code + ' • ' + st + ' • ' + s.date + ' ' + s.time); }); }); });
      if (clash.length) {
        setSeatWarn('Tidak bisa dihapus/dinonaktifkan — sudah terbooking:\n• ' + clash.slice(0, 6).join('\n• ') + (clash.length > 6 ? '\n… +' + (clash.length - 6) + ' lainnya' : ''));
        toast('Bangku ' + [...new Set(clash.map((cc) => cc.split(' • ')[1]))].join(', ') + ' sudah terbooking user — batalkan/pindahkan dulu', 'err');
        audit('vehicle_seat_rejected', vid + ' • ' + offIds.join(','));
        return;
      }
    }
    const addedIds = newSeatSids.filter((s) => !oldSeatSids.includes(s));
    const gv = (s) => (s || '').trim();
    const own = ownership || '';
    if (!own) { toast('Pilih status kepemilikan dulu', 'err'); return; }
    const biz = own === 'Milik Pengemudi' ? '' : (own === 'Milik pribadi' ? '' : gv(ownerBiz));
    const onm = own === 'Milik Pengemudi' ? '' : gv(ownerName);
    const br = gv(brand), md = gv(model), pl = gv(plate), oph = gv(ownerPhone);
    if (own === 'Milik Pengemudi') { if (!coopDriverId) { toast('Pilih pengemudi pemilik dulu', 'err'); return; } }
    else { if (!onm) { toast('Isi nama pemilik armada dulu', 'err'); return; } }
    if ((own === 'Milik perusahaan' || own === 'Sewa / leasing') && !biz) { toast('Isi nama usaha / perusahaan dulu', 'err'); return; }
    if (!br || !md) { toast('Isi merek + tipe/model kendaraan dulu', 'err'); return; }
    const vYear = Number(year);
    if (!vYear || vYear < 1990 || vYear > 2035) { toast('Isi tahun kendaraan yang valid (1990–2035)', 'err'); return; }
    if (!pl) { toast('Isi nomor polisi / plat dulu', 'err'); return; }
    if (!oph || oph.replace(/\D/g, '').length < 9) { toast('No HP pemilik minimal 9 digit', 'err'); return; }
    const nik = gv(ownerNik).replace(/\D/g, '');
    if (nik.length !== 16) { toast('NIK pemilik harus 16 digit', 'err'); return; }
    const addr = gv(ownerAddr);
    if (!addr) { toast('Isi alamat lengkap pemilik dulu', 'err'); return; }
    const hEm = own === 'Milik Pengemudi' ? (((gv(ownerEmail) || old?.ownerEmail) ? 'Ya' : 'Tidak')) : (hasEmail || '');
    const oEm = own === 'Milik Pengemudi' ? (gv(ownerEmail) || old?.ownerEmail || '') : (hEm === 'Ya' ? gv(ownerEmail) : '');
    if (own === 'Milik Pengemudi') { if (!oEm || !oEm.includes('@')) { toast('Isi email pemilik yang valid dulu', 'err'); return; } }
    else if (!hEm) { toast('Pilih apakah pemilik memiliki email dulu', 'err'); return; }
    else if (hEm === 'Ya') { if (!oEm || !oEm.includes('@')) { toast('Isi email pemilik yang valid dulu', 'err'); return; } }
    const stnkPhoto = docs.stnkPhoto || old?.stnkPhoto || '';
    const ktpOwnerPhoto = docs.ktpOwnerPhoto || old?.ktpOwnerPhoto || '';
    if (!stnkPhoto) { toast('Upload foto STNK dulu', 'err'); return; }
    if (!ktpOwnerPhoto) { toast('Upload foto KTP pemilik dulu', 'err'); return; }
    if (!vtype) { toast('Pilih jenis kendaraan dulu', 'err'); return; }
    if (!status) { toast('Pilih status armada dulu', 'err'); return; }
    const col = gv(color);
    if (!col) { toast('Isi warna kendaraan dulu', 'err'); return; }
    const stk = gv(stnkExp);
    if (!stk) { toast('Isi masa berlaku STNK dulu', 'err'); return; }
    const pho = gv(photo);
    if (!pho) { toast('Isi URL foto armada dulu', 'err'); return; }
    if (!services.length) { toast('Pilih minimal 1 sistem layanan', 'err'); return; }
    const drvRef = (drvSelId && drvSelId !== '__custom__') ? driverById(drvSelId) : null;
    if (!drvRef || drvRef.agencyId !== agId) { toast('Pilih pengemudi dari daftar pengemudi agen dulu', 'err'); return; }
    const usedPlate = usedPlateFor(drvRef);
    if (usedPlate) { toast('Pengemudi ' + drvRef.name + ' sudah dipakai armada ' + usedPlate, 'err'); return; }
    if (!hasBackup) { toast('Pilih ketersediaan pengemudi pengganti dulu', 'err'); return; }
    const backRef = hasBackup === 'Ya' && backSelId && backSelId !== '__custom__' ? driverById(backSelId) : null;
    if (hasBackup === 'Ya' && (!backRef || backRef.agencyId !== agId)) { toast('Pilih pengemudi pengganti dari daftar agen', 'err'); return; }
    if (backRef) {
      if (sameDriver(drvRef, backRef)) { toast('Pengemudi utama dan pengganti tidak boleh orang yang sama', 'err'); return; }
      const backPlate = usedPlateFor(backRef);
      if (backPlate) { toast('Pengemudi pengganti ' + backRef.name + ' sudah dipakai armada ' + backPlate, 'err'); return; }
    }
    if (own === 'Milik Pengemudi') {
      const coop = driverById(coopDriverId);
      if (!coop || !sameDriver(coop, drvRef)) { toast('Pengemudi pemilik harus sama dengan pengemudi utama', 'err'); return; }
    }
    const phoneOf = (d, fallback) => gv(d && d.phone) || gv(fallback);
    const simOf = (d, fallback) => [d && d.simType, d && d.simNumber].filter(Boolean).join(' - ') || gv(fallback);
    const simExpOf = (d, fallback) => {
      const y = String((d && d.simExp) || '').slice(0, 4);
      return /^\d{4}$/.test(y) ? y + '-01-01' : gv(fallback);
    };
    const dph = phoneOf(drvRef, drvPhone);
    if (!dph || dph.replace(/\D/g, '').length < 9) { toast('No HP pengemudi minimal 9 digit', 'err'); return; }
    const dsim = simOf(drvRef, drvSim);
    if (!dsim) { toast('Isi nomor & jenis SIM pengemudi dulu', 'err'); return; }
    const dsimExp = simExpOf(drvRef, drvSimExp);
    if (!dsimExp) { toast('Isi masa berlaku SIM pengemudi dulu', 'err'); return; }
    const bph = backRef ? phoneOf(backRef, backPhone) : '';
    const bsim = backRef ? simOf(backRef, backSim) : '';
    const bsimExp = backRef ? simExpOf(backRef, backSimExp) : '';
    if (backRef && (!bph || bph.replace(/\D/g, '').length < 9)) { toast('No HP pengemudi pengganti minimal 9 digit', 'err'); return; }
    const data = {
      brand: br, model: md, year: vYear, color: col, plate: pl.toUpperCase(), chassis: old?.chassis || '', engine: old?.engine || '',
      vtype: vtype === 'Lainnya' ? (gv(vtypeOther) || 'Lainnya') : vtype, vtypeOther: gv(vtypeOther), baggage: old?.baggage || 'Sedang', tax: old?.tax || 'Aktif',
      stnkExp: stk, kir: old?.kir || '', condition: old?.condition || 'Baik', status, photo: pho, facilities,
      /* Periode dari pengajuan maintenance disimpan di koleksi request, bukan di armada.
         Field lama dibersihkan agar status legacy 'maintenance' benar-benar memblokir semua tanggal. */
      maintenanceFrom: '', maintenanceUntil: '', maintenanceRequestId: '',
      layout: VLAY.map((cc) => ({ sid: cc.sid, type: cc.type })), inactiveSeats: off, capacity: seats.length, seatSeq: VSEQ,
      ownerName: onm, ownerBiz: biz, ownerNik: nik, ownerAddr: addr, ownerPhone: oph, ownerEmail: oEm, ownership: own, coopDriverId: own === 'Milik Pengemudi' ? drvRef.id : '', hasEmail: hEm,
      docs: ['STNK', 'KTP pemilik'], docOther: old?.docOther || '', stnkPhoto, ktpOwnerPhoto,
      mainRoute: old?.mainRoute || '', origin: old?.origin || '', dest: old?.dest || '', freq: old?.freq || 'Setiap hari', freqOther: old?.freqOther || '',
      services, opSchedule: old?.opSchedule || '', coopTariff: old?.coopTariff || 0, coopSys: old?.coopSys || 'Bagi hasil', coopOther: old?.coopOther || '', fleetCount: old?.fleetCount || 1,
      driverId: drvRef.id, backDriverId: backRef ? backRef.id : '', driverConflict: false,
      hasDriver: 'Ya', drvName: drvRef.name, drvPhone: dph, drvSim: dsim, drvSimExp: dsimExp, drvExp: old?.drvExp || '',
      hasBackup, backName: backRef ? backRef.name : '', backPhone: backRef ? bph : '', backSim: backRef ? bsim : '', backSimExp: backRef ? bsimExp : ''
    };
    const reopened = vid ? ((old?.inactiveSeats || []).filter((s) => newSeatSids.includes(s))) : [];
    const opened = [...reopened, ...addedIds];
    if (vid) { Object.assign(old, data); } else { arr.push({ id: uid('V'), agencyId: agId, ...data }); }
    DB.save('vehicles', arr); refresh();
    audit('vehicle_save', (data.brand + (data.model ? ' ' + data.model : '')) + ' • ' + data.capacity + ' kursi' + (off.length ? ' • nonaktif: ' + off.join(',') : ''));
    if (vid && opened.length) {
      const affected = new Set();
      DB.load('bookings', []).filter((b) => { const s = DB.load('schedules', []).find((x) => x.id === b.scheduleId); return s && s.vehicleId === vid; }).forEach((b) => affected.add(b.userEmail));
      affected.forEach((em) => notify(em, 'Kursi dibuka kembali', 'Bangku ' + opened.join(', ') + ' pada armada ' + (data.brand + (data.model ? ' ' + data.model : '')) + ' (' + data.plate + ') kini tersedia.', 'app'));
    }
    toast('Data armada disimpan • layout 4×7 ' + data.capacity + ' kursi — sinkron ke semua user');
    setVehEdit(null);
    setAgenTab('fleet'); go('agen');
    refresh();
  };

  const delVeh = () => {
    if (!vid) return;
    if (!window.confirm('Hapus armada?')) return;
    DB.save('vehicles', DB.load('vehicles', []).filter((vv) => vv.id !== vid)); refresh();
    setVehEdit(null);
    setAgenTab('fleet'); go('agen');
    refresh();
  };

  const isCoop = ownership === 'Milik Pengemudi';

  /* Petunjuk pola gabung baris-1: tepat satu dari r1c1/r1c2 kursi, pasangannya kosong. */
  const benchHint = (VLAY[0].type === 'seat' && VLAY[1].type === 'empty') || (VLAY[0].type === 'empty' && VLAY[1].type === 'seat');

  let seatCells = [];
  {
    let skip = false;
    VLAY.forEach((cc, i) => {
      if (skip) { skip = false; return; }
      if (cc.type === 'driver' && VLAY[i + 1] && VLAY[i + 1].type === 'driver' && (i % 4) === 2) {
        seatCells.push(
          <button key={i} type="button" onClick={() => vPaintCell(i)} aria-label="Pengemudi (kolom 3-4 gabung)" className="rounded-xl border-2 border-[#0b2447] bg-[#0b2447] text-white h-[58px] min-h-[54px] flex items-center justify-center gap-1.5 font-extrabold text-[11px] active:scale-95 transition" style={{ gridColumn: 'span 2' }}><Icon name="circle-gauge" className="w-5 h-5 pointer-events-none" /><span className="pointer-events-none">PENGEMUDI</span></button>
        );
        skip = true;
        return;
      }
      seatCells.push(
        <button key={i} type="button" onClick={() => vPaintCell(i)} aria-label={'Sel ' + (i + 1) + ' ' + cc.type} className={'rounded-xl border-2 ' + VCELLCLS[cc.type] + ' h-[58px] min-h-[54px] flex flex-col items-center justify-center font-extrabold active:scale-95 transition'}><Icon name={VCELLICON[cc.type]} className="w-4 h-4 pointer-events-none" /><span className="text-[9px] leading-tight mt-0.5 pointer-events-none">{cc.type === 'empty' ? 'R' + (Math.floor(i / 4) + 1) + 'C' + ((i % 4) + 1) : vCellLabel(cc)}</span></button>
      );
    });
  }

  return (
    <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
      <div className="flex items-center gap-2"><button onClick={vehBack} className="bg-slate-100 hover:bg-slate-200 active:scale-95 transition p-2.5 rounded-xl cursor-pointer" aria-label="Kembali ke data armada"><Icon name="arrow-left" className="w-4 h-4 pointer-events-none" /></button><h2 className="font-extrabold text-[18px]">{vid ? 'Edit' : 'Tambah'} Armada</h2></div>
      <Sec index="A" title="A. DATA PEMILIK ARMADA / MITRA" />
      <div className="space-y-2.5">
        <div><label className="text-[12px] font-extrabold">STATUS KEPEMILIKAN KENDARAAN <span className="text-red-500">*</span></label><PillRadios options={V_OWN} value={ownership} onChange={handleOwn} /></div>
        <div className={(!ownership || ownership === 'Milik Pengemudi') ? 'hidden' : ''}><label className="text-[12px] font-extrabold">NAMA LENGKAP PEMILIK <span className="text-red-500">*</span></label><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="cth: H. Muhammad Nur" className={'w-full mt-1 ' + inC} /></div>
        <div className={(!ownership || ownership === 'Milik pribadi' || ownership === 'Milik Pengemudi') ? 'hidden' : ''}><label className="text-[12px] font-extrabold">NAMA USAHA / PERUSAHAAN <span className="text-red-500">*</span></label><input value={ownerBiz} onChange={(e) => setOwnerBiz(e.target.value)} placeholder="cth: Barakah Travel" className={'w-full mt-1 ' + inC} /></div>
        <div className={ownership === 'Milik Pengemudi' ? '' : 'hidden'}><label className="text-[12px] font-extrabold">PILIH PENGEMUDI (MILIK PENGEMUDI) <span className="text-red-500">*</span></label><select value={coopDriverId} onChange={(e) => vehCoopFill(e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih pengemudi —</option>{driverOptions}</select></div>
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">NOMOR KTP / NIK <span className="text-red-500">*</span></label><input value={ownerNik} onChange={(e) => setOwnerNik(e.target.value)} inputMode="numeric" maxLength={16} placeholder="16 digit" className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">NO HP / WHATSAPP <span className="text-red-500">*</span></label><input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} inputMode="tel" placeholder="cth: 0812xxxxxxx" className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">ALAMAT LENGKAP <span className="text-red-500">*</span></label><input value={ownerAddr} onChange={(e) => setOwnerAddr(e.target.value)} placeholder="cth: Jl. Merdeka No.12, Calang" className={'w-full mt-1 ' + inC} /></div>
        <div className={(!ownership || ownership === 'Milik Pengemudi') ? 'hidden' : ''}><label className="text-[12px] font-extrabold">APAKAH PEMILIK MEMILIKI EMAIL? <span className="text-red-500">*</span></label><PillRadios options={['Ya', 'Tidak']} value={hasEmail} onChange={setHasEmail} /></div>
        <div className={(ownership && ownership !== 'Milik Pengemudi' && hasEmail === 'Ya') || isCoop ? '' : 'hidden'}><label className="text-[12px] font-extrabold">EMAIL <span className="text-red-500">*</span></label><input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="cth: pemilik@email.com" className={'w-full mt-1 ' + inC} /></div>
      </div>
      <Sec index="B" title="B. DATA KENDARAAN / ARMADA" />
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">MEREK KENDARAAN <span className="text-red-500">*</span></label><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="cth: Toyota" className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">TIPE / MODEL <span className="text-red-500">*</span></label><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="cth: Innova Reborn" className={'w-full mt-1 ' + inC} /></div></div>
        <div className="grid grid-cols-3 gap-2.5"><div><label className="text-[12px] font-extrabold">TAHUN <span className="text-red-500">*</span></label><input type="number" min={1990} max={2035} value={year} onChange={(e) => setYear(e.target.value)} placeholder="cth: 2022" className={'w-full mt-1 ' + inC} /></div>
          <div className="col-span-2"><label className="text-[12px] font-extrabold">WARNA <span className="text-red-500">*</span></label><input value={color} onChange={(e) => setColor(e.target.value)} placeholder="cth: Hitam" className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">NOMOR POLISI / PLAT <span className="text-red-500">*</span></label><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="cth: BL 1234 AA" className={'w-full mt-1 ' + inC} /></div>
        <div><label className="text-[12px] font-extrabold">JENIS KENDARAAN <span className="text-red-500">*</span></label><PillRadios options={V_TYPES} value={vtype} onChange={setVtype} /></div>
        <div className={vtype === 'Lainnya' ? '' : 'hidden'}><label className="text-[12px] font-extrabold">JENIS LAINNYA</label><input value={vtypeOther} onChange={(e) => setVtypeOther(e.target.value)} placeholder="cth: Sebutkan jenisnya" className={'w-full mt-1 ' + inC} /></div>
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">MASA BERLAKU STNK <span className="text-red-500">*</span></label><input type="date" value={stnkExp} onChange={(e) => setStnkExp(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">STATUS ARMADA <span className="text-red-500">*</span></label><select value={status} onChange={(e) => setStatus(e.target.value)} className={inC + ' w-full mt-1'}><option value="">— Pilih —</option><option value="aktif">aktif</option>{(oldV?.status === 'maintenance' || status === 'maintenance') ? <option value="maintenance">maintenance (legacy — semua tanggal)</option> : null}</select>
            {status === 'maintenance' ? <div className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-1.5">Status legacy ini memblokir semua tanggal. Untuk maintenance terjadwal maksimal 2 hari, gunakan pengajuan pengemudi di tab Maintenance.</div> : null}</div></div>
        <div><label className="text-[12px] font-extrabold">FASILITAS (boleh pilih lebih dari 1)</label><CheckPills options={V_FAC} values={facilities} onChange={setFacilities} /></div>
        <div><label className="text-[12px] font-extrabold">URL FOTO ARMADA <span className="text-red-500">*</span></label><input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="URL foto armada" className={'w-full mt-1 ' + inC} /></div>
      </div>
      <Sec index="C" title="C. DOKUMEN KENDARAAN" />
      <div className="grid grid-cols-2 gap-2.5">
        <UpBox title="STNK (FOTO)" req src={docs.stnkPhoto || oldV?.stnkPhoto || ''} onPick={(d) => setDocs((p) => ({ ...p, stnkPhoto: d }))} />
        <UpBox title="KTP PEMILIK (FOTO)" req src={docs.ktpOwnerPhoto || oldV?.ktpOwnerPhoto || ''} onPick={(d) => setDocs((p) => ({ ...p, ktpOwnerPhoto: d }))} />
      </div>
      <Sec index="D" title="D. RENCANA OPERASIONAL ARMADA" />
      <div className="space-y-2.5">
        <div><label className="text-[12px] font-extrabold">SISTEM LAYANAN (boleh pilih lebih dari 1) <span className="text-red-500">*</span></label><CheckPills options={V_SERVICES} values={services} onChange={setServices} /></div>
      </div>
      <Sec index="E" title="E. DATA PENGEMUDI" />
      <div className="space-y-2.5">
        <div className="text-[11.5px] text-slate-500 font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">Nama boleh sama. Pilih berdasarkan HP/SIM. Satu pengemudi hanya boleh terpasang di satu armada, baik sebagai pengemudi utama maupun pengganti.</div>
        {oldV?.driverConflict ? <div className="text-[11.5px] font-bold text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2">Data pengemudi armada ini bentrok dengan armada lain. Pilih pengemudi pengganti yang belum dipakai untuk memperbaiki data.</div> : null}
        <div><label className="text-[12px] font-extrabold">NAMA PENGEMUDI <span className="text-red-500">*</span></label><select value={drvSelId} onChange={(e) => vehDrvFill(e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih pengemudi —</option>{driverOptions}{drvSelId === '__custom__' ? <option value="__custom__">{oldV?.drvName} • data lama perlu dipilih ulang</option> : null}</select></div>
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">NO HP / WHATSAPP PENGEMUDI <span className="text-red-500">*</span></label><input value={drvPhone} onChange={(e) => setDrvPhone(e.target.value)} inputMode="tel" placeholder="cth: 0812xxxxxxx" className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">NOMOR & JENIS SIM <span className="text-red-500">*</span></label><input value={drvSim} onChange={(e) => setDrvSim(e.target.value)} placeholder="cth: A - 123456" className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">MASA BERLAKU SIM <span className="text-red-500">*</span></label><input type="date" value={drvSimExp} onChange={(e) => setDrvSimExp(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
        <div><label className="text-[12px] font-extrabold">TERSEDIA PENGEMUDI PENGGANTI? <span className="text-red-500">*</span></label><PillRadios options={['Ya', 'Tidak']} value={hasBackup} onChange={setHasBackup} /></div>
        <div className={(hasBackup || '') === 'Ya' ? 'space-y-2.5' : 'hidden space-y-2.5'}>
          <div><label className="text-[12px] font-extrabold">NAMA PENGEMUDI PENGGANTI <span className="text-red-500">*</span></label><select value={backSelId} onChange={(e) => vehBackFill(e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih pengemudi —</option>{driverOptions}{backSelId === '__custom__' ? <option value="__custom__">{oldV?.backName} • data lama perlu dipilih ulang</option> : null}</select></div>
          <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">NO HP / WHATSAPP PENGGANTI</label><input value={backPhone} onChange={(e) => setBackPhone(e.target.value)} inputMode="tel" placeholder="cth: 0812xxxxxxx" className={'w-full mt-1 ' + inC} /></div>
            <div><label className="text-[12px] font-extrabold">NOMOR & JENIS SIM</label><input value={backSim} onChange={(e) => setBackSim(e.target.value)} placeholder="cth: A - 123456" className={'w-full mt-1 ' + inC} /></div></div>
          <div><label className="text-[12px] font-extrabold">MASA BERLAKU SIM PENGGANTI</label><input type="date" value={backSimExp} onChange={(e) => setBackSimExp(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
        </div>
      </div>
      <Sec index="F" title="F. KONFIGURASI BANGKU 4×7 *" />
      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5">
        <div className="flex items-center justify-between"><span className="text-[12px] font-extrabold tracking-wide">PETAK KURSI <span className="badge bg-sky-600 text-white ml-1">{VLAY.filter((cc) => cc.type === 'seat').length} kursi • {drvBlocks(VLAY)} pengemudi</span></span><Icon name="layout-grid" className="w-4 h-4 text-sky-600" /></div>
        <p className="text-[11.5px] text-slate-500 font-medium mt-1">Pilih alat lalu klik petak. Pengemudi selalu blok gabungan kolom 3–4 (setir kanan). Nomor kursi otomatis berurutan (A1, A2, …) dari kiri ke kanan, atas ke bawah. Kapasitas tempat duduk mengikuti jumlah bangku aktif ini.</p>
        <div className="mt-2.5"><div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">{VTOOLS.map((x) => <button key={x[0]} type="button" onClick={() => setVTOOL(x[0])} className={'rounded-xl border-2 ' + (VTOOL === x[0] ? 'border-sky-500 bg-sky-600 text-white shadow' : 'border-slate-200 bg-white text-slate-500') + ' py-2 flex flex-col items-center gap-0.5 text-[9px] font-extrabold active:scale-95'}><Icon name={x[1]} className="w-4 h-4 pointer-events-none" /><span className="pointer-events-none">{x[2]}</span></button>)}</div></div>
        <div className="mt-2.5"><div className="grid grid-cols-4 gap-1.5 sm:gap-2">{seatCells}</div></div>
        {benchHint ? <p className="mt-2 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 flex items-center gap-1.5"><Icon name="info" className="w-3.5 h-3.5 shrink-0" />R1C1 + R1C2 akan otomatis menjadi 1 bangku lebar "A1" saat disimpan</p> : null}
        {seatWarn ? <div className="mt-2.5 bg-red-50 border border-red-200 rounded-xl p-2.5 text-[12px] font-bold text-red-700 whitespace-pre-line">{seatWarn}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-5"><button onClick={vehBack} className="bg-slate-100 hover:bg-slate-200 active:scale-95 transition font-extrabold text-[14px] py-3 rounded-2xl cursor-pointer">Batal</button><button onClick={saveVeh} className="bg-sky-600 hover:bg-sky-500 active:scale-[.99] text-white font-extrabold text-[14px] py-3 rounded-2xl">Simpan</button></div>
      {vid ? <button onClick={delVeh} className="mt-2.5 w-full bg-red-50 text-red-600 font-extrabold text-[13px] py-3 rounded-2xl">Hapus Armada</button> : null}
    </div>
  );
}
