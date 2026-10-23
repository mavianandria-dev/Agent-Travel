import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, driverById, driverForVehicle, backupDriverForVehicle, simLabel, simExpired, audit, todayStr, driverProfileStatus, approveDriverProfile, rejectDriverProfile, driverFieldLabel } from '@/lib/domain.js';
import { Icon, DocRow, DocPreview } from '@/components/ui.jsx';

const fmtVal = (v) => {
  const s = String(v == null ? '' : v);
  if (s.startsWith('data:image')) return '(foto baru)';
  return s || '-';
};

function VerifyModal({ id }) {
  const { closeModal, toast, refresh } = useApp();
  const [reason, setReason] = useState('');
  const d = driverById(id);
  if (!d) return <div className="p-6 font-bold text-slate-500">Data tidak ditemukan</div>;
  const st = driverProfileStatus(d);
  if (!st.hasPending) return <div className="p-6 font-bold text-slate-500">Tidak ada usulan perubahan dari driver ini.</div>;
  const approve = () => {
    const res = approveDriverProfile(id, 'agen');
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast(res.count + ' field usulan driver disetujui');
    refresh();
  };
  const reject = () => {
    if (!reason.trim()) { toast('Alasan penolakan wajib diisi', 'err'); return; }
    const res = rejectDriverProfile(id, reason, 'agen');
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast('Usulan driver ditolak');
    refresh();
  };
  return (
    <div className="p-6 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between"><h3 className="font-extrabold text-[16px]">Verifikasi Usulan — {d.name}</h3><button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
      <p className="text-[12.5px] text-slate-500 font-medium mt-1">Driver mengirim usulan perubahan. Data baru berlaku setelah Anda setujui.</p>
      <div className="space-y-2 mt-3">
        {Object.keys(st.pending).map((k) => (
          <div key={k} className="bg-slate-50 rounded-2xl p-3">
            <div className="text-[12.5px] font-extrabold">{driverFieldLabel(k)}</div>
            <div className="text-[12px] text-slate-500 font-medium mt-0.5">Lama: <span className="line-through">{fmtVal(d[k])}</span></div>
            <div className="text-[12px] font-semibold text-emerald-700 mt-0.5">Usulan: {fmtVal(st.pending[k])}</div>
          </div>
        ))}
      </div>
      <label className="block mt-3 text-[11px] font-extrabold text-slate-500">ALASAN PENOLAKAN (wajib bila menolak)</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="cth: NIK tidak sesuai dengan foto KTP" className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" />
      <div className="flex gap-2 mt-4">
        <button onClick={reject} className="flex-1 bg-red-500 text-white font-extrabold text-[13px] py-3 rounded-2xl">Tolak</button>
        <button onClick={approve} className="flex-1 bg-green-500 text-white font-extrabold text-[13px] py-3 rounded-2xl">Setujui</button>
      </div>
    </div>
  );
}

export function DrvDetail({ id }) {
  const { closeModal, openModal, setDrvEdit, go } = useApp();
  const d = driverById(id);
  if (!d) return <div className="p-6 font-bold text-slate-500">Data tidak ditemukan</div>;
  const row = (l, val) => <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-[13px]"><span className="text-slate-500 font-semibold shrink-0">{l}</span><b className="text-right">{val || '-'}</b></div>;
  const viewDoc = (title, src) => openModal(<DocPreview title={title} src={src} onBack={() => openModal(<DrvDetail id={d.id} />)} />);
  return (
    <div className="p-6 max-h-[85vh] overflow-y-auto"><div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0b2447] to-sky-600 text-white font-extrabold text-xl flex items-center justify-center shrink-0 overflow-hidden">{d.photo ? <img src={d.photo} className="w-full h-full object-cover" alt={d.name} /> : d.name[0]}</div>
      <div className="flex-1 min-w-0"><div className="font-extrabold text-[16px]">{d.name}</div><div className="text-[12px] text-slate-500 font-medium">{d.phone} • {simLabel(d)}</div></div>
      <button onClick={() => closeModal()} className="text-slate-400 shrink-0"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="flex gap-1.5 mt-2.5 flex-wrap"><span className={`badge ${d.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{d.status}</span>{simExpired(d) ? <span className="badge bg-red-100 text-red-600">SIM kedaluwarsa</span> : null}<span className="badge bg-amber-100 text-amber-700">★ {d.rating} • {d.trips} trip</span>{driverProfileStatus(d).hasPending ? <span className="badge bg-violet-100 text-violet-700">Perlu Verifikasi ({driverProfileStatus(d).pendingCount})</span> : null}</div>
      <h4 className="font-extrabold text-[13px] mt-4 mb-1">A. Data Diri</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Tempat, tgl lahir', (d.birthPlace || '') + (d.birthDate ? ' • ' + d.birthDate : ''))}{row('Jenis kelamin', d.gender)}{row('Alamat', d.address)}{row('NIK', d.nik)}{row('Pernikahan', d.marital)}{row('Pendidikan', d.education)}{row('Kontak darurat', (d.emName || '') + (d.emPhone ? ' • ' + d.emPhone : '') + (d.emRelation ? ' (' + d.emRelation + ')' : ''))}</div>
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">B. SIM</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Jenis', 'SIM ' + (d.simType || '-'))}{row('Nomor', d.simNumber)}{row('Masa berlaku', d.simExp || '-')}</div>
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">C. Akun</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Email login', d.userEmail)}{row('Bank', d.bank || '-')}</div>
      <div className="space-y-2 mt-3"><DocRow title="FOTO PROFIL" src={d.photo} onView={() => viewDoc('FOTO PROFIL', d.photo)} /><DocRow title="DOKUMEN SIM" src={d.simPhoto} onView={() => viewDoc('DOKUMEN SIM', d.simPhoto)} /></div>
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        {driverProfileStatus(d).hasPending ? <button onClick={() => openModal(<VerifyModal id={d.id} />)} className="col-span-2 bg-violet-600 text-white font-extrabold text-[13px] py-3 rounded-2xl">Verifikasi Usulan Driver ({driverProfileStatus(d).pendingCount})</button> : null}
        <button onClick={() => closeModal()} className="bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Tutup</button><button onClick={() => { closeModal(); setDrvEdit({ agId: d.agencyId, did: d.id }); go('agen-drvform'); }} className="bg-sky-600 text-white font-extrabold text-[13px] py-3 rounded-2xl">Edit</button></div></div>
  );
}

export default function Drivers({ ag }) {
  const { user, openModal, setDrvEdit, go, toast, refresh, tick } = useApp();
  void tick;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const ds = DB.load('drivers', []).filter((d) => d.agencyId === agency.id);

  const delDrv = (id) => {
    const assigned = DB.load('vehicles', []).find((v) => {
      const d = driverForVehicle(v);
      const b = backupDriverForVehicle(v);
      return (d && d.id === id) || (b && b.id === id);
    });
    if (assigned) { toast('Pengemudi masih terpasang di armada ' + (assigned.plate || assigned.id) + ' — lepas dulu', 'err'); return; }
    if (DB.load('schedules', []).some((s) => s.driverId === id && s.date >= todayStr(0))) { toast('Pengemudi punya jadwal aktif — tidak bisa dihapus', 'err'); return; }
    if (!window.confirm('Hapus pengemudi + akun loginnya?')) return;
    const d = driverById(id);
    DB.save('drivers', DB.load('drivers', []).filter((x) => x.id !== id)); refresh();
    if (d && d.userEmail) {
      const em = d.userEmail.toLowerCase();
      const stillUsed = DB.load('drivers', []).some((x) => x.userEmail && x.userEmail.toLowerCase() === em);
      if (!stillUsed) { DB.save('users', DB.load('users', []).filter((x) => !(x.email === em && x.role === 'pengemudi'))); refresh(); }
    }
    const rs = DB.load('routes', []);
    let rc = false;
    rs.forEach((r) => {
      const ids = (r.driverIds || []).filter((x) => x !== id);
      if (ids.length !== (r.driverIds || []).length) { r.driverIds = ids; if (r.driverId === id) r.driverId = ids[0] || null; rc = true; }
    });
    if (rc) { DB.save('routes', rs); refresh(); }
    audit('driver_delete', d ? d.name : id);
    toast('Pengemudi dihapus', 'info');
    refresh();
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5"><div className="flex items-center"><h3 className="font-extrabold text-[16px]">Data Pengemudi ({ds.length})</h3><div className="flex-1"></div>
      <button onClick={() => { setDrvEdit({ agId: agency.id }); go('agen-drvform'); }} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Tambah Pengemudi</button></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">{ds.map((d) => {
        const pst = driverProfileStatus(d);
        return (
        <div key={d.id} onClick={() => openModal(<DrvDetail id={d.id} />)} className="border-2 border-slate-100 rounded-3xl p-4 card-hover flex gap-3 cursor-pointer">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0b2447] to-sky-600 text-white font-extrabold text-xl flex items-center justify-center shrink-0 overflow-hidden">{d.photo ? <img src={d.photo} className="w-full h-full object-cover" alt={d.name} /> : d.name[0]}</div>
          <div className="flex-1 min-w-0"><div className="font-extrabold text-[14px]">{d.name}</div><div className="text-[12px] text-slate-500 font-medium">{d.phone} • {simLabel(d)}</div>{simExpired(d) ? <span className="badge bg-red-100 text-red-600 !text-[10px] mt-1">SIM kedaluwarsa</span> : null}
            <div className="text-[12px] font-bold text-amber-600">★ {d.rating} • {d.trips} trip</div>
            <div className="flex items-center gap-2 mt-1.5"><span className={`badge ${d.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{d.status}</span>
              {pst.hasPending ? <button onClick={(e) => { e.stopPropagation(); openModal(<VerifyModal id={d.id} />); }} className="badge bg-violet-100 text-violet-700 cursor-pointer">Verifikasi ({pst.pendingCount})</button> : null}
              <button onClick={(e) => { e.stopPropagation(); setDrvEdit({ agId: agency.id, did: d.id }); go('agen-drvform'); }} className="text-sky-600"><Icon name="pencil" className="w-4 h-4 pointer-events-none" /></button><button onClick={(e) => { e.stopPropagation(); delDrv(d.id); }} className="text-red-400"><Icon name="trash-2" className="w-4 h-4 pointer-events-none" /></button></div></div></div>
        );
      })}</div></div>
  );
}
