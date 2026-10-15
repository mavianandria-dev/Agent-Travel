import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, audit, uid } from '@/lib/domain.js';

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
  const [name, setName] = useState(a0.name || '');
  const [phone, setPhone] = useState(a0.phone || '');
  const [addr, setAddr] = useState(a0.address || '');
  const [bank, setBank] = useState(a0.bank || '');
  const [feeT, setFeeT] = useState(a0.feeType || 'percent');
  const [feeV, setFeeV] = useState(a0.feeValue || 0);
  const [nvC, setNvC] = useState('');
  const [nvV, setNvV] = useState('');
  const vouchers = DB.load('vouchers', []);

  const saveAgency = () => {
    const arr = DB.load('agencies', []);
    const a = arr.find((x) => x.id === agency.id);
    if (!a) { toast('Data travel tidak ditemukan', 'err'); return; }
    a.name = name;
    a.phone = phone;
    a.address = addr;
    a.bank = bank;
    a.feeType = feeT;
    a.feeValue = Number(feeV) || 0;
    DB.save('agencies', arr); refresh();
    audit('agency_update', a.name);
    toast('Pengaturan travel disimpan');
    refresh();
  };

  const addVoucher = () => {
    const v = DB.load('vouchers', []);
    v.push({ code: (nvC || 'PROMO').toUpperCase(), type: 'flat', value: Number(nvV) || 10000, quota: 50, used: 0, active: true, desc: 'Voucher agen' });
    DB.save('vouchers', v); refresh();
    toast('Voucher dibuat');
    setNvC('');
    setNvV('');
    refresh();
  };

  const toggleVoucher = (code) => {
    const v = DB.load('vouchers', []);
    const m = v.find((x) => x.code === code);
    if (!m) return;
    m.active = !m.active;
    DB.save('vouchers', v); refresh();
    audit('voucher_toggle', code + ' → ' + (m.active ? 'aktif' : 'nonaktif'));
    toast('Voucher ' + code + (m.active ? ' diaktifkan' : ' dinonaktifkan'), 'info');
    refresh();
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px]">Profil Travel</h3>
        <div className="space-y-2.5 mt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
          <input value={addr} onChange={(e) => setAddr(e.target.value)} className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
          <input value={bank} onChange={(e) => setBank(e.target.value)} className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
          <div className="grid grid-cols-2 gap-2.5"><select value={feeT} onChange={(e) => setFeeT(e.target.value)} className="text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring"><option value="percent">Fee %</option><option value="flat">Fee flat Rp</option></select>
            <input type="number" value={feeV} onChange={(e) => setFeeV(e.target.value)} className="text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
        </div><button onClick={saveAgency} className="mt-3 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Simpan</button></div>
      <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px]">Kebijakan Refund & Voucher</h3>
        <div className="text-[12.5px] font-semibold bg-slate-50 rounded-2xl p-3 mt-2">{(a0.refundPolicy || []).map((p) => <div key={p.minH}>• H-{Math.round(p.minH / 24) || '0'} ({p.minH} jam): <b>{p.pct}%</b></div>)}</div>
        <div className="text-[12px] font-extrabold mt-3">VOUCHER AKTIF</div>
        {vouchers.map((vv) => <div key={vv.code} onClick={() => toggleVoucher(vv.code)} title="Klik untuk aktif/nonaktif" className="flex items-center gap-2 mt-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12.5px] font-bold cursor-pointer"><span className="font-mono">{vv.code}</span><span className="text-slate-500 font-medium flex-1">{vv.desc}</span><span className={`badge ${vv.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{vv.used}/{vv.quota}</span></div>)}
        <div className="flex gap-2 mt-2.5"><input value={nvC} onChange={(e) => setNvC(e.target.value)} placeholder="KODE" className="flex-1 text-[12px] font-mono font-bold uppercase border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><input value={nvV} onChange={(e) => setNvV(e.target.value)} type="number" placeholder="Nilai" className="w-24 text-[12px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><button onClick={addVoucher} className="bg-amber-400 px-3.5 rounded-xl font-extrabold">+</button></div>
      </div>
      <span className="hidden">{uid('x')}</span>
    </div>
  );
}
