import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, schedById, viaSopirOf, totalBersihOf } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Empty } from '@/components/ui.jsx';
import { TicketView } from '@/components/TicketView.jsx';

const LEDGER_BADGE = {
  ditahan: ['b-pending', 'Ditahan'],
  layak: ['b-paid', 'Layak Cair'],
  dicairkan: ['b-done', 'Dicairkan'],
  void: ['b-cancel', 'Void'],
};

/* Tanggal + jam:menit waktu perangkat (bukan UTC server) untuk tampilan. */
const loc = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* Tabel dompet pengemudi — dipakai halaman Dompet pengemudi dan kartu
   terselip laporan pencairan admin (Settlement.jsx); satu sumber desain. */
export default function DriverLedgerTable({ entries, showBerangkat = true }) {
  const { openModal } = useApp();
  const bookings = DB.load('bookings', []);
  const codeOf = (e) => bookings.find((b) => b.id === e.bookingId)?.code || '-';
  const sorted = [...entries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return (
    <>
      <div className="table-wrap mt-3"><table className="data w-full min-w-[700px]"><thead><tr><th>Kode</th><th>Rute / Kursi</th><th>Nominal Tiket</th><th>Komisi Via Sopir</th><th>Total Bersih</th><th>Tgl Cair / Status</th></tr></thead><tbody>
        {sorted.map((e) => {
          const s = schedById(e.scheduleId);
          const r = s ? routeById(s.routeId) : null;
          const bg = LEDGER_BADGE[e.status] || ['b-wait', e.status];
          const vs = viaSopirOf(e, bookings);
          const berangkat = loc(s?.departedAt);
          return (
            <tr key={e.id}>
              <td className="font-mono font-extrabold">{(() => {
                /* Kode = tombol lihat tiket — hanya bila bookingnya ada
                   dan sudah lunas, pola sama dengan manifest tugas
                   pengemudi (Tasks.jsx). */
                const bk = bookings.find((b) => b.id === e.bookingId);
                if (!(bk && ['paid', 'done'].includes(bk.status))) return codeOf(e);
                return (
                  <button onClick={() => openModal(<TicketView bid={bk.id} />)} className="text-sky-700 hover:bg-sky-50 rounded-lg px-1.5 py-1 -ml-1.5 transition" title="Lihat Tiket">
                    {codeOf(e)}
                  </button>
                );
              })()}</td>
              <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}<br /><span className="text-slate-400">{(e.seats || []).join(', ') || '-'}</span>{showBerangkat && berangkat ? <span className="block text-[11px] text-slate-400 font-semibold">Berangkat {berangkat}</span> : null}</td>
              <td className="font-extrabold text-green-700">+{fmtRp(e.ticket)}</td>
              <td className="font-extrabold text-green-700">{vs > 0 ? `+${fmtRp(vs)}` : <span className="text-slate-300">–</span>}</td>
              <td className="font-extrabold">{fmtRp(totalBersihOf(e, bookings))}</td>
              <td><span className={`badge ${bg[0]}`}>{bg[1]}</span>{e.status === 'dicairkan' && loc(e.paidOutAt) ? <span className="block text-[11px] font-bold text-slate-600 mt-0.5">{loc(e.paidOutAt)}</span> : null}{e.status === 'layak' ? <span className="block text-[10px] font-semibold text-sky-600 mt-0.5">Otomatis</span> : null}</td>
            </tr>
          );
        })}
      </tbody></table></div>
      {sorted.length === 0 ? <Empty icon="wallet" msg="Belum ada dana tiket masuk." /> : null}
    </>
  );
}
