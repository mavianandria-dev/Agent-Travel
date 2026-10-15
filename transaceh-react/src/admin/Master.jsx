import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyById, driverById, audit } from '@/lib/domain.js';
import { fmtRp, uid, REGIONS } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

function RouteFormModal() {
  const { toast, closeModal, refresh } = useApp();
  const ags = DB.load('agencies', []).filter((a) => a.status === 'active');
  const [from, setFrom] = useState('Aceh Jaya');
  const [to, setTo] = useState('Banda Aceh');
  const [price, setPrice] = useState('');
  const [agOpen, setAgOpen] = useState(false);
  const [agIds, setAgIds] = useState([]);
  const [drvIds, setDrvIds] = useState([]);
  const allDrv = DB.load('drivers', []).filter((d) => d.status === 'aktif' && (!agIds.length || agIds.includes(d.agencyId)));
  const toggleAg = (id) => setAgIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleDrv = (id) => setDrvIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const saveRoute = () => {
    const f = (from || '').trim() || 'A', t = (to || '').trim() || 'B';
    if (f === t) { toast('Kota asal dan tujuan tidak boleh sama', 'err'); return; }
    if (!agIds.length) { toast('Centang minimal 1 travel agen', 'err'); return; }
    for (const id of agIds) { const a = agencyById(id); if (!a || a.status !== 'active') { toast('Ada agen tidak aktif tercentang', 'err'); return; } }
    for (const id of drvIds) { const d = driverById(id); if (!d || d.status !== 'aktif' || !agIds.includes(d.agencyId)) { toast('Pengemudi ' + (d?.name || id) + ' tidak valid untuk agen tercentang', 'err'); return; } }
    const arr = DB.load('routes', []);
    arr.push({ id: uid('R'), from: f, to: t, distance: '-', duration: '-', basePrice: Number(price) || 100000, pickups: ['Terminal ' + f, 'Terminal ' + t], active: true, agencyId: agIds[0], agencyIds: agIds, driverId: drvIds[0] || null, driverIds: drvIds });
    DB.save('routes', arr);
    refresh();
    audit('route_create', f + ' → ' + t + ' • ' + agIds.length + ' agen • ' + drvIds.length + ' pengemudi');
    closeModal();
    toast('Rute disimpan & terhubung ke ' + agIds.length + ' agen');
    refresh();
  };
  const agLabel = agIds.length ? agIds.length + ' dipilih: ' + agIds.map((id) => { const a = agencyById(id); return a ? a.name : id; }).slice(0, 2).join(', ') + (agIds.length > 2 ? ' +' + (agIds.length - 2) + ' lainnya' : '') : 'Pilih agen.';
  return (
    <div className="p-6"><h3 className="font-extrabold">Tambah Rute</h3>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div><label className="text-[12px] font-extrabold">DARI</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
        <div><label className="text-[12px] font-extrabold">KE</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" placeholder="Harga dasar / kursi" className="col-span-2 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
        <div className="col-span-2"><label className="text-[12px] font-extrabold">TRAVEL AGEN (centang, bisa banyak)</label>
          <div className="relative mt-1">
            <button type="button" onClick={() => setAgOpen((o) => !o)} className="w-full font-semibold text-left border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring bg-white flex items-center gap-2"><span className={`flex-1 ${agIds.length ? '' : 'text-slate-500'}`}>{agLabel}</span><Icon name="chevron-down" className="w-4 h-4 text-slate-400" /></button>
            {agOpen ? (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto p-1.5">
                <div className="flex gap-1.5 px-1 pb-1.5"><button type="button" onClick={() => setAgIds(ags.map((a) => a.id))} className="text-[11px] font-extrabold text-sky-600">Pilih semua</button><span className="text-slate-300">•</span><button type="button" onClick={() => setAgIds([])} className="text-[11px] font-extrabold text-slate-400">Reset</button></div>
                {ags.map((a) => (<label key={a.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-sky-50 cursor-pointer text-[13px] font-semibold"><input type="checkbox" checked={agIds.includes(a.id)} onChange={() => toggleAg(a.id)} className="w-4 h-4 accent-sky-600 shrink-0" /><span className="flex-1">{a.name}</span></label>))}
                {ags.length === 0 ? <div className="text-[12px] text-slate-400 px-2 py-2">- tidak ada agen aktif -</div> : null}
              </div>
            ) : null}
          </div></div>
        <div className="col-span-2"><label className="text-[12px] font-extrabold">PENGEMUDI DEFAULT (chip, mengikuti agen)</label>
          <div className="flex items-center gap-2 mt-1.5"><span className={`text-[11.5px] font-bold ${drvIds.length ? 'text-sky-600' : 'text-slate-500'}`}>{drvIds.length ? drvIds.length + ' pengemudi dipilih' : '0 dipilih'}</span><div className="flex-1"></div><button type="button" onClick={() => setDrvIds(allDrv.map((d) => d.id))} className="text-[11px] font-extrabold text-sky-600">Pilih semua</button><span className="text-slate-300">•</span><button type="button" onClick={() => setDrvIds([])} className="text-[11px] font-extrabold text-slate-400">Reset</button></div>
          <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-44 overflow-y-auto bg-slate-50 border-2 border-slate-200 rounded-xl p-2">
            {allDrv.map((d) => {
              const ag = agencyById(d.agencyId);
              const on = drvIds.includes(d.id);
              return (
                <label key={d.id} className="shrink-0"><input type="checkbox" checked={on} onChange={() => toggleDrv(d.id)} className="hidden" />
                  <span className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full border-2 text-[12px] font-extrabold transition cursor-pointer ${on ? 'bg-sky-600 border-sky-600 text-white shadow' : 'bg-white border-slate-200 text-slate-600 hover:border-sky-300'}`}><Icon name="id-card" className="w-3.5 h-3.5" />{d.name}<span className="text-[10px] font-bold opacity-70">• {ag ? ag.name : '-'}</span></span></label>
              );
            })}
            {allDrv.length === 0 ? <div className="text-[12px] text-slate-400 font-semibold px-1 py-1">- tidak ada pengemudi aktif untuk agen ini -</div> : null}
          </div>
        </div>
      </div>
      <button onClick={saveRoute} className="btn-touch mt-3 w-full bg-sky-600 text-white font-extrabold py-3 rounded-2xl">Simpan</button></div>
  );
}

export function Master() {
  const { refresh, openModal } = useApp();
  const routes = DB.load('routes', []);
  const banners = DB.load('banners', []);
  const logs = DB.load('audit', []).slice(0, 20);
  const toggleRoute = (id) => { const arr = DB.load('routes', []); const r = arr.find((x) => x.id === id); if (r) { r.active = !r.active; DB.save('routes', arr); refresh(); } };
  const toggleBanner = (id) => { const arr = DB.load('banners', []); const b = arr.find((x) => x.id === id); if (b) { b.active = !b.active; DB.save('banners', arr); refresh(); } };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="flex items-center"><h3 className="font-extrabold text-[15px]">Master Rute</h3><div className="flex-1"></div><button onClick={() => openModal(<RouteFormModal />)} className="bg-sky-600 text-white text-[12px] font-extrabold px-3.5 py-2 rounded-xl">+ Rute</button></div>
        {routes.map((r) => {
          const agIds = r.agencyIds || (r.agencyId ? [r.agencyId] : []), drIds = r.driverIds || (r.driverId ? [r.driverId] : []);
          const agNms = agIds.map((id) => { const a = agencyById(id); return a ? a.name : null; }).filter(Boolean);
          const drNms = drIds.map((id) => { const d = driverById(id); return d ? d.name : null; }).filter(Boolean);
          return (
            <div key={r.id} className="mt-2 bg-slate-50 rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-bold">{r.from} → {r.to}<span className="text-slate-400 font-medium">{fmtRp(r.basePrice)}</span><div className="flex-1"></div><span className={`badge ${r.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{r.active ? 'aktif' : 'nonaktif'}</span><button onClick={() => toggleRoute(r.id)} className="text-sky-600" title="Aktif/nonaktif"><Icon name="repeat" className="w-4 h-4" /></button></div>
              <div className="text-[11.5px] font-semibold text-slate-500 mt-1.5 flex flex-col gap-1">
                <span className="flex items-start gap-1"><Icon name="building-2" className="w-3 h-3 mt-0.5 shrink-0" /><span>{agNms.length ? agNms.map((n) => (<span key={n} className="badge bg-sky-100 text-sky-700 mr-1 mb-0.5">{n}</span>)) : '- tanpa agen -'}</span></span>
                <span className="flex items-start gap-1"><Icon name="id-card" className="w-3 h-3 mt-0.5 shrink-0" /><span>{drNms.length ? drNms.map((n) => (<span key={n} className="badge bg-slate-200 text-slate-600 mr-1 mb-0.5">{n}</span>)) : '- tanpa pengemudi -'}</span></span>
              </div>
            </div>
          );
        })}
        <div className="font-extrabold text-[13px] mt-4">BANNER PROMO</div>
        {banners.map((b) => (<div key={b.id} className="flex items-center gap-2 mt-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12.5px] font-bold">{b.title}<div className="flex-1"></div><button onClick={() => toggleBanner(b.id)} className={`badge ${b.active ? 'bg-green-500 text-white' : 'bg-slate-200'} cursor-pointer`}>{b.active ? 'on' : 'off'}</button></div>))}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="scroll-text" className="w-5 h-5 text-sky-600" />Audit Log (aksi penting)</h3>
        <div className="mt-2 space-y-1.5 max-h-[420px] overflow-y-auto">{logs.map((l) => (<div key={l.id} className="bg-slate-50 rounded-xl px-3 py-2 text-[12px]"><span className="font-mono text-slate-400">{new Date(l.time).toLocaleString('id-ID')}</span><br /><b>{l.actor}</b> • <span className="font-bold text-sky-700">{l.action}</span> <span className="text-slate-500">{l.detail}</span></div>))}</div></div>
    </div>
  );
}

export default Master;
