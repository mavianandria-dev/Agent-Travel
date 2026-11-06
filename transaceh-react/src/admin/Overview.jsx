import { useEffect, useState } from 'react';
import { DB } from '@/lib/db.js';
import { schedById, routeById, splitFare, fareModelOf, vehicleById, driverById, vehName, takenSeats, schedSeatCap, scheduleInHistory, tripProgress } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { StatCard, useChart, BadgeStatus, fmtDate, EtaBar } from '@/components/ui.jsx';
import { IS_SHEETS } from '@/lib/runtime.js';
import { pullSnapshotSoft } from '@/lib/remote.js';

export function Overview() {
  const bookings = DB.load('bookings', []);
  const bk = bookings.filter((b) => b.status === 'paid' || b.status === 'done');
  const gmv = bk.reduce((a, b) => a + b.total, 0);
  const fee = DB.load('payments', []).filter((p) => p.status === 'paid').reduce((a, p) => {
    const b = bookings.find((x) => x.id === p.bookingId);
    const s = b ? schedById(b.scheduleId) : null;
    const f = b && s ? (b.fare || splitFare(s, (b.seats || []).length, b.discount || 0, 'pelanggan', fareModelOf(b))) : null;
    return a + (f ? Number(f.fee) || 0 : Number(p.fee) || 0);
  }, 0);
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
      <UpcomingDepartures />
    </>
  );
}

/* Keberangkatan akan datang lintas agen untuk admin — kolom Rute memakai
   bar progres ETA (EtaBar). Jam lokal 30 detik hidup di komponen ini saja
   supaya chart pada Overview tidak ikut dibuat ulang tiap tick. */
function UpcomingDepartures() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);
  /* Snapshot segar saat dibuka/focus — pola sama dengan halaman agen. */
  useEffect(() => {
    if (!IS_SHEETS) return undefined;
    const pull = () => pullSnapshotSoft().then((pulled) => { if (pulled) setNow(Date.now()); });
    pull();
    window.addEventListener('focus', pull);
    return () => window.removeEventListener('focus', pull);
  }, []);
  const SHOWN = 15;
  const upcoming = DB.load('schedules', []).filter((s) => !scheduleInHistory(s)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const ags = DB.load('agencies', []);
  return (
    <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5 mt-4">
      <h3 className="font-extrabold text-[15px]">Keberangkatan Akan Datang <span className="text-slate-400 font-bold text-[12px]">({upcoming.length} jadwal{upcoming.length > SHOWN ? ' • ' + SHOWN + ' terdekat' : ''})</span></h3>
      <div className="table-wrap mt-3"><table className="data w-full min-w-[720px]"><thead><tr><th>Tanggal / Jam</th><th>Rute</th><th>Agen</th><th>Armada / Pengemudi</th><th>Terisi</th></tr></thead><tbody>
        {upcoming.slice(0, SHOWN).map((s) => {
          const r = routeById(s.routeId);
          const v = vehicleById(s.vehicleId);
          const dr = driverById(s.driverId);
          const ag = ags.find((a) => a.id === s.agencyId);
          const prog = s.tripStatus === 'ontrip' ? tripProgress(s, r, now) : null;
          return (
            <tr key={s.id}>
              <td className="font-bold">{fmtDate(s.date)}<br /><span className="text-sky-600">{s.time}</span> {s.tripStatus && s.tripStatus !== 'scheduled' ? <BadgeStatus st={s.tripStatus} /> : null}</td>
              <td className="font-semibold">{r ? r.from + ' → ' + r.to : '-'}<EtaBar prog={prog} now={now} /></td>
              <td className="text-[12.5px] font-semibold">{ag?.name || '-'}</td>
              <td className="text-[12.5px] font-medium">{vehName(v)}{v?.plate ? <span className="text-slate-400"> • {v.plate}</span> : null}<br /><span className="text-slate-500">{s.driverName || dr?.name || v?.drvName || '—'}</span></td>
              <td className="font-extrabold">{takenSeats(s.id).booked.length}/{schedSeatCap(s.id)}</td>
            </tr>
          );
        })}
        {upcoming.length === 0 ? <tr><td colSpan={5} className="text-center text-slate-400 font-semibold py-4">Tidak ada jadwal akan datang.</td></tr> : null}
      </tbody></table></div>
    </div>
  );
}
