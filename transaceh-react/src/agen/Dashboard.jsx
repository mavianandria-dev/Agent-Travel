import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, vehicleById, vehName, driverById, schedById, bookingsOf, takenSeats, schedSeatCap } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon, StatCard, BadgeStatus, useChart, fmtDate } from '@/components/ui.jsx';

export function agenStats(agId) {
  const sch = DB.load('schedules', []).filter((s) => s.agencyId === agId);
  const bk = DB.load('bookings', []).filter((b) => sch.some((s) => s.id === b.scheduleId) && b.status !== 'cancelled');
  const paid = bk.filter((b) => b.status === 'paid' || b.status === 'done');
  const rev = paid.filter((b) => schedById(b.scheduleId)?.date === todayStr(0)).reduce((a, b) => a + b.total, 0);
  const totRev = paid.reduce((a, b) => a + b.total, 0);
  const cap = sch.filter((s) => s.date === todayStr(0)).reduce((a, s) => a + schedSeatCap(s.id), 0) || 1;
  const occ = sch.filter((s) => s.date === todayStr(0)).reduce((a, s) => a + takenSeats(s.id).paid.length, 0);
  return { rev, todayBk: bk.filter((b) => schedById(b.scheduleId)?.date === todayStr(0)).length, occ: Math.round((occ / cap) * 100), totRev, totBk: bk.length, sch };
}

function ManifestBody({ sid }) {
  const { closeModal } = useApp();
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const dr = driverById(s.driverId);
  const bk = bookingsOf(sid);
  const lay = (() => { try { return (v && Array.isArray(v.layout) && v.layout.length === 28) ? v.layout : []; } catch (e) { return []; } })();
  const order = lay.filter((c) => c.type === 'seat' || c.type === 'off').map((c) => c.sid);
  const bookedExtra = [...new Set(bk.flatMap((b) => b.seats || []))].filter((id) => !order.includes(id));
  const offSet = new Set(lay.filter((c) => c.type === 'off').map((c) => c.sid));
  return (
    <div className="p-6 print-only-off">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="clipboard-list" className="w-5 h-5 text-sky-600" />Manifest Penumpang</h3>
        <button onClick={() => closeModal()} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="text-[13px] font-bold mt-2">{r?.from} → {r?.to} • {fmtDate(s.date)} {s.time}<br /><span className="text-slate-500 font-medium">{vehName(v)} {v?.plate} • Pengemudi: {dr?.name}</span></div>
      <table className="data w-full mt-3"><thead><tr><th>#</th><th>Kursi</th><th>Nama</th><th>HP</th><th>Jemput</th><th>Status</th></tr></thead><tbody>
        {[...order, ...bookedExtra].map((st) => {
          const b = bk.find((x) => (x.seats || []).includes(st));
          const p = b?.passengers.find((x) => x.seat === st);
          const vehOff = offSet.has(st);
          const blocked = (s.blockedSeats || []).includes(st);
          return (
            <tr key={st}><td>{st}</td><td className="font-extrabold">{st}</td>
              <td className="font-semibold">{p ? p.name : vehOff ? <span className="text-slate-400">— nonaktif (armada) —</span> : blocked ? <span className="text-slate-400">— diblokir —</span> : <span className="text-slate-300">— kosong —</span>}</td>
              <td>{p ? p.phone : '-'}</td><td className="text-[12px]">{p ? (p.pickup || '-') : '-'}</td>
              <td>{b ? <BadgeStatus st={b.status} /> : (vehOff || blocked) ? <span className="badge b-cancel">Tutup</span> : <span className="badge b-wait">Kosong</span>}</td></tr>
          );
        })}
      </tbody></table>
      <button onClick={() => window.print()} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl no-print"><Icon name="printer" className="w-4 h-4 inline" /> Cetak Manifest</button>
    </div>
  );
}

export default function Dashboard({ ag }) {
  const { user, openModal, tick } = useApp();
  void tick;
  const agency = ag || agencyOf(user);
  const agId = agency?.id || '';
  const st0 = agId ? agenStats(agId) : { rev: 0, todayBk: 0, occ: 0, totRev: 0, totBk: 0, sch: [] };
  const labels = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); });
  const vals = [...Array(7)].map((_, i) => {
    const d = todayStr(-6 + i);
    if (!agId) return 0;
    return DB.load('bookings', []).filter((b) => { const s = schedById(b.scheduleId); return s && s.agencyId === agId && (b.status === 'paid' || b.status === 'done') && s.date === d; }).reduce((a, b) => a + b.total, 0);
  });
  const todaySched0 = (st0.sch || []).filter((s) => s.date === todayStr(0));
  const refRev = useChart(() => ({ type: 'bar', data: { labels, datasets: [{ data: vals, backgroundColor: '#0f7ae5', borderRadius: 10 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => 'Rp' + (v / 1000) + 'k' } } }, maintainAspectRatio: false } }));
  const refOcc = useChart(() => ({
    type: 'doughnut',
    data: { labels: todaySched0.map((s) => s.time + ' ' + (routeById(s.routeId)?.to || '')), datasets: [{ data: todaySched0.map((s) => takenSeats(s.id).paid.length), backgroundColor: ['#0f7ae5', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444'] }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
  }));
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const st = st0;
  const manifest = (sid) => openModal(<ManifestBody sid={sid} />);
  const todaySched = st.sch.filter((s) => s.date === todayStr(0));
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon="wallet" label="Pendapatan Hari Ini" val={fmtRp(st.rev)} sub="vs kemarin" color="bg-gradient-to-br from-green-400 to-emerald-600" />
        <StatCard icon="clipboard-list" label="Booking Hari Ini" val={st.todayBk} sub="pesanan" color="bg-gradient-to-br from-sky-400 to-blue-600" />
        <StatCard icon="armchair" label="Okupansi Kursi" val={st.occ + '%'} sub="rata-rata hari ini" color="bg-gradient-to-br from-amber-400 to-orange-500" />
        <StatCard icon="trending-up" label="Total Pendapatan" val={fmtRp(st.totRev)} sub={st.totBk + ' booking'} color="bg-gradient-to-br from-violet-400 to-purple-600" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5"><h3 className="font-extrabold text-[15px]">Pendapatan 7 Hari</h3><div className="chart-box h-[190px] sm:h-[220px]"><canvas ref={refRev}></canvas></div></div>
        <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5"><h3 className="font-extrabold text-[15px]">Okupansi per Jadwal Hari Ini</h3><div className="chart-box h-[190px] sm:h-[220px]"><canvas ref={refOcc}></canvas></div></div>
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5 mt-4">
        <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="calendar-days" className="w-5 h-5 text-sky-600" />Jadwal Hari Ini ({todayStr(0)})</h3>
        <div className="grid md:grid-cols-2 gap-2.5 mt-3">
          {todaySched.map((s) => {
            const r = routeById(s.routeId);
            const v = vehicleById(s.vehicleId);
            const dr = driverById(s.driverId);
            const tk = takenSeats(s.id);
            const capN = schedSeatCap(s.id);
            return (
              <div key={s.id} className="border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="bg-[#0b2447] text-white rounded-2xl px-3 py-2 text-center shrink-0"><div className="font-extrabold text-[15px]">{s.time}</div><div className="text-[10px] opacity-70">WIB</div></div>
                <div className="flex-1 min-w-0"><div className="font-extrabold text-[13.5px]">{r?.from} → {r?.to}</div><div className="text-[12px] text-slate-500 font-medium">{vehName(v)} • {dr?.name} • {tk.paid.length}/{capN} kursi</div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1.5"><div className="h-full bg-green-500 rounded-full" style={{ width: (tk.paid.length / capN) * 100 + '%' }}></div></div></div>
                <button onClick={() => manifest(s.id)} className="bg-sky-50 text-sky-700 text-[11.5px] font-extrabold px-3 py-2 rounded-xl hover:bg-sky-100"><Icon name="printer" className="w-3.5 h-3.5 inline" /> Manifest</button>
              </div>
            );
          })}
          {!todaySched.length ? <div className="text-slate-400 text-[13px]">Tidak ada jadwal hari ini.</div> : null}
        </div>
      </div>
    </div>
  );
}
