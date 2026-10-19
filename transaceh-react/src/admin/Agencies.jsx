import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyById, audit, kycSummary } from '@/lib/domain.js';
import { fmtRp, uid } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

export function agSetStatus(id, st, toast, refresh) {
  const arr = DB.load('agencies', []);
  const a = arr.find((x) => x.id === id);
  if (!a) return;
  a.status = st;
  DB.save('agencies', arr);
  refresh();
  const us = DB.load('users', []);
  let ch = false;
  us.filter((x) => x.role === 'agen' && x.agencyId === id).forEach((x) => { const ns = st === 'active' ? 'active' : 'suspended'; if (x.status !== ns) { x.status = ns; ch = true; } });
  if (ch) DB.save('users', us);
  refresh();
  audit('agency_status', id + ' → ' + st);
  toast('Agen ' + st);
  refresh();
}

function FeeModal({ id }) {
  const { toast, closeModal, refresh } = useApp();
  const a = agencyById(id);
  const [feeT, setFeeT] = useState(a.feeType);
  const [feeV, setFeeV] = useState(a.feeValue);
  const saveFee = () => {
    const arr = DB.load('agencies', []);
    const x = arr.find((y) => y.id === id);
    x.feeType = feeT; x.feeValue = Number(feeV) || 0;
    DB.save('agencies', arr);
    refresh();
    audit('fee_update', id + ' ' + x.feeType + ' ' + x.feeValue);
    closeModal();
    toast('Fee agen diperbarui');
    refresh();
  };
  return (
    <div className="p-6"><h3 className="font-extrabold">Fee Platform - {a.name}</h3>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <select value={feeT} onChange={(e) => setFeeT(e.target.value)} className="text-[13px] font-bold border-2 border-slate-200 rounded-xl px-3 py-2.5"><option value="percent">Persen %</option><option value="flat">Flat Rp</option></select>
        <input type="number" value={feeV} onChange={(e) => setFeeV(e.target.value)} className="text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5" />
      </div>
      <button onClick={saveFee} className="mt-3 w-full bg-violet-600 text-white font-extrabold py-3 rounded-2xl">Simpan Fee</button></div>
  );
}

function AgFormModal() {
  const { toast, closeModal, refresh } = useApp();
  const [naN, setNaN] = useState('');
  const [naE, setNaE] = useState('');
  const [naP, setNaP] = useState('');
  const saveAg = () => {
    const arr = DB.load('agencies', []);
    const id = uid('AG');
    arr.push({ id, name: naN || 'Travel Baru', address: naP || '-', phone: '-', bank: '-', status: 'pending', feeType: 'percent', feeValue: 8, refundPolicy: [{ minH: 72, pct: 100 }, { minH: 24, pct: 50 }, { minH: 0, pct: 0 }], rating: 5.0, trips: 0 });
    DB.save('agencies', arr);
    refresh();
    const us = DB.load('users', []);
    us.push({ id: uid('U'), name: naN || 'Agen', email: naE || ('agen' + Date.now() + '@mail.com'), phone: '-', wa: '-', pass: 'agen123', role: 'agen', agencyId: id, status: 'pending' });
    DB.save('users', us);
    refresh();
    audit('agency_register', naN);
    closeModal();
    toast('Agen didaftarkan, menunggu approval');
    refresh();
  };
  return (
    <div className="p-6"><h3 className="font-extrabold text-[17px]">Registrasi Travel Agen</h3>
      <div className="space-y-2.5 mt-3">
        <input value={naN} onChange={(e) => setNaN(e.target.value)} placeholder="Nama travel" className="w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
        <input value={naE} onChange={(e) => setNaE(e.target.value)} placeholder="Email agen" className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
        <input value={naP} onChange={(e) => setNaP(e.target.value)} placeholder="No HP / Alamat" className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      </div>
      <button onClick={saveAg} className="mt-3 w-full bg-sky-600 text-white font-extrabold py-3 rounded-2xl">Daftarkan (status pending)</button></div>
  );
}

/* Alamat bisa objek berjenjang (kota/kecamatan/kelurahan) atau teks bebas (data lama) */
function fmtAlamat(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return [a.jalan, a.rtRw && 'RT/RW ' + a.rtRw, a.kelurahan, a.kecamatan, a.kota, a.provinsi, a.kodePos].filter(Boolean).join(', ');
}

function KycModal({ id }) {
  const { closeModal } = useApp();
  const ag = agencyById(id);
  const k = (ag && ag.kyc) || {};
  const s = kycSummary(ag);
  const [tab, setTab] = useState('diri');
  const al = k.alamat || {};
  const dg = k.darurat || {};
  const row = (l, v) => (v ? <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-[12.5px]"><span className="text-slate-500 font-semibold shrink-0">{l}</span><b className="text-right">{v}</b></div> : null);
  const alamat = fmtAlamat(al);
  return (
    <div className="p-6 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center"><h3 className="font-extrabold text-[17px]">Kelengkapan Data — {ag.name}</h3><div className="flex-1"></div>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="flex gap-1.5 mt-3">{[['diri', 'Data Diri'], ['usaha', 'Legalitas & Rekening'], ['dok', 'Dokumen']].map(([v, l]) => (
        <button key={v} onClick={() => setTab(v)} className={'px-3 py-2 rounded-xl text-[12px] font-extrabold ' + (tab === v ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500')}>{l}</button>
      ))}</div>
      {tab === 'diri' ? <div className="mt-3 bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Jenis agen', k.jenis)}{row('Nama lengkap', k.nama)}{row('NIK', k.nik)}{row('Tempat, tgl lahir', (k.tmpLahir || '') + (k.tglLahir ? ' • ' + k.tglLahir : ''))}
        {row('Jenis kelamin', k.gender)}{row('Agama', k.agama)}{row('Alamat domisili', alamat)}
        {row('No HP', k.hp)}{row('Email', k.email)}
        {row('Kontak darurat', (dg.nama || '') + (dg.hubungan ? ' (' + dg.hubungan + ')' : '') + (dg.hp ? ' • ' + dg.hp : ''))}
        {!k.nik ? <div className="text-[12.5px] font-bold text-slate-400 py-2">Belum ada data — agen belum mengisi tahap kelengkapan.</div> : null}
      </div> : null}
      {tab === 'usaha' ? <div className="mt-3 bg-slate-50 rounded-2xl px-3.5 py-1">
        {k.jenis === 'Badan Usaha (PT/CV)' ? <>
          {row('Badan usaha', k.badanNama)}{row('Bentuk usaha', k.badanBentuk)}{row('NPWP', k.npwpUsaha)}{row('NIB', k.nib)}
          {row('Nomor akta', k.aktaNo)}{row('Direktur', k.direktur)}{row('Alamat usaha', fmtAlamat(k.alamatUsaha))}
        </> : <div className="text-[12.5px] font-bold text-slate-500 py-2">Agen terdaftar sebagai Perorangan / Freelance — legalitas badan usaha tidak berlaku.</div>}
        {row('Bank', k.bank)}{row('No rekening', k.rekeningNo)}{row('Pemilik rekening', k.rekeningNama)}
        {row('NPWP pemohon', k.npwpSamaKtp === false ? k.npwp : (k.nik ? 'Sama dengan NIK • ' + k.nik : ''))}
      </div> : null}
      {tab === 'dok' ? <div className="mt-3 text-[12.5px] font-bold text-slate-500 py-2">Dokumen: {s.docsFilled}/{s.docsTotal} terunggah. {s.status === 'diajukan' ? 'Pengajuan sudah dikirim agen.' : 'Belum dikirim.'}</div> : null}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className={'rounded-xl px-3 py-2 text-center text-[11.5px] font-extrabold ' + (s.dataOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>Data Diri</div>
        <div className={'rounded-xl px-3 py-2 text-center text-[11.5px] font-extrabold ' + (s.docsOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>Dokumen</div>
        <div className={'rounded-xl px-3 py-2 text-center text-[11.5px] font-extrabold ' + (s.termsOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>S&amp;K</div>
      </div>
    </div>
  );
}

export function Agencies() {
  const { toast, refresh, openModal } = useApp();
  const ags = DB.load('agencies', []);
  const agReject = (id) => {
    const a = agencyById(id);
    if (!a) return;
    const hasData = DB.load('vehicles', []).some((v) => v.agencyId === id) || DB.load('drivers', []).some((d) => d.agencyId === id) || DB.load('schedules', []).some((s) => s.agencyId === id);
    if (hasData) { toast('Agen punya data operasional - suspend saja', 'err'); return; }
    if (!window.confirm('Tolak & hapus pengajuan ' + a.name + '?')) return;
    DB.save('agencies', DB.load('agencies', []).filter((x) => x.id !== id));
    refresh();
    DB.save('users', DB.load('users', []).filter((x) => !(x.role === 'agen' && x.agencyId === id)));
    refresh();
    audit('agency_reject', a.name);
    toast('Pengajuan ' + a.name + ' ditolak', 'info');
    refresh();
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <div className="flex items-center"><h3 className="font-extrabold text-[16px]">Manajemen Travel Agen</h3><div className="flex-1"></div>
        <button onClick={() => openModal(<AgFormModal />)} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Registrasi Agen</button></div>
      <div className="grid md:grid-cols-2 gap-3 mt-3">
        {ags.map((a) => (
          <div key={a.id} className="border-2 border-slate-100 rounded-3xl p-4 flex gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white font-extrabold text-xl flex items-center justify-center shrink-0">{(a.name || '?')[0]}</div>
            <div className="flex-1 min-w-0"><div className="font-extrabold text-[14px]">{a.name}</div><div className="text-[12px] text-slate-500 font-medium">{a.address}</div>
              <div className="text-[12px] font-bold mt-0.5">Fee: {a.feeType === 'flat' ? fmtRp(a.feeValue) : a.feeValue + '%'} • ★{a.rating}</div>
              <div className="flex gap-1.5 mt-2 flex-wrap"><span className={`badge ${a.status === 'active' ? 'bg-green-100 text-green-700' : a.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{a.status}</span>
                {a.status === 'pending' ? (() => { const s = kycSummary(a); return <>
                  <span className={`badge ${s.dataOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>Data Diri {s.dataOk ? '✓' : '—'}</span>
                  <span className={`badge ${s.docsOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>Dokumen {s.docsOk ? '✓' : '—'}</span>
                  <span className={`badge ${s.termsOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>S&amp;K {s.termsOk ? '✓' : '—'}</span>
                  <button onClick={() => openModal(<KycModal id={a.id} />)} className="badge bg-sky-100 text-sky-700 cursor-pointer">Detail</button>
                  {s.status === 'diajukan'
                    ? <button onClick={() => agSetStatus(a.id, 'active', toast, refresh)} className="badge bg-green-500 text-white cursor-pointer">Approve</button>
                    : <button disabled className="badge bg-slate-200 text-slate-400 cursor-not-allowed" title="Menunggu kelengkapan dikirim agen">Approve</button>}
                  <button onClick={() => agReject(a.id)} className="badge bg-red-100 text-red-600 cursor-pointer">Tolak</button>
                </>; })() : null}
                {a.status === 'active' ? <button onClick={() => agSetStatus(a.id, 'suspended', toast, refresh)} className="badge bg-red-100 text-red-600 cursor-pointer">Suspend</button> : <button onClick={() => agSetStatus(a.id, 'active', toast, refresh)} className="badge bg-sky-100 text-sky-700 cursor-pointer">Aktifkan</button>}
                <button onClick={() => openModal(<FeeModal id={a.id} />)} className="badge bg-violet-100 text-violet-700 cursor-pointer">Fee</button></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Agencies;
