import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, agencyById, feeFor } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon, StatCard, useChart } from '@/components/ui.jsx';

export function Overview() {
  const bk = DB.load('bookings', []).filter((b) => b.status === 'paid' || b.status === 'done');
  const gmv = bk.reduce((a, b) => a + b.total, 0);
  const fee = DB.load('payments', []).filter((p) => p.status === 'paid').reduce((a, p) => a + (p.fee || 0), 0);
  const ags = DB.load('agencies', []);
  const byRoute = {};
  bk.forEach((b) => { const s = schedById(b.scheduleId); if (!s) return; const r = routeById(s.routeId); const k = r.from + ' → ' + r.to; byRoute[k] = (byRoute[k] || 0) + 1; });
  const topRoute = Object.entries(byRoute).sort((a, b) => b[1] - a[1])[0];
  const counts = ags.map((a) => bk.filter((b) => { const s = schedById(b.scheduleId); return s && s.agencyId === a.id; }).length);
  const max = Math.max(1, ...counts);
  const ref = useChart(() => {
    const labels = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); });
    const vals = [...Array(7)].map((_, i) => DB.load('bookings', []).filter((b) => (b.createdAt || '').slice(0, 10) === todayStr(-6 + i)).length);
    return { type: 'line', data: { labels, datasets: [{ data: vals, borderColor: '#0f7ae5', backgroundColor: 'rgba(15,122,229,.15)', fill: true, tension: 0.45, pointRadius: 5, pointBackgroundColor: '#0b2447' }] }, options: { plugins: { legend: { display: false } }, maintainAspectRatio: false } };
  });
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon="banknote" label="Total GMV" val={fmtRp(gmv)} sub={bk.length + ' transaksi'} color="bg-gradient-to-br from-green-400 to-emerald-600" />
        <StatCard icon="percent" label="Fee Masuk" val={fmtRp(fee)} sub="platform revenue" color="bg-gradient-to-br from-violet-400 to-purple-600" />
        <StatCard icon="building-2" label="Travel Agen" val={ags.length} sub={ags.filter((a) => a.status === 'active').length + ' aktif'} color="bg-gradient-to-br from-sky-400 to-blue-600" />
        <StatCard icon="route" label="Rute Terlaris" val={(topRoute || ['-', 0])[0]} sub={(topRoute || ['', 0])[1] + ' booking'} color="bg-gradient-to-br from-amber-400 to-orange-500" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5"><h3 className="font-extrabold text-[15px]">Tren Booking 7 Hari (Platform)</h3><div className="chart-box h-[190px] sm:h-[230px]"><canvas ref={ref}></canvas></div></div>
        <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px]">Agen Teraktif</h3>
          {ags.map((a, i) => (
            <div key={a.id} className="mt-2.5"><div className="flex justify-between text-[12.5px] font-extrabold"><span>{a.name}</span><span>{counts[i]} booking</span></div><div className="h-2.5 bg-slate-100 rounded-full mt-1"><div className="h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full" style={{ width: (counts[i] / max * 100) + '%' }}></div></div></div>
          ))}
        </div>
      </div>
    </>
  );
}
