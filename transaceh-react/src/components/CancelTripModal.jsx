import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { schedById, routeById, cancelScheduleByOperator, splitFare } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, fmtDate } from '@/components/ui.jsx';

const REASONS = ['Armada rusak', 'Pengemudi berhalangan', 'Cuaca / force majeure'];

export default function CancelTripModal({ sid, by = 'pengemudi' }) {
  const { closeModal, toast, refresh } = useApp();
  const [reason, setReason] = useState('');
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const bookings = DB.load('bookings', []).filter((b) => b.scheduleId === sid);
  const paid = bookings.filter((b) => b.status === 'paid');
  const pending = bookings.filter((b) => b.status === 'pending');
  const total = paid.reduce((a, b) => a + (Number(b.total) || Number((b.fare || splitFare(s, (b.seats || []).length, b.discount || 0)).total) || 0), 0);

  const submit = () => {
    const res = cancelScheduleByOperator(sid, reason, by);
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast((res.count || 0) + ' booking dibatalkan • refund 100% ' + fmtRp(res.total || 0));
  };

  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="calendar-x" className="w-5 h-5 text-red-500" />Batalkan Jadwal?</h3>
      <div className="text-[12.5px] font-semibold text-slate-500 mt-1">{r ? r.from + ' → ' + r.to : '-'} • {fmtDate(s.date)} {s.time} WIB</div>

      <div className="mt-3 bg-red-50 border border-red-100 rounded-2xl p-3 text-[12.5px] font-semibold text-red-800">
        Pembatalan sepihak sebelum berangkat mewajibkan refund <b>100% total pembayaran</b> ke seluruh penumpang lunas. Jasa agen &amp; fee platform ikut dikembalikan.
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-[12px] font-semibold">
        <div className="bg-slate-50 rounded-xl px-3 py-2">Booking lunas<br /><b className="text-[14px]">{paid.length} • {fmtRp(total)}</b></div>
        <div className="bg-slate-50 rounded-xl px-3 py-2">Belum dibayar<br /><b className="text-[14px]">{pending.length} booking</b></div>
      </div>

      <div className="text-[11px] font-extrabold text-slate-500 mt-3">ALASAN PEMBATALAN (WAJIB)</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {REASONS.map((x) => <button key={x} onClick={() => setReason(x)} className={'text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg ' + (reason === x ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500')}>{x}</button>)}
      </div>
      <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tulis alasan yang bisa dipertanggungjawabkan..." className="w-full mt-2 text-[13px] bg-slate-50 border border-slate-200 rounded-xl p-3 focus-ring"></textarea>

      <div className="flex gap-2 mt-4">
        <button onClick={closeModal} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={submit} disabled={!reason.trim()} className="flex-1 bg-red-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl disabled:opacity-40">Batalkan &amp; Refund 100%</button>
      </div>
    </div>
  );
}
