import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, vehicleById, bookingsOf, vehName, vehLayout, schedSeatCap, takenSeats, seatsLeft, audit, setScheduleTripStatus, scheduleNeedsReview, scheduleInHistory, schedById, setScheduleDelay, reportTripDelay, createDriverBooking, confirmDriverBookingPayment, splitFare, tripProgress, bookedPassengers, departureTiming, scheduleIsPast } from '@/lib/domain.js';
import { fmtClock, fmtRp } from '@/lib/utils.js';
import { Icon, Empty, BadgeStatus, fmtDate, CabinGrid } from '@/components/ui.jsx';
import { pickupArea, pickupOptions, pickupOf } from '@/lib/pickups.js';
import CancelTripModal from '@/components/CancelTripModal.jsx';
import BlockSeatModal from '@/components/BlockSeatModal.jsx';

export function drvOfUser(u) {
  if (!u) return null;
  const ds = DB.load('drivers', []);
  return ds.find((d) => d.userEmail && d.userEmail.toLowerCase() === u.email.toLowerCase())
    || ds.filter((d) => u.agencyId && d.agencyId === u.agencyId)[0] || null;
}

export function tripUpdate(sid, st, toast, refresh, opts = {}) {
  if (!setScheduleTripStatus(sid, st, opts)) return false;
  refresh();
  toast(st === 'ontrip' ? 'Status: Dalam Perjalanan - notif terkirim ke penumpang' : 'Perjalanan selesai. Booking → Selesai.');
  return true;
}

function fmtGap(minutes) {
  const m = Math.abs(Number(minutes) || 0);
  if (m >= 1440) return Math.round(m / 1440) + ' hari';
  if (m >= 60) return Math.round(m / 60) + ' jam';
  return m + ' menit';
}

/** Konfirmasi sebelum berangkat. Berangkat >60 menit lebih awal wajib alasan. */
function StartTripModal({ sid }) {
  const { closeModal, toast, refresh, user } = useApp();
  const s = schedById(sid);
  const [reason, setReason] = useState('');
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const bk = bookingsOf(sid);
  const tk = takenSeats(sid);
  const cap = schedSeatCap(sid);
  const timing = departureTiming(s);
  const early = timing.state === 'early';
  const late = timing.state === 'late';
  const pending = bk.filter((b) => b.status === 'pending').length;

  const submit = () => {
    const why = reason.trim();
    if (early && why.length < 10) {
      toast('Alasan berangkat lebih awal wajib diisi minimal 10 karakter.', 'err');
      return;
    }
    const ok = setScheduleTripStatus(sid, 'ontrip', { reason: why, by: user?.name || user?.email || 'pengemudi' });
    if (!ok) { toast('Status perjalanan tidak bisa diubah.', 'err'); return; }
    closeModal();
    refresh();
    toast('Perjalanan dimulai. Penjualan tiket ditutup.');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="car-front" className="w-5 h-5 text-sky-600" />Mulai Perjalanan?</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="text-[12.5px] text-slate-500 font-medium mt-1">{r?.from} → {r?.to} • {fmtDate(s.date)} {s.time} WIB<br />{vehName(v)} {v?.plate} • Penumpang {tk.booked.length}/{cap}{pending ? ` • ${pending} menunggu bayar` : ''}</div>

      <div className={'mt-4 rounded-2xl border p-3 text-[12.5px] font-semibold ' + (early ? 'bg-amber-50 border-amber-200 text-amber-900' : late ? 'bg-red-50 border-red-200 text-red-800' : 'bg-sky-50 border-sky-200 text-sky-900')}>
        {early
          ? `Jadwal masih ${fmtGap(timing.minutes)} lagi. Berangkat sekarang menutup penjualan tiket dan membatalkan booking yang belum dibayar. Alasan wajib diisi (minimal 10 karakter).`
          : late
            ? `Jadwal sudah lewat ${fmtGap(timing.minutes)}. Pastikan perjalanan benar-benar berangkat; penjualan tiket akan ditutup dan booking yang belum dibayar dibatalkan.`
            : 'Setelah berangkat, semua penjualan tiket ditutup dan booking yang belum dibayar dibatalkan otomatis. Pastikan penumpang dan armada sudah siap.'}
      </div>

      {early ? (
        <label className="block mt-3">
          <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Alasan berangkat lebih awal</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Contoh: penumpang sudah lengkap dan kondisi jalan lancar" className="mt-1.5 w-full text-[13px] border-2 border-slate-200 rounded-2xl px-3 py-2.5 focus-ring" />
        </label>
      ) : null}

      <div className="flex gap-2 mt-4">
        <button onClick={closeModal} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={submit} className={'flex-1 text-white font-extrabold text-[13px] py-2.5 rounded-xl ' + (early ? 'bg-amber-500' : 'bg-green-500')}>Ya, Berangkat</button>
      </div>
    </div>
  );
}

function ManifestModal({ sid }) {
  const { closeModal, openModal } = useApp();
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
  const canBlock = s.status !== 'cancelled' && !['ontrip', 'arrived', 'missed', 'cancelled'].includes(s.tripStatus) && !scheduleIsPast(s, 0);
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
          const p = (b?.passengers || []).find((x) => x.seat === st);
          const vehOff = offSet.has(st);
          const blocked = (s.blockedSeats || []).includes(st);
          return (
            <tr key={st}><td>{st}</td><td className="font-extrabold">{st}</td>
              <td className="font-semibold">{p ? p.name : vehOff ? <span className="text-slate-400">- nonaktif (armada) -</span> : blocked ? <span className="text-slate-400">- diblokir -</span> : <span className="text-slate-300">- kosong -</span>}</td>
              <td>{p ? p.phone : '-'}</td><td className="text-[12px]">{p ? (pickupOf(p,b) || '-') + (p.pickupCoords ? ' • ' + p.pickupCoords : '') : '-'}</td>
              <td>{b ? <BadgeStatus st={b.status} /> : (vehOff || blocked) ? <span className="badge b-cancel">Tutup</span> : <span className="badge b-wait">Kosong</span>}</td></tr>
          );
        })}
      </tbody></table>
      <div className="flex gap-2 mt-3 no-print">
        {canBlock ? <button onClick={() => openModal(<BlockSeatModal sid={sid} by="pengemudi" />)} className="flex-1 bg-amber-100 text-amber-700 font-extrabold text-[13px] py-2.5 rounded-xl"><Icon name="ban" className="w-4 h-4 inline" /> Tutup / Buka Kursi</button> : null}
        <button onClick={() => window.print()} className="flex-1 bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl"><Icon name="printer" className="w-4 h-4 inline" /> Cetak Manifest</button>
      </div>
    </div>
  );
}

function DelayModal({ sid, mode = 'departure' }) {
  const { closeModal, toast, refresh, user } = useApp();
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;

  const departure = mode === 'departure';
  const submit = () => {
    const actor = user?.name || user?.email || 'pengemudi';
    const res = departure
      ? setScheduleDelay(sid, Number(minutes), reason, note, actor)
      : reportTripDelay(sid, reason, note, actor);
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast(departure ? `Delay ${minutes} menit dicatat` : 'Info keterlambatan dikirim');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="clock" className="w-5 h-5 text-amber-600" />{departure ? 'Delay Keberangkatan' : 'Info Keterlambatan'}</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <p className="text-[12.5px] text-slate-500 font-medium mt-1">
        {departure
          ? 'Jadwal tetap aktif, tetapi batas terlewat, pembayaran, dan pencarian ikut menyesuaikan estimasi baru.'
          : 'Info ini hanya dikirim ke pelanggan dan admin. Estimasi tiba tidak diubah.'}
      </p>

      {departure && s.delayUntil && new Date(s.delayUntil).getTime() > Date.now() ? (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[12px] font-semibold text-amber-900">
          Delay saat ini: {s.delayMinutes} menit • estimasi {fmtClock(s.delayUntil)}. Delay baru akan ditambahkan dari estimasi ini.
        </div>
      ) : null}

      {departure ? (
        <div className="mt-3">
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Tambahan delay</label>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring bg-white">
            {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} menit</option>)}
          </select>
        </div>
      ) : null}

      <div className="mt-3">
        <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Alasan wajib</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={departure ? 'Contoh: macet di jalur' : 'Contoh: kendala di jalan'} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      </div>

      <div className="mt-3">
        <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Catatan opsional</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Info tambahan untuk pelanggan" className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      </div>

      <button onClick={submit} className="mt-4 w-full bg-amber-500 text-white font-extrabold text-[13px] py-3 rounded-2xl">{departure ? 'Simpan Delay' : 'Kirim Info Keterlambatan'}</button>
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
    const s = schedById(sid);
    if (!s || s.status === 'cancelled' || ['missed', 'cancelled', 'arrived'].includes(s.tripStatus)) {
      toast('Boarding ditutup — jadwal sudah terlewat/dibatalkan/selesai.', 'err');
      return;
    }
    if (b.status !== 'paid') { toast('Tiket ' + c + ' status: ' + b.status, 'warn'); return; }
    if (b.boarded) { toast('Penumpang ' + c + ' sudah boarding.', 'warn'); return; }
    b.boarded = true;
    DB.save('bookings', all.map((x) => (x.id === b.id ? b : x)));
    refresh();
    audit('board', c);
    closeModal();
    toast('Hadir ✓ - ' + (bookedPassengers(b)[0]?.name || 'Penumpang') + ' kursi ' + (b.seats || []).join(','), 'ok');
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
  const s = schedById(sid);
  if (!s || s.status === 'cancelled' || ['missed', 'cancelled', 'arrived'].includes(s.tripStatus)) {
    toast('Boarding ditutup — jadwal sudah terlewat/dibatalkan/selesai.', 'err');
    return false;
  }
  if (b.status !== 'paid') { toast('Tiket ' + c + ' status: ' + b.status, 'warn'); return false; }
  if (b.boarded) { toast('Penumpang ' + c + ' sudah boarding.', 'warn'); return false; }
  b.boarded = true;
  DB.save('bookings', all.map((x) => (x.id === b.id ? b : x)));
  refresh();
  audit('board', c);
  closeModal();
  toast('Hadir ✓ - ' + (bookedPassengers(b)[0]?.name || 'Penumpang') + ' kursi ' + (b.seats || []).join(','), 'ok');
  refresh();
  return true;
}

function DriverBookingModal({ sid }) {
  const { toast, closeModal, refresh, user } = useApp();
  const driver = drvOfUser(user);
  const s = schedById(sid);
  const v = vehicleById(s?.vehicleId ?? null);
  const r = routeById(s?.routeId ?? null);
  const tk = takenSeats(s?.id ?? '');
  const taken = new Set([...tk.paid, ...tk.hold, ...(s?.blockedSeats || []), ...tk.inactive]);
  const layout = vehLayout(v);
  const seatOrder = layout.filter((c) => c.type === 'seat' && c.sid).map((c) => c.sid);
  const available = seatOrder.filter((st) => !taken.has(st));
  const left = available.length;
  const [seats, setSeats] = useState([]);
  const [pax, setPax] = useState([]);
  const [pickup, setPickup] = useState(pickupOptions(r)[0] || '-');
  const [payMethod, setPayMethod] = useState('QRIS');
  const [step, setStep] = useState(1);
  const [made, setMade] = useState(null);
  const rows = [...pax].sort((a, b) => seatOrder.indexOf(a.seat) - seatOrder.indexOf(b.seat));
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;

  const total = Number(s.price || 0) * seats.length;
  const fare = splitFare(s, seats.length, 0, 'driver');
  const va = '8821 ' + String(Math.floor(100000000000 + Math.random() * 899999999999)).slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');

  /* Pilih kursi seperti alur pelanggan: klik denah, klik lagi untuk melepas. */
  const toggleSeat = (st) => {
    if (seats.includes(st)) {
      setSeats(seats.filter((x) => x !== st));
      setPax(pax.filter((p) => p.seat !== st));
      return;
    }
    const maxS = schedSeatCap(s.id);
    if (seats.length >= maxS) { toast('Maksimal ' + maxS + ' kursi per booking', 'warn'); return; }
    setSeats([...seats, st]);
    setPax([...pax, { seat: st, name: '', phone: '' }]);
  };

  const setPaxField = (seat, field, val) => {
    setPax(pax.map((p) => (p.seat === seat ? { ...p, [field]: val } : p)));
  };

  const submit = () => {
    if (!driver) { toast('Data pengemudi tidak ditemukan', 'err'); return; }
    if (!seats.length) { toast('Pilih minimal satu kursi', 'err'); return; }
    if (rows.length !== seats.length) { toast('Data penumpang belum lengkap', 'err'); return; }
    if (rows.some((p) => !String(p.name || '').trim() || !String(p.phone || '').trim())) {
      toast('Nama dan HP wajib diisi untuk semua penumpang', 'err');
      return;
    }
    const res = createDriverBooking(sid, {
      passengers: rows,
      seats,
      driverId: driver.id,
      payMethod,
      discount: 0,
      pickup,
    });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    setMade(res.booking);
    setStep(2);
    refresh();
  };

  const pay = () => {
    const res = confirmDriverBookingPayment(made.id);
    if (!res.ok) { toast(res.msg, 'err'); return; }
    toast('Pembayaran berhasil. Tiket ' + res.booking.code, 'ok');
    closeModal();
    refresh();
  };

  if (step === 2 && made) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between"><h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="wallet" className="w-5 h-5 text-sky-600" />Pembayaran {made.payMethod}</h3><button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
        <div className="text-center bg-amber-50 border border-amber-200 rounded-2xl py-2.5 mt-3 font-extrabold text-amber-800 text-[13px]">Kursi ditahan 15 menit</div>

        {made.payMethod === 'QRIS' ? (
          <img src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + made.code + '-' + made.total} className="w-48 h-48 mx-auto mt-4 rounded-2xl border-4 border-[#0b2447]" alt="QRIS" />
        ) : made.payMethod === 'VA' ? (
          <div className="mt-4 bg-[#0b2447] text-white rounded-2xl p-4 text-center"><div className="text-[11px] font-bold opacity-70 tracking-widest">VIRTUAL ACCOUNT BCA</div><div className="font-mono font-extrabold text-[22px] tracking-wider mt-1">{va}</div></div>
        ) : (
          <div className="mt-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl p-4 text-center font-extrabold">Bayar via E-Wallet<br /><span className="text-[26px] font-mono">{fmtRp(made.total)}</span><div className="text-[12px] opacity-80 font-semibold">Dana • OVO • GoPay • ShopeePay</div></div>
        )}

        <div className="mt-4 space-y-1 text-[13px] font-semibold">
          <div className="flex justify-between"><span>Total dibayar</span><span className="font-extrabold">{fmtRp(made.total)}</span></div>
          <div className="flex justify-between"><span>Fee platform</span><span>{fmtRp(fare.fee)}</span></div>
          <div className="flex justify-between"><span>Jasa agen</span><span>{fmtRp(0)}</span></div>
          <div className="flex justify-between font-extrabold"><span>Untuk pengemudi</span><span className="text-sky-700">{fmtRp(fare.ticket)}</span></div>
        </div>
        <div className="text-[11px] text-slate-400 font-semibold mt-2">Kode booking: <b className="font-mono">{made.code}</b> • Kursi {made.seats.join(', ')}</div>
        <button onClick={pay} className="mt-4 w-full bg-green-500 hover:bg-green-600 text-white font-extrabold py-3.5 rounded-2xl transition flex items-center justify-center gap-2"><Icon name="circle-check-big" className="w-5 h-5" />Pembayaran Berhasil</button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between"><h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="user-plus" className="w-5 h-5 text-sky-600" />Pesan Tiket</h3><button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="text-[12.5px] text-slate-500 font-medium mt-1">{r?.from} → {r?.to} • {fmtDate(s.date)} {s.time} WIB<br /><span className="text-slate-500">{vehName(v)} {v?.plate} • Pengemudi: {driver?.name}</span></div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Pilih Kursi</label>
          <div className="flex gap-3 mt-1.5 text-[11px] font-bold flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: '#dcfce7', borderColor: '#22c55e' }}></span>Aktif</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: '#dbeafe', borderColor: '#3b82f6' }}></span>Dipilih</span>
            <span className="flex items-center gap-1.5 text-slate-500"><Icon name="x" className="w-3.5 h-3.5" />Terisi</span>
            <span className="flex items-center gap-1.5 text-slate-500"><Icon name="timer" className="w-3.5 h-3.5" />Ditahan</span>
            <span className="flex items-center gap-1.5 text-slate-500"><Icon name="ban" className="w-3.5 h-3.5" />Nonaktif</span>
          </div>
          <CabinGrid
            layout={layout}
            paid={tk.paid}
            hold={tk.hold}
            inactive={tk.inactive}
            selected={seats}
            onPick={toggleSeat}
            interactive
            plate={v?.plate}
            vehName={vehName(v)}
            legend={false}
          />
          <div className="text-[12px] font-semibold mt-2">
            Terpilih: <b className="text-sky-700">{seats.length ? seats.join(', ') : '-'}</b>
            <span className="text-slate-400 font-medium"> - kursi kosong {left}</span>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Titik Jemput</label>
          <select value={pickup} onChange={(e) => setPickup(e.target.value)} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
            {pickupOptions(r).map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Data Penumpang</label>
          {!rows.length ? (
            <div className="mt-1 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[12.5px] font-semibold text-amber-800 flex gap-2"><Icon name="mouse-pointer-click" className="w-5 h-5 shrink-0" />Klik kursi pada denah armada. 1 kursi untuk 1 penumpang.</div>
          ) : (
            <div className="space-y-2 mt-1">
              {rows.map((p) => (
                <div key={p.seat} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="badge bg-sky-600 text-white">Kursi {p.seat}</span>
                    <button onClick={() => toggleSeat(p.seat)} className="text-red-500 hover:bg-red-50 p-1 rounded-lg" title="Lepas kursi"><Icon name="x" className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input value={p.name || ''} onChange={(e) => setPaxField(p.seat, 'name', e.target.value)} placeholder="Nama penumpang" className="text-[13px] font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 focus-ring" />
                    <input value={p.phone || ''} onChange={(e) => setPaxField(p.seat, 'phone', e.target.value)} placeholder="No. HP" className="text-[13px] font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 focus-ring" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Metode Pembayaran</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {[['QRIS', 'qr-code'], ['VA', 'landmark'], ['EWALLET', 'wallet']].map((m) => (
              <button key={m[0]} onClick={() => setPayMethod(m[0])} className={'paybtn rounded-2xl border-2 p-2.5 text-center transition ' + (payMethod === m[0] ? 'border-sky-500 bg-sky-50' : 'border-slate-200')}>
                <Icon name={m[1]} className={'w-5 h-5 mx-auto ' + (payMethod === m[0] ? 'text-sky-600' : 'text-slate-400')} />
                <div className="font-extrabold text-[11.5px] mt-1">{m[0]}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-3 space-y-1 text-[13px] font-semibold">
          <div className="flex justify-between"><span>Total bayar</span><span className="font-extrabold">{fmtRp(total)}</span></div>
          <div className="flex justify-between"><span>Fee platform</span><span>{fmtRp(fare.fee)}</span></div>
          <div className="flex justify-between"><span>Jasa agen</span><span>{fmtRp(0)}</span></div>
          <div className="flex justify-between font-extrabold"><span>Untuk pengemudi</span><span className="text-sky-700">{fmtRp(fare.ticket)}</span></div>
        </div>
      </div>

      <div className="flex gap-2 mt-4"><button onClick={closeModal} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={submit} disabled={left <= 0} className="flex-1 bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl disabled:opacity-40">Lanjut Bayar</button></div>
    </div>
  );
}

export default function Tasks() {
  const { go, user, toast, refresh, openModal } = useApp();
  const me = drvOfUser(user);
  const [, setClock] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /* Jam lokal: progress bar perjalanan harus berjalan sendiri tiap 30 detik. */
  useEffect(() => {
    const iv = setInterval(() => { setNow(Date.now()); setClock((x) => x + 1); }, 30000);
    return () => clearInterval(iv);
  }, []);
  const mySched = DB.load('schedules', []).filter((s) => !me || s.driverId === me.id).sort((a, b) => (a.date + b.time).localeCompare(b.date + b.time));
  const overdue = mySched.filter(scheduleNeedsReview);
  const upcoming = mySched.filter((s) => !scheduleInHistory(s) && !scheduleNeedsReview(s) && s.status !== 'cancelled' && !['arrived', 'missed', 'cancelled'].includes(s.tripStatus));

  const renderTask = (s, late) => {
    const r = routeById(s.routeId), v = vehicleById(s.vehicleId);
    const bk = bookingsOf(s.id);
    const left = seatsLeft(s.id);
    const tk = takenSeats(s.id);
    const delayActive = s.tripStatus === 'scheduled' && s.delayUntil && new Date(s.delayUntil).getTime() > Date.now();
    const tripInfo = s.tripStatus === 'ontrip' && Array.isArray(s.tripDelayInfo) ? s.tripDelayInfo[0] : null;
    const prog = s.tripStatus === 'ontrip' ? tripProgress(s, r, now) : null;
    /* Titik jemput penumpang — hanya baris yang benar-benar ada di manifest
       (kursi yang dipesan), lalu dikelompokkan per titik jemput. */
    const seatOrder = vehLayout(v).filter((c) => c.type === 'seat' || c.type === 'off').map((c) => c.sid);
    const paxPicks = (() => {
      const map = new Map();
      bk.forEach((b) => {
        bookedPassengers(b).forEach((p) => {
          const raw = pickupOf(p, b);
          if (!raw) return;
          const area = pickupArea(raw, r.from);
          if (!area.label) return;
          const key = area.label.toLowerCase();
          const cur = map.get(key);
          if (cur) { cur.count += 1; return; }
          const pos = seatOrder.indexOf(p.seat);
          map.set(key, { label: area.label, count: 1, order: pos < 0 ? 999 : pos });
        });
      });
      return [...map.values()].sort((a, b) => a.order - b.order);
    })();
    const finish = () => {
      const msg = late
        ? 'Tandai trip ini sebagai Tiba? Pastikan perjalanan benar-benar sudah terjadi.'
        : 'Tandai trip ini sudah tiba di tujuan?';
      if (!window.confirm(msg)) return;
      tripUpdate(s.id, 'arrived', toast, refresh);
    };
    return (
      <div key={s.id} data-sid={s.id} className="bg-white rounded-3xl shadow-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-[#0b2447] text-white rounded-2xl px-3.5 py-2 text-center"><div className="text-[11px] font-bold opacity-70">{fmtDate(s.date)}</div><div className="font-extrabold text-[16px]">{s.time}</div></div>
          <div className="flex-1 min-w-[180px]"><div className="font-extrabold text-[15px]">{r.from} → {r.to}</div><div className="text-[12px] text-slate-500 font-medium">{vehName(v)} {v?.plate} • {tk.booked.length}/{schedSeatCap(s.id)} penumpang{tk.blocked.length ? ` • ${tk.blocked.length} tutup` : ''}</div></div>
          {prog ? (
            <div
              role="progressbar"
              aria-label={'Progres perjalanan ' + (s.date || '') + ' ' + (s.time || '') + ' ' + prog.pct + ' persen'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={prog.pct}
              aria-valuetext={'Berangkat ' + fmtClock(prog.start) + ', estimasi tiba ' + fmtClock(prog.end)}
              title={'Berangkat ' + fmtClock(prog.start) + ' • Estimasi tiba ' + fmtClock(prog.end) + ' • sisa ±' + prog.remainMin + ' menit'}
              className="badge relative overflow-hidden bg-slate-100 text-[#0b2447] !text-[12px] py-1.5 px-3 gap-2 min-w-[240px] justify-between ring-1 ring-slate-200"
            >
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-200 via-emerald-300 to-sky-300 transition-[width] duration-700 ease-out" style={{ width: prog.pct + '%' }} />
              <span className="relative z-10 flex items-center gap-1.5 font-extrabold whitespace-nowrap"><Icon name="car-front" className="w-3.5 h-3.5" /> Berangkat {fmtClock(prog.start)}</span>
              <span className="relative z-10 font-extrabold whitespace-nowrap">{prog.pct}% <span className="font-bold text-slate-500">• ETA {fmtClock(prog.end)}</span></span>
            </div>
          ) : null}
          <BadgeStatus st={s.tripStatus || 'scheduled'} />
        </div>
        {paxPicks.length ? (
          <div className="mt-2.5 bg-slate-50 rounded-2xl p-3">
            <span className="text-slate-400 font-extrabold text-[11px] flex items-center gap-1.5"><Icon name="map-pin" className="w-3.5 h-3.5" /> TITIK JEMPUT</span>
            <div className="flex flex-wrap items-center gap-1 mt-2">
              {paxPicks.map((p) => (
                <span key={p.label} className="badge bg-white text-[#0b2447] !text-[11.5px] px-2 py-1 border border-slate-200">
                  <span className="font-extrabold">{p.label}</span>
                  <span className="badge bg-sky-100 text-sky-700 !text-[10px] px-1.5 py-0.5"><Icon name="users" className="w-2.5 h-2.5" />{p.count}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {delayActive ? <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-2.5 text-[12px] font-semibold text-amber-900">Delay {s.delayMinutes} menit • estimasi {fmtClock(s.delayUntil)} — {s.delayReason}</div> : null}
        {tripInfo ? <div className="mt-2.5 bg-sky-50 border border-sky-200 rounded-2xl p-2.5 text-[12px] font-semibold text-sky-900">Info keterlambatan: {tripInfo.reason}{tripInfo.note ? ' • ' + tripInfo.note : ''} ({fmtClock(tripInfo.at)})</div> : null}
        <div className="flex flex-wrap gap-1.5 mt-3 items-center">
          <button onClick={() => openModal(<ManifestModal sid={s.id} />)} className="badge bg-sky-100 text-sky-700 cursor-pointer !text-[12px] py-1.5 active:scale-95 transition"><Icon name="users" className="w-3.5 h-3.5" /> Manifest ({bk.length})</button>
          {late ? <button onClick={finish} className="badge bg-blue-600 text-white cursor-pointer !text-[12px] py-1.5 active:scale-95 transition">Tandai Tiba</button> : null}
          {!late && (s.tripStatus === 'scheduled' || !s.tripStatus) ? <button onClick={() => openModal(<StartTripModal sid={s.id} />)} className="badge bg-green-500 text-white cursor-pointer !text-[12px] py-1.5 active:scale-95 transition">Berangkat →</button> : null}
          {!late && (s.tripStatus === 'scheduled' || !s.tripStatus) ? <button onClick={() => openModal(<DelayModal sid={s.id} mode="departure" />)} className="badge bg-amber-100 text-amber-700 cursor-pointer !text-[12px] py-1.5 active:scale-95 transition"><Icon name="clock" className="w-3.5 h-3.5" /> Delay</button> : null}
          {!late && (s.tripStatus === 'scheduled' || !s.tripStatus) && bk.length ? <button onClick={() => openModal(<CancelTripModal sid={s.id} by="pengemudi" />)} className="badge bg-red-100 text-red-600 cursor-pointer !text-[12px] py-1.5 active:scale-95 transition"><Icon name="calendar-x" className="w-3.5 h-3.5" /> Batalkan</button> : null}
          {!late && s.tripStatus === 'ontrip' ? <button onClick={finish} className="badge bg-blue-600 text-white cursor-pointer !text-[12px] py-1.5 active:scale-95 transition">Tiba di Tujuan</button> : null}
          {s.tripStatus === 'ontrip' && s.status !== 'cancelled' ? <button onClick={() => openModal(<DelayModal sid={s.id} mode="ontrip" />)} className="badge bg-sky-100 text-sky-700 cursor-pointer !text-[12px] py-1.5 active:scale-95 transition"><Icon name="clock" className="w-3.5 h-3.5" /> Info Delay</button> : null}
          {!late && (s.status === 'open' || !s.status) && (s.tripStatus === 'scheduled' || !s.tripStatus) && left > 0 ? <button onClick={() => openModal(<DriverBookingModal sid={s.id} />)} className="badge bg-violet-100 text-violet-700 cursor-pointer !text-[12px] py-1.5 active:scale-95 transition"><Icon name="user-plus" className="w-3.5 h-3.5" /> Pesan Tiket</button> : null}
          {s.tripStatus !== 'missed' && s.status !== 'cancelled' ? <button onClick={() => openModal(<ScanModal sid={s.id} />)} className="badge bg-[#0b2447] text-white cursor-pointer !text-[12px] py-1.5 active:scale-95 transition"><Icon name="scan-line" className="w-3.5 h-3.5" /> Scan QR</button> : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="anim space-y-4">
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
