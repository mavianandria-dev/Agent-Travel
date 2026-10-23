import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyById, audit, decideRouteRequest, priceForAgency, isRouteSuspended, suspendAgencyRoute, activateAgencyRoute } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { routeMeta } from '@/lib/geo.js';
import { Icon, Empty } from '@/components/ui.jsx';

/* Daftar rute dikelompokkan per agen; suspend berlaku per agen-rute + alasan (tampil ke agen) */
function AgencyRoutesPanel() {
  const { toast, refresh } = useApp();
  const [susKey, setSusKey] = useState(null);
  const [reason, setReason] = useState('');
  const routes = DB.load('routes', []);
  const groups = new Map();
  routes.forEach((r) => {
    const ids = (r.agencyIds && r.agencyIds.length ? r.agencyIds : (r.agencyId ? [r.agencyId] : []));
    if (!ids.length) { if (!groups.has('__none__')) groups.set('__none__', []); groups.get('__none__').push(r); return; }
    ids.forEach((id) => { if (!groups.has(id)) groups.set(id, []); groups.get(id).push(r); });
  });
  const doEnable = (r) => {
    const arr = DB.load('routes', []); const t = arr.find((x) => x.id === r.id);
    if (!t) return;
    t.active = true; DB.save('routes', arr);
    audit('route_enable', t.from + ' → ' + t.to);
    refresh(); toast('Rute diaktifkan');
  };
  const doActivate = (r, aid) => {
    if (activateAgencyRoute(r.id, aid)) { refresh(); toast('Rute diaktifkan kembali untuk agen ini'); }
  };
  const confirmSuspend = (r, aid) => {
    const why = (reason || '').trim();
    if (!why) return toast('Isi alasan suspend dulu', 'warn');
    if (suspendAgencyRoute(r.id, aid, why)) { setSusKey(null); setReason(''); refresh(); toast('Rute disuspend untuk agen ini', 'info'); }
  };
  const row = (r, aid) => {
    const key = r.id + '|' + aid;
    const susp = isRouteSuspended(r, aid);
    return (
      <div key={key} className="mt-2 bg-slate-50 rounded-2xl px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-bold flex-wrap">
          <span>{r.from} → {r.to}</span>
          <span className="text-slate-400 font-medium">{routeMeta(r)} • {fmtRp(priceForAgency(r, aid))}/kursi</span>
          <div className="flex-1"></div>
          {susp ? <span className="badge bg-red-100 text-red-600">disuspend</span>
            : !r.active ? <span className="badge bg-slate-200 text-slate-500">nonaktif</span>
            : <button onClick={() => { setSusKey(key); setReason(''); }} className="badge bg-red-100 text-red-600 cursor-pointer">Suspend</button>}
          {susp ? <button onClick={() => doActivate(r, aid)} className="badge bg-sky-100 text-sky-700 cursor-pointer">Aktifkan</button> : null}
          {!r.active ? <button onClick={() => doEnable(r)} className="badge bg-sky-100 text-sky-700 cursor-pointer">Aktifkan rute</button> : null}
        </div>
        {susp ? <div className="text-[12px] font-bold text-red-500 mt-1">Alasan: {r.suspensions[aid].reason}</div> : null}
        {susKey === key ? (
          <div className="flex gap-2 mt-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan suspend (wajib)" className="flex-1 text-[12.5px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" />
            <button onClick={() => confirmSuspend(r, aid)} className="bg-red-500 text-white text-[12px] font-extrabold px-3.5 py-2 rounded-xl">Suspend</button>
            <button onClick={() => { setSusKey(null); setReason(''); }} className="bg-slate-200 text-[12px] font-extrabold px-3.5 py-2 rounded-xl">Batal</button>
          </div>
        ) : null}
      </div>
    );
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <h3 className="font-extrabold text-[15px]">Rute per Agen <span className="badge bg-slate-100 text-slate-500 ml-1">{routes.length} rute</span></h3>
      <div className="text-[11.5px] text-slate-400 font-medium mt-1">Suspend berlaku untuk agen tersebut saja — agen lain tetap bisa menjual rute yang sama. Alasan ikut ditampilkan ke agen.</div>
      {[...groups.entries()].map(([aid, list]) => {
        const ag = aid === '__none__' ? null : agencyById(aid);
        return (
          <div key={aid} className="mt-3">
            <div className="text-[13px] font-extrabold flex items-center gap-1.5"><Icon name="building-2" className="w-4 h-4 text-sky-600" />{aid === '__none__' ? '- tanpa agen -' : (ag ? ag.name : aid)}<span className="text-slate-400 font-medium">• {list.length} rute</span></div>
            {aid === '__none__' ? list.map((r) => (
              <div key={r.id} className="mt-2 bg-slate-50 rounded-2xl px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-[13px] font-bold flex-wrap">
                  <span>{r.from} → {r.to}</span>
                  <span className="text-slate-400 font-medium">{routeMeta(r)} • {fmtRp(priceForAgency(r, null))}/kursi</span>
                  <div className="flex-1"></div>
                  <span className="badge bg-slate-100 text-slate-500">tanpa agen</span>
                  {!r.active ? <button onClick={() => doEnable(r)} className="badge bg-sky-100 text-sky-700 cursor-pointer">Aktifkan rute</button> : null}
                </div>
              </div>
            )) : list.map((r) => row(r, aid))}
          </div>
        );
      })}
      {!routes.length ? <Empty icon="route" msg="Belum ada rute — buat lewat usulan agen" /> : null}
    </div>
  );
}

const REQ_STATUS = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600' };
const REQ_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

function RequestSection() {
  const { toast, refresh } = useApp();
  const [rejectId, setRejectId] = useState(null);
  const [note, setNote] = useState('');
  const reqs = DB.load('routeRequests', []);
  const pending = reqs.filter((x) => x.status === 'pending');
  const done = reqs.filter((x) => x.status !== 'pending');
  const approve = (id) => {
    const r = decideRouteRequest(id, true, '');
    refresh();
    if (r?.error) { toast(r.error, 'err'); return; }
    toast(r?.createdRouteId ? 'Rute baru dibuat untuk agen pengusul' : 'Titik jemput ditambahkan ke rute');
  };
  const reject = (id) => {
    decideRouteRequest(id, false, note);
    setRejectId(null); setNote('');
    refresh();
    toast('Usulan ditolak', 'info');
  };
  const card = (q) => {
    const ag = agencyById(q.agencyId);
    const oldPrice = q.type === 'ubah-harga' ? priceForAgency(DB.load('routes', []).find((x) => x.id === q.routeId), q.agencyId) : 0;
    const typeLabel = q.type === 'rute-baru' ? 'Rute Baru' : q.type === 'ubah-harga' ? 'Ubah Harga' : 'Titik Jemput';
    return (
      <div key={q.id} className="mt-2 bg-slate-50 rounded-2xl px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-bold flex-wrap">
          <span className="badge bg-sky-100 text-sky-700">{typeLabel}</span>
          <span>{q.from} → {q.to}</span>
          {q.type === 'ubah-harga' ? <span className="text-slate-400 font-medium">{fmtRp(oldPrice)} → <b className="text-slate-700">{fmtRp(q.price)}</b></span>
          : q.price ? <span className="text-slate-400 font-medium">{fmtRp(q.price)}</span> : null}
          <span className="text-slate-400 font-medium">• {ag ? ag.name : q.agencyId}</span>
          <div className="flex-1"></div>
          <span className={`badge ${REQ_STATUS[q.status]}`}>{REQ_LABEL[q.status]}</span>
        </div>
        {(q.pickups && q.pickups.length ? q.pickups : q.pickup ? [q.pickup] : []).length ? <div className="text-[12px] text-slate-500 font-medium mt-1">Titik: {(q.pickups && q.pickups.length ? q.pickups : [q.pickup]).join(', ')}</div> : null}
        {(q.vehicleIds || []).length ? <div className="text-[12px] text-slate-500 font-medium mt-1">Armada: {(q.vehicleIds || []).length} unit</div> : null}
        {q.note ? <div className="text-[12px] text-slate-500 font-medium">Alasan: {q.note}</div> : null}
        {q.adminNote ? <div className="text-[12px] font-bold text-sky-700 mt-1">Admin: {q.adminNote}</div> : null}
        {q.status === 'pending' ? (
          <div className="mt-2">
            {rejectId === q.id ? (
              <div className="flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan penolakan (opsional)" className="flex-1 text-[12.5px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" />
                <button onClick={() => reject(q.id)} className="bg-red-500 text-white text-[12px] font-extrabold px-3.5 py-2 rounded-xl">Tolak</button>
                <button onClick={() => { setRejectId(null); setNote(''); }} className="bg-slate-200 text-[12px] font-extrabold px-3.5 py-2 rounded-xl">Batal</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => approve(q.id)} className="flex-1 bg-green-500 text-white text-[12px] font-extrabold px-3.5 py-2 rounded-xl">Setujui</button>
                <button onClick={() => setRejectId(q.id)} className="flex-1 bg-slate-200 text-slate-600 text-[12px] font-extrabold px-3.5 py-2 rounded-xl">Tolak</button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <h3 className="font-extrabold text-[15px]">Usulan Rute Agen {pending.length ? <span className="badge bg-amber-100 text-amber-700 ml-1">{pending.length} menunggu</span> : null}</h3>
      {pending.map(card)}
      {!pending.length ? <div className="text-[12.5px] text-slate-400 font-medium mt-2">Tidak ada usulan menunggu.</div> : null}
      {done.length ? <div className="font-extrabold text-[13px] mt-4 text-slate-500">Riwayat keputusan</div> : null}
      {done.slice(0, 10).map(card)}
    </div>
  );
}

export function Routes() {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <AgencyRoutesPanel />
      <RequestSection />
    </div>
  );
}

export default Routes;
