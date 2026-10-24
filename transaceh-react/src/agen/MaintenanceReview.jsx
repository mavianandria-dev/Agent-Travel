import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import {
  maintenanceRequestById, maintenanceRequestImpact, maintenanceRequestStatusLabel,
  maintenancePeriodLabel, maintenanceDateLabel, decideMaintenanceRequest,
} from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

export default function MaintenanceReview({ id }) {
  const { closeModal, toast, refresh, user } = useApp();
  const [note, setNote] = useState('');
  const req = maintenanceRequestById(id);
  if (!req) return <div className="p-6 font-bold text-slate-500">Pengajuan tidak ditemukan</div>;
  const impact = maintenanceRequestImpact(req) || {};
  const summary = req.summary || impact;
  const paidRows = Array.isArray(impact.paidBookings) ? impact.paidBookings : [];
  const pendingRows = Array.isArray(impact.pendingBookings) ? impact.pendingBookings : [];
  const countOf = (v) => (Array.isArray(v) ? v.length : (Number.isFinite(Number(v)) ? Number(v) : 0));
  const stats = {
    schedules: countOf(summary.schedules ?? impact.schedules),
    paid: countOf(summary.paidBookings ?? summary.paid ?? impact.paidBookings),
    pending: countOf(summary.pendingBookings ?? summary.pending ?? impact.pendingBookings),
    replacement: countOf(summary.replacementOffers ?? summary.replacementCount ?? impact.replacementCount),
  };
  const canDecide = req.status === 'menunggu' && (!user || user.role !== 'agen' || user.agencyId === req.agencyId);

  const decide = (approve) => {
    if (!approve && note.trim().length < 5) {
      toast('Tulis alasan penolakan minimal 5 karakter', 'err');
      return;
    }
    const res = decideMaintenanceRequest(req.id, approve, {
      note,
      by: user?.name || user?.email || 'agen',
    });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast(approve
      ? 'Maintenance disetujui • ' + (res.affected || 0) + ' jadwal ditandai'
      : 'Pengajuan maintenance ditolak', approve ? 'ok' : 'info');
  };

  return (
    <div className="p-6 max-h-[88vh] overflow-y-auto">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Icon name="wrench" className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-[17px]">Review Maintenance</h3>
          <div className="text-[12.5px] font-semibold text-slate-500">{req.vehicleName} • {req.vehiclePlate} • {maintenancePeriodLabel(req)}</div>
        </div>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>

      <div className="mt-3 grid sm:grid-cols-3 gap-2">
        <div className="bg-slate-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase">Pengemudi</div><div className="font-extrabold text-[13px]">{req.driverName || '-'}</div><div className="text-[11px] font-semibold text-slate-500">Diajukan {req.requestedAt ? new Date(req.requestedAt).toLocaleString('id-ID') : '-'}</div></div>
        <div className="bg-slate-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase">Periode</div><div className="font-extrabold text-[13px]">{maintenanceDateLabel(req.from)} – {maintenanceDateLabel(req.until)}</div><div className="text-[11px] font-semibold text-slate-500">Tanggal lain tetap normal</div></div>
        <div className="bg-slate-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase">Status</div><div className="font-extrabold text-[13px]">{maintenanceRequestStatusLabel(req.status)}</div><div className="text-[11px] font-semibold text-slate-500">{req.decidedAt ? 'Diputuskan ' + new Date(req.decidedAt).toLocaleString('id-ID') : 'Menunggu keputusan agen'}</div></div>
      </div>

      <div className="mt-3 bg-amber-50 border-2 border-amber-200 rounded-2xl p-3.5">
        <div className="text-[10px] font-extrabold text-amber-700 uppercase">Alasan pengemudi</div>
        <div className="text-[13px] font-semibold text-amber-950 mt-0.5">{req.reason}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="border-2 border-slate-100 rounded-2xl p-3"><div className="font-extrabold text-[20px]">{stats.schedules}</div><div className="text-[10.5px] font-bold text-slate-500">Jadwal terkena</div></div>
        <div className="border-2 border-slate-100 rounded-2xl p-3"><div className="font-extrabold text-[20px]">{stats.paid}</div><div className="text-[10.5px] font-bold text-slate-500">Booking lunas</div></div>
        <div className="border-2 border-slate-100 rounded-2xl p-3"><div className="font-extrabold text-[20px]">{stats.pending}</div><div className="text-[10.5px] font-bold text-slate-500">Belum bayar</div></div>
        <div className="border-2 border-slate-100 rounded-2xl p-3"><div className="font-extrabold text-[20px]">{stats.replacement}</div><div className="text-[10.5px] font-bold text-slate-500">Ada pengganti</div></div>
      </div>

      <div className="mt-3 rounded-2xl border-2 border-sky-100 bg-sky-50/70 p-3.5 text-[12px] font-semibold text-sky-900">
        <div className="flex items-center gap-1.5 font-extrabold"><Icon name="shield-check" className="w-4 h-4" />Kebijakan saat disetujui</div>
        <div className="mt-1.5 space-y-1">
          <div>• Booking <b>belum dibayar</b> dibatalkan tanpa refund.</div>
          <div>• Booking <b>lunas</b> mendapat refund 100% atau pilihan pindah armada bila armada pengganti valid tersedia.</div>
          <div>• Tanpa armada pengganti, refund 100% diproses otomatis. Perjalanan yang sedang berjalan tidak dihentikan.</div>
          <div>• Estimasi refund: <b>{fmtRp(summary.refundTotal ?? impact.refundTotal ?? 0)}</b></div>
        </div>
      </div>

      {(impact.schedules || []).length ? (
        <div className="mt-4">
          <div className="font-extrabold text-[13px]">Jadwal pada periode</div>
          <div className="mt-1.5 border-2 border-slate-100 rounded-2xl overflow-hidden">
            <table className="data w-full"><thead><tr><th>Tanggal</th><th>Jam</th><th>Lunas</th><th>Pending</th></tr></thead><tbody>
              {impact.schedules.map((s) => {
                const paid = paidRows.filter((b) => b.scheduleId === s.id).length;
                const pending = pendingRows.filter((b) => b.scheduleId === s.id).length;
                return <tr key={s.id}><td className="font-semibold">{maintenanceDateLabel(s.date)}</td><td>{s.time}</td><td>{paid}</td><td>{pending}</td></tr>;
              })}
            </tbody></table>
          </div>
        </div>
      ) : <div className="mt-3 text-[12.5px] font-semibold text-slate-400">Tidak ada jadwal aktif pada periode ini. Approval tetap menandai periode maintenance.</div>}

      {req.status === 'menunggu' ? (
        <>
          <label className="block mt-4">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Catatan agen (wajib untuk penolakan)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: bengkel penuh, ajukan tanggal lain" className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-2xl px-3 py-2.5 focus-ring" />
          </label>
          <div className="flex gap-2 mt-4">
            <button onClick={() => decide(false)} disabled={!canDecide} className="flex-1 bg-red-50 text-red-600 font-extrabold text-[13px] py-3 rounded-2xl disabled:opacity-40">Tolak</button>
            <button onClick={() => decide(true)} disabled={!canDecide} className="flex-[2] bg-green-500 hover:bg-green-600 text-white font-extrabold text-[13px] py-3 rounded-2xl disabled:opacity-40">Setujui Maintenance</button>
          </div>
        </>
      ) : (
        <div className="mt-4 bg-slate-50 rounded-2xl p-3 text-[12.5px] font-semibold text-slate-600">
          {req.decisionNote ? 'Catatan keputusan: ' + req.decisionNote : 'Pengajuan sudah diputuskan.'}
          {summary.refunded != null ? <div className="mt-1">Refund otomatis: {summary.refunded} booking • Pilihan pelanggan: {summary.choices || 0} booking.</div> : null}
        </div>
      )}
    </div>
  );
}
