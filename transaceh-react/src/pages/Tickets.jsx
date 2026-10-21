import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, vehicleById, vehName, canCancelBooking, canPayBooking } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { PaymentModal } from './Search.jsx';

export function ticketCardData(b) {
  const s = schedById(b.scheduleId);
  if (!s) return null;
  const ms = b.status === 'pending' ? new Date(b.holdExpiry).getTime() - Date.now() : 0;
  return { s, ms };
}

export default function Tickets() {
  const { user, go, toast, refresh, tick, openModal } = useApp();
  void tick;

  const repay = (bid) => {
    const b = DB.load('bookings', []).find((x) => x.id === bid);
    if (!b) return;
    if (!canPayBooking(b, schedById(b.scheduleId))) {
      toast('Pembayaran ditutup — jadwal sudah berjalan/dibatalkan atau hold kedaluwarsa.', 'err');
      refresh();
      return;
    }
    const nb = { ...b, holdExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
    DB.save('bookings', DB.load('bookings', []).map((x) => (x.id === bid ? nb : x)));
    refresh();
    openModal(<PaymentModal booking={nb} />);
  };

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
          return (
            <div key={b.id} className="border-2 border-slate-100 rounded-3xl overflow-hidden card-hover">
              <div className="bg-gradient-to-r from-[#0b2447] to-sky-700 text-white p-4 flex items-center justify-between">
                <div><div className="font-mono font-extrabold tracking-wider text-[15px]">{b.code}</div><div className="text-[12px] opacity-80 font-semibold">{r.from} → {r.to} • {fmtDate(d.s.date)} {d.s.time}</div></div><div className="flex items-center gap-1.5"><BadgeStatus st={b.status} />{d.s.tripStatus === 'scheduled' && d.s.delayUntil && new Date(d.s.delayUntil).getTime() > Date.now() ? <span className="badge bg-amber-100 text-amber-700">Delay {d.s.delayMinutes}m</span> : null}{b.tripStatus === 'missed' && b.status !== 'cancelled' ? <BadgeStatus st="missed" /> : null}</div>
              </div>
              <div className="p-4"><div className="flex items-center gap-2 text-[13px] font-bold"><Icon name="armchair" className="w-4 h-4 text-sky-600" />Kursi {b.seats.join(', ')} • {vehName(v)}</div>
                <div className="text-[12px] text-slate-500 font-medium mt-1">{(b.passengers || []).map((p) => p.name).join(', ')}</div>
                <div className="flex items-center justify-between mt-2"><span className="font-extrabold text-[15px]">{fmtRp(b.total)}</span>
                  {b.status === 'pending' ? <span className="text-[11px] font-extrabold text-amber-700">Hold: {d.ms > 0 ? Math.floor(d.ms / 60000) + ' mnt' : 'habis'}</span> : null}</div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => go('ticket-detail:' + b.id)} className="flex-1 bg-[#0b2447] text-white text-[12.5px] font-extrabold py-2.5 rounded-xl">Detail / E-Tiket</button>
                  {b.status === 'pending' ? (canPayBooking(b, d.s)
                    ? <button onClick={() => repay(b.id)} className="flex-1 bg-green-500 text-white text-[12.5px] font-extrabold py-2.5 rounded-xl">Bayar</button>
                    : <button disabled className="flex-1 bg-slate-100 text-slate-400 text-[12.5px] font-extrabold py-2.5 rounded-xl cursor-not-allowed">Pembayaran ditutup</button>) : null}
                  {canCancelBooking(b, d.s) ? <button onClick={() => cancelBooking(b.id)} className="px-3.5 bg-red-50 text-red-600 rounded-xl" title="Batalkan"><Icon name="trash-2" className="w-4 h-4" /></button> : null}
                </div></div></div>
          );
        })}</div>
      )}
    </div>
  );
}
