import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, vehicleById, vehName, canCancelBooking, bookedPassengers, maintenanceBookingInfo, maintenanceDeadlineLabel } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty, BadgeStatus, fmtDate } from '@/components/ui.jsx';

export function ticketCardData(b) {
  const s = schedById(b.scheduleId);
  if (!s) return null;
  const ms = b.status === 'pending' && b.holdExpiry ? new Date(b.holdExpiry).getTime() - Date.now() : 0;
  return { s, ms };
}

export default function Tickets() {
  const { user, go, toast, tick } = useApp();
  void tick;

  const cancelBooking = (bid) => {
    go('ticket-detail:' + bid);
    toast('Lanjutkan pembatalan dari halaman detail tiket', 'info');
  };

  if (!user) {
    return (
      <div className="anim bg-white rounded-3xl shadow-card p-5">
        <Empty icon="ticket" msg="Login untuk melihat tiket" />
        <button onClick={() => go('login')} className="mt-3 bg-[#0b2447] text-white text-[13px] font-extrabold px-6 py-2.5 rounded-xl">Masuk</button>
      </div>
    );
  }

  const list = DB.load('bookings', []).filter((b) => b.userEmail === user.email).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = list.filter((b) => ['pending', 'paid'].includes(b.status));

  return (
    <div className="anim bg-white rounded-3xl shadow-card p-5">
      <h2 className="font-extrabold text-[18px] flex items-center gap-2"><Icon name="ticket" className="w-5 h-5 text-sky-600" />Tiket Saya <span className="badge bg-sky-100 text-sky-700">{active.length} aktif</span></h2>
      {!list.length ? (
        <div className="text-center">
          <Empty icon="ticket" msg="Belum ada tiket" />
          <button onClick={() => go('search')} className="mt-3 bg-[#0b2447] text-white text-[13px] font-extrabold px-6 py-2.5 rounded-xl">Cari Travel</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 mt-4">{list.map((b) => {
          const d = ticketCardData(b);
          if (!d) return null;
          const r = routeById(d.s.routeId);
          const v = vehicleById(d.s.vehicleId);
          const mt = maintenanceBookingInfo(b);
          return (
            <div key={b.id} className="border-2 border-slate-100 rounded-3xl overflow-hidden card-hover">
              <div className="bg-gradient-to-r from-[#0b2447] to-sky-700 text-white p-4 flex items-center justify-between">
                <div><div className="font-mono font-extrabold tracking-wider text-[15px]">{b.code}</div><div className="text-[12px] opacity-80 font-semibold">{r.from} → {r.to} • {fmtDate(d.s.date)} {d.s.time}</div></div><div className="flex items-center gap-1.5"><BadgeStatus st={b.status} />{mt?.state === 'choice_pending' ? <span className="badge bg-red-100 text-red-700 italic">MAINTENANCE</span> : mt?.state === 'replaced' ? <span className="badge bg-green-100 text-green-700">Pindah armada</span> : mt?.state === 'cancelled_unpaid' ? <span className="badge bg-slate-200 text-slate-600">Maintenance</span> : null}{d.s.tripStatus === 'scheduled' && d.s.delayUntil && new Date(d.s.delayUntil).getTime() > Date.now() ? <span className="badge bg-amber-100 text-amber-700">Delay {d.s.delayMinutes}m</span> : null}{b.tripStatus === 'missed' && b.status !== 'cancelled' ? <BadgeStatus st="missed" /> : null}</div>
              </div>
              <div className="p-4"><div className="flex items-center gap-2 text-[13px] font-bold"><Icon name="armchair" className="w-4 h-4 text-sky-600" />Kursi {b.seats.join(', ')} • {vehName(v)}</div>
                <div className="text-[12px] text-slate-500 font-medium mt-1">{bookedPassengers(b).map((p) => p.name).join(', ') || '-'}</div>
                {mt?.state === 'choice_pending' ? <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold text-red-800">Jadwal maintenance. Refund 100% {fmtRp(mt.refundAmount)} atau pindah armada sebelum {maintenanceDeadlineLabel(mt.deadline)}.</div> : null}
                {mt?.state === 'refunded' ? <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold text-green-800">Refund 100% {fmtRp(b.refundAmount)} • {b.refundStatus === 'done' ? 'Selesai' : 'Sedang diproses'}.</div> : null}
                {mt?.state === 'cancelled_unpaid' ? <div className="mt-2 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600">Dibatalkan karena maintenance armada. Booking belum dibayar, tidak ada refund.</div> : null}
                {mt?.state === 'replaced' ? <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold text-green-800">Dipindahkan dari {fmtDate(mt.originalSchedule.date)} {mt.originalSchedule.time} ke {fmtDate(d.s.date)} {d.s.time} • kursi {b.seats.join(', ')}.</div> : null}
                <div className="flex items-center justify-between mt-2"><span className="font-extrabold text-[15px]">{fmtRp(b.total)}</span>
                  {b.status === 'pending' ? <span className="text-[11px] font-extrabold text-amber-700">Menunggu pembayaran — dibatalkan otomatis {d.ms > 0 ? 'dalam ' + Math.floor(d.ms / 60000) + ' mnt' : 'sekarang'}</span> : null}</div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => go('ticket-detail:' + b.id)} className="flex-1 bg-[#0b2447] text-white text-[12.5px] font-extrabold py-2.5 rounded-xl">{mt?.state === 'choice_pending' ? (mt.candidates?.length ? 'Pilih Refund / Pindah' : 'Lihat Refund') : 'Detail / E-Tiket'}</button>
                  {canCancelBooking(b, d.s) ? <button onClick={() => cancelBooking(b.id)} className="px-3.5 bg-red-50 text-red-600 rounded-xl" title="Batalkan"><Icon name="trash-2" className="w-4 h-4" /></button> : null}
                </div></div></div>
          );
        })}</div>
      )}
    </div>
  );
}
