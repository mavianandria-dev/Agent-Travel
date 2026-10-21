import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, schedSeatCap, takenSeats } from '@/lib/domain.js';
import { todayStr } from '@/lib/utils.js';
import { Icon, StatCard, BadgeStatus } from '@/components/ui.jsx';
import { drvOfUser } from './Tasks.jsx';

export default function Trips() {
  const { user } = useApp();
  const me = drvOfUser(user);
  const mySched = DB.load('schedules', []).filter((s) => !me || s.driverId === me.id).sort((a, b) => (a.date + b.time).localeCompare(b.date + b.time));
  const upcoming = mySched.filter((s) => s.date >= todayStr(0) && s.status !== 'cancelled' && !['arrived', 'missed', 'cancelled'].includes(s.tripStatus));
  return (
    <>
      <div className="anim bg-white rounded-3xl shadow-card p-5">
        <h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="route" className="w-5 h-5 text-sky-600" />Riwayat Trip - {me?.name || user?.name}</h2>
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          <StatCard icon="flag" label="Total Trip" val={me?.trips || 0} sub="selesai" color="bg-gradient-to-br from-green-400 to-emerald-600" />
          <StatCard icon="star" label="Rating" val={me?.rating || 5} sub="penumpang" color="bg-gradient-to-br from-amber-400 to-orange-500" />
          <StatCard icon="calendar" label="Jadwal Aktif" val={upcoming.length} sub="ke depan" color="bg-gradient-to-br from-sky-400 to-blue-600" />
        </div>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[560px]"><thead><tr><th>Jadwal</th><th>Rute</th><th>Penumpang</th><th>Status</th></tr></thead><tbody>
          {mySched.map((s) => {
            const r = routeById(s.routeId);
            return <tr key={s.id}><td className="font-bold">{s.date} {s.time}</td><td>{r.from} → {r.to}</td><td><b>{takenSeats(s.id).paid.length}/{schedSeatCap(s.id)}</b></td><td><BadgeStatus st={s.tripStatus || 'scheduled'} /></td></tr>;
          })}
        </tbody></table></div>
      </div>
    </>
  );
}
