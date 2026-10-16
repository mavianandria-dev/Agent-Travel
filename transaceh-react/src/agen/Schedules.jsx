import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, routeById, vehicleById, vehName, driverById, schedById, takenSeats, vehLayout, schedSeatCap, schedReady, audit, hm } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { ManifestModal } from './Bookings.jsx';

function SchedFormModal({ agId, onDone }) {
  const { closeModal, toast, refresh } = useApp();
  const routes = DB.load('routes', []);
  const vs = DB.load('vehicles', []).filter((v) => v.agencyId === agId && v.status === 'aktif');
  const ds = DB.load('drivers', []).filter((d) => d.agencyId === agId && d.status === 'aktif');
  const [routeId, setRouteId] = useState(routes[0]?.id || '');
  const [date, setDate] = useState(todayStr(1));
  const [time, setTime] = useState('07:00');
  const [vehicleId, setVehicleId] = useState(vs[0]?.id || '');
  const [driverId, setDriverId] = useState(ds[0]?.id || '');
  const [price, setPrice] = useState(150000);
  const [serviceFee, setServiceFee] = useState(10000);

  const schedRouteDriver = (rid) => {
    setRouteId(rid);
    const r = routeById(rid);
    if (!r) return;
    const pref = r.driverIds || (r.driverId ? [r.driverId] : []);
    const hit = pref.find((id) => ds.some((d) => d.id === id));
    if (hit) { setDriverId(hit); const d = driverById(hit); if (d) toast('Pengemudi default rute: ' + d.name, 'info'); }
  };

  const saveSched = () => {
    const clash = DB.load('schedules', []).find((s) => s.date === date && (s.vehicleId === vehicleId || s.driverId === driverId) && Math.abs(hm(s.time) - hm(time)) < 240);
    if (clash) { toast('BENTROK: armada/pengemudi sudah terjadwal ' + clash.time + ' di rute lain. Minimal jeda 4 jam.', 'err'); return; }
    const arr = DB.load('schedules', []);
    const r = routeById(routeId);
    arr.push({ id: 'S-' + Math.random().toString(36).slice(2, 7).toUpperCase(), agencyId: agId, routeId: r.id, date, time, vehicleId, driverId, price: Number(price) || r.basePrice, serviceFee: serviceFee === '' ? undefined : Number(serviceFee), status: 'open', tripStatus: 'scheduled', blockedSeats: [], createdAt: new Date().toISOString() });
    DB.save('schedules', arr); refresh();
    audit('schedule_create', r.from + '→' + r.to + ' ' + date + ' ' + time);
    closeModal();
    toast('Jadwal disimpan');
    refresh();
    if (onDone) onDone();
  };

  return (
    <div className="p-6"><h3 className="font-extrabold text-[17px]">Tambah Jadwal</h3>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div className="col-span-2"><label className="text-[12px] font-extrabold">RUTE</label><select value={routeId} onChange={(e) => schedRouteDriver(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{routes.map((r) => <option key={r.id} value={r.id}>{r.from} → {r.to}</option>)}</select></div>
        <div><label className="text-[12px] font-extrabold">TANGGAL</label><input type="date" value={date} min={todayStr(0)} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
        <div><label className="text-[12px] font-extrabold">JAM</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
        <div><label className="text-[12px] font-extrabold">ARMADA</label><select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{vs.map((v) => <option key={v.id} value={v.id}>{vehName(v)} • {v.plate}</option>)}</select></div>
        <div><label className="text-[12px] font-extrabold">PENGEMUDI</label><select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{ds.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div className="col-span-2"><label className="text-[12px] font-extrabold">HARGA / KURSI (otomatis +25rb weekend)</label><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
        <div className="col-span-2"><label className="text-[12px] font-extrabold">JASA AGEN / KURSI (Rp)</label><input type="number" min="0" value={serviceFee} onChange={(e) => setServiceFee(e.target.value)} placeholder="10000" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      </div>
      <button onClick={saveSched} className="mt-4 w-full bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">Simpan Jadwal</button></div>
  );
}

function BlockSeatModal({ sid }) {
  const { closeModal, toast, refresh, tick } = useApp();
  void tick;
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const order = vehLayout(vehicleById(s.vehicleId)).filter((c) => c.type === 'seat' || c.type === 'off').map((c) => c.sid);
  const toggleBlock = (st) => {
    const arr = DB.load('schedules', []);
    const m = arr.find((x) => x.id === sid);
    m.blockedSeats = m.blockedSeats || [];
    m.blockedSeats = m.blockedSeats.includes(st) ? m.blockedSeats.filter((x) => x !== st) : [...m.blockedSeats, st];
    DB.save('schedules', arr); refresh();
    audit('seat_block', sid + ' ' + st);
    refresh();
  };
  void toast;
  return (
    <div className="p-6"><h3 className="font-extrabold text-[16px]">Tutup / Buka Kursi Manual</h3><p className="text-[12px] text-slate-500 font-medium">Klik kursi untuk blokir (maintenance/operasional).</p>
      <div className="grid grid-cols-4 gap-2 mt-3">{order.map((st) => <button key={st} onClick={() => toggleBlock(st)} className={`rounded-xl border-2 py-3 font-extrabold text-[14px] min-h-[60px] ${(s.blockedSeats || []).includes(st) ? 'border-red-400 bg-red-50 text-red-600' : 'border-green-300 bg-green-50 text-green-700'}`}>{st}<br /><span className="text-[10px]">{(s.blockedSeats || []).includes(st) ? 'DIBLOKIR' : 'BUKA'}</span></button>)}</div>
      <button onClick={() => { closeModal(); refresh(); }} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Selesai</button></div>
  );
}

export default function Schedules({ ag }) {
  const { user, openModal, toast, refresh, tick } = useApp();
  void tick;
  void schedReady;
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;
  const list = DB.load('schedules', []).filter((s) => s.agencyId === agency.id).sort((a, b) => (a.date + b.time).localeCompare(b.date + b.time));

  const schedForm = () => openModal(<SchedFormModal agId={agency.id} />);
  const manifest = (sid) => openModal(<ManifestModal sid={sid} />);
  const blockSeat = (sid) => openModal(<BlockSeatModal sid={sid} />);
  const delSched = (id) => {
    if (!window.confirm('Hapus jadwal ini?')) return;
    DB.save('schedules', DB.load('schedules', []).filter((s) => s.id !== id)); refresh();
    audit('schedule_delete', id);
    toast('Jadwal dihapus', 'info');
    refresh();
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <div className="flex items-center gap-2"><h3 className="font-extrabold text-[16px]">Penjadwalan Keberangkatan</h3><div className="flex-1"></div>
        <button onClick={schedForm} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Tambah Jadwal</button></div>
      <div className="table-wrap mt-3"><table className="data w-full min-w-[720px]"><thead><tr><th>Tanggal / Jam</th><th>Rute</th><th>Armada / Pengemudi</th><th>Harga</th><th>Terisi</th><th>Aksi</th></tr></thead><tbody>
        {list.map((s) => {
          const r = routeById(s.routeId);
          const v = vehicleById(s.vehicleId);
          const dr = driverById(s.driverId);
          const tk = takenSeats(s.id);
          return (
            <tr key={s.id}><td className="font-bold">{fmtDate(s.date)}<br /><span className="text-sky-600">{s.time}</span> {s.tripStatus !== 'scheduled' ? <BadgeStatus st={s.tripStatus} /> : null}</td>
              <td className="font-semibold">{r?.from} → {r?.to}</td><td className="text-[12.5px] font-medium">{vehName(v)}<br /><span className="text-slate-400">{dr?.name}</span></td>
              <td className="font-extrabold">{fmtRp(s.price)}</td>
              <td><div className="flex items-center gap-1.5"><div className="w-16 h-2 bg-slate-100 rounded-full"><div className="h-full bg-sky-500 rounded-full" style={{ width: (tk.paid.length / schedSeatCap(s.id)) * 100 + '%' }}></div></div><b className="text-[12px]">{tk.paid.length}/{schedSeatCap(s.id)}</b></div></td>
              <td><div className="flex gap-1.5"><button onClick={() => manifest(s.id)} className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="users" className="w-4 h-4" /></button>
                <button onClick={() => blockSeat(s.id)} title="Tutup/buka kursi" className="bg-amber-100 text-amber-700 p-2 rounded-lg"><Icon name="ban" className="w-4 h-4" /></button>
                <button onClick={() => delSched(s.id)} className="bg-red-50 text-red-500 p-2 rounded-lg"><Icon name="trash-2" className="w-4 h-4" /></button></div></td></tr>
          );
        })}
      </tbody></table></div></div>
  );
}
