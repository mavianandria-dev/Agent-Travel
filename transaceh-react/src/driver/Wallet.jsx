import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { ledgerByDriver, routeById, schedById } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty, StatCard } from '@/components/ui.jsx';
import { drvOfUser } from './Tasks.jsx';

const LEDGER_BADGE = {
  ditahan: ['b-pending', 'Ditahan'],
  layak: ['b-paid', 'Layak Cair'],
  dicairkan: ['b-done', 'Dicairkan'],
  void: ['b-cancel', 'Void'],
};

export default function Wallet() {
  const { user } = useApp();
  const me = drvOfUser(user);
  const entries = me ? ledgerByDriver(me.id) : [];
  const bookings = DB.load('bookings', []);
  const codeOf = (e) => bookings.find((b) => b.id === e.bookingId)?.code || '-';
  const sum = (st) => entries.filter((e) => e.status === st).reduce((a, e) => a + (Number(e.ticket) || 0), 0);
  const pending = sum('ditahan');
  const layak = sum('layak');
  const done = sum('dicairkan');
  const sorted = [...entries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return (
    <>
      <div className="anim bg-white rounded-3xl shadow-card p-5">
        <h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="wallet" className="w-5 h-5 text-sky-600" />Dompet - {me?.name || user?.name}</h2>
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          <StatCard icon="timer" label="Saldo Menunggu" val={fmtRp(pending)} sub="ditahan" color="bg-gradient-to-br from-amber-400 to-orange-500" />
          <StatCard icon="hand-coins" label="Layak Cair" val={fmtRp(layak)} sub="layak" color="bg-gradient-to-br from-green-400 to-emerald-600" />
          <StatCard icon="banknote" label="Sudah Dicairkan" val={fmtRp(done)} sub="dicairkan" color="bg-gradient-to-br from-sky-400 to-blue-600" />
        </div>
        <div className="mt-3 bg-slate-50 border-2 border-slate-100 rounded-2xl px-3.5 py-3 text-[13px]">
          <div className="flex justify-between gap-3"><span className="text-slate-500 font-semibold">Rekening bank</span><b className="text-right">{me?.bank || '-'}</b></div>
          <p className="text-[11.5px] text-slate-400 font-medium mt-1">hubungi travel untuk ubah rekening</p>
        </div>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[640px]"><thead><tr><th>Kode</th><th>Rute / Kursi</th><th>Nominal Tiket</th><th>Status</th><th>Tanggal</th></tr></thead><tbody>
          {sorted.map((e) => {
            const s = schedById(e.scheduleId);
            const r = s ? routeById(s.routeId) : null;
            const bg = LEDGER_BADGE[e.status] || ['b-wait', e.status];
            return (
              <tr key={e.id}>
                <td className="font-mono font-extrabold">{codeOf(e)}</td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}<br /><span className="text-slate-400">{(e.seats || []).join(', ') || '-'}</span></td>
                <td className="font-extrabold">{fmtRp(e.ticket)}</td>
                <td><span className={`badge ${bg[0]}`}>{bg[1]}</span></td>
                <td className="text-[12px] font-semibold">{(e.createdAt || '').slice(0, 10)}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {sorted.length === 0 ? <Empty icon="wallet" msg="Belum ada dana tiket masuk." /> : null}
      </div>
    </>
  );
}
