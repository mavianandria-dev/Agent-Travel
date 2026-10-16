import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { saveRouteRequest, priceForAgency } from '@/lib/domain.js';
import { PICKUP_ORIGIN } from '@/lib/pickups.js';
import { fmtRp, REGIONS } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';

const TYPE_LABEL = { 'rute-baru': 'Rute Baru', 'titik-jemput': 'Titik Jemput', 'ubah-harga': 'Ubah Harga' };

const STATUS = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600' };
const STATUS_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

function RequestRouteModal({ ag }) {
  const { toast, closeModal, refresh } = useApp();
  const [from, setFrom] = useState('Aceh Jaya');
  const [to, setTo] = useState('Banda Aceh');
  const [price, setPrice] = useState('');
  const [picks, setPicks] = useState([]);
  const [custom, setCustom] = useState('');
  const [homePickup, setHomePickup] = useState(true);
  const [note, setNote] = useState('');
  const allRoutes = DB.load('routes', []);
  const corridorRoutes = allRoutes.filter((r) => r.from === from && r.to === to);
  const myCorridor = corridorRoutes.filter((r) => (r.agencyIds || []).includes(ag.id));
  const isNew = corridorRoutes.length === 0;
  const chips = [...new Set(PICKUP_ORIGIN[from] || [])];
  const pickChip = (p) => { setCustom(''); setPicks((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p])); };
  const addCustom = () => { const v = custom.trim(); if (!v) return; if (!picks.includes(v)) setPicks((ps) => [...ps, v]); setCustom(''); };
  const pickFrom = (v) => { setFrom(v); setPicks([]); setCustom(''); };
  const pickTo = (v) => { setTo(v); setPicks([]); setCustom(''); };
  const submit = () => {
    if (from === to) { toast('Kota asal dan tujuan tidak boleh sama', 'err'); return; }
    const all = custom.trim() && !picks.includes(custom.trim()) ? [...picks, custom.trim()] : picks;
    if (isNew) {
      if (!(Number(price) > 0)) { toast('Isi usulan harga tiket', 'err'); return; }
      saveRouteRequest({ agencyId: ag.id, type: 'rute-baru', from, to, price: Number(price), pickups: all, homePickup, note });
    } else {
      if (!myCorridor.length) { toast('Koridor ini belum tersedia untuk travel Anda — hubungi admin', 'warn'); return; }
      if (!all.length) { toast('Pilih minimal 1 titik jemput', 'err'); return; }
      const r = myCorridor[0];
      saveRouteRequest({ agencyId: ag.id, type: 'titik-jemput', routeId: r.id, from, to, pickups: all, note });
    }
    refresh(); closeModal(); toast('Usulan terkirim — menunggu persetujuan admin');
  };
  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[16px]">Usulkan Rute</h3>
      <div className={`mt-2 text-[12px] font-bold rounded-xl px-3 py-2 ${isNew ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
        {isNew ? 'Terdeteksi: koridor baru → tersimpan sebagai usulan RUTE' : 'Terdeteksi: koridor tersedia → tersimpan sebagai usulan TITIK'}
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div><label className="text-[12px] font-extrabold">DARI <span className="text-red-500">*</span></label>
          <select value={from} onChange={(e) => pickFrom(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
        <div><label className="text-[12px] font-extrabold">KE <span className="text-red-500">*</span></label>
          <select value={to} onChange={(e) => pickTo(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
      </div>
      {isNew ? (
      <div className="mt-3"><label className="text-[12px] font-extrabold">USULAN HARGA TIKET / KURSI (Rp) <span className="text-red-500">*</span></label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="cth: 300000" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      ) : null}
      <div className="mt-3"><label className="text-[12px] font-extrabold">TITIK JEMPUT USULAN {!isNew ? <span className="text-red-500">*</span> : '(opsional, boleh banyak)'}</label>
        {chips.length ? (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {chips.map((p) => (
              <button key={p} type="button" onClick={() => pickChip(p)} className={`px-3 py-2 rounded-xl border-2 text-[12px] font-extrabold transition ${picks.includes(p) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>{picks.includes(p) ? '✓ ' : ''}{p}</button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2 mt-1.5">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={chips.length ? 'atau ketik titik baru…' : 'cth: Simpang Lima'} className="flex-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
          <button type="button" onClick={addCustom} className="bg-slate-100 hover:bg-slate-200 text-[12px] font-extrabold px-4 rounded-xl shrink-0">+ Tambah</button>
        </div>
        {picks.length ? <div className="flex flex-wrap gap-1.5 mt-1.5">{picks.map((p) => (<span key={p} className="badge bg-sky-600 text-white">{p} <button type="button" onClick={() => setPicks((ps) => ps.filter((x) => x !== p))} className="ml-0.5 font-extrabold">×</button></span>))}</div> : null}
      </div>
      {isNew ? (
      <div className="mt-3"><label className="flex items-center gap-2.5 bg-sky-50 border-2 border-sky-200 rounded-2xl px-3.5 py-2.5 cursor-pointer text-[12.5px] font-bold text-sky-800"><input type="checkbox" checked={homePickup} onChange={(e) => setHomePickup(e.target.checked)} className="w-5 h-5 accent-sky-600 shrink-0" />Sediakan jemput ke rumah (pelanggan isi koordinat)</label></div>
      ) : null}
      <div className="mt-3"><label className="text-[12px] font-extrabold">CATATAN (opsional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan usulan…" rows={2} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      <button onClick={submit} className="btn-touch mt-4 w-full bg-sky-600 text-white font-extrabold py-3 rounded-2xl">Kirim Usulan</button>
    </div>
  );
}

function EditPriceModal({ ag, route }) {
  const { toast, closeModal, refresh } = useApp();
  const old = priceForAgency(route, ag.id);
  const [price, setPrice] = useState(old || '');
  const submit = () => {
    if (!(Number(price) > 0)) { toast('Isi harga tiket baru', 'err'); return; }
    if (Number(price) === old) { toast('Harga sama — tidak ada perubahan', 'warn'); return; }
    const dup = DB.load('routeRequests', []).some((x) => x.agencyId === ag.id && x.type === 'ubah-harga' && x.routeId === route.id && x.status === 'pending');
    if (dup) { toast('Sudah ada usulan harga menunggu untuk rute ini', 'warn'); return; }
    saveRouteRequest({ agencyId: ag.id, type: 'ubah-harga', routeId: route.id, from: route.from, to: route.to, price: Number(price), note: '' });
    refresh(); closeModal(); toast('Usulan harga terkirim — menunggu persetujuan admin');
  };
  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[16px]">Ubah Harga Tiket</h3>
      <div className="text-[13px] font-bold mt-1">{route.from} → {route.to}</div>
      <div className="text-[12.5px] text-slate-500 font-medium mt-1">Harga Anda kini: <b className="text-slate-700">{fmtRp(old)}</b>/kursi</div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">HARGA BARU / KURSI (Rp) <span className="text-red-500">*</span></label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="cth: 170000" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
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
              <div className="text-[12px] text-slate-500 font-medium mt-1">{r.distance} • {r.duration}</div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">{r.homePickup !== false ? <span className="badge bg-green-100 text-green-700"><Icon name="map-pin" className="w-3 h-3" />Jemput rumah tersedia</span> : null}</div>
              <div className="flex items-center gap-2 mt-1.5"><span className="text-[13px] font-extrabold">Harga Anda: {fmtRp(priceForAgency(r, ag.id))}<span className="text-slate-400 font-medium">/kursi</span></span><div className="flex-1"></div>
                <button onClick={() => openModal(<EditPriceModal ag={ag} route={r} />)} className="text-sky-600 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100">Ubah Harga</button></div>
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
                <span className="badge bg-sky-100 text-sky-700">{TYPE_LABEL[q.type] || q.type}</span>
                <span>{q.from} → {q.to}</span>
                {q.price ? <span className="text-slate-400 font-medium">{fmtRp(q.price)}</span> : null}<div className="flex-1"></div>
                <span className={`badge ${STATUS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
              </div>
              {(q.pickups && q.pickups.length ? q.pickups : q.pickup ? [q.pickup] : []).length ? <div className="text-[12px] text-slate-500 font-medium mt-1">Titik: {(q.pickups && q.pickups.length ? q.pickups : [q.pickup]).join(', ')}</div> : null}
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
