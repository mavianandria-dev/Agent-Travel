import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, vehicleById, vehName, driverById, schedById, takenSeats, vehLayout, schedSeatCap, schedReady, scheduleInHistory, scheduleHasTransactions, bookingsOf, audit } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { ManifestModal } from './Bookings.jsx';
import { SchedFormModal } from './SchedForm.jsx';
import CancelTripModal from '@/components/CancelTripModal.jsx';

function BlockSeatModal({ sid }) {
  const { closeModal, toast, refresh, tick } = useApp();
  void tick;
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const order = vehLayout(vehicleById(s.vehicleId)).filter((c) => c.type === 'seat' || c.type === 'off').map((c) => c.sid);
  const toggleBlock = (st) => {
    const arr = DB.load('schedules', []);
    const m = arr.find((x) => x.id === sid);
    m.blockedSeats = m.blockedSeats || [];
    m.blockedSeats = m.blockedSeats.includes(st) ? m.blockedSeats.filter((x) => x !== st) : [...m.blockedSeats, st];
    DB.save('schedules', arr); refresh();
    audit('seat_block', sid + ' ' + st);
    refresh();
  };
  void toast;
  return (
    <div className="p-6"><h3 className="font-extrabold text-[16px]">Tutup / Buka Kursi Manual</h3><p className="text-[12px] text-slate-500 font-medium">Klik kursi untuk blokir (maintenance/operasional).</p>
      <div className="grid grid-cols-4 gap-2 mt-3">{order.map((st) => <button key={st} onClick={() => toggleBlock(st)} className={`rounded-xl border-2 py-3 font-extrabold text-[14px] min-h-[60px] ${(s.blockedSeats || []).includes(st) ? 'border-red-400 bg-red-50 text-red-600' : 'border-green-300 bg-green-50 text-green-700'}`}>{st}<br /><span className="text-[10px]">{(s.blockedSeats || []).includes(st) ? 'DIBLOKIR' : 'BUKA'}</span></button>)}</div>
      <button onClick={() => { closeModal(); refresh(); }} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Selesai</button></div>
  );
}

export default function Schedules({ ag }) {
  const { user, openModal, toast, refresh, tick } = useApp();
  const [tab, setTab] = useState('upcoming');
  void tick;
  void schedReady;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const all = DB.load('schedules', []).filter((s) => s.agencyId === agency.id).sort((a, b) => (a.date + b.time).localeCompare(b.date + b.time));
  const upcoming = all.filter((s) => !scheduleInHistory(s));
  const history = all.filter(scheduleInHistory);
  const missed = all.filter((s) => s.tripStatus === 'missed' && !s.reviewedAt);
  const list = tab === 'upcoming' ? upcoming : history;

  const schedForm = () => openModal(<SchedFormModal agId={agency.id} />);
  const manifest = (sid) => openModal(<ManifestModal sid={sid} />);
  const blockSeat = (sid) => openModal(<BlockSeatModal sid={sid} />);
  const cancelTrip = (sid) => openModal(<CancelTripModal sid={sid} by="agen" />);
  const delSched = (id) => {
    if (scheduleHasTransactions(id)) { toast('Jadwal sudah memiliki booking/ledger — tidak bisa dihapus', 'err'); return; }
    if (!window.confirm('Hapus jadwal ini?')) return;
    DB.save('schedules', DB.load('schedules', []).filter((s) => s.id !== id)); refresh();
    audit('schedule_delete', id);
    toast('Jadwal dihapus', 'info');
    refresh();
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <div className="flex items-center gap-2"><h3 className="font-extrabold text-[16px]">Penjadwalan Keberangkatan</h3><div className="flex-1"></div>
        <button onClick={schedForm} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Tambah Jadwal</button></div>

      {missed.length ? <div className="mt-3 bg-amber-50 border-2 border-amber-200 rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
        <Icon name="triangle-alert" className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-[12.5px] font-semibold text-amber-800 flex-1">{missed.length} jadwal sudah terlewat dan perlu diselesaikan.</span>
        <button onClick={() => setTab('history')} className="text-[12px] font-extrabold text-amber-700 hover:text-amber-900">Lihat Riwayat</button>
      </div> : null}

      <div className="flex gap-2 mt-3">
        <button onClick={() => setTab('upcoming')} className={`text-[12px] font-extrabold px-3.5 py-2 rounded-xl ${tab === 'upcoming' ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Akan Datang ({upcoming.length})</button>
        <button onClick={() => setTab('history')} className={`text-[12px] font-extrabold px-3.5 py-2 rounded-xl ${tab === 'history' ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Riwayat ({history.length})</button>
      </div>

      <div className="table-wrap mt-3"><table className="data w-full min-w-[720px]"><thead><tr><th>Tanggal / Jam</th><th>Rute</th><th>Armada / Pengemudi &amp; Pengganti</th><th>Harga</th><th>Terisi</th><th>Aksi</th></tr></thead><tbody>
        {list.map((s) => {
          const r = routeById(s.routeId);
          const v = vehicleById(s.vehicleId);
          const dr = driverById(s.driverId);
          const drvNama = s.driverName || dr?.name || v?.drvName || '—';
          const back = s.backupName || v?.backName || '';
          const tk = takenSeats(s.id);
          const hasBooking = bookingsOf(s.id).length > 0;
          const historical = tab === 'history' || ['ontrip', 'arrived', 'missed'].includes(s.tripStatus);
          return (
            <tr key={s.id}><td className="font-bold">{fmtDate(s.date)}<br /><span className="text-sky-600">{s.time}</span> {s.tripStatus !== 'scheduled' ? <BadgeStatus st={s.tripStatus} /> : null}</td>
              <td className="font-semibold">{r?.from} → {r?.to}</td>
              <td className="text-[12.5px] font-medium">{vehName(v)}{v?.plate ? <span className="text-slate-400"> • {v.plate}</span> : null}<br /><span className="text-slate-500">{drvNama}</span><br /><span className="text-[11.5px] text-slate-400">Pengganti: {back || '—'}</span></td>
              <td className="font-extrabold">{fmtRp(s.price)}</td>
              <td><div className="flex items-center gap-1.5"><div className="w-16 h-2 bg-slate-100 rounded-full"><div className="h-full bg-sky-500 rounded-full" style={{ width: (tk.paid.length / schedSeatCap(s.id)) * 100 + '%' }}></div></div><b className="text-[12px]">{tk.paid.length}/{schedSeatCap(s.id)}</b></div></td>
              <td><div className="flex gap-1.5"><button onClick={() => manifest(s.id)} title="Manifest" className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="users" className="w-4 h-4" /></button>
                {!historical ? <button onClick={() => blockSeat(s.id)} title="Tutup/buka kursi" className="bg-amber-100 text-amber-700 p-2 rounded-lg"><Icon name="ban" className="w-4 h-4" /></button> : null}
                {!historical && hasBooking ? <button onClick={() => cancelTrip(s.id)} title="Batalkan jadwal (refund 100%)" className="bg-red-50 text-red-600 p-2 rounded-lg"><Icon name="calendar-x" className="w-4 h-4" /></button> : null}
                {!historical && !hasBooking ? <button onClick={() => delSched(s.id)} title="Hapus jadwal" className="bg-red-50 text-red-500 p-2 rounded-lg"><Icon name="trash-2" className="w-4 h-4" /></button> : null}</div></td></tr>
          );
        })}
      </tbody></table></div>
      {list.length === 0 ? <div className="text-center text-[13px] font-semibold text-slate-400 py-7">{tab === 'upcoming' ? 'Belum ada jadwal mendatang.' : 'Belum ada riwayat jadwal.'}</div> : null}
    </div>
  );
}
