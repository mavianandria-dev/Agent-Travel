import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import {
  driverForUser, driverForVehicle, backupDriverForVehicle, sameDriver,
  vehName, maintenanceImpact, maintenanceRequestsForDriver, maintenanceRequestStatusLabel,
  maintenancePeriodLabel, maintenanceDateLabel, createMaintenanceRequest, cancelMaintenanceRequest, MAINTENANCE_MAX_DAYS,
} from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';

const STATUS_CLS = {
  menunggu: 'bg-amber-100 text-amber-800',
  disetujui: 'bg-green-100 text-green-700',
  ditolak: 'bg-red-100 text-red-700',
  dibatalkan: 'bg-slate-100 text-slate-500',
  selesai: 'bg-sky-100 text-sky-700',
};

function addDays(key, days) {
  const d = new Date(String(key) + 'T00:00:00');
  if (!Number.isFinite(d.getTime())) return key;
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export default function Maintenance() {
  const { user, toast, refresh, tick } = useApp();
  void tick;
  const me = driverForUser(user);
  const vehicles = me ? DB.load('vehicles', []).filter((v) => {
    if (v.agencyId !== me.agencyId) return false;
    const main = driverForVehicle(v);
    const back = backupDriverForVehicle(v);
    return sameDriver(me, main) || sameDriver(me, back);
  }) : [];
  const [vehicleId, setVehicleId] = useState('');
  const [from, setFrom] = useState(() => todayStr(1));
  const [until, setUntil] = useState(() => todayStr(MAINTENANCE_MAX_DAYS));
  const [reason, setReason] = useState('');

  if (!user || !me) {
    return <div className="anim bg-white rounded-3xl shadow-card p-5"><Empty icon="wrench" msg="Data pengemudi tidak ditemukan" /></div>;
  }

  const maxUntil = addDays(from, MAINTENANCE_MAX_DAYS - 1);
  const impact = vehicleId && from && until && from <= until ? maintenanceImpact({ vehicleId, from, until }) : null;
  const requests = maintenanceRequestsForDriver(me.id, vehicles.map((v) => v.id));

  const changeFrom = (value) => {
    const nextMax = addDays(value, MAINTENANCE_MAX_DAYS - 1);
    setFrom(value);
    if (!until || until < value) setUntil(nextMax);
    else if (until > nextMax) setUntil(nextMax);
  };

  const submit = () => {
    const res = createMaintenanceRequest({ vehicleId, from, until, reason });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    toast('Pengajuan maintenance dikirim ke agen', 'ok');
    setReason('');
    refresh();
  };

  const cancelRequest = (r) => {
    if (!window.confirm('Batalkan pengajuan maintenance ' + maintenancePeriodLabel(r) + '?')) return;
    const res = cancelMaintenanceRequest(r.id, { reason: 'Dibatalkan pengemudi' });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    toast('Pengajuan maintenance dibatalkan', 'ok');
    refresh();
  };

  return (
    <div className="anim space-y-4">
      <div className="bg-gradient-to-r from-[#0b2447] to-sky-700 text-white rounded-3xl p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><Icon name="wrench" className="w-6 h-6" /></div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-[18px]">Maintenance Armada</h2>
            <p className="text-[12.5px] font-medium opacity-80 mt-0.5">Ajukan tanggal armada berhenti operasional. Agen memeriksa dampak jadwal dan booking sebelum menyetujui.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="calendar-x" className="w-5 h-5 text-sky-600" />Ajukan Maintenance</h3>
        {!vehicles.length ? (
          <div className="mt-3 bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 text-[12.5px] font-semibold text-amber-900">
            Belum ada armada dengan pengemudi utama/pengganti yang tertaut ke akun Anda. Hubungi agen untuk melengkapi data armada.
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Armada</span>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring bg-white">
                  <option value="">— Pilih armada —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{vehName(v)} • {v.plate}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Mulai</span>
                  <input type="date" min={todayStr(0)} value={from} max={addDays(todayStr(0), 60)} onChange={(e) => changeFrom(e.target.value)} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Selesai</span>
                  <input type="date" min={from || todayStr(0)} max={maxUntil} value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
                </label>
              </div>
            </div>
            <label className="block mt-3">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Alasan maintenance</span>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: ganti kampas rem dan servis rutin di bengkel resmi" className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-2xl px-3 py-2.5 focus-ring" />
            </label>
            <div className="text-[11px] font-semibold text-slate-400 mt-1">Maksimal {MAINTENANCE_MAX_DAYS} hari per pengajuan. Pengajuan tidak langsung mengubah status armada sebelum disetujui agen.</div>

            {impact ? (
              <div className="mt-4 rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-3.5">
                <div className="font-extrabold text-[12.5px] text-sky-900 flex items-center gap-1.5"><Icon name="triangle-alert" className="w-4 h-4" />Dampak bila disetujui</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-center">
                  <div className="bg-white rounded-xl p-2"><div className="font-extrabold text-[17px]">{impact.schedules.length}</div><div className="text-[10.5px] font-bold text-slate-500">Jadwal</div></div>
                  <div className="bg-white rounded-xl p-2"><div className="font-extrabold text-[17px]">{impact.paid}</div><div className="text-[10.5px] font-bold text-slate-500">Booking lunas</div></div>
                  <div className="bg-white rounded-xl p-2"><div className="font-extrabold text-[17px]">{impact.pending}</div><div className="text-[10.5px] font-bold text-slate-500">Belum bayar</div></div>
                  <div className="bg-white rounded-xl p-2"><div className="font-extrabold text-[17px]">{impact.replacementCount}</div><div className="text-[10.5px] font-bold text-slate-500">Ada pengganti</div></div>
                </div>
                <div className="text-[11.5px] font-semibold text-sky-800 mt-2">Estimasi refund 100%: <b>{fmtRp(impact.refundTotal)}</b> • Booking belum bayar dibatalkan tanpa refund.</div>
                {impact.schedules.length ? (
                  <div className="mt-2 space-y-1">
                    {impact.schedules.slice(0, 4).map((s) => (
                      <div key={s.id} className="text-[11.5px] font-semibold text-slate-600 flex justify-between gap-2"><span>{maintenanceDateLabel(s.date)} • {s.time} WIB</span><span>{fmtRp(s.price)}</span></div>
                    ))}
                    {impact.schedules.length > 4 ? <div className="text-[11px] font-semibold text-slate-400">+{impact.schedules.length - 4} jadwal lain</div> : null}
                  </div>
                ) : <div className="text-[11.5px] font-semibold text-slate-500 mt-1">Tidak ada jadwal aktif pada periode ini.</div>}
              </div>
            ) : null}

            <button onClick={submit} disabled={!vehicleId || !reason.trim()} className="mt-4 w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-[14px] py-3 rounded-2xl transition">Kirim Pengajuan Maintenance</button>
          </>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="history" className="w-5 h-5 text-sky-600" />Riwayat Pengajuan</h3>
        {!requests.length ? <Empty icon="clipboard-list" msg="Belum ada pengajuan maintenance" /> : (
          <div className="space-y-2.5 mt-3">
            {requests.map((r) => (
              <div key={r.id} className="border-2 border-slate-100 rounded-2xl p-3.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-extrabold text-[13px]">{r.vehicleName || 'Armada'} <span className="text-slate-400 font-semibold">• {r.vehiclePlate}</span></div>
                    <div className="text-[12px] font-semibold text-slate-500">{maintenancePeriodLabel(r)} • diajukan {r.requestedAt ? new Date(r.requestedAt).toLocaleDateString('id-ID') : '-'}</div>
                  </div>
                  <span className={'badge ' + (STATUS_CLS[r.status] || 'bg-slate-100 text-slate-500')}>{maintenanceRequestStatusLabel(r.status)}</span>
                  {r.status === 'menunggu' ? <button onClick={() => cancelRequest(r)} className="text-[11.5px] font-extrabold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">Batalkan</button> : null}
                </div>
                <div className="text-[12px] font-medium text-slate-600 mt-2">Alasan: {r.reason}</div>
                {r.decisionNote ? <div className="text-[11.5px] font-semibold text-slate-500 mt-1">Catatan: {r.decisionNote}</div> : null}
                {r.summary ? (
                  <div className="text-[11.5px] font-semibold text-sky-800 bg-sky-50 rounded-xl px-2.5 py-1.5 mt-2">
                    {r.summary.schedules} jadwal • {r.summary.paidBookings} booking lunas • {r.summary.refunded} refund otomatis • {r.summary.choices} pilihan pelanggan
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
