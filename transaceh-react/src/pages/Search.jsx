import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, schedReady, takenSeats, seatsLeft, routeById, vehicleById, driverById, vehLayout, schedSeatCap, feeFor, audit, notify, processWaiting, vehName } from '@/lib/domain.js';
import { fmtRp, todayStr, uid } from '@/lib/utils.js';
import { Icon, CabinGrid, fmtDate } from '@/components/ui.jsx';

const STEP_LABELS = ['Rute', 'Tanggal', 'Armada', 'Kursi', 'Bayar'];
const STEP_ICONS = ['map-pin', 'calendar', 'bus', 'armchair', 'wallet'];

function WizardSteps({ step }) {
  return (
    <>
      <div className="flex items-center gap-1 md:gap-2 overflow-x-auto pb-1">{STEP_LABELS.map((l, i) => {
        const n = i + 1;
        const act = step === n;
        const done = step > n;
        return (
          <div key={l} className="flex items-center gap-2 shrink-0">
            <div className={'step-dot ' + (act ? 'bg-sky-600 text-white shadow-lg' : done ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400')}>{done ? <Icon name="check" className="w-4 h-4" /> : n}</div>
            <div className={'text-[12px] font-extrabold ' + (act ? 'text-sky-700' : 'text-slate-400')}>{l}</div>
            {n < 5 ? <div className={'w-4 md:w-8 h-0.5 rounded mx-1 ' + (done ? 'bg-green-400' : 'bg-slate-200')}></div> : null}
          </div>
        );
      })}</div>
      <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden"><div className="h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: (step * 20) + '%' }}></div></div>
    </>
  );
}

function calcDiscount(voucher, scheduleId, seatCount) {
  if (!voucher) return 0;
  const v = DB.load('vouchers', []).find((x) => x.code === String(voucher).toUpperCase() && x.active);
  if (!v) return 0;
  const s = schedById(scheduleId);
  if (!s) return 0;
  const sub = s.price * seatCount;
  if (v.type === 'percent') return Math.min(Math.round((sub * v.value) / 100), v.maxDisc || sub);
  return Math.min(v.value, sub);
}

export function PaymentModal({ booking, onDone }) {
  const { closeModal, go, toast, setBw, refresh } = useApp();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => {
      const b = DB.load('bookings', []).find((x) => x.id === booking.id);
      if (!b) { clearInterval(iv); return; }
      const ms = new Date(b.holdExpiry).getTime() - Date.now();
      if (ms <= 0) {
        clearInterval(iv);
        closeModal();
        toast('Hold kedaluwarsa — booking dibatalkan otomatis', 'err');
        refresh();
        go('tickets');
        return;
      }
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(iv);
  }, [booking.id, closeModal, go, toast, refresh]);

  const ms = new Date(booking.holdExpiry).getTime() - now;
  const mm = String(Math.max(0, Math.floor(ms / 60000))).padStart(2, '0');
  const ss = String(Math.max(0, Math.floor((ms % 60000) / 1000))).padStart(2, '0');
  const va = booking._va || ('8821 ' + String(Math.floor(100000000000 + Math.random() * 899999999999)).slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 '));

  const simulatePay = () => {
    const arr = DB.load('bookings', []);
    const b = arr.find((x) => x.id === booking.id);
    if (!b) return;
    b.status = 'paid';
    b.paidAt = new Date().toISOString();
    DB.save('bookings', arr);
    refresh();
    const pays = DB.load('payments', []);
    const p = pays.find((x) => x.bookingId === booking.id);
    if (p) { p.status = 'paid'; DB.save('payments', pays); refresh(); }
    audit('payment_paid', b.code + ' • ' + fmtRp(b.total));
    notify(b.userEmail, 'Pembayaran berhasil — ' + b.code, 'E-tiket QR terbit. Tunjukkan ke pengemudi saat boarding.', 'WA+Email');
    refresh();
    closeModal();
    toast('Pembayaran sukses! E-tiket terbit.', 'ok');
    setBw({ step: 1, routeId: 'R1', date: todayStr(1), scheduleId: null, seats: [], passengers: [], pickup: '', voucher: '', discount: 0 });
    if (onDone) onDone(b.id);
    else go('ticket-detail:' + b.id);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between"><h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="wallet" className="w-5 h-5 text-sky-600" />Pembayaran {booking.payMethod}</h3>
        <button onClick={() => { closeModal(); go('tickets'); }} className="text-slate-400 hover:text-slate-700"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="text-center bg-amber-50 border border-amber-200 rounded-2xl py-2.5 mt-3 font-extrabold text-amber-800 text-[14px]">Sisa waktu bayar: <span className="font-mono">{mm}:{ss}</span></div>
      {booking.payMethod === 'QRIS' ? (
        <>
          <img src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + booking.code + '-' + booking.total} className="w-48 h-48 mx-auto mt-4 rounded-2xl border-4 border-[#0b2447]" alt="QRIS" />
          <div className="text-center text-[12px] font-bold text-slate-500 mt-2">Scan dengan Dana / OVO / GoPay / m-Banking</div>
        </>
      ) : booking.payMethod === 'VA' ? (
        <div className="mt-4 bg-[#0b2447] text-white rounded-2xl p-4 text-center"><div className="text-[11px] font-bold opacity-70 tracking-widest">VIRTUAL ACCOUNT BCA</div><div className="font-mono font-extrabold text-[22px] tracking-wider mt-1">{va}</div><button onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(va); toast('Nomor VA disalin'); }} className="mt-2 text-[12px] font-bold bg-white/15 px-4 py-1.5 rounded-full">Salin</button></div>
      ) : (
        <div className="mt-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl p-4 text-center font-extrabold">Bayar via E-Wallet<br /><span className="text-[26px] font-mono">{fmtRp(booking.total)}</span><div className="text-[12px] opacity-80 font-semibold">Dana • OVO • GoPay • ShopeePay</div></div>
      )}
      <div className="flex justify-between font-extrabold text-[15px] mt-4"><span>Total</span><span className="text-sky-700">{fmtRp(booking.total)}</span></div>
      <div className="text-[11px] text-slate-400 font-semibold">Kode booking: <b className="font-mono">{booking.code}</b></div>
      <button onClick={simulatePay} className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white font-extrabold py-3.5 rounded-2xl transition flex items-center justify-center gap-2"><Icon name="circle-check-big" className="w-5 h-5" />Simulasi: Saya Sudah Bayar</button>
      <button onClick={() => { closeModal(); go('tickets'); }} className="w-full mt-2 bg-slate-100 font-bold text-[13px] py-2.5 rounded-2xl">Bayar Nanti (lihat tiket)</button>
      <p className="text-[11px] text-slate-400 text-center mt-2 font-medium">Terintegrasi Midtrans / Xendit (mode simulasi)</p>
    </div>
  );
}

export function openPayment(bid, openModal) {
  const b = DB.load('bookings', []).find((x) => x.id === bid);
  if (!b) return;
  const nb = { ...b, holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
  DB.save('bookings', DB.load('bookings', []).map((x) => (x.id === bid ? nb : x)));
  openModal(<PaymentModal booking={nb} />);
}

export default function Search() {
  const { bw, setBw, user, go, toast, refresh, tick, payMethod, setPayMethod, openModal } = useApp();
  void tick;

  const routes = DB.load('routes', []).filter((r) => r.active);
  const stepSchedules = () => DB.load('schedules', []).filter((x) => x.routeId === bw.routeId && x.date === bw.date && x.status === 'open').sort((a, b) => a.time.localeCompare(b.time));

  const setStep = (step) => setBw({ ...bw, step });

  const wizNext = () => {
    if (bw.step === 1 && !bw.routeId) return toast('Pilih rute dulu', 'warn');
    if (bw.step === 3 && !bw.scheduleId) return toast('Pilih armada / jadwal dulu', 'warn');
    if (bw.step === 3 && bw.scheduleId && !schedReady(schedById(bw.scheduleId))) {
      setBw({ ...bw, scheduleId: null });
      refresh();
      return toast('Jadwal tidak tersedia (armada maintenance / pengemudi nonaktif / ditutup) — pilih yang lain', 'err');
    }
    if (bw.step === 4) {
      if (!bw.seats.length) return toast('Pilih minimal 1 kursi', 'warn');
      const bad = bw.seats.some((st) => { const p = bw.passengers.find((x) => x.seat === st); return !p || !p.name || !p.phone; });
      if (bad) return toast('Lengkapi nama & HP semua penumpang', 'warn');
      const tk = takenSeats(bw.scheduleId);
      const clash = bw.seats.find((s) => tk.paid.includes(s) || tk.hold.includes(s));
      if (clash) return toast('Kursi ' + clash + ' baru saja terbooking orang lain. Pilih kursi lain.', 'err');
    }
    if (bw.step >= 5) return;
    setBw({ ...bw, step: bw.step + 1 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const wizNav = (back, next) => (
    <div className="flex gap-2 mt-5 sticky bottom-[76px] md:static bg-gradient-to-t from-white via-white to-transparent md:bg-none pt-2 pb-1 -mx-1 px-1 z-10">
      {back ? <button onClick={() => { setBw({ ...bw, step: bw.step - 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-touch flex-1 bg-slate-100 hover:bg-slate-200 active:scale-[.98] font-extrabold text-[14px] py-3.5 rounded-2xl transition flex items-center justify-center gap-2"><Icon name="arrow-left" className="w-4 h-4" />Kembali</button> : null}
      {next ? <button onClick={wizNext} className="btn-touch flex-[2] bg-[#0b2447] hover:bg-sky-600 active:scale-[.98] text-white font-extrabold text-[14px] py-3.5 rounded-2xl transition flex items-center justify-center gap-2 shadow-lg">Lanjut<Icon name="arrow-right" className="w-4 h-4" /></button> : null}
    </div>
  );

  const toggleSeat = (st) => {
    if (bw.seats.includes(st)) {
      setBw({ ...bw, seats: bw.seats.filter((x) => x !== st), passengers: bw.passengers.filter((p) => p.seat !== st) });
    } else {
      const maxS = schedSeatCap(bw.scheduleId);
      if (bw.seats.length >= maxS) { toast('Maksimal ' + maxS + ' kursi per booking', 'warn'); return; }
      const passengers = [...bw.passengers];
      if (!passengers.find((p) => p.seat === st)) passengers.push({ seat: st, name: '', phone: '' });
      setBw({ ...bw, seats: [...bw.seats, st], passengers });
      toast('Kursi ' + st + ' dipilih', 'info');
    }
  };

  const setPax = (seat, f, val) => {
    const passengers = [...bw.passengers];
    let p = passengers.find((x) => x.seat === seat);
    if (!p) { p = { seat, name: '', phone: '' }; passengers.push(p); }
    p[f] = val;
    setBw({ ...bw, passengers });
  };

  const applyVoucher = () => {
    const discount = calcDiscount(bw.voucher, bw.scheduleId, bw.seats.length);
    setBw({ ...bw, discount });
    refresh();
    if (discount > 0) toast('Voucher ' + bw.voucher + ' dipakai: hemat ' + fmtRp(discount));
    else toast('Kode voucher tidak valid / kedaluwarsa', 'err');
  };

  const joinWaiting = () => {
    if (!user) { go('login'); return; }
    const sid = bw.scheduleId || (stepSchedules()[0] || {}).id;
    if (!sid) { toast('Pilih jadwal dulu', 'warn'); return; }
    const w = DB.load('waiting', []);
    w.push({ id: uid('WL'), scheduleId: sid, userEmail: user.email, time: new Date().toISOString() });
    DB.save('waiting', w);
    refresh();
    audit('waiting_list', user.email + ' → ' + sid);
    toast('Masuk waiting list. Kami notifikasi via WA jika ada kursi kosong.', 'ok');
  };

  const doCheckout = () => {
    if (!user) { toast('Login dulu untuk booking', 'warn'); go('login'); return; }
    const s = schedById(bw.scheduleId);
    if (!s) return;
    const tk = takenSeats(s.id);
    const clash = bw.seats.find((x) => tk.paid.includes(x) || tk.hold.includes(x));
    if (clash) {
      toast('Kursi ' + clash + ' sudah diambil. Silakan pilih ulang.', 'err');
      setBw({ ...bw, seats: bw.seats.filter((x) => x !== clash) });
      return;
    }
    const discount = calcDiscount(bw.voucher, bw.scheduleId, bw.seats.length);
    const sub = s.price * bw.seats.length;
    const total = sub - discount;
    const code = 'TA-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const booking = {
      id: uid('BK'), code, scheduleId: s.id, userEmail: user.email,
      passengers: bw.passengers.map((p) => ({ ...p, pickup: bw.pickup || routeById(s.routeId).pickups[0] })),
      seats: [...bw.seats], subtotal: sub, discount, total, status: 'pending', payMethod,
      createdAt: new Date().toISOString(), paidAt: null, holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString(), tripStatus: 'scheduled',
    };
    const arr = DB.load('bookings', []);
    arr.unshift(booking);
    DB.save('bookings', arr);
    refresh();
    const pays = DB.load('payments', []);
    pays.unshift({ id: uid('PAY'), bookingId: booking.id, amount: total, method: payMethod, status: 'pending', time: new Date().toISOString(), fee: feeFor(s.agencyId, total) });
    DB.save('payments', pays);
    refresh();
    const vs = DB.load('vouchers', []);
    const v = vs.find((x) => x.code === bw.voucher && x.active);
    if (v && discount > 0) { v.used = (v.used || 0) + 1; DB.save('vouchers', vs); refresh(); }
    audit('booking_create', code + ' • ' + user.email + ' • ' + bw.seats.join(','));
    notify(user.email, 'Booking dibuat — ' + code, 'Segera bayar ' + fmtRp(total) + ' sebelum hold 15 menit habis.', 'WA');
    refresh();
    openModal(<PaymentModal booking={booking} />);
  };

  const repay = (bid) => {
    const b = DB.load('bookings', []).find((x) => x.id === bid);
    if (!b) return;
    const nb = { ...b, holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
    DB.save('bookings', DB.load('bookings', []).map((x) => (x.id === bid ? nb : x)));
    refresh();
    openModal(<PaymentModal booking={nb} />);
  };
  void repay;

  const renderStep1 = () => (
    <>
      <h3 className="font-extrabold text-[16px]">Pilih Rute Perjalanan</h3>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">{routes.map((r) => (
        <button key={r.id} onClick={() => setBw({ ...bw, routeId: r.id, scheduleId: null })} className={'text-left rounded-2xl border-2 p-4 transition ' + (bw.routeId === r.id ? 'border-sky-500 bg-sky-50 shadow-lg' : 'border-slate-100 hover:border-sky-200')}>
          <div className="font-extrabold text-[15px]">{r.from} → {r.to}</div><div className="text-[12px] text-slate-500 font-medium">{r.duration} • {r.distance} • mulai {fmtRp(r.basePrice)}</div>
          <div className="text-[11px] font-bold text-slate-400 mt-1.5 flex items-center gap-1"><Icon name="map-pin" className="w-3 h-3" />{r.pickups.length} titik jemput door-to-door</div>
        </button>
      ))}</div>
      {wizNav(false, true)}
    </>
  );

  const renderStep2 = () => {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = todayStr(i);
      const list = DB.load('schedules', []).filter((x) => x.routeId === bw.routeId && x.date === d);
      const avail = list.filter((s) => schedReady(s) && seatsLeft(s.id) > 0).length;
      const dt = new Date(d);
      days.push({
        d, avail,
        wd: dt.toLocaleDateString('id-ID', { weekday: 'short' }),
        dn: dt.getDate(),
        mo: dt.toLocaleDateString('id-ID', { month: 'short' }),
      });
    }
    return (
      <>
        <h3 className="font-extrabold text-[16px]">Pilih Tanggal Keberangkatan</h3><p className="text-[12px] text-slate-500 font-medium">Hijau = ada armada tersedia • Merah = 0 tersedia</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-3">{days.map((x) => (
          <button key={x.d} onClick={() => setBw({ ...bw, date: x.d, scheduleId: null })} className={'rounded-2xl border-2 p-2.5 text-center transition ' + (bw.date === x.d ? 'border-sky-500 bg-sky-600 text-white shadow-lg' : x.avail > 0 ? 'border-green-200 bg-green-50 hover:border-green-400' : 'border-red-100 bg-red-50 opacity-70')}>
            <div className={'text-[10px] font-extrabold uppercase ' + (bw.date === x.d ? 'text-sky-200' : '')}>{x.wd}</div><div className="font-extrabold text-[18px] leading-none my-0.5">{x.dn}</div><div className="text-[10px] font-bold">{x.mo}</div>
            <div className={'badge mt-1.5 mx-auto !text-[10px] ' + (x.avail > 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white')}>{x.avail} tersedia</div>
          </button>
        ))}</div>
        {wizNav(true, true)}
      </>
    );
  };

  const renderStep3 = () => {
    const list = stepSchedules();
    if (!list.length) {
      return (
        <div className="text-center py-10"><Icon name="calendar-x" className="w-12 h-12 text-slate-300 mx-auto" /><div className="font-extrabold mt-2">Tidak ada jadwal hari ini</div><p className="text-[13px] text-slate-500">Coba tanggal lain atau masuk waiting list.</p>
          <button onClick={joinWaiting} className="mt-3 bg-amber-500 text-white font-bold text-[13px] px-5 py-2.5 rounded-xl"><Icon name="bell-ring" className="w-4 h-4 inline" /> Masuk Waiting List</button>
          {wizNav(true, false)}
        </div>
      );
    }
    const r0 = routeById(bw.routeId);
    return (
      <>
        <h3 className="font-extrabold text-[16px]">Pilih Armada — {r0 ? r0.from + ' → ' + r0.to : ''} • {fmtDate(bw.date)}</h3>
        <div className="space-y-3 mt-3">{list.map((s) => {
          const v = vehicleById(s.vehicleId);
          const dr = driverById(s.driverId);
          const left = seatsLeft(s.id);
          const sel = bw.scheduleId === s.id;
          const ready = schedReady(s);
          const why = !ready ? ((v && v.status !== 'aktif') ? 'Armada maintenance' : (dr && dr.status !== 'aktif') ? 'Pengemudi nonaktif' : 'Jadwal ditutup') : '';
          return (
            <div key={s.id} onClick={() => { if (ready) setBw({ ...bw, scheduleId: s.id }); }} className={(ready ? 'cursor-pointer card-hover active:scale-[.99]' : 'opacity-70') + ' rounded-2xl border-2 p-3 sm:p-3.5 flex flex-col xs:flex-row sm:flex-row gap-3 transition ' + (sel && ready ? 'border-sky-500 shadow-lg bg-sky-50/50' : 'border-slate-100 hover:border-sky-200 bg-white')}>
              <img src={v.photo} onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/' + v.id + '/400/250'; }} className="w-full h-36 xs:w-28 xs:h-24 sm:w-40 sm:h-28 object-cover rounded-2xl shrink-0" loading="lazy" alt={vehName(v)} />
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-extrabold text-[15px]">{vehName(v)}</span><span className="badge bg-slate-100 text-slate-600">{v.plate}</span>{!ready ? <span className="badge bg-amber-100 text-amber-700">{why}</span> : left <= 2 && left > 0 ? <span className="badge bg-red-100 text-red-700">Sisa {left}</span> : null}{ready && left === 0 ? <span className="badge bg-red-500 text-white">PENUH</span> : null}</div>
                <div className="text-[12.5px] font-bold text-sky-700 mt-1 flex items-center gap-2"><Icon name="clock" className="w-3.5 h-3.5" />Berangkat {s.time} WIB • <Icon name="user" className="w-3.5 h-3.5" />{dr.name} ★{dr.rating}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">{(v.facilities || []).map((f) => (<span key={f} className="badge bg-slate-100 text-slate-600 !font-semibold"><Icon name="check" className="w-3 h-3" />{f}</span>))}</div>
                <div className="flex items-center justify-between mt-2.5"><div className="font-extrabold text-[17px] text-[#0b2447]">{fmtRp(s.price)}<span className="text-[11px] font-semibold text-slate-400">/kursi</span></div>
                  <span className={'badge ' + (left > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{left} kursi tersisa</span></div></div>
              <div className="hidden sm:flex items-center"><div className={'w-6 h-6 rounded-full flex items-center justify-center ' + (sel ? 'bg-sky-500 text-white' : 'border-2 border-slate-200 text-transparent')}><Icon name="check" className="w-4 h-4" /></div></div>
            </div>
          );
        })}</div>
        {wizNav(true, true)}
      </>
    );
  };

  const renderStep4 = () => {
    const s = schedById(bw.scheduleId);
    if (!s) return (<><div className="text-center py-10 text-slate-400 font-bold">Jadwal tidak ditemukan — kembali pilih armada.</div>{wizNav(true, false)}</>);
    const tk = takenSeats(s.id);
    const v = vehicleById(s.vehicleId);
    const r = routeById(s.routeId);
    const layout = vehLayout(v);
    const pickup = bw.pickup || (r.pickups[0] || '');
    return (
      <div className="grid md:grid-cols-2 gap-5">
        <div><h3 className="font-extrabold text-[16px]">Pilih Kursi <span className="text-[12px] font-semibold text-slate-400">— {layout.filter((c) => c.type === 'seat').length} penumpang</span></h3>
          <div className="flex gap-3 mt-2 text-[11px] font-bold flex-wrap">
            {[['#dcfce7,#22c55e', 'Kosong'], ['#0f7ae5,#0b63c4', 'Pilihanmu'], ['#e2e8f0,#cbd5e1', 'Terisi'], ['#fef3c7,#f59e0b', 'Hold 15 mnt']].map((l) => (
              <span key={l[1]} className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: l[0].split(',')[0], borderColor: l[0].split(',')[1] }}></span>{l[1]}</span>
            ))}
            {(tk.inactive || []).length ? <span className="flex items-center gap-1.5 text-slate-500"><Icon name="ban" className="w-3.5 h-3.5" />Nonaktif ({tk.inactive.join(', ')})</span> : null}
          </div>
          <CabinGrid layout={layout} paid={tk.paid} hold={tk.hold} inactive={tk.inactive} selected={bw.seats} onPick={toggleSeat} interactive plate={v.plate} vehName={vehName(v)} legend={false} />
        </div>
        <div><h3 className="font-extrabold text-[16px]">Data Penumpang <span className="badge bg-sky-100 text-sky-700">{bw.seats.length} kursi</span></h3>
          {bw.seats.length === 0 ? (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] font-semibold text-amber-800 flex gap-2"><Icon name="mouse-pointer-click" className="w-5 h-5 shrink-0" />Klik kursi hijau pada layout armada untuk memilih. 1 akun bisa pesan beberapa kursi sekaligus.</div>
          ) : (
            <>
              <div className="space-y-2.5 mt-3">{bw.seats.map((st) => (
                <div key={st} className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <div className="flex items-center justify-between"><span className="badge bg-sky-600 text-white">Kursi {st}</span><button onClick={() => setBw({ ...bw, seats: bw.seats.filter((x) => x !== st), passengers: bw.passengers.filter((p) => p.seat !== st) })} className="text-red-500 hover:bg-red-50 p-1 rounded-lg"><Icon name="x" className="w-4 h-4" /></button></div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input placeholder="Nama penumpang" value={((bw.passengers.find((p) => p.seat === st) || {}).name || '')} onChange={(e) => setPax(st, 'name', e.target.value)} className="text-[13px] font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 focus-ring" />
                    <input placeholder="No. HP" value={((bw.passengers.find((p) => p.seat === st) || {}).phone || '')} onChange={(e) => setPax(st, 'phone', e.target.value)} className="text-[13px] font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 focus-ring" />
                  </div>
                </div>
              ))}</div>
              <label className="block text-[12px] font-extrabold mt-3 mb-1">TITIK JEMPUT (door-to-door)</label>
              <select value={pickup} onChange={(e) => setBw({ ...bw, pickup: e.target.value })} className="w-full text-[13px] font-semibold bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{r.pickups.map((p) => (<option key={p} value={p}>{p}</option>))}</select>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderStep5 = () => {
    const s = schedById(bw.scheduleId);
    if (!s) return (<><div className="text-center py-10 text-slate-400 font-bold">Jadwal tidak ditemukan — kembali pilih armada.</div>{wizNav(true, false)}</>);
    const r = routeById(s.routeId);
    const v = vehicleById(s.vehicleId);
    const sub = s.price * bw.seats.length;
    const discount = calcDiscount(bw.voucher, bw.scheduleId, bw.seats.length);
    const total = sub - discount;
    const vouchers = DB.load('vouchers', []).filter((x) => x.active);
    return (
      <>
        <h3 className="font-extrabold text-[16px]">Ringkasan &amp; Pembayaran</h3>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="font-extrabold text-[14px]">{r.from} → {r.to}</div>
            <div className="text-[12.5px] font-semibold text-slate-600 mt-1">{fmtDate(s.date)} • {s.time} WIB • {vehName(v)} ({v.plate})</div>
            <div className="text-[12.5px] font-semibold text-slate-600">Kursi: <b>{bw.seats.join(', ')}</b> • Jemput: <b>{bw.pickup || r.pickups[0]}</b></div>
            <div className="mt-2 space-y-1 text-[13px] font-semibold"><div className="flex justify-between"><span>Subtotal ({bw.seats.length} kursi)</span><span>{fmtRp(sub)}</span></div>
              <div className="flex justify-between text-green-700"><span>Diskon voucher</span><span>− {fmtRp(discount)}</span></div>
              <div className="flex justify-between font-extrabold text-[16px] pt-2 border-t"><span>Total Bayar</span><span className="text-sky-700">{fmtRp(total)}</span></div></div>
            <div className="mt-3"><label className="text-[12px] font-extrabold">KODE VOUCHER</label>
              <div className="flex gap-2 mt-1"><input value={bw.voucher} onChange={(e) => setBw({ ...bw, voucher: e.target.value.toUpperCase() })} placeholder="cth: HEMAT20" className="flex-1 text-[13px] font-bold uppercase bg-white border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><button onClick={applyVoucher} className="bg-[#0b2447] text-white text-[12px] font-extrabold px-4 rounded-xl">Pakai</button></div>
              <div className="flex flex-wrap gap-1.5 mt-2">{vouchers.map((x) => (<button key={x.code} onClick={() => { const d = calcDiscount(x.code, bw.scheduleId, bw.seats.length); setBw({ ...bw, voucher: x.code, discount: d }); refresh(); }} className="badge bg-amber-100 text-amber-800 hover:bg-amber-200">{x.code} • {x.desc}</button>))}</div></div>
          </div>
          <div><label className="text-[12px] font-extrabold">METODE PEMBAYARAN</label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {[['QRIS', 'qr-code', 'Instan'], ['VA', 'landmark', 'Cek otomatis'], ['EWALLET', 'wallet', 'Dana/Ovo/Gopay']].map((m) => (
                <button key={m[0]} onClick={() => setPayMethod(m[0])} className={'paybtn rounded-2xl border-2 p-3 text-center transition ' + (payMethod === m[0] ? 'border-sky-500 bg-sky-50' : 'border-slate-200')}><Icon name={m[1]} className={'w-6 h-6 mx-auto ' + (payMethod === m[0] ? 'text-sky-600' : 'text-slate-400')} /><div className="font-extrabold text-[12px] mt-1">{m[0]}</div><div className="text-[10px] text-slate-400 font-semibold">{m[2]}</div></button>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mt-3 text-[12.5px] font-semibold text-amber-900 flex gap-2"><Icon name="timer" className="w-5 h-5 shrink-0" /><span>Kursi di-hold <b>15 menit</b> setelah klik Bayar. 1 kursi hanya untuk 1 orang — lock real-time aktif.</span></div>
            <button onClick={doCheckout} className="w-full mt-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 text-white font-extrabold text-[15px] py-3.5 rounded-2xl shadow-lg transition flex items-center justify-center gap-2"><Icon name="shield-check" className="w-5 h-5" />Bayar {fmtRp(total)}</button>
            <button onClick={joinWaiting} className="w-full mt-2 text-[12px] font-bold text-slate-500 hover:text-amber-600">Kursi penuh? Masuk waiting list →</button>
          </div>
        </div>
        {wizNav(true, false)}
      </>
    );
  };

  return (
    <div className="anim bg-white rounded-3xl shadow-card p-5">
      <WizardSteps step={bw.step} />
      <div className="mt-5">
        {bw.step === 1 ? renderStep1() : null}
        {bw.step === 2 ? renderStep2() : null}
        {bw.step === 3 ? renderStep3() : null}
        {bw.step === 4 ? (<>{renderStep4()}{wizNav(true, true)}</>) : null}
        {bw.step === 5 ? renderStep5() : null}
      </div>
    </div>
  );
}
