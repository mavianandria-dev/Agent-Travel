import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, schedById, viaSopirOf } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { StatCard, Icon } from '@/components/ui.jsx';
import { ManifestModal } from './Bookings.jsx';

export default function Finance({ ag, st }) {
  const { user, toast, tick, openModal } = useApp();
  void tick;
  void st;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;

  const ledger = DB.load('ledger', []).filter((e) => e.agencyId === agency.id && e.status !== 'void');
  const active = ledger.filter((e) => e.status === 'ditahan' || e.status === 'layak' || e.status === 'dicairkan');
  const bookings = DB.load('bookings', []);
  const byId = (id) => bookings.find((b) => b.id === id);
  /* Komisi via sopir per entri — helper domain (baris lama dihitung
     ulang dari bookingnya). Jasa bersih = jasa − komisi — uang yang
     benar-benar milik agen; dipakai card indikator dan tabel. */
  const bersihOf = (e) => Math.max(0, (Number(e.service) || 0) - viaSopirOf(e, bookings));
  /* Card indikator pola dompet pengemudi: tiga status, basis jasa bersih.
     "Sudah Dicairkan" tetap memakai cap sistem servicePaidOutAt (jasa cair
     otomatis 5 menit setelah tiba) — baris dicairkan lama tanpa cap jasa
     tidak dihitung terkirim, dan tidak dihitung ganda di Layak Cair. */
  const sumBersih = (fn) => active.filter(fn).reduce((a, e) => a + bersihOf(e), 0);
  const pending = sumBersih((e) => e.status === 'ditahan');
  const layak = sumBersih((e) => e.status === 'layak' && !e.servicePaidOutAt);
  const done = sumBersih((e) => !!e.servicePaidOutAt);
  /* Tanggal + jam:menit waktu perangkat (bukan UTC server) untuk tampilan. */
  const loc = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  /* Kelompokkan per keberangkatan (jadwal): satu baris = satu berangkat,
     semua nilai dijumlahkan; urut keberangkatan terbaru di atas. */
  const groups = [];
  const seen = {};
  active.forEach((e) => {
    const sid = String(e.scheduleId || '');
    if (!seen[sid]) { seen[sid] = { sid, items: [] }; groups.push(seen[sid]); }
    seen[sid].items.push(e);
  });
  const depKey = (g) => {
    const s = schedById(g.sid);
    return String(s?.departedAt || (s ? `${s.date || ''}T${s.time || ''}` : '') || '');
  };
  groups.sort((a, b) => depKey(b).localeCompare(depKey(a)));

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
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <StatCard icon="timer" label="Saldo Menunggu" val={fmtRp(pending)} sub="ditahan" color="bg-gradient-to-br from-amber-400 to-orange-500" />
        <StatCard icon="hand-coins" label="Layak Cair" val={fmtRp(layak)} sub="layak" color="bg-gradient-to-br from-green-400 to-emerald-600" />
        <StatCard icon="banknote" label="Sudah Dicairkan" val={fmtRp(done)} sub="dicairkan" color="bg-gradient-to-br from-sky-400 to-blue-600" />
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5 mt-4"><div className="flex items-center gap-2"><h3 className="font-extrabold text-[15px]">Riwayat Jasa</h3><div className="flex-1"></div>
        <button onClick={exportCSV} className="bg-green-500 text-white text-[12px] font-extrabold px-4 py-2 rounded-xl">Export Excel</button>
        <button onClick={() => window.print()} className="bg-slate-100 text-[12px] font-extrabold px-4 py-2 rounded-xl">Export PDF</button></div>
        <div className="overflow-x-auto mt-2"><table className="data w-full min-w-[780px]"><thead><tr><th>Manifest</th><th>Rute</th><th>Nominal Jasa</th><th>Komisi Sopir</th><th>Jasa Bersih</th><th>Tgl Cair / Status</th></tr></thead><tbody>
          {groups.map((g) => {
            const s = schedById(g.sid);
            const r = s ? routeById(s.routeId) : null;
            /* Komisi via sopir dijumlah per tiket — helper domain; baris
               lama dihitung ulang dari bookingnya. */
            const vs = g.items.reduce((a, e) => a + viaSopirOf(e, bookings), 0);
            const jasa = g.items.reduce((a, e) => a + (Number(e.service) || 0), 0);
            const bersih = Math.max(0, jasa - vs);
            const berangkat = loc(s?.departedAt) || (s ? `${s.date || ''} ${s.time || ''}`.trim() : '');
            const tiba = loc(s?.arrivedAt);
            /* Status kelompok: jasa cair otomatis 5 menit setelah tiba —
               semua terkirim (cap servicePaidOutAt) → Dicairkan + jam. */
            const allCair = g.items.every((e) => e.servicePaidOutAt);
            const anyTahan = g.items.some((e) => e.status === 'ditahan');
            const badge = allCair ? ['b-done', 'Dicairkan'] : anyTahan ? ['b-pending', 'Ditahan'] : ['b-paid', 'Layak Cair'];
            const cairAt = allCair ? loc(g.items.map((e) => e.servicePaidOutAt).sort().pop()) : '';
            return (
              <tr key={g.sid || g.items[0]?.id}>
                <td><button onClick={() => openModal(<ManifestModal sid={g.sid} />)} title="Manifest" className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="users" className="w-4 h-4" /></button></td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}{berangkat ? <span className="block text-[11px] text-slate-400 font-semibold">Berangkat {berangkat}</span> : null}{tiba ? <span className="block text-[11px] text-slate-400 font-semibold">Tiba {tiba}</span> : null}</td>
                <td className="font-extrabold text-green-700">+{fmtRp(jasa)}</td>
                <td className="font-extrabold text-red-600">{vs > 0 ? `-${fmtRp(vs)}` : <span className="text-slate-300">–</span>}</td>
                <td className="font-extrabold">{fmtRp(bersih)}</td>
                <td><span className={`badge ${badge[0]}`}>{badge[1]}</span>{cairAt ? <span className="block text-[11px] font-bold text-slate-600 mt-0.5">{cairAt}</span> : null}{!allCair && !anyTahan ? <span className="block text-[10px] font-semibold text-sky-600 mt-0.5">Otomatis</span> : null}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {groups.length === 0 ? <p className="text-[12.5px] text-slate-400 font-semibold mt-3">Belum ada transaksi jasa — baris muncul saat ada tiket lunas.</p> : null}</div>
      <div className="hidden"><Icon name="wallet" className="w-4 h-4" /></div>
    </div>
  );
}
