import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { audit, DEFAULT_SERVICE } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

export function Master() {
  const { refresh, toast } = useApp();
  const banners = DB.load('banners', []);
  const routes = DB.load('routes', []);
  const ags = DB.load('agencies', []);
  const logs = DB.load('audit', []).slice(0, 20);
  const toggleBanner = (id) => { const arr = DB.load('banners', []); const b = arr.find((x) => x.id === id); if (b) { b.active = !b.active; DB.save('banners', arr); refresh(); } };
  const saveFee = (agencyId, raw) => {
    const arr = DB.load('agencies', []); const a = arr.find((x) => x.id === agencyId);
    const fee = Math.max(0, Math.round(Number(raw) || 0));
    if (!a) return fee;
    const old = Number(a.serviceFee ?? DEFAULT_SERVICE) || 0;
    if (fee === old) return old;
    a.serviceFee = fee; DB.save('agencies', arr);
    audit('service_fee', a.name + ' • ' + old + ' → ' + fee);
    refresh(); toast('Jasa agen diperbarui • ' + fmtRp(fee) + '/kursi');
    return fee;
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="banknote" className="w-5 h-5 text-sky-600" />JASA AGEN / KURSI</h3>
        <div className="text-[11.5px] text-slate-400 font-medium mt-1">Ditentukan admin per agen — berlaku untuk semua rute agen tersebut. Transaksi yang sudah terproses tidak berubah.</div>
        {ags.map((a) => {
          const nRoutes = routes.filter((r) => (r.agencyIds || (r.agencyId ? [r.agencyId] : [])).includes(a.id)).length;
          return (
            <div key={a.id} className="flex items-center gap-2 mt-1.5 bg-slate-50 rounded-xl px-3 py-2 text-[12.5px] font-bold">
              <span className="flex-1">{a.name}<span className="text-slate-400 font-medium"> • {nRoutes} rute</span></span>
              <input type="number" min="0" defaultValue={a.serviceFee ?? DEFAULT_SERVICE} onBlur={(e) => { e.target.value = saveFee(a.id, e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-28 text-right font-semibold border-2 border-slate-200 rounded-xl px-2 py-1.5 focus-ring" />
              <span className="text-slate-400 font-medium">/kursi</span>
            </div>
          );
        })}
        {!ags.length ? <div className="text-[12.5px] text-slate-400 font-medium mt-2">Belum ada agen.</div> : null}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="font-extrabold text-[15px]">BANNER PROMO</div>
        {banners.map((b) => (<div key={b.id} className="flex items-center gap-2 mt-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12.5px] font-bold">{b.title}<div className="flex-1"></div><button onClick={() => toggleBanner(b.id)} className={`badge ${b.active ? 'bg-green-500 text-white' : 'bg-slate-200'} cursor-pointer`}>{b.active ? 'on' : 'off'}</button></div>))}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="scroll-text" className="w-5 h-5 text-sky-600" />Audit Log (aksi penting)</h3>
        <div className="mt-2 space-y-1.5 max-h-[420px] overflow-y-auto">{logs.map((l) => (<div key={l.id} className="bg-slate-50 rounded-xl px-3 py-2 text-[12px]"><span className="font-mono text-slate-400">{new Date(l.time).toLocaleString('id-ID')}</span><br /><b>{l.actor}</b> • <span className="font-bold text-sky-700">{l.action}</span> <span className="text-slate-500">{l.detail}</span></div>))}</div></div>
    </div>
  );
}

export default Master;
