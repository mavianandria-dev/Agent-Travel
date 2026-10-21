import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, vehicleById, bookingsOf, vehName, vehLayout, schedSeatCap, takenSeats, audit, setScheduleTripStatus, scheduleNeedsReview } from '@/lib/domain.js';
import { todayStr } from '@/lib/utils.js';
import { Icon, Empty, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import CancelTripModal from '@/components/CancelTripModal.jsx';

export function drvOfUser(u) {
  if (!u) return null;
  const ds = DB.load('drivers', []);
  return ds.find((d) => d.userEmail && d.userEmail.toLowerCase() === u.email.toLowerCase())
    || ds.filter((d) => u.agencyId && d.agencyId === u.agencyId)[0] || null;
}

export function tripUpdate(sid, st, toast, refresh) {
  if (!setScheduleTripStatus(sid, st)) return;
  refresh();
  toast(st === 'ontrip' ? 'Status: Dalam Perjalanan - notif terkirim ke penumpang' : 'Perjalanan selesai. Booking → Selesai.');
}

function ManifestModal({ sid }) {
  const { closeModal } = useApp();
  const s = DB.load('schedules', []).find((x) => x.id === sid);
  if (!s) return <div className="p-6">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const dr = DB.load('drivers', []).find((d) => d.id === s.driverId);
  const bk = bookingsOf(sid);
  const lay = vehLayout(vehicleById(s.vehicleId));
  const order = lay.filter((c) => c.type === 'seat' || c.type === 'off').map((c) => c.sid);
  const bookedExtra = [...new Set(bk.flatMap((b) => b.seats || []))].filter((id) => !order.includes(id));
  const offSet = new Set(lay.filter((c) => c.type === 'off').map((c) => c.sid));
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="clipboard-list" className="w-5 h-5 text-sky-600" />Manifest Penumpang</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="text-[13px] font-bold mt-2">{r.from} → {r.to} • {fmtDate(s.date)} {s.time}<br /><span className="text-slate-500 font-medium">{vehName(v)} {v?.plate} • Pengemudi: {dr?.name}</span></div>
      <table className="data w-full mt-3"><thead><tr><th>#</th><th>Kursi</th><th>Nama</th><th>HP</th><th>Jemput</th><th>Status</th></tr></thead><tbody>
        {[...order, ...bookedExtra].map((st) => {
          const b = bk.find((x) => (x.seats || []).includes(st));
          const p = b?.passengers.find((x) => x.seat === st);
          const vehOff = offSet.has(st);
          const blocked = (s.blockedSeats || []).includes(st);
          return (
            <tr key={st}><td>{st}</td><td className="font-extrabold">{st}</td>
              <td className="font-semibold">{p ? p.name : vehOff ? <span className="text-slate-400">- nonaktif (armada) -</span> : blocked ? <span className="text-slate-400">- diblokir -</span> : <span className="text-slate-300">- kosong -</span>}</td>
              <td>{p ? p.phone : '-'}</td><td className="text-[12px]">{p ? (p.pickup || '-') + (p.pickupCoords ? ' • ' + p.pickupCoords : '') : '-'}</td>
              <td>{b ? <BadgeStatus st={b.status} /> : (vehOff || blocked) ? <span className="badge b-cancel">Tutup</span> : <span className="badge b-wait">Kosong</span>}</td></tr>
          );
        })}
      </tbody></table>
      <button onClick={() => window.print()} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl no-print"><Icon name="printer" className="w-4 h-4 inline" /> Cetak Manifest</button>
    </div>
  );
}

function ScanModal({ sid }) {
  const { toast, closeModal, refresh } = useApp();
  const [code, setCode] = useState('');
  const doScan = () => {
    const c = (code || '').trim().toUpperCase();
    const all = DB.load('bookings', []);
    const b = all.find((x) => x.code === c && x.scheduleId === sid);
    if (!b) { toast('Tiket tidak valid untuk jadwal ini', 'err'); return; }
    if (b.status !== 'paid') { toast('Tiket ' + c + ' status: ' + b.status, 'warn'); return; }
    b.boarded = true;
    DB.save('bookings', all.map((x) => (x.id === b.id ? b : x)));
    refresh();
    audit('board', c);
    closeModal();
    toast('Hadir ✓ - ' + b.passengers[0].name + ' kursi ' + b.seats.join(','), 'ok');
    refresh();
  };
  return (
    <div className="p-6 text-center">
      <Icon name="scan-line" className="w-12 h-12 text-sky-600 mx-auto" />
      <h3 className="font-extrabold text-[16px] mt-2">Scan / Cek QR Penumpang</h3>
      <p className="text-[12px] text-slate-500 font-medium">Masukkan kode tiket (cth: TA-XXXXX)</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="TA-XXXXX" className="mt-3 w-full text-center font-mono font-extrabold tracking-widest uppercase text-[16px] border-2 border-slate-200 rounded-2xl px-3 py-3 focus-ring" />
      <button onClick={doScan} className="mt-3 w-full bg-green-500 text-white font-extrabold py-3 rounded-2xl">Konfirmasi Hadir</button>
    </div>
  );
}

export function boardPassenger(sid, code, toast, closeModal, refresh) {
  const c = (code || '').trim().toUpperCase();
  const all = DB.load('bookings', []);
  const b = all.find((x) => x.code === c && x.scheduleId === sid);
  if (!b) { toast('Tiket tidak valid untuk jadwal ini', 'err'); return false; }
  if (b.status !== 'paid') { toast('Tiket ' + c + ' status: ' + b.status, 'warn'); return false; }
  b.boarded = true;
  DB.save('bookings', all.map((x) => (x.id === b.id ? b : x)));
  refresh();
  audit('board', c);
  closeModal();
  toast('Hadir ✓ - ' + b.passengers[0].name + ' kursi ' + b.seats.join(','), 'ok');
  refresh();
  return true;
}

export default function Tasks() {
  const { view, go, user, toast, refresh, openModal } = useApp();
  const me = drvOfUser(user);
  const today = todayStr(0);
  const mySched = DB.load('schedules', []).filter((s) => !me || s.driverId === me.id).sort((a, b) => (a.date + b.time).localeCompare(b.date + b.time));
  const overdue = mySched.filter(scheduleNeedsReview);
  const upcoming = mySched.filter((s) => s.date >= today && !scheduleNeedsReview(s) && s.status !== 'cancelled' && !['arrived', 'missed', 'cancelled'].includes(s.tripStatus));
  const pills = [['driver', 'car-front', 'Tugas Saya'], ['driver-trips', 'route', 'Trip'], ['driver-wallet', 'wallet', 'Dompet']];

  const renderTask = (s, late) => {
    const r = routeById(s.routeId), v = vehicleById(s.vehicleId);
    const bk = bookingsOf(s.id);
    const finish = () => {
      if (late && !window.confirm('Tandai trip ini sebagai Tiba? Pastikan perjalanan benar-benar sudah terjadi.')) return;
      tripUpdate(s.id, 'arrived', toast, refresh);
    };
    return (
      <div key={s.id} className="bg-white rounded-3xl shadow-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-[#0b2447] text-white rounded-2xl px-3.5 py-2 text-center"><div className="text-[11px] font-bold opacity-70">{fmtDate(s.date)}</div><div className="font-extrabold text-[16px]">{s.time}</div></div>
          <div className="flex-1 min-w-[180px]"><div className="font-extrabold text-[15px]">{r.from} → {r.to}</div><div className="text-[12px] text-slate-500 font-medium">{vehName(v)} {v?.plate} • {takenSeats(s.id).paid.length}/{schedSeatCap(s.id)} penumpang</div></div>
          <BadgeStatus st={s.tripStatus || 'scheduled'} />
        </div>
        <div className="mt-2.5 bg-slate-50 rounded-2xl p-3 text-[12.5px] font-semibold"><span className="text-slate-400 font-extrabold text-[11px]">TITIK JEMPUT:</span> {(r.pickups || []).join(' → ')}</div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => openModal(<ManifestModal sid={s.id} />)} className="flex-1 bg-sky-50 text-sky-700 text-[12.5px] font-extrabold py-2.5 rounded-xl min-w-[130px]"><Icon name="users" className="w-4 h-4 inline" /> Manifest ({bk.length})</button>
          {late ? <button onClick={finish} className="flex-1 bg-blue-600 text-white text-[12.5px] font-extrabold py-2.5 rounded-xl min-w-[130px]">Tandai Tiba</button> : null}
          {!late && (s.tripStatus === 'scheduled' || !s.tripStatus) ? <button onClick={() => tripUpdate(s.id, 'ontrip', toast, refresh)} className="flex-1 bg-green-500 text-white text-[12.5px] font-extrabold py-2.5 rounded-xl min-w-[130px]">Berangkat →</button> : null}
          {!late && (s.tripStatus === 'scheduled' || !s.tripStatus) && bk.length ? <button onClick={() => openModal(<CancelTripModal sid={s.id} by="pengemudi" />)} className="bg-red-50 text-red-600 text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl"><Icon name="calendar-x" className="w-4 h-4 inline" /> Batalkan</button> : null}
          {!late && s.tripStatus === 'ontrip' ? <button onClick={finish} className="flex-1 bg-blue-600 text-white text-[12.5px] font-extrabold py-2.5 rounded-xl min-w-[130px]">Tiba di Tujuan</button> : null}
          <button onClick={() => openModal(<ScanModal sid={s.id} />)} className="bg-[#0b2447] text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl"><Icon name="scan-line" className="w-4 h-4 inline" /> Scan QR</button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="anim bg-white rounded-3xl shadow-card p-4 flex gap-2 overflow-x-auto no-print">
        {pills.map((x) => (
          <button key={x[0]} onClick={() => go(x[0])} className={`flex items-center gap-1.5 text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl whitespace-nowrap ${view === x[0] ? 'bg-[#0b2447] text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon name={x[1]} className="w-4 h-4" />{x[2]}
          </button>
        ))}
      </div>
      <div className="anim space-y-4 mt-4">
        <div className="bg-gradient-to-r from-[#0b2447] to-sky-700 text-white rounded-3xl p-5 shadow-card flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center font-extrabold text-2xl">{((me?.name || user?.name || 'P')[0])}</div>
          <div><div className="font-extrabold text-[17px]">Halo, {me?.name || user?.name}!</div><div className="text-[12.5px] opacity-80 font-medium">{overdue.length ? overdue.length + ' perlu diselesaikan • ' : ''}{upcoming.length} tugas ke depan • standby 30 mnt sebelum jam</div></div>
          <div className="flex-1"></div><button onClick={() => go('driver-trips')} className="bg-white/15 text-[12px] font-extrabold px-4 py-2 rounded-xl">Riwayat</button>
        </div>

        {overdue.length ? <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-4">
          <h3 className="font-extrabold text-[15px] flex items-center gap-2 text-amber-900"><Icon name="triangle-alert" className="w-4 h-4 text-amber-600" />Perlu Diselesaikan ({overdue.length})</h3>
          <p className="text-[12px] font-medium text-amber-800 mt-1">Jadwal sudah lewat. Tandai Tiba hanya jika perjalanan benar-benar terjadi.</p>
          <div className="space-y-3 mt-3">{overdue.slice(0, 6).map((s) => renderTask(s, true))}</div>
        </div> : null}

        <div className="space-y-3">
          {upcoming.slice(0, 6).map((s) => renderTask(s, false))}
          {upcoming.length === 0 && overdue.length === 0 ? <Empty icon="car" msg="Tidak ada tugas — Istirahat dulu, Pengemudi hebat." /> : null}
        </div>
      </div>
    </>
  );
}
