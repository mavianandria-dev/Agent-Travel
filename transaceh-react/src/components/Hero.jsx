import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeBookable } from '@/lib/domain.js';
import { todayStr } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

export default function Hero() {
  const { view, user, bw, setBw, go, t } = useApp();
  if (view !== 'home') return null;
  if (user && ['agen', 'pengemudi', 'superadmin'].includes(user.role)) return null;

  const banners = DB.load('banners', []).filter((b) => b.active);
  const routes = DB.load('routes', []).filter(routeBookable);
  const schedCount = DB.load('schedules', []).length;

  const heroSearch = () => {
    setBw({ ...bw, step: 3, scheduleId: null, seats: [] });
    go('search');
  };

  const feats = [
    ['armchair', 'Layout 4×7 Fleksibel', 'Real-time'],
    ['qr-code', 'E-Tiket QR', 'PDF + WA'],
    ['shield-check', 'Bayar Aman', 'QRIS • VA • E-Wallet'],
  ];

  return (
    <div className="relative overflow-hidden bg-[#0b2447] text-white no-print">
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(600px 300px at 15% 20%,#0f7ae5,transparent),radial-gradient(500px 260px at 85% 30%,#22d3ee,transparent),radial-gradient(400px 300px at 50% 100%,#1e3a8a,transparent)' }}></div>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-6 sm:pt-10 pb-6 sm:pb-8 relative">
        <div className="anim inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-[11px] sm:text-[12px] font-bold max-w-full"><span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0"></span><span className="truncate">Live • {schedCount} jadwal minggu ini • {routes.length} rute aktif</span></div>
        <h1 className="anim anim-1 text-[26px] leading-[1.12] sm:text-[32px] md:text-[52px] font-extrabold sm:leading-[1.05] tracking-tight mt-3 sm:mt-4">Calang <span className="text-sky-400">↔</span> Banda Aceh<br /><span className="bg-gradient-to-r from-sky-300 to-cyan-300 bg-clip-text text-transparent">Pesan kursi semudah pesan kopi.</span></h1>
        <p className="anim anim-2 text-slate-300 text-[13px] sm:text-[14px] md:text-[16px] mt-2 sm:mt-3 max-w-xl font-medium leading-relaxed">Pilih kursi real-time ala bioskop, bayar QRIS/VA/e-wallet, e-tiket QR otomatis terkirim via WhatsApp &amp; email.</p>
        <div className="anim anim-3 mt-4 sm:mt-5 bg-white rounded-3xl md:rounded-full p-2 flex flex-col md:flex-row gap-2 shadow-pop max-w-3xl text-slate-800">
          <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-2xl md:rounded-full min-h-[52px]"><Icon name="map-pin" className="w-5 h-5 text-sky-600 shrink-0" />
            <select value={bw.routeId} onChange={(e) => setBw({ ...bw, routeId: e.target.value })} className="bg-transparent font-bold w-full focus-ring rounded-lg py-2">
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.from} → {r.to}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-2xl md:rounded-full min-h-[52px]"><Icon name="calendar" className="w-5 h-5 text-sky-600 shrink-0" />
            <input type="date" value={bw.date} min={todayStr(0)} max={todayStr(14)} onChange={(e) => setBw({ ...bw, date: e.target.value || todayStr(1) })} className="bg-transparent font-bold w-full py-2" />
          </div>
          <button onClick={heroSearch} className="btn-touch bg-[#0b2447] hover:bg-sky-600 active:scale-[.98] transition text-white font-extrabold text-[15px] px-7 py-3.5 rounded-2xl md:rounded-full flex items-center justify-center gap-2 min-h-[52px]"><Icon name="search" className="w-4 h-4" />{t('search')}</button>
        </div>
        <div className="anim anim-4 flex flex-wrap gap-2 mt-4">{banners.map((b) => (
          <span key={b.id || b.title} className="text-[12px] font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-[#0b2447] px-3.5 py-1.5 rounded-full flex items-center gap-1.5"><Icon name="badge-percent" className="w-3.5 h-3.5" />{b.title}</span>
        ))}</div>
        <div className="grid grid-cols-3 gap-2 md:gap-3 mt-6 max-w-3xl">
          {feats.map((f, i) => (
            <div key={f[0]} className={'anim anim-' + (i + 1) + ' bg-white/[.07] border border-white/10 rounded-2xl p-3 md:p-4 backdrop-blur'}><Icon name={f[0]} className="w-5 h-5 text-sky-300" /><div className="font-extrabold text-[13px] md:text-[15px] mt-1.5">{f[1]}</div><div className="text-[11px] text-slate-300 font-medium">{f[2]}</div></div>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 1440 60" className="block w-full -mb-px"><path fill="#f1f5f9" d="M0,32 C360,70 1080,0 1440,32 L1440,60 L0,60 Z" /></svg>
    </div>
  );
}
