import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, BadgeStatus, fmtDate } from '@/components/ui.jsx';

export default function History() {
  const { user, go, filter, setFilter, tick } = useApp();
  void tick;

  if (!user) {
    return (
      <div className="anim bg-white rounded-3xl shadow-card p-5">
        <div className="text-center py-8 text-slate-400"><div className="text-[13px] font-bold">Login untuk melihat riwayat</div></div>
        <button onClick={() => go('login')} className="mt-3 bg-[#0b2447] text-white text-[13px] font-extrabold px-6 py-2.5 rounded-xl">Masuk</button>
      </div>
    );
  }

  const st = filter.status || '';
  const list = DB.load('bookings', []).filter((b) => b.userEmail === user.email).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = list.filter((b) => !st || st === 'all' || b.status === st);

  return (
    <div className="anim bg-white rounded-3xl shadow-card p-5">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold text-[18px] flex items-center gap-2"><Icon name="history" className="w-5 h-5 text-sky-600" />Riwayat Booking</h2><div className="flex-1"></div>
        {['all', 'pending', 'paid', 'done', 'cancelled'].map((f) => (
          <button key={f} onClick={() => setFilter({ ...filter, status: f })} className={'badge cursor-pointer ' + (st === f || (!st && f === 'all') ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500')}>{f === 'all' ? 'Semua' : f}</button>
        ))}</div>
      <div className="table-wrap mt-3"><table className="data w-full min-w-[640px]"><thead><tr><th>Kode</th><th>Rute / Jadwal</th><th>Kursi</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {shown.map((b) => {
          const s = schedById(b.scheduleId);
          if (!s) return null;
          const r = routeById(s.routeId);
          return (
            <tr key={b.id}><td className="font-mono font-extrabold">{b.code}</td><td className="font-semibold">{r.from} → {r.to}<br /><span className="text-slate-400 text-[12px]">{fmtDate(s.date)} {s.time}</span></td><td className="font-bold">{b.seats.join(', ')}</td><td className="font-extrabold">{fmtRp(b.total)}</td><td><BadgeStatus st={b.status} /></td>
              <td><button onClick={() => go('ticket-detail:' + b.id)} className="text-sky-600 font-bold text-[12px] hover:underline">Detail</button></td></tr>
          );
        })}
        {!shown.length ? <tr><td colSpan={6} className="text-center text-slate-400 py-8">Tidak ada data</td></tr> : null}
      </tbody></table></div></div>
  );
}
