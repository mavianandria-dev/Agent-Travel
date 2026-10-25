import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { uid } from '@/lib/utils.js';
import { agencyOf, audit, formatAlamat, kycSummary, syncAgencyProfileFromKyc, refundPolicyText } from '@/lib/domain.js';

export default function Setting({ ag }) {
  const { user, tick } = useApp();
  void tick;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  return <SettingInner key={agency.id} agency={agency} />;
}

function SettingInner({ agency }) {
  const { toast, refresh } = useApp();
  const a0 = DB.load('agencies', []).find((x) => x.id === agency.id) || agency;
  const k = a0.kyc || {};
  const isBadan = k.jenis === 'Badan Usaha (PT/CV)';
  const sum = kycSummary(a0);
  const ttl = [k.tmpLahir, k.tglLahir ? k.tglLahir.split('-').reverse().join('/') : ''].filter(Boolean).join(', ');
  const darurat = [k.darurat?.nama, k.darurat?.hubungan, k.darurat?.hp].filter(Boolean).join(' • ');
  const npwp = isBadan ? k.npwpUsaha : (k.npwpSamaKtp ? k.nik : k.npwp);
  const [name, setName] = useState(a0.name || '');
  const [nvC, setNvC] = useState('');
  const [nvV, setNvV] = useState('');
  const vouchers = DB.load('vouchers', []).filter((x) => !x.agencyId || x.agencyId === agency.id);

  const saveAgency = () => {
    const arr = DB.load('agencies', []);
    const a = arr.find((x) => x.id === agency.id);
    if (!a) { toast('Data travel tidak ditemukan', 'err'); return; }
    a.name = name;
    syncAgencyProfileFromKyc(a);
    DB.save('agencies', arr); refresh();
    audit('agency_update', a.name);
    toast('Profil travel disimpan');
    refresh();
  };

  const addVoucher = () => {
    const v = DB.load('vouchers', []);
    v.push({ id: uid('VC'), agencyId: agency.id, code: (nvC || 'PROMO').toUpperCase(), type: 'flat', value: Number(nvV) || 10000, quota: 50, used: 0, active: true, desc: 'Voucher agen' });
    DB.save('vouchers', v); refresh();
    toast('Voucher dibuat');
    setNvC('');
    setNvV('');
    refresh();
  };

  const toggleVoucher = (target) => {
    if (!target || target.agencyId !== agency.id) return;
    const v = DB.load('vouchers', []);
    const m = v.find((x) => (x.id && target.id ? x.id === target.id : x.code === target.code));
    if (!m || m.agencyId !== agency.id) return;
    m.active = !m.active;
    DB.save('vouchers', v); refresh();
    audit('voucher_toggle', m.code + ' → ' + (m.active ? 'aktif' : 'nonaktif'));
    toast('Voucher ' + m.code + (m.active ? ' diaktifkan' : ' dinonaktifkan'), 'info');
    refresh();
  };

  const row = (label, value) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-[12.5px]">
      <span className="text-slate-500 font-semibold shrink-0">{label}</span>
      <b className="text-right break-words max-w-[62%]">{value || '-'}</b>
    </div>
  );
  const group = (title, children) => (
    <div className="mt-3">
      <p className="text-[10.5px] font-extrabold text-slate-400 tracking-wider">{title}</p>
      <div className="bg-slate-50 rounded-2xl px-3.5 py-1 mt-1.5">{children}</div>
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h3 className="font-extrabold text-[15px]">Profil Travel</h3>
            <p className="text-[11.5px] text-slate-500 font-medium mt-0.5">Data identitas dan rekening mengikuti Kelengkapan Data Agen Travel.</p>
          </div>
          <span className={`badge shrink-0 ${sum.lengkap ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>KYC {sum.lengkap ? 'Lengkap' : 'Belum lengkap'}</span>
        </div>

        <div className="mt-3">
          <label className="text-[11px] font-extrabold text-slate-500">NAMA TRAVEL / BRAND</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
        </div>

        {sum.lengkap ? <>
          {group('DATA PEMOHON', <>
            {row('Jenis agen', k.jenis)}
            {row('Nama lengkap', k.nama)}
            {row('NIK', k.nik)}
            {row('Tempat, tgl lahir', ttl)}
            {row('Jenis kelamin', k.gender)}
            {row('Agama', k.agama)}
            {!isBadan ? row('NPWP', npwp ? (k.npwpSamaKtp ? npwp + ' (sama dengan KTP)' : npwp) : '') : null}
          </>)}

          {group('KONTAK & ALAMAT', <>
            {row('Email', k.email)}
            {row('No HP / WhatsApp', k.hp)}
            {row('Alamat domisili', formatAlamat(k.alamat))}
            {row('Kontak darurat', darurat)}
          </>)}

          {isBadan ? group('LEGALITAS USAHA', <>
            {row('Nama badan usaha', k.badanNama)}
            {row('Bentuk usaha', k.badanBentuk)}
            {row('NPWP badan usaha', k.npwpUsaha)}
            {row('NIB', k.nib)}
            {row('Nomor akta', k.aktaNo)}
            {row('Direktur', k.direktur)}
            {row('Alamat usaha', formatAlamat(k.alamatUsaha))}
          </>) : null}

          {group('REKENING BANK', <>
            {row('Bank', k.bank)}
            {row('Nomor rekening', k.rekeningNo)}
            {row('Nama pemilik', k.rekeningNama)}
          </>)}
        </> : (
          <div className="mt-3 bg-amber-50 border-2 border-amber-200 rounded-2xl px-3.5 py-3 text-[12.5px] font-semibold text-amber-800">
            Data kelengkapan belum lengkap. Lengkapi melalui halaman Kelengkapan Data Agen Travel.
          </div>
        )}

        <button onClick={saveAgency} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Simpan Profil</button>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px]">Kebijakan Refund &amp; Voucher</h3>
        <div className="text-[12.5px] font-semibold bg-slate-50 rounded-2xl p-3 mt-2"><div className="text-[12px] font-bold text-slate-600">{refundPolicyText(a0.refundPolicy)}</div><div className="text-[11.5px] font-medium text-slate-400 mt-1">Refund tiket diatur Super Admin. Hanya komponen tiket yang dikembalikan; jasa agen &amp; fee platform tidak.</div></div>
        <div className="text-[12px] font-extrabold mt-3">VOUCHER AKTIF</div>
        {vouchers.map((vv) => {
          const own = vv.agencyId === agency.id;
          return <div key={vv.id || vv.code} onClick={() => toggleVoucher(vv)} title={own ? 'Klik untuk aktif/nonaktif' : 'Voucher global diatur Super Admin'} className={`flex items-center gap-2 mt-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12.5px] font-bold ${own ? 'cursor-pointer' : 'opacity-75'}`}><span className="font-mono">{vv.code}</span><span className="text-slate-500 font-medium flex-1">{vv.desc}{own ? '' : ' • Global'}</span><span className={`badge ${vv.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{vv.used}/{vv.quota}</span></div>;
        })}
        <div className="flex gap-2 mt-2.5"><input value={nvC} onChange={(e) => setNvC(e.target.value)} placeholder="KODE" className="flex-1 text-[12px] font-mono font-bold uppercase border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><input value={nvV} onChange={(e) => setNvV(e.target.value)} type="number" placeholder="Nilai" className="w-24 text-[12px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><button onClick={addVoucher} className="bg-amber-400 px-3.5 rounded-xl font-extrabold">+</button></div>
      </div>
    </div>
  );
}
