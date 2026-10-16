import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { Icon } from '@/components/ui.jsx';

export function Master() {
  const { refresh } = useApp();
  const banners = DB.load('banners', []);
  const logs = DB.load('audit', []).slice(0, 20);
  const toggleBanner = (id) => { const arr = DB.load('banners', []); const b = arr.find((x) => x.id === id); if (b) { b.active = !b.active; DB.save('banners', arr); refresh(); } };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
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
