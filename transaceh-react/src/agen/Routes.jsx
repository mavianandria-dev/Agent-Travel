import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { saveRouteRequest } from '@/lib/domain.js';
import { fmtRp, REGIONS } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';

const STATUS = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600' };
const STATUS_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

function RequestRouteModal({ ag }) {
  const { toast, closeModal, refresh } = useApp();
  const myRoutes = DB.load('routes', []).filter((r) => (r.agencyIds || []).includes(ag.id));
  const [type, setType] = useState('rute-baru');
  const [routeId, setRouteId] = useState(myRoutes[0]?.id || '');
  const [from, setFrom] = useState('Aceh Jaya');
  const [to, setTo] = useState('Banda Aceh');
  const [pickup, setPickup] = useState('');
  const [note, setNote] = useState('');
  const submit = () => {
    if (type === 'titik-jemput') {
      const r = myRoutes.find((x) => x.id === routeId);
      if (!r) { toast('Pilih rute dulu', 'err'); return; }
      if (!pickup.trim()) { toast('Isi titik jemput usulan', 'err'); return; }
      saveRouteRequest({ agencyId: ag.id, type, from: r.from, to: r.to, pickup, note });
    } else {
      if (from === to) { toast('Kota asal dan tujuan tidak boleh sama', 'err'); return; }
      saveRouteRequest({ agencyId: ag.id, type, from, to, pickup, note });
    }
    refresh(); closeModal(); toast('Usulan terkirim — menunggu persetujuan admin');
  };
  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[16px]">Usulkan Rute</h3>
      <div className="flex gap-1.5 mt-3">
        {[['rute-baru', 'Rute Baru'], ['titik-jemput', 'Titik Jemput']].map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} className={`flex-1 text-[12.5px] font-extrabold px-3 py-2.5 rounded-xl ${type === v ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500'}`}>{l}</button>
        ))}
      </div>
      {type === 'titik-jemput' ? (
        <div className="mt-3"><label className="text-[12px] font-extrabold">RUTE <span className="text-red-500">*</span></label>
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
            {myRoutes.map((r) => (<option key={r.id} value={r.id}>{r.from} → {r.to}</option>))}
          </select></div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <div><label className="text-[12px] font-extrabold">DARI <span className="text-red-500">*</span></label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
          <div><label className="text-[12px] font-extrabold">KE <span className="text-red-500">*</span></label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
        </div>
      )}
      <div className="mt-3"><label className="text-[12px] font-extrabold">TITIK JEMPUT USULAN {type === 'titik-jemput' ? <span className="text-red-500">*</span> : '(opsional)'}</label>
        <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="cth: Simpang Lima" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">CATATAN (opsional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan usulan…" rows={2} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      <button onClick={submit} className="btn-touch mt-4 w-full bg-sky-600 text-white font-extrabold py-3 rounded-2xl">Kirim Usulan</button>
    </div>
  );
}

export default function Routes({ ag }) {
  const { openModal } = useApp();
  const routes = DB.load('routes', []).filter((r) => (r.agencyIds || []).includes(ag.id));
  const reqs = DB.load('routeRequests', []).filter((x) => x.agencyId === ag.id);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="flex items-center"><h3 className="font-extrabold text-[16px]">Rute Saya ({routes.length})</h3><div className="flex-1"></div>
          <button onClick={() => openModal(<RequestRouteModal ag={ag} />)} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Usulkan Rute</button></div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {routes.map((r) => (
            <div key={r.id} className="border-2 border-slate-100 rounded-3xl p-4">
              <div className="flex items-center gap-2 text-[14px] font-extrabold">{r.from} <Icon name="arrow-right" className="w-4 h-4 text-sky-600" /> {r.to}<div className="flex-1"></div><span className={`badge ${r.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{r.active ? 'aktif' : 'nonaktif'}</span></div>
              <div className="text-[12px] text-slate-500 font-medium mt-1">{r.distance} • {r.duration} • <b className="text-slate-700">{fmtRp(r.basePrice)}</b>/kursi</div>
              <div className="flex flex-wrap gap-1 mt-2">{(r.pickups || []).map((p) => (<span key={p} className="badge bg-slate-100 text-slate-600"><Icon name="map-pin" className="w-3 h-3" />{p}</span>))}</div>
            </div>
          ))}
        </div>
        {!routes.length ? <Empty icon="route" msg="Belum ada rute untuk travel Anda" /> : null}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px]">Status Usulan ({reqs.length})</h3>
        <div className="space-y-2 mt-3">
          {reqs.map((q) => (
            <div key={q.id} className="bg-slate-50 rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-bold">
                <span className="badge bg-sky-100 text-sky-700">{q.type === 'rute-baru' ? 'Rute Baru' : 'Titik Jemput'}</span>
                <span>{q.from} → {q.to}</span><div className="flex-1"></div>
                <span className={`badge ${STATUS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
              </div>
              {q.pickup ? <div className="text-[12px] text-slate-500 font-medium mt-1">Titik: {q.pickup}</div> : null}
              {q.note ? <div className="text-[12px] text-slate-500 font-medium">Catatan: {q.note}</div> : null}
              {q.adminNote ? <div className="text-[12px] font-bold text-sky-700 mt-1">Admin: {q.adminNote}</div> : null}
            </div>
          ))}
        </div>
        {!reqs.length ? <div className="text-[12.5px] text-slate-400 font-medium mt-2">Belum ada usulan. Butuh koridor atau titik baru? Klik Usulkan Rute.</div> : null}
      </div>
    </div>
  );
}
