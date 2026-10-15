import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, schedById, feeFor } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { StatCard, Icon } from '@/components/ui.jsx';

export default function Finance({ ag, st }) {
  const { user, toast, tick } = useApp();
  void tick;
  void st;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const schIds = DB.load('schedules', []).filter((s) => s.agencyId === agency.id).map((s) => s.id);
  const paid = DB.load('bookings', []).filter((b) => schIds.includes(b.scheduleId) && (b.status === 'paid' || b.status === 'done'));
  const pays = DB.load('payments', []).filter((p) => paid.some((b) => b.id === p.bookingId));
  const feeTot = pays.reduce((a, p) => a + (p.fee || 0), 0);
  const totRev = paid.reduce((a, b) => a + b.total, 0);
  const routes = DB.load('routes', []);
  const refundTot = DB.load('bookings', []).filter((b) => schIds.includes(b.scheduleId) && b.status === 'cancelled').reduce((a, b) => a + (b.refundAmount || 0), 0);

  const exportCSV = () => {
    let csv = 'Kode,Nama,Kursi,Rute,Tanggal,Jam,Total,Status\n';
    paid.forEach((b) => { const s = schedById(b.scheduleId); if (!s) return; const r = routeById(s.routeId); csv += `${b.code},"${(b.passengers || []).map((p) => p.name).join(';')}","${(b.seats || []).join(' ')}","${r.from}-${r.to}",${s.date},${s.time},${b.total},${b.status}\n`; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'laporan-booking.csv';
    a.click();
    toast('Laporan Excel (CSV) diunduh');
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon="banknote" label="Omzet (GMV)" val={fmtRp(totRev)} sub={paid.length + ' transaksi lunas'} color="bg-gradient-to-br from-green-400 to-emerald-600" />
        <StatCard icon="percent" label={'Fee Platform (' + (agency.feeType === 'flat' ? fmtRp(agency.feeValue) : agency.feeValue + '%') + ')'} val={fmtRp(feeTot)} sub="dipotong otomatis" color="bg-gradient-to-br from-red-400 to-rose-600" />
        <StatCard icon="hand-coins" label="Bersih Diterima" val={fmtRp(totRev - feeTot)} sub="setelah fee" color="bg-gradient-to-br from-sky-400 to-blue-600" />
        <StatCard icon="ticket-x" label="Refund Keluar" val={fmtRp(refundTot)} sub="pembatalan" color="bg-gradient-to-br from-amber-400 to-orange-500" />
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5 mt-4"><div className="flex items-center gap-2"><h3 className="font-extrabold text-[15px]">Pendapatan per Rute</h3><div className="flex-1"></div>
        <button onClick={exportCSV} className="bg-green-500 text-white text-[12px] font-extrabold px-4 py-2 rounded-xl">Export Excel</button>
        <button onClick={() => window.print()} className="bg-slate-100 text-[12px] font-extrabold px-4 py-2 rounded-xl">Export PDF</button></div>
        <div className="overflow-x-auto mt-2"><table className="data w-full min-w-[560px]"><thead><tr><th>Rute</th><th>Booking</th><th>Omzet</th><th>Fee</th><th>Bersih</th></tr></thead><tbody>
          {routes.map((r) => {
            const rb = paid.filter((b) => schedById(b.scheduleId)?.routeId === r.id);
            if (!rb.length) return null;
            const om = rb.reduce((a, b) => a + b.total, 0);
            const fe = rb.reduce((a, b) => a + feeFor(agency.id, b.total), 0);
            return <tr key={r.id}><td className="font-bold">{r.from} → {r.to}</td><td>{rb.length}</td><td className="font-extrabold">{fmtRp(om)}</td><td className="text-red-500 font-bold">−{fmtRp(fe)}</td><td className="font-extrabold text-green-700">{fmtRp(om - fe)}</td></tr>;
          })}
        </tbody></table></div></div>
      <div className="hidden"><Icon name="wallet" className="w-4 h-4" /></div>
    </div>
  );
}
