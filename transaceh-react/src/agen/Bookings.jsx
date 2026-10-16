import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, vehicleById, vehName, driverById, schedById, bookingsOf, agencyById, audit, notify, processWaiting, splitFare, createLedger } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon, BadgeStatus, fmtDate } from '@/components/ui.jsx';

export function ManifestModal({ sid }) {
  const { closeModal } = useApp();
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const dr = driverById(s.driverId);
  const bk = bookingsOf(sid);
  let lay = [];
  try { lay = (v && Array.isArray(v.layout) && v.layout.length === 28) ? v.layout : []; } catch (e) { lay = []; }
  const order = lay.filter((c) => c.type === 'seat' || c.type === 'off').map((c) => c.sid);
  const bookedExtra = [...new Set(bk.flatMap((b) => b.seats || []))].filter((id) => !order.includes(id));
  const offSet = new Set(lay.filter((c) => c.type === 'off').map((c) => c.sid));
  return (
    <div className="p-6 print-only-off">
      <div className="flex items-center justify-between"><h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="clipboard-list" className="w-5 h-5 text-sky-600" />Manifest Penumpang</h3><button onClick={() => closeModal()} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="text-[13px] font-bold mt-2">{r?.from} → {r?.to} • {fmtDate(s.date)} {s.time}<br /><span className="text-slate-500 font-medium">{vehName(v)} {v?.plate} • Pengemudi: {dr?.name}</span></div>
      <table className="data w-full mt-3"><thead><tr><th>#</th><th>Kursi</th><th>Nama</th><th>HP</th><th>Jemput</th><th>Status</th></tr></thead><tbody>
        {[...order, ...bookedExtra].map((st) => {
          const b = bk.find((x) => (x.seats || []).includes(st));
          const p = b?.passengers.find((x) => x.seat === st);
          const vehOff = offSet.has(st);
          const blocked = (s.blockedSeats || []).includes(st);
          return (
            <tr key={st}><td>{st}</td><td className="font-extrabold">{st}</td><td className="font-semibold">{p ? p.name : vehOff ? <span className="text-slate-400">— nonaktif (armada) —</span> : blocked ? <span className="text-slate-400">— diblokir —</span> : <span className="text-slate-300">— kosong —</span>}</td><td>{p ? p.phone : '-'}</td><td className="text-[12px]">{p ? (p.pickup || '-') + (p.pickupCoords ? ' • ' + p.pickupCoords : '') : '-'}</td><td>{b ? <BadgeStatus st={b.status} /> : (vehOff || blocked) ? <span className="badge b-cancel">Tutup</span> : <span className="badge b-wait">Kosong</span>}</td></tr>
          );
        })}
      </tbody></table>
      <button onClick={() => window.print()} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl no-print"><Icon name="printer" className="w-4 h-4 inline" /> Cetak Manifest</button>
    </div>
  );
}

function CancelModal({ bid }) {
  const { closeModal, toast, refresh } = useApp();
  const b = DB.load('bookings', []).find((x) => x.id === bid);
  if (!b) return <div className="p-6 font-bold text-slate-500">Booking tidak ditemukan</div>;
  const s = schedById(b.scheduleId);
  const h = (new Date(s.date + 'T' + s.time) - Date.now()) / 36e5;
  const pol = ((agencyById(s.agencyId)?.refundPolicy) || []).slice().sort((a, b2) => b2.minH - a.minH);
  const rule = pol.find((p) => h >= p.minH) || { pct: 0 };
  const doCancel = () => {
    const arr = DB.load('bookings', []);
    const m = arr.find((x) => x.id === bid);
    m.status = 'cancelled';
    m.refundPct = rule.pct;
    m.refundAmount = Math.round(m.total * (rule.pct / 100));
    DB.save('bookings', arr); refresh();
    audit('booking_cancel', m.code + ' • refund ' + m.refundPct + '%');
    notify(m.userEmail, 'Booking dibatalkan — ' + m.code, 'Refund ' + fmtRp(m.refundAmount || 0) + ' (' + (m.refundPct || 0) + '%) diproses 1–3 hari kerja.', 'WA');
    processWaiting(m.scheduleId);
    closeModal();
    toast('Booking dibatalkan. Refund ' + fmtRp(m.refundAmount || 0), 'info');
    refresh();
  };
  return (
    <div className="p-6"><h3 className="font-extrabold text-[17px]">Batalkan Booking?</h3>
      <p className="text-[13px] text-slate-500 font-medium mt-1">Refund mengikuti kebijakan agen: H-3 = 100%, H-1 = 50%, hari-H = 0%.</p>
      <div className="mt-3"><div className="bg-sky-50 rounded-2xl p-3 text-[13px] font-bold text-sky-900">Estimasi refund: <b>{rule.pct}% × {fmtRp(b.total)} = {fmtRp(Math.round(b.total * rule.pct / 100))}</b><br /><span className="font-medium text-[12px]">Keberangkatan {Math.max(0, Math.round(h))} jam lagi</span></div></div>
      <div className="flex gap-2 mt-4"><button onClick={() => closeModal()} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={doCancel} className="flex-1 bg-red-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl">Ya, Batalkan</button></div></div>
  );
}

export default function Bookings({ ag }) {
  const { user, filter, setFilter, toast, openModal, closeModal, refresh, tick } = useApp();
  void tick;
  void todayStr;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const schIds = DB.load('schedules', []).filter((s) => s.agencyId === agency.id).map((s) => s.id);
  const all = DB.load('bookings', []).filter((b) => schIds.includes(b.scheduleId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const q = (filter.q || '').toLowerCase();
  const list = all.filter((b) => {
    if (q && !(b.code.toLowerCase().includes(q) || (b.passengers || []).some((p) => (p.name || '').toLowerCase().includes(q)))) return false;
    if (filter.date) { const s = schedById(b.scheduleId); if (!s || s.date !== filter.date) return false; }
    if (filter.status && filter.status !== 'all' && b.status !== filter.status) return false;
    return true;
  });

  const verifyPay = (bid) => {
    const arr = DB.load('bookings', []);
    const b = arr.find((x) => x.id === bid);
    if (!b) return;
    b.status = 'paid';
    b.paidAt = new Date().toISOString();
    b.fare = splitFare(schedById(b.scheduleId), (b.seats || []).length, b.discount || 0);
    DB.save('bookings', arr); refresh();
    createLedger(b); refresh();
    audit('verify_manual', b.code);
    toast('Pembayaran ' + b.code + ' diverifikasi manual (transfer)');
    refresh();
  };

  const exportCSV = () => {
    const schId2 = DB.load('schedules', []).filter((s) => s.agencyId === agency.id).map((s) => s.id);
    const rows = DB.load('bookings', []).filter((b) => schId2.includes(b.scheduleId));
    let csv = 'Kode,Nama,Kursi,Rute,Tanggal,Jam,Total,Status\n';
    rows.forEach((b) => { const s = schedById(b.scheduleId); if (!s) return; const r = routeById(s.routeId); csv += `${b.code},"${(b.passengers || []).map((p) => p.name).join(';')}","${(b.seats || []).join(' ')}","${r.from}-${r.to}",${s.date},${s.time},${b.total},${b.status}\n`; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'laporan-booking.csv';
    a.click();
    toast('Laporan Excel (CSV) diunduh');
  };

  const manifest = (sid) => openModal(<ManifestModal sid={sid} />);
  const cancelBooking = (bid) => openModal(<CancelModal bid={bid} />);

  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[16px]">Manajemen Booking</h3><div className="flex-1"></div>
        <input value={filter.q || ''} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Cari kode / nama..." className="text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring w-52" />
        <input type="date" value={filter.date || ''} onChange={(e) => setFilter({ ...filter, date: e.target.value })} className="text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" />
        <select value={filter.status || ''} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className="text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring">
          <option value="">Semua status</option><option value="pending">Menunggu Bayar</option><option value="paid">Lunas</option><option value="done">Selesai</option><option value="cancelled">Dibatalkan</option>
        </select>
        <button onClick={exportCSV} className="bg-green-500 text-white text-[12px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="file-spreadsheet" className="w-4 h-4" />Excel</button></div>
      <div className="table-wrap mt-3">
        <table className="data w-full min-w-[760px]"><thead><tr><th>Kode</th><th>Penumpang</th><th>Jadwal</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {list.map((b) => {
            const s = schedById(b.scheduleId);
            if (!s) return null;
            const r = routeById(s.routeId);
            return (
              <tr key={b.id}><td className="font-mono font-extrabold">{b.code}</td><td className="font-semibold">{b.passengers[0]?.name} <span className="text-slate-400">+{(b.seats || []).length - 1}</span><br /><span className="text-[12px] text-slate-400">{(b.seats || []).join(', ')}</span></td>
                <td className="font-medium">{r.from}→{r.to}<br /><span className="text-slate-400 text-[12px]">{fmtDate(s.date)} {s.time}</span></td><td className="font-extrabold">{fmtRp(b.total)}</td><td><BadgeStatus st={b.status} /></td>
                <td className="whitespace-nowrap"><div className="flex gap-1.5">
                  {b.status === 'pending' ? <button onClick={() => verifyPay(b.id)} title="Verifikasi manual" className="bg-green-100 text-green-700 p-2 rounded-lg"><Icon name="check-check" className="w-4 h-4" /></button> : null}
                  <button onClick={() => manifest(s.id)} title="Manifest" className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="printer" className="w-4 h-4" /></button>
                  {b.status !== 'cancelled' ? <button onClick={() => cancelBooking(b.id)} className="bg-red-50 text-red-500 p-2 rounded-lg"><Icon name="x" className="w-4 h-4" /></button> : null}
                </div></td></tr>
            );
          })}
          {!list.length ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">Tidak ada pesanan</td></tr> : null}
        </tbody></table>
      </div>
      {closeModal ? null : null}
    </div>
  );
}
