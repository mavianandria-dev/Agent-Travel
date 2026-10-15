import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, vehicleById, driverById, agencyById, audit, notify, processWaiting, vehName } from '@/lib/domain.js';
import { fmtRp, todayStr, uid } from '@/lib/utils.js';
import { Icon, Empty, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { PaymentModal } from './Search.jsx';

function TripTimeline({ st }) {
  const steps = [['scheduled', 'check', 'Dijadwalkan'], ['ontrip', 'car', 'Dalam Perjalanan'], ['arrived', 'flag', 'Tiba di Tujuan']];
  const order = { scheduled: 0, ontrip: 1, arrived: 2 };
  const cur = order[st] ?? 0;
  return (
    <div className="flex items-center mt-3">{steps.map((x, i) => (
      <span key={x[0]} className="contents">
        {i > 0 ? <div className={'flex-1 h-1 rounded ' + (i <= cur ? 'bg-green-500' : 'bg-slate-200')}></div> : null}
        <div className="flex flex-col items-center px-1"><div className={'w-9 h-9 rounded-full flex items-center justify-center ' + (i <= cur ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-300')}><Icon name={x[1]} className="w-4 h-4" /></div><div className={'text-[10px] font-extrabold mt-1 ' + (i <= cur ? 'text-green-700' : 'text-slate-400')}>{x[2]}</div></div>
      </span>
    ))}</div>
  );
}

export default function TicketDetail({ bid }) {
  const { view, user, go, toast, refresh, tick, openModal, closeModal } = useApp();
  const [rate, setRate] = useState(5);
  const [rateText, setRateText] = useState('');
  void tick;

  const id = bid || (view.startsWith('ticket-detail:') ? view.split(':')[1] : null);
  const b = DB.load('bookings', []).find((x) => x.id === id);
  if (!b) return <div className="anim bg-white rounded-3xl shadow-card p-5"><Empty icon="x" msg="Tiket tidak ditemukan" /></div>;
  const s = schedById(b.scheduleId);
  if (!s) return <div className="anim bg-white rounded-3xl shadow-card p-5"><Empty icon="x" msg="Jadwal tidak ditemukan" /></div>;
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const dr = driverById(s.driverId);
  const ag = agencyById(s.agencyId);

  const submitReview = () => {
    const arr = DB.load('bookings', []);
    const target = arr.find((x) => x.id === b.id);
    if (!target) return;
    target.rating = rate;
    DB.save('bookings', arr);
    refresh();
    const rv = DB.load('reviews', []);
    rv.unshift({ id: uid('RV'), agencyId: s.agencyId, user: (user || {}).name || target.passengers[0]?.name || 'Penumpang', rating: rate, text: rateText || 'Perjalanan menyenangkan!', date: todayStr(0), trip: r.from + ' → ' + r.to });
    DB.save('reviews', rv);
    refresh();
    audit('review', b.code + ' ★' + rate);
    toast('Ulasan terkirim. Terima kasih!');
    refresh();
  };

  const repay = () => {
    const nb = { ...b, holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
    DB.save('bookings', DB.load('bookings', []).map((x) => (x.id === b.id ? nb : x)));
    refresh();
    openModal(<PaymentModal booking={nb} />);
  };

  const cancelBooking = () => {
    const h = (new Date(s.date + 'T' + s.time) - Date.now()) / 36e5;
    const pol = ((ag && ag.refundPolicy) || []).slice().sort((a, b2) => b2.minH - a.minH);
    const rule = pol.find((p) => h >= p.minH) || { pct: 0 };
    const est = Math.round(b.total * rule.pct / 100);
    openModal(
      <div className="p-6"><h3 className="font-extrabold text-[17px]">Batalkan Booking?</h3>
        <p className="text-[13px] text-slate-500 font-medium mt-1">Refund mengikuti kebijakan agen: H-3 = 100%, H-1 = 50%, hari-H = 0%.</p>
        <div className="mt-3"><div className="bg-sky-50 rounded-2xl p-3 text-[13px] font-bold text-sky-900">Estimasi refund: <b>{rule.pct}% × {fmtRp(b.total)} = {fmtRp(est)}</b><br /><span className="font-medium text-[12px]">Keberangkatan {Math.max(0, Math.round(h))} jam lagi</span></div></div>
        <div className="flex gap-2 mt-4"><button onClick={() => closeModal()} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
          <button onClick={() => doCancel(rule.pct)} className="flex-1 bg-red-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl">Ya, Batalkan</button></div></div>
    );
  };

  const doCancel = (pct) => {
    const arr = DB.load('bookings', []);
    const target = arr.find((x) => x.id === b.id);
    if (!target) return;
    target.status = 'cancelled';
    target.refundPct = pct || 0;
    target.refundAmount = Math.round(target.total * ((pct || 0) / 100));
    DB.save('bookings', arr);
    refresh();
    audit('booking_cancel', target.code + ' • refund ' + (pct || 0) + '%');
    notify(target.userEmail, 'Booking dibatalkan — ' + target.code, 'Refund ' + fmtRp(target.refundAmount || 0) + ' (' + (pct || 0) + '%) diproses 1–3 hari kerja.', 'WA');
    processWaiting(target.scheduleId);
    refresh();
    closeModal();
    toast('Booking dibatalkan. Refund ' + fmtRp(target.refundAmount || 0), 'info');
    refresh();
    go('tickets');
  };

  return (
    <div className="anim grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card overflow-hidden print-only-off">
        <div className="bg-gradient-to-r from-[#0b2447] to-sky-700 text-white p-5">
          <div className="flex items-center justify-between"><span className="font-extrabold text-[15px]">TransAceh • E-Tiket</span><BadgeStatus st={b.status} /></div>
          <div className="font-mono font-extrabold text-[26px] tracking-widest mt-2">{b.code}</div>
          <div className="text-[13px] font-bold opacity-90">{r.from} → {r.to}</div>
        </div>
        <div className="p-5">
          <div className="flex gap-4"><img src={'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=TIKET-' + b.code} className="w-36 h-36 rounded-2xl border-2 border-slate-200" alt="QR" />
            <div className="text-[13px] font-semibold space-y-1.5">
              <div><span className="text-slate-400">Tanggal</span><br /><b>{fmtDate(s.date)} • {s.time} WIB</b></div>
              <div><span className="text-slate-400">Armada / Pengemudi</span><br /><b>{vehName(v)} • {v.plate}</b><br /><b>{dr.name}</b> • {dr.phone}</div>
            </div></div>
          <div className="mt-4 bg-slate-50 rounded-2xl p-3.5 text-[13px] font-semibold space-y-1">
            <div className="font-extrabold text-[12px] text-slate-400 tracking-wider">PENUMPANG</div>
            {b.passengers.map((p) => (<div key={p.seat} className="flex justify-between border-t border-slate-200 pt-1.5"><span>{p.name} <span className="text-slate-400">({p.phone})</span></span><span className="badge bg-sky-600 text-white">{p.seat}</span></div>))}
            <div className="flex justify-between border-t pt-1.5"><span>Jemput</span><b>{(b.passengers[0] && b.passengers[0].pickup) || '-'}</b></div>
            <div className="flex justify-between"><span>Travel</span><b>{ag.name} • {ag.phone}</b></div>
            <div className="flex justify-between font-extrabold text-[15px]"><span>Total</span><span>{fmtRp(b.total)}</span></div>
          </div>
          <div className="flex gap-2 mt-4 no-print">
            <button onClick={() => window.print()} className="flex-1 bg-slate-100 font-extrabold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-2"><Icon name="printer" className="w-4 h-4" />Cetak / PDF</button>
            <button onClick={() => toast('Tiket dikirim via WhatsApp ke ' + ((b.passengers[0] && b.passengers[0].phone) || 'penumpang'), 'ok')} className="flex-1 bg-green-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-2"><Icon name="message-circle" className="w-4 h-4" />Kirim WA</button>
          </div>
          {b.status === 'pending' ? <button onClick={repay} className="no-print w-full mt-2 bg-green-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl">Bayar Sekarang</button> : null}
          {['pending', 'paid'].includes(b.status) ? <button onClick={cancelBooking} className="no-print w-full mt-2 bg-red-50 text-red-600 font-extrabold text-[13px] py-2.5 rounded-xl">Batalkan Booking</button> : null}
          <button onClick={() => go('tickets')} className="no-print w-full mt-2 text-[12px] font-bold text-slate-400">← Kembali ke tiket saya</button>
        </div>
      </div>
      <div className="space-y-4">
        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="navigation" className="w-5 h-5 text-sky-600" />Status Perjalanan</h3>
          <TripTimeline st={b.tripStatus || 'scheduled'} />
          <div className="mt-3 bg-sky-50 rounded-2xl p-3 text-[12.5px] font-semibold text-sky-900">Titik jemput: <b>{(b.passengers[0] && b.passengers[0].pickup) || '-'}</b> — harap standby 15 menit sebelum berangkat.</div>
        </div>
        {b.status === 'done' && !b.rating ? (
          <div className="bg-white rounded-3xl shadow-card p-5">
            <h3 className="font-extrabold text-[15px]">Beri Rating &amp; Ulasan</h3>
            <div className="flex gap-1.5 mt-2">{[1, 2, 3, 4, 5].map((i) => (<button key={i} onClick={() => setRate(i)} className={'rate-s text-3xl ' + (i <= rate ? 'text-amber-400' : 'text-slate-200')}>★</button>))}</div>
            <textarea rows={2} value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="Ceritakan pengalamanmu..." className="w-full mt-2 text-[13px] bg-slate-50 border border-slate-200 rounded-xl p-3 focus-ring"></textarea>
            <button onClick={submitReview} className="mt-2 w-full bg-amber-400 hover:bg-amber-500 font-extrabold text-[13px] py-2.5 rounded-xl">Kirim Ulasan</button></div>
        ) : b.rating ? (
          <div className="bg-green-50 border border-green-200 rounded-3xl p-4 text-[13px] font-bold text-green-800">Terima kasih! Kamu memberi ★{b.rating} untuk perjalanan ini.</div>
        ) : null}
      </div>
    </div>
  );
}
