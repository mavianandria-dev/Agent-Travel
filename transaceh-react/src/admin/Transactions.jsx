import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, agencyById, feeFor } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { BadgeStatus } from '@/components/ui.jsx';

export function Transactions() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const list = DB.load('bookings', []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const f = list.filter((b) => !q || (b.code || '').toLowerCase().includes(q.toLowerCase()));
  const exportCSV = () => {
    let csv = 'Kode,Nama,Kursi,Rute,Tanggal,Jam,Total,Status\n';
    f.forEach((b) => { const s = schedById(b.scheduleId); if (!s) return; const r = routeById(s.routeId); csv += `${b.code},"${(b.passengers || []).map((p) => p.name).join(';')}","${(b.seats || []).join(' ')}","${r.from}-${r.to}",${s.date},${s.time},${b.total},${b.status}\n`; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'laporan-transaksi.csv';
    a.click();
    toast('Laporan Excel (CSV) diunduh');
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <div className="flex items-center gap-2 flex-wrap"><h3 className="font-extrabold text-[16px]">Monitoring Semua Transaksi</h3><div className="flex-1"></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode..." className="text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring w-44" />
        <button onClick={exportCSV} className="bg-green-500 text-white text-[12px] font-extrabold px-4 py-2.5 rounded-xl">Export</button></div>
      <div className="table-wrap mt-3"><table className="data w-full min-w-[760px]"><thead><tr><th>Kode</th><th>User</th><th>Jadwal / Agen</th><th>Total / Fee</th><th>Status</th></tr></thead><tbody>
        {f.slice(0, 60).map((b) => {
          const s = schedById(b.scheduleId); if (!s) return null;
          const r = routeById(s.routeId); const ag = agencyById(s.agencyId);
          return (
            <tr key={b.id}><td className="font-mono font-extrabold">{b.code}</td><td className="text-[12.5px] font-semibold">{b.userEmail}</td>
              <td className="text-[12.5px]">{r.from}→{r.to} {s.date}<br /><span className="text-slate-400">{ag?.name} • {b.payMethod}</span></td>
              <td className="font-extrabold">{fmtRp(b.total)}<br /><span className="text-[11px] text-violet-600 font-bold">fee {fmtRp(feeFor(s.agencyId, b.total))}</span></td><td><BadgeStatus st={b.status} /></td></tr>
          );
        })}
      </tbody></table></div>
    </div>
  );
}
