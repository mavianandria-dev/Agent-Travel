import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, schedById, platformFeeOf } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { StatCard, Icon } from '@/components/ui.jsx';

export default function Finance({ ag, st }) {
  const { user, toast, tick } = useApp();
  void tick;
  void st;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;

  const ledger = DB.load('ledger', []).filter((e) => e.agencyId === agency.id && e.status !== 'void');
  const active = ledger.filter((e) => e.status === 'ditahan' || e.status === 'layak' || e.status === 'dicairkan');
  const jasaTerkumpul = active.reduce((a, e) => a + (Number(e.service) || 0), 0);
  const sudahDicairkan = active.filter((e) => e.status === 'dicairkan').reduce((a, e) => a + (Number(e.service) || 0), 0);
  const menungguCair = jasaTerkumpul - sudahDicairkan;
  const feeTot = active.reduce((a, e) => a + (Number(e.fee) || 0), 0);
  const tiketTot = active.reduce((a, e) => a + (Number(e.ticket) || 0), 0);
  const routes = DB.load('routes', []);
  const bookings = DB.load('bookings', []);
  const gFee = platformFeeOf();
  const byId = (id) => bookings.find((b) => b.id === id);

  const exportCSV = () => {
    let csv = 'Kode,Kursi,Rute,Tanggal,Jam,Tiket,Jasa,Fee,Total,Status\n';
    active.forEach((e) => {
      const s = schedById(e.scheduleId);
      if (!s) return;
      const r = routeById(s.routeId);
      const b = byId(e.bookingId);
      const code = b?.code || e.bookingId;
      const seats = '"' + (e.seats || []).join(' ') + '"';
      const rute = '"' + (r ? r.from + '-' + r.to : '-') + '"';
      csv += `${code},${seats},${rute},${s.date},${s.time},${Number(e.ticket) || 0},${Number(e.service) || 0},${Number(e.fee) || 0},${Number(e.total) || 0},${e.status}\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'laporan-jasa.csv';
    a.click();
    toast('Laporan Excel (CSV) diunduh');
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon="hand-coins" label="Jasa Terkumpul" val={fmtRp(jasaTerkumpul)} sub={active.length + ' transaksi jasa'} color="bg-gradient-to-br from-sky-400 to-blue-600" />
        <StatCard icon="banknote" label="Sudah Dicairkan" val={fmtRp(sudahDicairkan)} sub="status dicairkan" color="bg-gradient-to-br from-green-400 to-emerald-600" />
        <StatCard icon="clock" label="Menunggu Cair" val={fmtRp(menungguCair)} sub="ditahan + layak" color="bg-gradient-to-br from-amber-400 to-orange-500" />
        <StatCard icon="percent" label={'Fee Platform (' + (gFee.type === 'flat' ? fmtRp(gFee.value) : gFee.value + '%') + ')'} val={fmtRp(feeTot)} sub={'info • tiket ' + fmtRp(tiketTot)} color="bg-gradient-to-br from-red-400 to-rose-600" />
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5 mt-4"><div className="flex items-center gap-2"><h3 className="font-extrabold text-[15px]">Jasa per Rute</h3><div className="flex-1"></div>
        <button onClick={exportCSV} className="bg-green-500 text-white text-[12px] font-extrabold px-4 py-2 rounded-xl">Export Excel</button>
        <button onClick={() => window.print()} className="bg-slate-100 text-[12px] font-extrabold px-4 py-2 rounded-xl">Export PDF</button></div>
        <div className="overflow-x-auto mt-2"><table className="data w-full min-w-[560px]"><thead><tr><th>Rute</th><th>Transaksi</th><th>Tiket</th><th>Jasa</th><th>Fee</th></tr></thead><tbody>
          {routes.map((r) => {
            const rb = active.filter((e) => schedById(e.scheduleId)?.routeId === r.id);
            if (!rb.length) return null;
            const tk = rb.reduce((a, e) => a + (Number(e.ticket) || 0), 0);
            const js = rb.reduce((a, e) => a + (Number(e.service) || 0), 0);
            const fe = rb.reduce((a, e) => a + (Number(e.fee) || 0), 0);
            return <tr key={r.id}><td className="font-bold">{r.from} → {r.to}</td><td>{rb.length}</td><td className="font-bold">{fmtRp(tk)}</td><td className="font-extrabold text-sky-700">{fmtRp(js)}</td><td className="text-red-500 font-bold">−{fmtRp(fe)}</td></tr>;
          })}
        </tbody></table></div></div>
      <div className="hidden"><Icon name="wallet" className="w-4 h-4" /></div>
    </div>
  );
}
