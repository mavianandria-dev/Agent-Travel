import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { saveRouteRequest, priceForAgency, isRouteSuspended, vehicleById, vehName, fleetAvailable } from '@/lib/domain.js';
import { PICKUP_ORIGIN } from '@/lib/pickups.js';
import { estimateRoute, routeMeta } from '@/lib/geo.js';
import { fmtRp, REGIONS } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';

const TYPE_LABEL = { 'rute-baru': 'Rute Baru', 'titik-jemput': 'Titik Jemput', 'ubah-harga': 'Ubah Harga' };

const STATUS = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600' };
const STATUS_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

function RequestRouteModal({ ag }) {
  const { toast, closeModal, refresh } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [price, setPrice] = useState('');
  const [picks, setPicks] = useState([]);
  const [custom, setCustom] = useState('');
  const [homePickup, setHomePickup] = useState(true);
  const [note, setNote] = useState('');
  const [dist, setDist] = useState('');
  const [dur, setDur] = useState('');
  const [armada, setArmada] = useState([]);
  const availV = fleetAvailable(ag.id, { includeUsed: true });
  const usedV = availV.filter((v) => (v.routeUsage || []).length > 0);
  const selectedUsed = availV.filter((v) => armada.includes(v.id) && (v.routeUsage || []).length > 0);
  const chips = [...new Set(PICKUP_ORIGIN[from] || [])];
  const pickChip = (p) => { setCustom(''); setPicks((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p])); };
  const addCustom = () => { const v = custom.trim(); if (!v) return; if (!picks.includes(v)) setPicks((ps) => [...ps, v]); setCustom(''); };
  const pickFrom = (v) => { setFrom(v); setPicks([]); setCustom(''); };
  const pickTo = (v) => { setTo(v); setPicks([]); setCustom(''); };
  const pickV = (id) => setArmada((as) => (as.includes(id) ? as.filter((x) => x !== id) : [...as, id]));
  const submit = () => {
    if (!from || !to) { toast('Pilih kota asal dan tujuan dulu', 'err'); return; }
    if (from === to) { toast('Kota asal dan tujuan tidak boleh sama', 'err'); return; }
    if (!(Number(price) > 0)) { toast('Isi usulan harga tiket', 'err'); return; }
    if (!armada.length) { toast('Pilih minimal 1 armada untuk rute ini', 'err'); return; }
    const all = custom.trim() && !picks.includes(custom.trim()) ? [...picks, custom.trim()] : picks;
    saveRouteRequest({ agencyId: ag.id, type: 'rute-baru', from, to, price: Number(price), pickups: all, homePickup, note, distance: dist, duration: dur, vehicleIds: armada });
    refresh(); closeModal(); toast('Usulan terkirim — menunggu persetujuan admin');
  };
  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[16px]">Usulkan Rute</h3>
      <div className="mt-2 text-[12px] font-bold bg-slate-50 text-slate-600 rounded-xl px-3 py-2">Satu armada boleh dipakai di beberapa rute. DARI/KE yang sama tetap boleh diusulkan dengan harga, titik jemput, atau armada yang berbeda.</div>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div><label className="text-[12px] font-extrabold">DARI <span className="text-red-500">*</span></label>
          <select value={from} onChange={(e) => pickFrom(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring"><option value="" disabled>— Pilih kota asal —</option>{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
        <div><label className="text-[12px] font-extrabold">KE <span className="text-red-500">*</span></label>
          <select value={to} onChange={(e) => pickTo(e.target.value)} className="w-full mt-1 font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring"><option value="" disabled>— Pilih kota tujuan —</option>{REGIONS.map((g) => (<optgroup key={g.p} label={g.p}>{g.c.map((n) => (<option key={n}>{n}</option>))}</optgroup>))}</select></div>
      </div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">USULAN HARGA TIKET / KURSI (Rp) <span className="text-red-500">*</span></label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="cth: 300000" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div><label className="text-[12px] font-extrabold">PERKIRAAN JARAK (opsional)</label>
          <input value={dist} onChange={(e) => setDist(e.target.value)} placeholder={(estimateRoute(from, to) || {}).distance || 'cth: ±150 km'} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
        <div><label className="text-[12px] font-extrabold">PERKIRAAN DURASI (opsional)</label>
          <input value={dur} onChange={(e) => setDur(e.target.value)} placeholder={(estimateRoute(from, to) || {}).duration || 'cth: ±3 jam'} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      </div>
      <div className="text-[11.5px] text-slate-500 font-medium bg-slate-50 rounded-xl px-3 py-2 mt-1.5">Kosongkan jarak/durasi untuk pakai estimasi otomatis dari koordinat kota.</div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">TITIK JEMPUT USULAN <span className="text-slate-400">(opsional, boleh banyak)</span></label>
        {chips.length ? (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {chips.map((p) => (
              <button key={p} type="button" onClick={() => pickChip(p)} className={`px-3 py-2 rounded-xl border-2 text-[12px] font-extrabold transition ${picks.includes(p) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>{picks.includes(p) ? '✓ ' : ''}{p}</button>
            ))}
          </div>
        ) : !from ? (
          <div className="text-[11.5px] text-slate-400 font-semibold bg-slate-50 rounded-xl px-3 py-2 mt-1.5">Pilih kota asal (DARI) dulu — saran titik jemput wilayah berangkat muncul otomatis di sini.</div>
        ) : (
          <div className="text-[11.5px] text-slate-400 font-semibold bg-slate-50 rounded-xl px-3 py-2 mt-1.5">Belum ada saran titik jemput untuk {from} — ketik manual di kolom bawah.</div>
        )}
        <div className="flex gap-2 mt-1.5">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={chips.length ? 'atau ketik titik baru…' : 'cth: Simpang Lima'} className="flex-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
          <button type="button" onClick={addCustom} className="bg-slate-100 hover:bg-slate-200 text-[12px] font-extrabold px-4 rounded-xl shrink-0">+ Tambah</button>
        </div>
        {picks.length ? <div className="flex flex-wrap gap-1.5 mt-1.5">{picks.map((p) => (<span key={p} className="badge bg-sky-600 text-white">{p} <button type="button" onClick={() => setPicks((ps) => ps.filter((x) => x !== p))} className="ml-0.5 font-extrabold">×</button></span>))}</div> : null}
      </div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">PILIH ARMADA (wajib, boleh banyak) <span className="text-red-500">*</span></label>
        {availV.length ? (
          <>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {availV.map((v) => {
                const usage = v.routeUsage || [];
                const used = usage.length > 0;
                const routeNames = usage.map((r) => r.from + ' → ' + r.to);
                return (
                  <button key={v.id} type="button" data-vehicle-id={v.id} title={used ? 'Sudah dipakai di ' + routeNames.join(', ') + '. Tetap bisa dipilih untuk rute baru.' : 'Belum dipakai rute lain.'} onClick={() => pickV(v.id)} className={`px-3 py-2 rounded-xl border-2 text-[12px] font-extrabold transition ${armada.includes(v.id) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>
                    {armada.includes(v.id) ? '✓ ' : ''}{vehName(v)} • {v.plate}{used ? <span className="ml-1 text-[10px] font-bold opacity-80">• {usage.length} rute</span> : null}
                  </button>
                );
              })}
            </div>
            {usedV.length ? <div className="text-[11.5px] text-slate-500 font-medium bg-slate-50 rounded-xl px-3 py-2 mt-1.5">{usedV.length} armada sudah dipakai rute lain — tetap bisa dipilih untuk rute baru. Rute pemakaian terlihat saat armada dipilih.</div> : null}
          </>
        ) : (
          <div className="text-[12px] font-bold text-amber-700 bg-amber-50 border-2 border-amber-200 rounded-xl px-3 py-2 mt-1.5">Belum ada armada aktif — tambah armada dulu di halaman Armada.</div>
        )}
        {armada.length ? <div className="text-[11.5px] font-semibold text-sky-700 mt-1.5">{armada.length} armada dipilih untuk rute ini.</div> : null}
        {selectedUsed.length ? <div className="text-[11.5px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1.5">{selectedUsed.map((v) => vehName(v) + ': ' + (v.routeUsage || []).map((r) => r.from + ' → ' + r.to).join(', ')).join('; ')}. Armada ini tetap bisa dipakai — pastikan jadwalnya tidak bentrok.</div> : null}
      </div>
      <div className="mt-3"><label className="flex items-center gap-2.5 bg-sky-50 border-2 border-sky-200 rounded-2xl px-3.5 py-2.5 cursor-pointer text-[12.5px] font-bold text-sky-800"><input type="checkbox" checked={homePickup} onChange={(e) => setHomePickup(e.target.checked)} className="w-5 h-5 accent-sky-600 shrink-0" />Sediakan jemput ke rumah (pelanggan pin lokasi via peta)</label></div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">CATATAN (opsional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan usulan…" rows={2} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      <button onClick={submit} className="btn-touch mt-4 w-full bg-sky-600 text-white font-extrabold py-3 rounded-2xl">Kirim Usulan</button>
    </div>
  );
}

function EditPriceModal({ ag, route }) {
  const { toast, closeModal, refresh } = useApp();
  const old = priceForAgency(route, ag.id);
  const [price, setPrice] = useState(old || '');
  const submit = () => {
    if (!(Number(price) > 0)) { toast('Isi harga tiket baru', 'err'); return; }
    if (Number(price) === old) { toast('Harga sama — tidak ada perubahan', 'warn'); return; }
    const dup = DB.load('routeRequests', []).some((x) => x.agencyId === ag.id && x.type === 'ubah-harga' && x.routeId === route.id && x.status === 'pending');
    if (dup) { toast('Sudah ada usulan harga menunggu untuk rute ini', 'warn'); return; }
    saveRouteRequest({ agencyId: ag.id, type: 'ubah-harga', routeId: route.id, from: route.from, to: route.to, price: Number(price), note: '' });
    refresh(); closeModal(); toast('Usulan harga terkirim — menunggu persetujuan admin');
  };
  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[16px]">Ubah Harga Tiket</h3>
      <div className="text-[13px] font-bold mt-1">{route.from} → {route.to}</div>
      <div className="text-[12.5px] text-slate-500 font-medium mt-1">Harga Anda kini: <b className="text-slate-700">{fmtRp(old)}</b>/kursi</div>
      <div className="mt-3"><label className="text-[12px] font-extrabold">HARGA BARU / KURSI (Rp) <span className="text-red-500">*</span></label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="cth: 170000" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
      <button onClick={submit} className="btn-touch mt-4 w-full bg-sky-600 text-white font-extrabold py-3 rounded-2xl">Kirim Usulan</button>
    </div>
  );
}

/* Detail armada pada suatu rute (dipanggil saat card Rute Saya diklik). */
function RouteArmadaModal({ ag, route }) {
  const { closeModal } = useApp();
  const vs = (route.vehicleIds || []).map((id) => vehicleById(id)).filter((v) => v && v.agencyId === ag.id);
  return (
    <div className="p-6">
      <div className="flex items-center gap-2"><h3 className="font-extrabold text-[16px]">{route.from} <Icon name="arrow-right" className="w-4 h-4 text-sky-600" /> {route.to}</h3>
        <span className="badge bg-sky-100 text-sky-700"><Icon name="bus" className="w-3 h-3" />{vs.length} armada</span>
        <div className="flex-1"></div>
        <button onClick={() => closeModal()} className="text-slate-400 shrink-0"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="text-[12px] text-slate-500 font-medium mt-1">{routeMeta(route)}</div>
      {vs.length ? (
        <div className="table-wrap mt-3"><table className="data w-full min-w-[600px]"><thead><tr><th>Armada</th><th>Plat</th><th>Tahun</th><th>Kursi</th><th>Pengemudi</th><th>Status</th></tr></thead><tbody>
          {vs.map((v) => (
            <tr key={v.id}>
              <td className="font-extrabold">{vehName(v)}</td>
              <td>{v.plate || '—'}</td>
              <td>{v.year || '—'}</td>
              <td>{v.capacity || 6} kursi</td>
              <td>{v.drvName || '—'}</td>
              <td><span className={`badge ${v.status === 'aktif' ? 'bg-green-100 text-green-700' : v.status === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>{v.status || '—'}</span></td>
            </tr>
          ))}
        </tbody></table></div>
      ) : <div className="mt-3"><Empty icon="bus" msg="Belum ada armada di rute ini" /></div>}
      <button onClick={() => closeModal()} className="mt-4 w-full bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Tutup</button>
    </div>
  );
}

export default function Routes({ ag }) {
  const { openModal } = useApp();
  const routes = DB.load('routes', []).filter((r) => (r.agencyIds || []).includes(ag.id));
  const reqs = DB.load('routeRequests', []).filter((x) => x.agencyId === ag.id);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="flex items-center"><h3 className="font-extrabold text-[16px]">Rute Saya ({routes.length})</h3><div className="flex-1"></div>
          <button onClick={() => openModal(<RequestRouteModal ag={ag} />)} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Usulkan Rute</button></div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {routes.map((r) => (
            <div key={r.id} onClick={() => openModal(<RouteArmadaModal ag={ag} route={r} />)} className="card-hover cursor-pointer border-2 border-slate-100 rounded-3xl p-4">
              <div className="flex items-center gap-2 text-[14px] font-extrabold">{r.from} <Icon name="arrow-right" className="w-4 h-4 text-sky-600" /> {r.to}<div className="flex-1"></div><span className="badge bg-sky-50 text-sky-700"><Icon name="bus" className="w-3 h-3" />{(r.vehicleIds || []).length} armada</span>{isRouteSuspended(r, ag.id) ? <span className="badge bg-red-100 text-red-600">disuspend</span> : <span className={`badge ${r.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{r.active ? 'aktif' : 'nonaktif'}</span>}</div>
              <div className="text-[12px] text-slate-500 font-medium mt-1">{routeMeta(r)}</div>
              {isRouteSuspended(r, ag.id) ? <div className="text-[12px] font-bold text-red-500 mt-1">Disuspend admin: {r.suspensions[ag.id].reason}</div> : null}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">{r.homePickup !== false ? <span className="badge bg-green-100 text-green-700"><Icon name="map-pin" className="w-3 h-3" />Jemput rumah tersedia</span> : null}</div>
              <div className="flex items-center gap-2 mt-1.5"><span className="text-[13px] font-extrabold">Harga Anda: {fmtRp(priceForAgency(r, ag.id))}<span className="text-slate-400 font-medium">/kursi</span></span><div className="flex-1"></div>
                <button onClick={(e) => { e.stopPropagation(); openModal(<EditPriceModal ag={ag} route={r} />); }} className="text-sky-600 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100">Ubah Harga</button></div>
              <div className="flex flex-wrap gap-1 mt-2">{(r.pickups || []).map((p) => (<span key={p} className="badge bg-slate-100 text-slate-600"><Icon name="map-pin" className="w-3 h-3" />{p}</span>))}</div>
            </div>
          ))}
        </div>
        {!routes.length ? <Empty icon="route" msg="Belum ada rute untuk travel Anda" /> : null}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px]">Status Usulan ({reqs.length})</h3>
        <div className="space-y-2 mt-3">
          {reqs.map((q) => (
            <div key={q.id} className="bg-slate-50 rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-bold">
                <span className="badge bg-sky-100 text-sky-700">{TYPE_LABEL[q.type] || q.type}</span>
                <span>{q.from} → {q.to}</span>
                {q.price ? <span className="text-slate-400 font-medium">{fmtRp(q.price)}</span> : null}<div className="flex-1"></div>
                <span className={`badge ${STATUS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
              </div>
              {(q.pickups && q.pickups.length ? q.pickups : q.pickup ? [q.pickup] : []).length ? <div className="text-[12px] text-slate-500 font-medium mt-1">Titik: {(q.pickups && q.pickups.length ? q.pickups : [q.pickup]).join(', ')}</div> : null}
              {(q.vehicleIds || []).length ? <div className="text-[12px] text-slate-500 font-medium mt-1">Armada: {(q.vehicleIds || []).length} unit</div> : null}
              {q.note ? <div className="text-[12px] text-slate-500 font-medium">Catatan: {q.note}</div> : null}
              {q.adminNote ? <div className="text-[12px] font-bold text-sky-700 mt-1">Admin: {q.adminNote}</div> : null}
            </div>
          ))}
        </div>
        {!reqs.length ? <div className="text-[12.5px] text-slate-400 font-medium mt-2">Belum ada usulan. Butuh koridor atau titik baru? Klik Usulkan Rute.</div> : null}
      </div>
    </div>
  );
}
