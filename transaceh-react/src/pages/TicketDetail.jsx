import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, vehicleById, driverById, agencyById, audit, vehName, splitFare, fareModelOf, cancelBooking as cancelBookingDomain, canCancelBooking, canPayBooking, refundPolicyOf, refundPolicyText, refundAmountFor, scheduleIsPast, ensureHoldExpiry, bookedPassengers, maintenanceBookingInfo, maintenanceDeadlineLabel, refundMaintenanceBooking, moveMaintenanceBooking, seatsLeft } from '@/lib/domain.js';
import { fmtRp, todayStr, uid, fmtClock } from '@/lib/utils.js';
import { pickupOf } from '@/lib/pickups.js';
import { Icon, Empty, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { PaymentModal } from './Search.jsx';

function TripTimeline({ st }) {
  const steps = [['scheduled', 'check', 'Dijadwalkan'], ['ontrip', 'car', 'Dalam Perjalanan'], ['arrived', 'flag', 'Tiba di Tujuan']];
  const order = { scheduled: 0, ontrip: 1, arrived: 2 };
  const abnormal = st === 'missed' || st === 'cancelled';
  const cur = abnormal ? -1 : order[st] ?? 0;
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
  const _fare = b.fare || splitFare(s, (b.seats || []).length, b.discount || 0, b.source);
  /* E-tiket dua model uang (lihat domain.js — Model B memakai `fareModelOf`):
     - Model B (createdAt ≥ tanda deploy): rantai penuh Tiket (harga rute PENUH)
       + Jasa − Diskon + Subtotal + Fee; jalur pengemudi memecah jasa
       "Jasa agen (50%)" + "↳ Via sopir (50%)". Angka dari splitFare segar.
     - Model A (booking lama): rantai jurnal semula + memo viaSopir.
     viaSopir tidak pernah tersimpan — jurnal tetap 4 kolom. */
  const isB = fareModelOf(b) === 'B';
  const qB = isB ? splitFare(s, (b.seats || []).length, b.discount || 0, b.source) : null;
  const driverSrc = b.source === 'driver';
  const viaSopir = isB ? qB.viaSopir
    : (driverSrc ? splitFare(s, (b.seats || []).length, b.discount || 0, 'driver').viaSopir : 0);
  const tiketMurni = isB ? qB.quoteTicket
    : (driverSrc ? Math.max(0, _fare.ticket - viaSopir) : _fare.ticket);
  const jasaAgen = isB ? Math.max(0, qB.quoteService - qB.viaSopir) : _fare.service;
  const feeRow = isB ? qB.fee : _fare.fee;
  const discRow = isB ? qB.disc : 0;
  const subtotalFare = isB ? qB.subtotal : Math.max(0, b.total - _fare.fee);
  const pax = bookedPassengers(b);
  const firstPax = pax[0] || null;
  const pickupText = (pickupOf(firstPax, b) || '-') + ((firstPax?.pickupCoords || b.pickupCoords) ? ' • ' + (firstPax?.pickupCoords || b.pickupCoords) : '');
  const tripStatus = s.tripStatus && s.tripStatus !== 'scheduled' ? s.tripStatus : (b.tripStatus || 'scheduled');
  const delayActive = s.tripStatus === 'scheduled' && s.delayUntil && new Date(s.delayUntil).getTime() > Date.now();
  const tripDelayInfo = s.tripStatus === 'ontrip' && Array.isArray(s.tripDelayInfo) ? s.tripDelayInfo[0] : null;
  const mt = maintenanceBookingInfo(b);
  const mtActive = mt?.state === 'choice_pending';
  const mtCandidates = mt?.candidates || [];
  const mtOriginal = mt?.originalSchedule || s;
  const mtRoute = routeById(mtOriginal.routeId) || r;
  const qrInvalid = !!mt && mt.state !== 'replaced';

  const submitReview = () => {
    const arr = DB.load('bookings', []);
    const target = arr.find((x) => x.id === b.id);
    if (!target) return;
    target.rating = rate;
    DB.save('bookings', arr);
    refresh();
    const rv = DB.load('reviews', []);
    rv.unshift({ id: uid('RV'), agencyId: s.agencyId, user: (user || {}).name || firstPax?.name || 'Penumpang', rating: rate, text: rateText || 'Perjalanan menyenangkan!', date: todayStr(0), trip: r.from + ' → ' + r.to });
    DB.save('reviews', rv);
    refresh();
    audit('review', b.code + ' ★' + rate);
    toast('Ulasan terkirim. Terima kasih!');
    refresh();
  };

  const repay = () => {
    if (!canPayBooking(b, s)) {
      toast('Pembayaran ditutup — jadwal sudah berjalan/dibatalkan atau hold kedaluwarsa.', 'err');
      refresh();
      return;
    }
    const nb = ensureHoldExpiry(b);
    if (nb !== b) DB.save('bookings', DB.load('bookings', []).map((x) => (x.id === b.id ? nb : x)));
    refresh();
    openModal(<PaymentModal booking={nb} />);
  };

  const cancelable = canCancelBooking(b, s) && !mtActive;
  const policyText = refundPolicyText(refundPolicyOf(s.agencyId));
  const cancelBlockReason = (() => {
    if (mtActive) return 'Gunakan pilihan refund 100% / pindah armada pada panel maintenance.';
    if (b.status === 'done') return 'Perjalanan sudah selesai.';
    if (b.status === 'cancelled') return 'Booking sudah dibatalkan.';
    if (b.boarded) return 'Penumpang sudah boarding.';
    if (s.status === 'cancelled' || s.tripStatus === 'cancelled') return 'Jadwal dibatalkan oleh operator.';
    if (s.tripStatus === 'ontrip') return 'Perjalanan sedang berjalan.';
    if (s.tripStatus === 'arrived') return 'Perjalanan sudah tiba di tujuan.';
    if (s.tripStatus === 'missed') return 'Jadwal sudah terlewat.';
    if (scheduleIsPast(s, 0)) return 'Jadwal sudah melewati jam keberangkatan.';
    return 'Pembatalan tidak tersedia untuk tiket ini.';
  })();

  const cancelBooking = () => {
    const paid = b.status === 'paid';
    /* Estimasi refund = satu sumber angka dengan pembatalan nyata (refundAmountFor). */
    const exp = paid ? refundAmountFor(b, s) : null;
    openModal(
      <div className="p-6"><h3 className="font-extrabold text-[17px]">Batalkan Booking?</h3>
        <p className="text-[13px] text-slate-500 font-medium mt-1">Refund mengikuti kebijakan travel: {policyText}.</p>
        <div className="mt-3"><div className="bg-sky-50 rounded-2xl p-3 text-[13px] font-bold text-sky-900">{paid ? <>Estimasi refund: <b>{exp.pct}% × {fmtRp(exp.base)} ({exp.scope === 'minusFee' ? 'semua −fee' : 'tiket'}) = {fmtRp(exp.amount)}</b><br /><span className="font-medium text-[12px]">{exp.scope === 'minusFee' ? <>Jasa agen {fmtRp(_fare.service)} ikut kembali • fee {fmtRp(_fare.fee)} hangus</> : <>Jasa agen {fmtRp(_fare.service)} dan fee {fmtRp(_fare.fee)} hangus</>}{exp.viaSopir > 0 ? <> • komisi via sopir {fmtRp(exp.viaSopir)} {exp.scope === 'minusFee' ? 'ikut kembali' : 'hangus'}</> : ''} • Keberangkatan {Math.max(0, Math.round(exp.hours))} jam lagi</span></> : <>Booking belum dibayar — <b>tidak ada refund</b>.<br /><span className="font-medium text-[12px]">Kursi akan dilepas setelah pembatalan.</span></>}</div></div>
        <div className="flex gap-2 mt-4"><button onClick={() => closeModal()} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
          <button onClick={doCancel} className="flex-1 bg-red-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl">Ya, Batalkan</button></div></div>
    );
  };

  const doCancel = () => {
    const res = cancelBookingDomain(b.id, { by: 'pelanggan' });
    closeModal();
    refresh();
    if (!res.ok) { toast(res.msg, 'err'); return; }
    toast(res.refund > 0 ? 'Booking dibatalkan. Refund ' + fmtRp(res.refund) : 'Booking dibatalkan. Tidak ada refund.', 'info');
    go('tickets');
  };

  const doMaintenanceRefund = () => {
    const res = refundMaintenanceBooking(b.id, { by: 'pelanggan', reason: 'Pilihan pelanggan' });
    refresh();
    if (!res.ok) { toast(res.msg, 'err'); return; }
    toast('Refund 100% ' + fmtRp(res.refund) + ' diproses.', 'ok');
    go('tickets');
  };

  const doMove = (targetId) => {
    const res = moveMaintenanceBooking(b.id, targetId, { by: 'pelanggan' });
    refresh();
    if (!res.ok) { toast(res.msg, 'err'); return; }
    toast('Berhasil pindah ke ' + vehName(vehicleById(res.target.vehicleId)) + ' pukul ' + res.target.time + ' WIB', 'ok');
    go('ticket-detail:' + b.id);
  };

  return (
    <div className="anim grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card overflow-hidden print-only-off">
        <div className="bg-gradient-to-r from-[#0b2447] to-sky-700 text-white p-5">
          <div className="flex items-center justify-between"><span className="font-extrabold text-[15px]">TransAceh • E-Tiket</span><div className="flex items-center gap-1.5"><BadgeStatus st={b.status} />{mtActive ? <span className="badge bg-red-100 text-red-700 italic">MAINTENANCE</span> : mt?.state === 'refunded' ? <span className="badge bg-green-100 text-green-700">Refund</span> : null}{tripStatus === 'missed' && b.status !== 'cancelled' ? <BadgeStatus st="missed" /> : null}</div></div>
          <div className="font-mono font-extrabold text-[26px] tracking-widest mt-2">{b.code}</div>
          <div className="text-[13px] font-bold opacity-90">{r.from} → {r.to}</div>
        </div>
        <div className="p-5">
          <div className="flex gap-4"><div className="relative w-36 h-36 shrink-0">
              <img src={'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=TIKET-' + b.code} className={'w-36 h-36 rounded-2xl border-2 border-slate-200 ' + (qrInvalid ? 'grayscale' : '')} alt="QR" />
              {qrInvalid ? <div className="absolute inset-0 rounded-2xl bg-slate-900/65 text-white flex flex-col items-center justify-center text-center px-2"><Icon name="wrench" className="w-7 h-7 mb-1" /><div className="text-[11px] font-extrabold leading-tight italic">TIDAK BERLAKU<br />MAINTENANCE</div></div> : null}
            </div>
            <div className="text-[13px] font-semibold space-y-1.5">
              <div><span className="text-slate-400">Tanggal</span><br /><b>{fmtDate(s.date)} • {s.time} WIB</b></div>
              <div><span className="text-slate-400">Armada / Pengemudi</span><br /><b>{vehName(v)} • {v.plate}</b><br /><b>{dr ? dr.name + ' • ' + dr.phone : 'Ditugaskan oleh travel'}</b></div>
            </div></div>
          <div className="mt-4 bg-slate-50 rounded-2xl p-3.5 text-[13px] font-semibold space-y-1">
            <div className="font-extrabold text-[12px] text-slate-400 tracking-wider">PENUMPANG</div>
            {pax.length ? pax.map((p) => (<div key={p.seat} className="flex justify-between border-t border-slate-200 pt-1.5"><span>{p.name} <span className="text-slate-400">({p.phone})</span></span><span className="badge bg-sky-600 text-white">{p.seat}</span></div>)) : <div className="border-t border-slate-200 pt-1.5 text-slate-400">Data penumpang tidak tersedia</div>}
            <div className="flex justify-between border-t pt-1.5"><span>Jemput</span><b>{pickupText}</b></div>
            <div className="flex justify-between"><span>Travel</span><b>{ag.name} • {ag.phone}</b></div>
            {driverSrc ? <>
              <div className="flex justify-between"><span>{isB ? 'Tiket (sopir) x' + (b.seats || []).length : 'Tiket (sopir)'}</span><span>{fmtRp(tiketMurni)}</span></div>
              {jasaAgen > 0 || viaSopir > 0 ? <>
                <div className="flex justify-between"><span>{isB ? 'Jasa agen (50%)' : 'Jasa agen'}</span><span>{fmtRp(jasaAgen)}</span></div>
                <div className="flex justify-between pl-3 text-[12.5px] text-slate-400"><span>{isB ? <>&#8627; Via sopir (50%)</> : <>&#8627; Via sopir</>}</span><span>{fmtRp(viaSopir)}</span></div>
                {isB ? <div className="flex justify-between text-green-700"><span>Diskon voucher</span><span>− {fmtRp(discRow)}</span></div> : null}
              </> : null}
              <div className="flex justify-between border-t border-slate-200 pt-1"><span className={isB ? 'font-extrabold' : ''}>Subtotal ({(b.seats || []).length} kursi)</span><span>{fmtRp(subtotalFare)}</span></div>
              <div className="flex justify-between"><span>Fee platform</span><span>{fmtRp(feeRow)}</span></div>
            </> : <>
              <div className="flex justify-between"><span>Tiket x{(b.seats || []).length}</span><span>{fmtRp(tiketMurni)}</span></div>
              <div className="flex justify-between"><span>Jasa agen</span><span>{fmtRp(jasaAgen)}</span></div>
              {isB ? <div className="flex justify-between text-green-700"><span>Diskon voucher</span><span>− {fmtRp(discRow)}</span></div> : null}
              <div className="flex justify-between"><span className="font-extrabold">Subtotal ({(b.seats || []).length} kursi)</span><span>{fmtRp(subtotalFare)}</span></div>
              <div className="flex justify-between"><span>Fee platform</span><span>{fmtRp(feeRow)}</span></div>
            </>}
            <div className="flex justify-between font-extrabold text-[15px]"><span>Total</span><span>{fmtRp(b.total)}</span></div>
          </div>
          <div className="flex gap-2 mt-4 no-print">
            <button onClick={() => window.print()} className="flex-1 bg-slate-100 font-extrabold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-2"><Icon name="printer" className="w-4 h-4" />Cetak / PDF</button>
            <button onClick={() => toast('Tiket dikirim via WhatsApp ke ' + (firstPax?.phone || 'penumpang'), 'ok')} className="flex-1 bg-green-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-2"><Icon name="message-circle" className="w-4 h-4" />Kirim WA</button>
          </div>
          {b.status === 'pending' ? (canPayBooking(b, s)
            ? <button onClick={repay} className="no-print w-full mt-2 bg-green-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl">Bayar Sekarang</button>
            : <button disabled className="no-print w-full mt-2 bg-slate-100 text-slate-400 font-extrabold text-[13px] py-2.5 rounded-xl cursor-not-allowed">Pembayaran Ditutup</button>) : null}
          {cancelable
            ? <button onClick={cancelBooking} className="no-print w-full mt-2 bg-red-50 text-red-600 font-extrabold text-[13px] py-2.5 rounded-xl">Batalkan Booking</button>
            : <div className="no-print mt-2"><button disabled className="w-full bg-slate-100 text-slate-400 font-extrabold text-[13px] py-2.5 rounded-xl cursor-not-allowed">Batalkan Booking</button><div className="mt-1.5 text-[11.5px] font-semibold text-slate-400 text-center">{cancelBlockReason}</div></div>}
          <button onClick={() => go('tickets')} className="no-print w-full mt-2 text-[12px] font-bold text-slate-400">← Kembali ke tiket saya</button>
        </div>
      </div>
      <div className="space-y-4">
        {mt ? (
          <div className={'bg-white rounded-3xl shadow-card p-5 border-2 ' + (mtActive ? 'border-red-200' : 'border-slate-100')}>
            <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="wrench" className="w-5 h-5 text-red-600" />{mtActive ? 'Jadwal Maintenance' : 'Riwayat Maintenance'}</h3>
            <div className="mt-2 bg-red-50 border border-red-200 rounded-2xl p-3 text-[12.5px] font-semibold text-red-900">
              <div>Jadwal asal: <b>{mtOriginal.date} • {mtOriginal.time} WIB</b> — {mtRoute.from} → {mtRoute.to}</div>
              {mt.request?.reason ? <div className="mt-1">Alasan: {mt.request.reason}</div> : null}
              {mt.state !== 'replaced' && mt.state !== 'cancelled_unpaid' ? <div className="mt-1">Refund 100%: <b>{fmtRp(mt.refundAmount)}</b> (total pembayaran).</div> : null}
            </div>

            {mtActive ? (
              <>
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[12px] font-semibold text-amber-900">
                  Pilih sebelum <b>{maintenanceDeadlineLabel(mt.deadline)}</b>. Jika tidak memilih, refund 100% diproses otomatis.
                </div>
                {mtCandidates.length ? (
                  <div className="mt-3">
                    <div className="text-[12px] font-extrabold text-slate-600">Armada pengganti tersedia</div>
                    <div className="space-y-2 mt-1.5">
                      {mtCandidates.map((t) => {
                        const tv = vehicleById(t.vehicleId);
                        return (
                          <div key={t.id} className="border-2 border-green-200 bg-green-50 rounded-2xl p-3">
                            <div className="font-extrabold text-[12.5px]">{vehName(tv)} <span className="text-slate-500 font-semibold">• {tv?.plate}</span></div>
                            <div className="text-[11.5px] font-semibold text-slate-600">{t.time} WIB • {seatsLeft(t.id)} kursi tersisa • harga sama</div>
                            <button onClick={() => doMove(t.id)} className="mt-2 w-full bg-green-500 text-white font-extrabold text-[12px] py-2 rounded-xl">Pindah ke Armada Ini</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[12px] font-semibold text-slate-600">Tidak ada armada pengganti valid saat ini. Refund 100% akan diproses otomatis.</div>
                )}
                <button onClick={doMaintenanceRefund} className="mt-3 w-full bg-red-500 hover:bg-red-600 text-white font-extrabold text-[13px] py-3 rounded-2xl">Refund 100% {fmtRp(mt.refundAmount)}</button>
              </>
            ) : mt.state === 'replaced' ? (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-2xl p-3 text-[12.5px] font-semibold text-green-900">
                Sudah dipindahkan ke <b>{vehName(v)} ({v?.plate})</b> pukul <b>{s.time} WIB</b>, {fmtDate(s.date)}. Kursi baru: <b>{(b.seats || []).join(', ')}</b>. Pembayaran lama tetap berlaku.
              </div>
            ) : mt.state === 'refunded' ? (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-2xl p-3 text-[12.5px] font-semibold text-green-900">
                Refund 100% {fmtRp(b.refundAmount)} • {b.refundStatus === 'done' ? 'Selesai' : b.refundStatus === 'diproses' ? 'Sedang diproses' : 'Menunggu diproses'}.
              </div>
            ) : mt.state === 'cancelled_unpaid' ? (
              <div className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[12.5px] font-semibold text-slate-600">Booking belum dibayar dan dibatalkan karena maintenance. Tidak ada refund.</div>
            ) : null}
          </div>
        ) : null}
        <div className="bg-white rounded-3xl shadow-card p-5">
          <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="navigation" className="w-5 h-5 text-sky-600" />Status Perjalanan</h3>
          <TripTimeline st={tripStatus} />
          {delayActive ? <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[12.5px] font-semibold text-amber-900">Jadwal delay {s.delayMinutes} menit. Estimasi keberangkatan {fmtClock(s.delayUntil)}. {s.delayReason ? 'Alasan: ' + s.delayReason + '.' : ''}</div> : null}
          {tripDelayInfo ? <div className="mt-3 bg-sky-50 border border-sky-200 rounded-2xl p-3 text-[12.5px] font-semibold text-sky-900">Info keterlambatan: {tripDelayInfo.reason}{tripDelayInfo.note ? ' • ' + tripDelayInfo.note : ''} ({fmtClock(tripDelayInfo.at)}). Estimasi tiba tidak berubah.</div> : null}
          {tripStatus === 'missed' ? <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[12.5px] font-semibold text-amber-900">Jadwal ini terlewat. Admin akan menindaklanjuti refund sesuai kebijakan travel.</div> : null}
          {tripStatus === 'cancelled' ? <div className="mt-3 bg-red-50 border border-red-200 rounded-2xl p-3 text-[12.5px] font-semibold text-red-800">Perjalanan dibatalkan. Refund, bila ada, diproses sesuai kebijakan travel.</div> : null}
          {b.status === 'cancelled' && Number(b.refundAmount) > 0 ? <div className="mt-3 bg-green-50 border border-green-200 rounded-2xl p-3 text-[12.5px] font-semibold text-green-900">Refund {fmtRp(b.refundAmount)} • {b.refundStatus === 'done' ? 'Selesai' : b.refundStatus === 'diproses' ? 'Sedang diproses' : 'Menunggu diproses'}</div> : null}
          <div className="mt-3 bg-sky-50 rounded-2xl p-3 text-[12.5px] font-semibold text-sky-900">Titik jemput: <b>{pickupText}</b> — harap standby 15 menit sebelum berangkat.</div>
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
