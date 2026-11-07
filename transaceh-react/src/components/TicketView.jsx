/* === E-Tiket (modal) — dipakai pengemudi (pasca-bayar penjualan langsung +
   tombol mata di Manifest) dan agen (tombol mata di Manifest) ===
   Kartu e-tiket ini 1:1 dengan halaman e-tiket pelanggan (pages/
   TicketDetail.jsx — header gradient, kode font-mono, QR `TIKET-<kode>`,
   panel PENUMPANG + Jemput + Travel, rincian Model B/driver + Total =
   snapshot b.total, tombol Cetak/PDF & Kirim WA) supaya tiket yang
   ditunjukkan ke penumpang konsisten dengan tiket aplikasi. Bagian khusus
   pelanggan tidak dirender: tombol batalkan, panel ulasan/maintenance,
   timeline, tautan kembali — halaman e-tiket pelanggan tidak tersentuh. */
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, vehicleById, schedById, splitFare, fareModelOf, agencyById, driverById, bookedPassengers, maintenanceBookingInfo, vehName } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { FareChain, discLabelOf } from '@/components/FareChain.jsx';
import { pickupOf } from '@/lib/pickups.js';

export function TicketView({ bid }) {
  const { closeModal, toast } = useApp();
  const b = DB.load('bookings', []).find((x) => x.id === bid);
  if (!b) return <div className="p-6"><Empty icon="x" msg="Tiket tidak ditemukan" /></div>;
  const s = schedById(b.scheduleId);
  if (!s) return <div className="p-6"><Empty icon="x" msg="Jadwal tidak ditemukan" /></div>;
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const dr = driverById(s.driverId);
  const ag = agencyById(s.agencyId);
  /* Formula tarif & label — satu-satunya sumber adalah pola yang sama
     dengan halaman e-tiket (Model B + fallback booking lama). */
  const isB = fareModelOf(b) === 'B';
  const _fare = b.fare || splitFare(s, (b.seats || []).length, b.discount || 0, b.source, isB ? 'B' : 'A');
  const qB = isB ? splitFare(s, (b.seats || []).length, b.discount || 0, b.source, 'B') : null;
  const driverSrc = b.source === 'driver';
  const viaSopir = isB ? qB.viaSopir : (driverSrc ? splitFare(s, (b.seats || []).length, 0, 'driver').viaSopir : 0);
  const tiketMurni = isB ? qB.quoteTicket : (driverSrc ? Math.max(0, _fare.ticket - viaSopir) : _fare.ticket);
  const jasaAgen = isB ? Math.max(0, qB.quoteService - qB.viaSopir) : _fare.service;
  const feeRow = isB ? qB.fee : _fare.fee;
  const subtotalFare = isB ? qB.subtotal : Math.max(0, b.total - _fare.fee);
  const pax = bookedPassengers(b);
  const firstPax = pax[0] || null;
  const pickupText = (pickupOf(firstPax, b) || '-') + ((firstPax?.pickupCoords || b.pickupCoords) ? ' • ' + (firstPax?.pickupCoords || b.pickupCoords) : '');
  /* Titik jemput kini per penumpang: bila label kursi berbeda (mis. satu
     dijemput di rumah, lainnya di titik), baris "Jemput" membuka daftar per
     kursi. Booking lama selalu kasus satu titik — tampilannya tak berubah. */
  const pickupUniq = [...new Set(pax.map((p) => pickupOf(p, b) || '-'))];
  const mt = maintenanceBookingInfo(b);
  const mtActive = mt?.state === 'choice_pending';
  const qrInvalid = !!mt && mt.state !== 'replaced';
  const tripStatus = s.tripStatus && s.tripStatus !== 'scheduled' ? s.tripStatus : (b.tripStatus || 'scheduled');
  return (
    <div className="overflow-hidden anim">
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
            <div><span className="text-slate-400">Armada / Pengemudi</span><br /><b>{vehName(v)} • {v?.plate}</b><br /><b>{dr ? dr.name + ' • ' + dr.phone : 'Ditugaskan oleh travel'}</b></div>
          </div></div>
        <div className="mt-4 bg-slate-50 rounded-2xl p-3.5 text-[13px] font-semibold space-y-1">
          <div className="font-extrabold text-[12px] text-slate-400 tracking-wider">PENUMPANG</div>
          {pax.length ? pax.map((p) => (<div key={p.seat} className="flex justify-between border-t border-slate-200 pt-1.5"><span>{p.name} <span className="text-slate-400">({p.phone})</span></span><span className="badge bg-sky-600 text-white">{p.seat}</span></div>)) : <div className="border-t border-slate-200 pt-1.5 text-slate-400">Data penumpang tidak tersedia</div>}
          {pickupUniq.length > 1 ? (
            /* Beragam: daftar jemput per kursi — koordinat disembunyikan agar
               rapi (label rumah sudah memuat alamatnya). */
            <div className="border-t pt-1.5">
              <div>Jemput</div>
              <div className="mt-1 space-y-0.5 pl-3">
                {pax.map((p) => (<div key={p.seat} className="text-[12.5px]"><b>Kursi {p.seat}</b><span className="text-slate-400"> — </span>{pickupOf(p, b) || '-'}</div>))}
              </div>
            </div>
          ) : (
            <div className="flex justify-between border-t pt-1.5"><span>Jemput</span><b>{pickupText}</b></div>
          )}
          <div className="flex justify-between"><span>Travel</span><b>{ag.name} • {ag.phone}</b></div>
          {isB ? (
            <div className="mt-2 pt-1"><FareChain s={s} fare={qB} n={(b.seats || []).length} discLabel={discLabelOf(b.voucher || b.voucherCode)} showTotal={false} /></div>
          ) : driverSrc ? <>
            <div className="flex justify-between"><span>Tiket (sopir)</span><span>{fmtRp(tiketMurni)}</span></div>
            {jasaAgen > 0 || viaSopir > 0 ? <>
              <div className="flex justify-between"><span>Jasa agen</span><span>{fmtRp(jasaAgen)}</span></div>
              <div className="flex justify-between pl-3 text-[12.5px] text-slate-400"><span>&#8627; Via sopir</span><span>{fmtRp(viaSopir)}</span></div>
            </> : null}
            <div className="flex justify-between border-t border-slate-200 pt-1"><span>Subtotal ({(b.seats || []).length} kursi)</span><span>{fmtRp(subtotalFare)}</span></div>
            <div className="flex justify-between"><span>Fee platform</span><span>{fmtRp(feeRow)}</span></div>
          </> : <>
            <div className="flex justify-between"><span>Tiket x{(b.seats || []).length}</span><span>{fmtRp(tiketMurni)}</span></div>
            <div className="flex justify-between"><span>Jasa agen</span><span>{fmtRp(jasaAgen)}</span></div>
            <div className="flex justify-between"><span className="font-extrabold">Subtotal ({(b.seats || []).length} kursi)</span><span>{fmtRp(subtotalFare)}</span></div>
            <div className="flex justify-between"><span>Fee platform</span><span>{fmtRp(feeRow)}</span></div>
          </>}
          <div className="flex justify-between font-extrabold text-[15px]"><span>Total</span><span>{fmtRp(b.total)}</span></div>
        </div>
        <div className="flex gap-2 mt-4 no-print">
          <button onClick={() => window.print()} className="flex-1 bg-slate-100 font-extrabold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-2"><Icon name="printer" className="w-4 h-4" />Cetak / PDF</button>
          <button onClick={() => toast('Tiket dikirim via WhatsApp ke ' + (firstPax?.phone || 'penumpang'), 'ok')} className="flex-1 bg-green-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-2"><Icon name="message-circle" className="w-4 h-4" />Kirim WA</button>
        </div>
        <button onClick={closeModal} className="no-print w-full mt-2 bg-slate-100 text-slate-600 font-extrabold text-[13px] py-2.5 rounded-xl">Tutup</button>
      </div>
    </div>
  );
}
