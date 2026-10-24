import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import {
  agencyOf, vehicleById, vehName, driverById, vehLayout,
  maintenanceRequestsForAgency, maintenanceRequestsForVehicle, maintenanceRequestStatusLabel,
  maintenancePeriodLabel, vehicleMaintenanceLabel,
} from '@/lib/domain.js';
import { Icon, DocRow, DocPreview, CabinGrid } from '@/components/ui.jsx';
import MaintenanceReview from './MaintenanceReview.jsx';

export function VehDetail({ id }) {
  const { closeModal, openModal, setVehEdit, go } = useApp();
  const v = vehicleById(id);
  if (!v) return <div className="p-6 font-bold text-slate-500">Data tidak ditemukan</div>;
  const row = (l, val) => <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-[13px]"><span className="text-slate-500 font-semibold shrink-0">{l}</span><b className="text-right">{val || '-'}</b></div>;
  const coopD = v.coopDriverId ? driverById(v.coopDriverId) : null;
  const maintenances = maintenanceRequestsForVehicle(v.id).filter((r) => ['menunggu', 'disetujui'].includes(r.status));
  const viewDoc = (kind) => {
    const title = kind === 'STNK' ? 'STNK' : 'KTP PEMILIK';
    const src = kind === 'STNK' ? v.stnkPhoto : v.ktpOwnerPhoto;
    openModal(<DocPreview title={title} src={src} onBack={() => openModal(<VehDetail id={v.id} />)} />);
  };
  return (
    <div className="p-6 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center gap-3">
        <img src={v.photo} onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/' + v.id + '/400/250'; }} className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-200 shrink-0" alt={vehName(v)} />
        <div className="flex-1 min-w-0"><div className="font-extrabold text-[16px]">{vehName(v)}</div><div className="text-[12px] text-slate-500 font-medium">{v.plate} • {v.year || ''} • {v.vtype || ''}</div></div>
        <button onClick={() => closeModal()} className="text-slate-400 shrink-0"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="flex gap-1.5 mt-2.5 flex-wrap"><span className={`badge ${v.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{v.status || 'aktif'}</span><span className="badge bg-sky-100 text-sky-700">{v.capacity ?? 6} kursi</span>{v.driverConflict ? <span className="badge bg-red-100 text-red-700">bentrok pengemudi</span> : null}{vehicleMaintenanceLabel(v) && v.status !== 'maintenance' ? <span className="badge bg-amber-100 text-amber-800">Maintenance {vehicleMaintenanceLabel(v)}</span> : null}{(v.facilities || []).map((f) => <span key={f} className="badge bg-slate-100 text-slate-500">{f}</span>)}</div>
      {maintenances.length ? (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
          <div className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wide">Jadwal maintenance</div>
          {maintenances.map((r) => (
            <div key={r.id} className="text-[11.5px] font-semibold text-amber-900 mt-0.5">{maintenancePeriodLabel(r)} • {maintenanceRequestStatusLabel(r.status)}</div>
          ))}
        </div>
      ) : null}
      <h4 className="font-extrabold text-[13px] mt-4 mb-1">A. PEMILIK / MITRA</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Status', v.ownership)}{v.ownership === 'Milik Pengemudi' ? row('Pengemudi pemilik', (coopD || {}).name || '-') : row('Nama pemilik', (v.ownerName || '') + (v.ownerBiz ? ' (' + v.ownerBiz + ')' : ''))}{row('NIK', v.ownerNik)}{row('HP / WHATSAPP', v.ownerPhone)}{row('Alamat', v.ownerAddr)}{row('Email', v.ownerEmail)}</div>
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">B. KENDARAAN</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Merek / tipe', vehName(v))}{row('Tahun / warna', (v.year || '') + (v.color ? ' • ' + v.color : ''))}{row('Plat', v.plate)}{row('Jenis', v.vtype)}{row('Masa STNK', v.stnkExp)}</div>
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">C. DOKUMEN</h4>
      <div className="space-y-2"><DocRow title="STNK" src={v.stnkPhoto} onView={() => viewDoc('STNK')} /><DocRow title="KTP PEMILIK" src={v.ktpOwnerPhoto} onView={() => viewDoc('KTP PEMILIK')} /></div>
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">D. OPERASIONAL</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Layanan', (v.services || []).join(', '))}</div>
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">E. PENGEMUDI</h4><div className="bg-slate-50 rounded-2xl px-3.5 py-1">
        {row('Nama', v.drvName)}{row('HP / WHATSAPP', v.drvPhone)}{row('SIM', v.drvSim)}{row('Masa SIM', v.drvSimExp)}{row('Pengganti', (v.hasBackup === 'Ya' ? ((v.backName || '-') + (v.backPhone ? ' • ' + v.backPhone : '')) : 'Tidak'))}</div>
      {v.driverConflict ? <div className="text-[11.5px] font-bold text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2 mt-2">Pengemudi armada ini juga terpasang di armada lain. Buka Edit untuk memilih pengemudi pengganti.</div> : null}
      <h4 className="font-extrabold text-[13px] mt-3 mb-1">F. BANGKU</h4>
      <CabinGrid layout={vehLayout(v)} plate={v.plate} vehName={vehName(v)} />
      <div className="grid grid-cols-2 gap-2.5 mt-4"><button onClick={() => closeModal()} className="bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Tutup</button><button onClick={() => { closeModal(); setVehEdit({ agId: v.agencyId, vid: v.id }); go('agen-vehform'); }} className="bg-sky-600 text-white font-extrabold text-[13px] py-3 rounded-2xl">Edit</button></div></div>
  );
}

export default function Fleet({ ag }) {
  const { user, openModal, setVehEdit, go, refresh, tick } = useApp();
  void tick;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const vs = DB.load('vehicles', []).filter((v) => v.agencyId === agency.id);
  const maintenanceRequests = maintenanceRequestsForAgency(agency.id);
  const pendingMaintenance = maintenanceRequests.filter((r) => r.status === 'menunggu');
  const delVeh = (vid) => {
    if (!window.confirm('Hapus armada?')) return;
    DB.save('vehicles', DB.load('vehicles', []).filter((v) => v.id !== vid)); refresh();
    refresh();
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-5"><div className="flex items-center"><h3 className="font-extrabold text-[16px]">Data Armada ({vs.length})</h3><div className="flex-1"></div>
      <button onClick={() => { setVehEdit({ agId: agency.id }); go('agen-vehform'); }} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Tambah Armada</button></div>

      {pendingMaintenance.length ? (
        <div className="mt-3 border-2 border-amber-200 bg-amber-50 rounded-2xl p-3.5">
          <div className="flex items-center gap-2"><Icon name="wrench" className="w-4 h-4 text-amber-700" /><span className="font-extrabold text-[13px] text-amber-900">Pengajuan Maintenance ({pendingMaintenance.length})</span></div>
          <div className="space-y-2 mt-2">
            {pendingMaintenance.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-amber-100 p-3 flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[190px]">
                  <div className="font-extrabold text-[12.5px]">{r.vehicleName} <span className="text-slate-400 font-semibold">• {r.vehiclePlate}</span></div>
                  <div className="text-[11.5px] font-semibold text-slate-500">{maintenancePeriodLabel(r)} • {r.driverName}</div>
                  <div className="text-[11.5px] font-medium text-slate-500 truncate">{r.reason}</div>
                </div>
                <button onClick={() => openModal(<MaintenanceReview id={r.id} />)} className="bg-amber-500 text-white text-[11.5px] font-extrabold px-3.5 py-2 rounded-xl">Review</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">{vs.map((v) => (
        <div key={v.id} onClick={() => openModal(<VehDetail id={v.id} />)} className="border-2 border-slate-100 rounded-3xl overflow-hidden card-hover cursor-pointer">
          <img src={v.photo} onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/' + v.id + '/400/250'; }} className="h-36 w-full object-cover pointer-events-none" loading="lazy" alt={vehName(v)} />
          <div className="p-4"><div className="flex items-center gap-2"><span className="font-extrabold text-[14px]">{vehName(v)}</span><span className="badge bg-sky-100 text-sky-700 !text-[10px]">{v.vtype || 'MPV'}</span></div>
            <div className="text-[12px] font-bold text-slate-500">{v.plate} • {v.year}{v.color ? ' • ' + v.color : ''} • {v.capacity ?? 6} kursi{(v.inactiveSeats || []).length ? <span className="text-red-500"> (off: {(v.inactiveSeats || []).join(', ')})</span> : null}</div>
            {v.ownership === 'Milik Pengemudi' && v.coopDriverId ? <div className="text-[11.5px] font-semibold text-slate-400 mt-0.5">Milik Pengemudi: {((driverById(v.coopDriverId) || {}).name || '-')}{v.mainRoute ? ' • ' + v.mainRoute : ''}</div> : v.ownerName ? <div className="text-[11.5px] font-semibold text-slate-400 mt-0.5">Pemilik: {v.ownerName}{v.ownerBiz ? ' (' + v.ownerBiz + ')' : ''}{v.mainRoute ? ' • ' + v.mainRoute : ''}</div> : null}
            <div className="flex flex-wrap gap-1 mt-1.5">{(v.facilities || []).map((f) => <span key={f} className="badge bg-slate-100 text-slate-500 !text-[10px]">{f}</span>)}</div>
            <div className="flex items-center justify-between mt-2.5"><span className="flex gap-1 flex-wrap"><span className={`badge ${v.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{v.status}</span>{vehicleMaintenanceLabel(v) && v.status !== 'maintenance' ? <span className="badge bg-amber-100 text-amber-800">Maintenance {vehicleMaintenanceLabel(v)}</span> : null}{v.driverConflict ? <span className="badge bg-red-100 text-red-700">bentrok pengemudi</span> : null}{v.pendingApproval ? <span className="badge bg-violet-100 text-violet-700">menunggu approval</span> : null}</span>
              <div className="flex gap-1.5"><button onClick={(e) => { e.stopPropagation(); setVehEdit({ agId: agency.id, vid: v.id }); go('agen-vehform'); }} className="bg-slate-100 p-2 rounded-lg"><Icon name="pencil" className="w-4 h-4 pointer-events-none" /></button><button onClick={(e) => { e.stopPropagation(); delVeh(v.id); }} className="bg-red-50 text-red-500 p-2 rounded-lg"><Icon name="trash-2" className="w-4 h-4 pointer-events-none" /></button></div></div></div></div>
      ))}</div></div>
  );
}
