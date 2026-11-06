import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, vehicleById, vehName, driverById, takenSeats, schedSeatCap, schedReady, scheduleInHistory, scheduleHasTransactions, bookingsOf, audit, scheduleMaintenance, maintenancePeriodLabel, schedById, scheduleDepartureMs, resolveDelayRequest, tripProgress } from '@/lib/domain.js';
import { fmtRp, fmtClock } from '@/lib/utils.js';
import { Icon, BadgeStatus, fmtDate, EtaBar } from '@/components/ui.jsx';
import { ManifestModal } from './Bookings.jsx';
import { SchedFormModal } from './SchedForm.jsx';
import CancelTripModal from '@/components/CancelTripModal.jsx';
import BlockSeatModal from '@/components/BlockSeatModal.jsx';
import { IS_SHEETS } from '@/lib/runtime.js';
import { pullSnapshotSoft } from '@/lib/remote.js';

export default function Schedules({ ag }) {
  const { user, openModal, toast, refresh, tick } = useApp();
  const [tab, setTab] = useState('upcoming');
  void tick;
  void schedReady;
  /* Tarik snapshot segar saat halaman dibuka dan tiap kembali ke layar:
     permintaan delay pengemudi, jadwal baru, dan pembatalan hanya hidup di
     server — tanpa ini banner & daftar menampilkan kondisi saat login.
     pullSnapshotSoft memagari rem 8 dtk; gagal jaringan dibungkam. */
  useEffect(() => {
    if (!IS_SHEETS) return undefined;
    const pull = () => pullSnapshotSoft().then((pulled) => { if (pulled) refresh(); });
    pull();
    window.addEventListener('focus', pull);
    return () => window.removeEventListener('focus', pull);
  }, [refresh]);
  /* Jam lokal: badge waktu-nyata (alarm "belum konfirmasi tiba") harus
     bergerak sendiri tiap 30 detik, pola sama dengan halaman Tugas. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const all = DB.load('schedules', []).filter((s) => s.agencyId === agency.id).sort((a, b) => (a.date + b.time).localeCompare(b.date + b.time));
  const bookedIds = new Set(DB.load('bookings', []).map((b) => b.scheduleId));
  const upcoming = all.filter((s) => !scheduleInHistory(s));
  const history = all.filter(scheduleInHistory);
  const missed = all.filter((s) => s.tripStatus === 'missed' && !s.reviewedAt);
  /* Permintaan delay > 180 mnt dari pengemudi yang menunggu keputusan agen. */
  const reqList = all.filter((s) => s.delayReqStatus === 'menunggu');
  const list = tab === 'upcoming' ? upcoming : history;

  const schedForm = () => openModal(<SchedFormModal agId={agency.id} />);
  /* Edit jadwal dasar: id dipertahankan di SchedFormModal mode sched. */
  const editSched = (sid) => openModal(<SchedFormModal agId={agency.id} sched={schedById(sid)} />);
  const manifest = (sid) => openModal(<ManifestModal sid={sid} />);
  const blockSeat = (sid) => openModal(<BlockSeatModal sid={sid} by="agen" />);
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

      {reqList.length ? <div className="mt-3 bg-amber-500 rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-white">
        <Icon name="timer" className="w-4 h-4 shrink-0" />
        <span className="text-[12.5px] font-extrabold flex-1">{reqList.length} permintaan delay keberangkatan menunggu persetujuan agen.</span>
        <button onClick={() => setTab('upcoming')} className="text-[12px] font-extrabold bg-white/15 hover:bg-white/25 rounded-xl px-3 py-1.5 outline outline-white/40">Tinjau</button>
      </div> : null}

      <div className="flex gap-2 mt-3">
        <button onClick={() => setTab('upcoming')} className={`text-[12px] font-extrabold px-3.5 py-2 rounded-xl ${tab === 'upcoming' ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Akan Datang ({upcoming.length})</button>
        <button onClick={() => setTab('history')} className={`text-[12px] font-extrabold px-3.5 py-2 rounded-xl ${tab === 'history' ? 'bg-[#0b2447] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Riwayat ({history.length})</button>
      </div>

      <div className="table-wrap mt-4"><table className="data w-full min-w-[720px]"><thead><tr><th>Tanggal / Jam</th><th>Rute</th><th>Armada / Pengemudi &amp; Pengganti</th><th>Harga</th><th>Terisi</th><th>Aksi</th></tr></thead><tbody>
        {list.map((s) => {
          const r = routeById(s.routeId);
          const v = vehicleById(s.vehicleId);
          const dr = driverById(s.driverId);
          const drvNama = s.driverName || dr?.name || v?.drvName || '—';
          const back = s.backupName || v?.backName || '';
          const tk = takenSeats(s.id);
          const capN = schedSeatCap(s.id);
          const hasBooking = bookingsOf(s.id).some((b) => ['pending', 'paid'].includes(b.status));
          const hasTransactions = scheduleHasTransactions(s.id);
          const mt = scheduleMaintenance(s);
          const historical = tab === 'history' || ['ontrip', 'arrived', 'missed'].includes(s.tripStatus);
          /* Alarm tiba (cermin alarm pengemudi): masih dalam perjalanan +
             ETA terlewati 10 menit — agen melihat tanda yang sama. */
          const prog = s.tripStatus === 'ontrip' ? tripProgress(s, r, now) : null;
          const arrAlarm = prog && prog.totalMin > 0 && now >= prog.end + 10 * 60 * 1000;
          /* Info perjalanan + tag lokasi (JSON string → area/addr). */
          const parseGeo = (str) => { try { const g = JSON.parse(str); return g && g.ok ? g : null; } catch { return null; } };
          const depGeo = parseGeo(s.departGeo);
          const arrGeo = parseGeo(s.arriveGeo);
          const tripLine = [
            s.departedAt ? 'Berangkat ' + fmtClock(new Date(s.departedAt).getTime()) : null,
            s.arrivedAt ? 'Tiba ' + fmtClock(new Date(s.arrivedAt).getTime()) : null,
          ].filter(Boolean).join(' · ');
          const geoLine = [
            depGeo ? 'Berangkat: ' + (depGeo.area || depGeo.addr || '-') : null,
            arrGeo ? 'Tiba: ' + (arrGeo.area || arrGeo.addr || '-') : null,
          ].filter(Boolean).join(' • ');
          const geoFull = [depGeo?.addr, arrGeo?.addr].filter(Boolean).join(' • ');
          return (
            <tr key={s.id}><td className="font-bold">{fmtDate(s.date)}<br /><span className="text-sky-600">{s.time}</span> {!bookedIds.has(s.id) ? <span className="badge bg-slate-200 text-slate-700 ml-1">Tidak ada pemesan</span> : null} {mt ? <span className="badge bg-red-100 text-red-700 italic ml-1">{mt.legacy ? 'MAINTENANCE' : 'MAINTENANCE ' + maintenancePeriodLabel(mt)}</span> : null} {s.tripStatus !== 'scheduled' ? <BadgeStatus st={s.tripStatus} /> : null}{s.tripStatus === 'scheduled' && s.delayUntil && new Date(s.delayUntil).getTime() > Date.now() ? <span className="badge bg-amber-100 text-amber-700 ml-1" title={'Estimasi ' + s.delayUntil}>Delay {s.delayMinutes}m</span> : null}{s.delayReqStatus === 'menunggu' ? <span className="badge bg-amber-500 text-white ml-1" title={'Permintaan +' + s.delayReqMinutes + ' mnt oleh ' + (s.delayReqBy || 'pengemudi')}><Icon name="timer" className="w-3 h-3 inline pointer-events-none" /> Permintaan {s.delayReqMinutes}m</span> : null}{arrAlarm ? <span className="badge bg-red-100 text-red-700 animate-pulse ml-1" title="Estimasi tiba sudah lewat 10 menit — pengemudi belum konfirmasi Tiba"><Icon name="timer" className="w-3 h-3 inline pointer-events-none" /> Belum konfirmasi tiba</span> : null}{s.lateCompletion ? <button onClick={() => openModal(<LateArriveModal sid={s.id} />)} className="badge bg-violet-100 text-violet-700 ml-1 cursor-pointer" title="Tiba ditandai tanpa catatan berangkat — klik untuk alasan pengakuan">Tiba tanpa berangkat</button> : null}</td>
              <td className="font-semibold">{r?.from} → {r?.to}{prog ? <div className="mt-1.5"><EtaBar prog={prog} ariaCtx={(s.date || '') + ' ' + (s.time || '')} /></div> : null}{!prog && tripLine ? <span className="block text-[11px] text-slate-400 font-semibold">{tripLine}</span> : null}{geoLine ? <span className="block text-[11px] text-slate-400 font-medium" title={geoFull}><Icon name="map-pin" className="w-3 h-3 inline pointer-events-none" /> {geoLine}</span> : null}</td>
              <td className="text-[12.5px] font-medium">{vehName(v)}{v?.plate ? <span className="text-slate-400"> • {v.plate}</span> : null}<br /><span className="text-slate-500">{drvNama}</span><br /><span className="text-[11.5px] text-slate-400">Pengganti: {back || '—'}</span></td>
              <td className="font-extrabold">{fmtRp(s.price)}</td>
              <td><div className="flex items-center gap-1.5"><div className="w-16 h-2 bg-slate-100 rounded-full"><div className="h-full bg-sky-500 rounded-full" style={{ width: (tk.booked.length / capN) * 100 + '%' }}></div></div><b className="text-[12px]">{tk.booked.length}/{capN}</b>{tk.blocked.length ? <span className="badge bg-amber-100 text-amber-700" title="Kursi ditutup">{tk.blocked.length} tutup</span> : null}</div></td>
              <td><div className="flex gap-1.5"><button onClick={() => manifest(s.id)} title="Manifest" className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="users" className="w-4 h-4" /></button>
                {!historical && !mt ? <button onClick={() => editSched(s.id)} title="Edit jadwal (jam/tanggal/armada/rute)" className="bg-sky-50 text-sky-600 p-2 rounded-lg"><Icon name="pencil" className="w-4 h-4" /></button> : null}
                {s.delayReqStatus === 'menunggu' && !historical ? <button onClick={() => openModal(<DelayRequestModal sid={s.id} />)} title="Tinjau permintaan delay" className="bg-amber-500 text-white p-2 rounded-lg"><Icon name="timer" className="w-4 h-4" /></button> : null}
                {!historical && !mt ? <button onClick={() => blockSeat(s.id)} title="Tutup/buka kursi" className="bg-amber-100 text-amber-700 p-2 rounded-lg"><Icon name="ban" className="w-4 h-4" /></button> : null}
                {!historical && hasBooking && !mt ? <button onClick={() => cancelTrip(s.id)} title="Batalkan jadwal (refund 100%)" className="bg-red-50 text-red-600 p-2 rounded-lg"><Icon name="calendar-x" className="w-4 h-4" /></button> : null}
                {!historical && !hasBooking && !mt ? (hasTransactions
                  ? <button disabled title="Tidak bisa dihapus — sudah ada riwayat transaksi" className="bg-slate-100 text-slate-300 p-2 rounded-lg cursor-not-allowed"><Icon name="trash-2" className="w-4 h-4" /></button>
                  : <button onClick={() => delSched(s.id)} title="Hapus jadwal" className="bg-red-50 text-red-500 p-2 rounded-lg"><Icon name="trash-2" className="w-4 h-4" /></button>) : null}</div></td></tr>
          );
        })}
      </tbody></table></div>
      {list.length === 0 ? <div className="text-center text-[13px] font-semibold text-slate-400 py-7">{tab === 'upcoming' ? 'Belum ada jadwal mendatang.' : 'Belum ada riwayat jadwal.'}</div> : null}
    </div>
  );
}

/* Detail pengakuan "Tiba tanpa catatan berangkat" — modal dari badge di
   baris jadwal. Menampilkan alasan wajib pengemudi (arriveAckReason),
   waktu tiba, dan tag lokasi tiba bila ada. */
function LateArriveModal({ sid }) {
  const { closeModal } = useApp();
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  let geo = null;
  try { geo = JSON.parse(s.arriveGeo || 'null'); } catch { /* tanpa tag lokasi */ }
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="triangle-alert" className="w-5 h-5 text-violet-600" />Tiba tanpa Catatan Berangkat</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="mt-3 bg-violet-50 border-2 border-violet-200 rounded-2xl p-3.5 text-[12.5px] font-semibold space-y-1">
        <div><span className="text-slate-400">Rute</span><br /><b>{r ? r.from + ' → ' + r.to : '-'}</b> • {fmtDate(s.date)} {s.time}</div>
        <div><span className="text-slate-400">Ditandai tiba</span> <b>{s.arrivedAt ? fmtClock(new Date(s.arrivedAt).getTime()) : '-'}</b></div>
        <div><span className="text-slate-400">Alasan pengakuan pengemudi</span><br /><b>{s.arriveAckReason || '—'}</b></div>
        {geo && geo.ok ? <div><span className="text-slate-400">Posisi saat menandai tiba</span> <b>{geo.area || '-'}{geo.addr ? ' • ' + geo.addr : ''}</b></div> : null}
      </div>
      <button onClick={closeModal} className="w-full mt-4 bg-slate-100 font-extrabold text-[13px] py-2.5 rounded-xl">Tutup</button>
    </div>
  );
}

/* Modal keputusan atas permintaan delay keberangkatan > 180 menit.
   Agen boleh mengoreksi jumlah menit saat menyetujui; menolak memakai
   catatan opsional yang diteruskan ke pengemudi. Guard domain dijalankan
   ulang pada saat keputusan dibuat (resolveDelayRequest). */
function DelayRequestModal({ sid }) {
  const { closeModal, toast, refresh, user } = useApp();
  const [mins, setMins] = useState('');
  const [note, setNote] = useState('');
  const s = schedById(sid);
  if (!s || s.delayReqStatus !== 'menunggu') return <div className="p-6 font-bold text-slate-500">Permintaan delay sudah tidak ada</div>;
  const reqM = Number(s.delayReqMinutes) || 0;
  const value = Number(mins) > 0 ? Number(mins) : reqM;
  /* Estimasi baru: dasar = max(sekarang, jam dasar, delay aktif) + menit. */
  const original = scheduleDepartureMs(s);
  const curUntil = s.delayUntil ? new Date(s.delayUntil).getTime() : NaN;
  const base = Math.max(Date.now(), Number.isFinite(original) ? original : 0, Number.isFinite(curUntil) ? curUntil : 0);
  const decide = (d) => {
    const res = resolveDelayRequest(sid, d, value, note, user?.name || user?.email || 'agen');
    if (!res.ok) {
      toast(res.msg, res.requestInvalid ? 'warn' : 'err');
      closeModal();
      refresh();
      return;
    }
    closeModal();
    refresh();
    toast(res.rejected ? 'Permintaan delay ditolak' : 'Delay ' + value + ' menit diterapkan', res.rejected ? 'info' : 'ok');
  };
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="timer" className="w-5 h-5 text-amber-600" />Permintaan Delay</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="mt-3 bg-amber-50 border-2 border-amber-200 rounded-2xl p-3.5 text-[12.5px] font-semibold space-y-1">
        <div><span className="text-slate-400">Diajukan oleh</span><br /><b>{s.delayReqBy || 'pengemudi'}</b> • {String(s.delayReqAt || '').slice(0, 16).replace('T', ' ')}</div>
        <div><span className="text-slate-400">Jadwal dasar</span> <b>{fmtDate(s.date)} • {s.time}</b></div>
        <div><span className="text-slate-400">Diminta</span> <b className="text-amber-700">+{reqM} menit</b> → estimasi <b>{fmtClock(new Date(base + value * 60000).toISOString())}</b></div>
        <div><span className="text-slate-400">Alasan</span> <b>{s.delayReqReason || '—'}</b></div>
        {s.delayReqNote ? <div><span className="text-slate-400">Catatan</span> {s.delayReqNote}</div> : null}
      </div>
      <div className="mt-3">
        <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Koreksi menit (opsional)</label>
        <input type="number" min="1" value={mins} onChange={(e) => setMins(e.target.value)} placeholder={'Pakai ' + reqM + ' menit'} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      </div>
      <div className="mt-3">
        <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Catatan keputusan (opsional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: tolak, penumpang sudah dijemput" className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => decide('setuju')} className="flex-1 bg-green-500 text-white font-extrabold text-[13px] py-3 rounded-2xl">Setuju (+{value} mnt)</button>
        <button onClick={() => decide('tolak')} className="flex-1 bg-red-50 text-red-600 font-extrabold text-[13px] py-3 rounded-2xl">Tolak</button>
      </div>
    </div>
  );
}
