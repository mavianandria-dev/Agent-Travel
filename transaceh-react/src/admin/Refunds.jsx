import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { refundPolicyOf, refundPolicyText, saveRefundPolicy } from '@/lib/domain.js';
import { Icon } from '@/components/ui.jsx';

const toRows = (policy) => policy.map((r) => ({ minD: Number(r.minH) / 24, pct: r.pct }));
const toPolicy = (rows) => rows.map((r) => ({ minH: Math.max(0, Math.round(Number(r.minD) || 0)) * 24, pct: r.pct }));

function PolicyCard({ ag, onApplyAll }) {
  const { toast, refresh } = useApp();
  const [rows, setRows] = useState(() => toRows(refundPolicyOf(ag.id)));
  const setRow = (i, key, val) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const removeRow = (i) => setRows((list) => (list.length <= 1 ? list : list.filter((_, idx) => idx !== i)));
  const addRow = () => setRows((list) => {
    const next = list.length ? Math.max(...list.map((r) => Math.round(Number(r.minD) || 0))) + 1 : 0;
    return [...list, { minD: next, pct: 0 }];
  });

  const save = () => {
    const res = saveRefundPolicy(ag.id, toPolicy(rows));
    if (!res.ok) { toast(res.msg, 'err'); return; }
    setRows(toRows(res.policy));
    refresh();
    toast('Kebijakan refund ' + ag.name + ' disimpan');
  };

  const applyAll = () => {
    const res = saveRefundPolicy(ag.id, toPolicy(rows));
    if (!res.ok) { toast(res.msg, 'err'); return; }
    setRows(toRows(res.policy));
    onApplyAll(res.policy);
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><Icon name="building-2" className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-[14.5px] truncate">{ag.name}</div>
          <div className="text-[11.5px] font-bold text-slate-400">{ag.status === 'active' ? 'Aktif' : ag.status === 'pending' ? 'Menunggu persetujuan' : 'Nonaktif'}</div>
        </div>
        <span className="badge bg-sky-50 text-sky-700">Tiket saja</span>
      </div>

      <div className="mt-3 bg-slate-50 rounded-2xl p-3 text-[12px] font-semibold text-slate-600">
        {refundPolicyText(toPolicy(rows))}
      </div>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-[10.5px] font-extrabold text-slate-400 tracking-wider">
          <span>MINIMAL (HARI)</span><span>REFUND TIKET (%)</span><span></span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2 items-center">
            <input type="number" min="0" step="1" value={r.minD} onChange={(e) => setRow(i, 'minD', e.target.value)} className="text-[13px] font-bold border-2 border-slate-200 rounded-xl px-2.5 py-2 focus-ring" />
            <input type="number" min="0" max="100" step="1" value={r.pct} onChange={(e) => setRow(i, 'pct', e.target.value)} className="text-[13px] font-bold border-2 border-slate-200 rounded-xl px-2.5 py-2 focus-ring" />
            <button onClick={() => removeRow(i)} disabled={rows.length <= 1} title="Hapus tier" className="w-9 h-9 rounded-xl bg-red-50 text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"><Icon name="trash-2" className="w-4 h-4 mx-auto" /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={addRow} className="text-[12px] font-extrabold text-sky-700 bg-sky-50 px-3 py-2 rounded-xl">+ Tambah Tier</button>
        <div className="flex-1"></div>
        <button onClick={applyAll} className="text-[12px] font-extrabold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">Terapkan ke Semua</button>
        <button onClick={save} className="text-[12px] font-extrabold text-white bg-[#0b2447] px-4 py-2 rounded-xl">Simpan</button>
      </div>
    </div>
  );
}

export default function Refunds() {
  const { toast, refresh } = useApp();
  const [version, setVersion] = useState(0);
  const agencies = DB.load('agencies', []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const applyAll = (policy) => {
    let ok = 0;
    DB.load('agencies', []).forEach((a) => {
      if (saveRefundPolicy(a.id, policy).ok) ok += 1;
    });
    setVersion((v) => v + 1);
    refresh();
    toast('Kebijakan refund diterapkan ke ' + ok + ' agen');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="settings" className="w-5 h-5 text-sky-600" />Kebijakan Refund Tiket</h3>
        <p className="text-[12.5px] text-slate-500 font-medium mt-1">Diatur super admin dan berlaku untuk pembatalan oleh pelanggan/agen. Refund dihitung dari komponen tiket; jasa agen dan fee platform tidak dikembalikan.</p>
        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-[12px] font-semibold">
          <div className="bg-sky-50 border border-sky-100 rounded-2xl px-3 py-2.5 text-sky-900"><b>Pelanggan / agen:</b> persentase tiket sesuai tabel di bawah. Booking belum dibayar = Rp0.</div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2.5 text-amber-900"><b>Sopir / agen membatalkan sepihak:</b> refund 100% total pembayaran, wajib alasan, sebelum berangkat.</div>
        </div>
        <p className="text-[11.5px] text-slate-400 font-medium mt-2">Tier 0 hari selalu ditambahkan otomatis sebagai batas bawah. Kebijakan baru berlaku untuk pembatalan berikutnya.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {agencies.map((a) => <PolicyCard key={a.id + ':' + version} ag={a} onApplyAll={applyAll} />)}
      </div>
      {!agencies.length ? <div className="bg-white rounded-3xl shadow-card p-5 text-center text-[13px] font-bold text-slate-400">Belum ada agen.</div> : null}
    </div>
  );
}
