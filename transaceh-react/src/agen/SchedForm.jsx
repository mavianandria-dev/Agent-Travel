import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyById, routeById, vehicleById, vehName, driverForVehicle, backupDriverForVehicle, priceForAgency, routeOfferedTo, scheduleDateStatus, routeDurationMinutes, audit, DEFAULT_SERVICE } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ITEM_H = 36;
const pad2 = (n) => String(n).padStart(2, '0');
const dstr = (y, m, d) => y + '-' + pad2(m + 1) + '-' + pad2(d);
const fmtShort = (k) => { const [, m, d] = k.split('-'); return Number(d) + ' ' + MONTHS[Number(m) - 1].slice(0, 3); };
const shiftMonth = (c, d) => { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; };

/* Wheel angka: geser naik/turun (drag/touch/scroll), snap, ketuk untuk lompat. */
function Wheel({ items, value, onChange }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const drag = useRef(null);
  const suppress = useRef(false);
  const idxOf = (v) => Math.max(0, items.indexOf(v));

  // posisi awal saja saat mount; nilai berikutnya diatur scroll & settle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = idxOf(value) * ITEM_H; }, []);

  const snapTo = (i, smooth) => {
    const el = ref.current; if (!el) return;
    const top = i * ITEM_H;
    if (smooth) el.scrollTo({ top, behavior: 'smooth' }); else el.scrollTop = top;
  };
  const settle = () => {
    const el = ref.current; if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
    snapTo(i, true);
    if (items[i] !== value) onChange(items[i]);
  };
  const startDrag = (e) => {
    suppress.current = false;
    if (e.pointerType !== 'mouse') return;
    const el = ref.current; if (!el) return;
    drag.current = { y: e.clientY, top: el.scrollTop, moved: false };
    el.style.scrollSnapType = 'none';
    const move = (ev) => {
      if (!drag.current) return;
      const dy = ev.clientY - drag.current.y;
      if (Math.abs(dy) > 4) drag.current.moved = true;
      el.scrollTop = drag.current.top - dy;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!drag.current) return;
      suppress.current = drag.current.moved;
      drag.current = null;
      el.style.scrollSnapType = '';
      settle();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div ref={ref} onPointerDown={startDrag}
      onScroll={() => { clearTimeout(timer.current); timer.current = setTimeout(settle, 120); }}
      className="relative z-10 h-[180px] w-16 py-[72px] overflow-y-scroll snap-y snap-mandatory overscroll-contain select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <button key={it} type="button"
          onClick={() => { if (suppress.current) { suppress.current = false; return; } snapTo(idxOf(it), true); if (it !== value) onChange(it); }}
          className={'w-full h-9 snap-center flex items-center justify-center transition-all ' + (it === value ? 'text-[22px] font-extrabold text-sky-600' : 'text-[16px] font-bold text-slate-300')}>
          {it}
        </button>
      ))}
    </div>
  );
}

/* Kalender bulanan multi-pilih dengan warna kapasitas armada. */
function CalGrid({ cal, atCur, dates, today, statusFor, onShift, onToggle }) {
  const first = new Date(cal.y, cal.m, 1).getDay();
  const dim = new Date(cal.y, cal.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  return (
    <div className="mt-1.5 border-2 border-slate-200 rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <button type="button" disabled={atCur} onClick={() => onShift(-1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-20"><Icon name="arrow-left" className="w-4 h-4" /></button>
        <div className="font-extrabold text-[13px]">{MONTHS[cal.m]} {cal.y}</div>
        <button type="button" onClick={() => onShift(1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><Icon name="arrow-right" className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 mt-1.5 text-[10px] font-extrabold text-slate-400 text-center">{DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 justify-items-center gap-y-1 mt-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={'e' + i} className="w-9 h-9" />;
          const key = dstr(cal.y, cal.m, d);
          const st = statusFor(key);
          const state = st?.state || 'available';
          const sel = dates.has(key);
          const blocked = ['full', 'duration', 'selected-conflict', 'blocked', 'maintenance'].includes(state);
          const past = state === 'past' || state === 'past-time';
          const isToday = key === today;
          const cls = sel
            ? (blocked ? 'bg-red-500 text-white font-extrabold ring-2 ring-red-300' : 'bg-sky-600 text-white font-extrabold shadow-sm')
            : state === 'available' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 font-bold'
              : state === 'limited' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300 hover:bg-amber-200 font-extrabold'
                : blocked ? 'bg-red-100 text-red-600 ring-1 ring-red-300 hover:bg-red-200 font-extrabold'
                  : 'text-slate-300 font-bold';
          return (
            <button key={key} type="button" disabled={past && !sel} onClick={() => onToggle(key)}
              title={st?.reason || ''} aria-label={d + ' ' + (st?.reason || '')}
              className={'w-9 h-9 rounded-full text-[12.5px] flex items-center justify-center transition ' + cls + (isToday && !sel && !past ? ' ring-2 ring-sky-300' : '')}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SchedFormModal({ agId, onDone }) {
  const { closeModal, toast, refresh } = useApp();
  const routes = DB.load('routes', []).filter((r) => routeOfferedTo(r, agId));
  const allRoutes = DB.load('routes', []);
  const schedules = DB.load('schedules', []);
  const vs = DB.load('vehicles', []).filter((v) => v.agencyId === agId && v.status === 'aktif');
  const routesForVehicle = (vid) => routes.filter((r) => {
    const ids = r.vehicleIds || [];
    return !ids.length || ids.includes(vid);
  });
  const vehicleOptions = vs.filter((v) => routesForVehicle(v.id).length > 0);

  const [vehicleId, setVehicleId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [hh, setHh] = useState('07');
  const [mm, setMm] = useState('00');
  const [dates, setDates] = useState(() => new Set());
  const [cal, setCal] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [nowMs] = useState(() => Date.now());

  const today = todayStr(0);
  const atCur = cal.y === Number(today.slice(0, 4)) && cal.m === Number(today.slice(5, 7)) - 1;
  const time = hh + ':' + mm;
  const veh = vehicleId ? vehicleById(vehicleId) : null;
  const route = routeId ? routeById(routeId) : null;
  const drvAuto = veh ? driverForVehicle(veh) : null;
  const backupDrv = veh ? backupDriverForVehicle(veh) : null;
  const mainName = drvAuto ? drvAuto.name : (veh?.drvName || '');
  const mainPhone = drvAuto ? drvAuto.phone : veh?.drvPhone;
  const mainSim = drvAuto ? [drvAuto.simType, drvAuto.simNumber].filter(Boolean).join(' - ') : veh?.drvSim;
  const backupName = backupDrv ? backupDrv.name : (veh && veh.hasBackup === 'Ya' ? (veh.backName || '') : '');
  const selSorted = [...dates].sort();
  const selLabel = selSorted.slice(0, 6).map(fmtShort).join(', ') + (selSorted.length > 6 ? ' +' + (selSorted.length - 6) + ' lagi' : '');
  const finalPrice = route ? priceForAgency(route, agId) : 0;
  const routeOptions = vehicleId ? routesForVehicle(vehicleId) : [];
  const unknownDuration = !!route && !routeDurationMinutes(route);

  const statusFor = (date, at = nowMs) => scheduleDateStatus({
    vehicleId,
    routeId,
    date,
    time,
    schedules,
    routes: allRoutes,
    selectedDates: selSorted,
    now: at,
  });
  const selStatuses = selSorted.map((d) => ({ d, st: statusFor(d) }));
  const invalidSelected = selStatuses.filter((x) => !['available', 'limited'].includes(x.st.state));
  const okCount = selStatuses.length - invalidSelected.length;

  const changeVehicle = (id) => {
    const first = routesForVehicle(id)[0];
    setVehicleId(id);
    setRouteId(first?.id || '');
    setDates(new Set());
  };
  const changeRoute = (id) => {
    setRouteId(id);
    setDates(new Set());
  };
  /* Ganti jam: cek ulang tanggal terpilih, lepas yang jadi tidak valid. */
  const applyTime = (nextHh, nextMm) => {
    const nextTime = nextHh + ':' + nextMm;
    const kept = [];
    [...dates].sort().forEach((d) => {
      const st = scheduleDateStatus({
        vehicleId,
        routeId,
        date: d,
        time: nextTime,
        schedules,
        routes: allRoutes,
        selectedDates: kept,
        now: Date.now(),
      });
      if (['available', 'limited'].includes(st.state)) kept.push(d);
    });
    setHh(nextHh);
    setMm(nextMm);
    if (kept.length !== dates.size) {
      setDates(new Set(kept));
      toast((dates.size - kept.length) + ' tanggal dilepas karena tidak cocok dengan jam baru', 'err');
    }
  };
  const toggleDate = (key) => {
    if (dates.has(key)) {
      setDates((prev) => { const n = new Set(prev); n.delete(key); return n; });
      return;
    }
    const st = statusFor(key);
    if (!['available', 'limited'].includes(st.state)) {
      toast(st.reason || 'Tanggal tidak bisa dipilih', 'err');
      return;
    }
    setDates((prev) => { const n = new Set(prev); n.add(key); return n; });
  };

  const saveSched = () => {
    if (!vehicleId) { toast('Pilih armada dulu', 'err'); return; }
    if (!vs.some((v) => v.id === vehicleId)) { toast('Armada tidak valid untuk agen ini', 'err'); return; }
    if (veh?.driverConflict) { toast('Data pengemudi armada ini bentrok - perbaiki data armada dulu', 'err'); return; }
    if (!drvAuto) { toast('Armada belum punya pengemudi yang valid - lengkapi data armada dulu', 'err'); return; }
    if (!route) { toast('Pilih rute dulu', 'err'); return; }
    if (!routeOfferedTo(route, agId)) { toast('Rute tidak valid untuk agen ini', 'err'); return; }
    if ((route.vehicleIds || []).length && !(route.vehicleIds || []).includes(vehicleId)) { toast('Armada tidak terdaftar di rute ini', 'err'); return; }
    if (!(finalPrice > 0)) { toast('Rute belum punya harga — usulkan harga via halaman Rute', 'err'); return; }
    if (!selSorted.length) { toast('Pilih minimal 1 tanggal dulu', 'err'); return; }

    const at = Date.now();
    const check = selSorted.map((d) => ({ d, st: statusFor(d, at) }));
    const ok = check.filter((x) => ['available', 'limited'].includes(x.st.state)).map((x) => x.d);
    const skipped = check.filter((x) => !['available', 'limited'].includes(x.st.state));
    if (!ok.length) { toast(skipped[0]?.st.reason || 'Tidak ada tanggal valid', 'err'); return; }

    const arr = DB.load('schedules', []);
    ok.forEach((d) => {
      arr.push({ id: 'S-' + Math.random().toString(36).slice(2, 7).toUpperCase(), agencyId: agId, routeId: route.id, date: d, time, vehicleId, driverId: drvAuto.id, driverName: drvAuto.name, backupDriverId: backupDrv ? backupDrv.id : null, backupName, price: finalPrice, status: 'open', tripStatus: 'scheduled', blockedSeats: [], createdAt: new Date().toISOString() });
    });
    DB.save('schedules', arr); refresh();
    audit('schedule_create', route.from + '→' + route.to + ' ' + time + ' • ' + ok.length + ' tanggal • ' + ok.slice(0, 6).join(', ') + (ok.length > 6 ? '…' : ''));
    closeModal();
    toast(ok.length + ' jadwal disimpan' + (skipped.length ? ' • ' + skipped.length + ' tanggal dilewati' : ''));
    refresh();
    if (onDone) onDone();
  };

  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[17px]">Tambah Jadwal</h3>

      <div className="mt-3">
        <label className="text-[12px] font-extrabold">ARMADA <span className="text-sky-600">• pilih dulu</span></label>
        <select value={vehicleId} onChange={(e) => changeVehicle(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
          <option value="">— Pilih armada —</option>
          {vehicleOptions.map((v) => <option key={v.id} value={v.id}>{vehName(v)} • {v.plate}</option>)}
        </select>
        {!vehicleOptions.length ? (
          <div className="text-[12px] font-bold text-amber-700 bg-amber-50 border-2 border-amber-200 rounded-xl px-3 py-2 mt-1.5">Belum ada armada aktif yang terhubung ke rute. Tambah armada atau rute dulu.</div>
        ) : !vehicleId ? (
          <div className="text-[11.5px] text-slate-500 font-medium bg-slate-50 rounded-xl px-3 py-2 mt-1.5">Pilih armada dulu — rute, jam, dan tanggal akan muncul setelahnya.</div>
        ) : null}
        {veh ? (
          <div className="mt-2 bg-slate-50 rounded-2xl p-3">
            <div className="flex items-start gap-2">
              <Icon name="user" className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold text-slate-400">PENGEMUDI</div>
                <div className="text-[12.5px] font-extrabold">{mainName || '—'}</div>
                <div className="text-[11px] text-slate-400 font-semibold">{mainPhone || '-'} • {mainSim || '-'}{mainName && !drvAuto ? ' • belum terhubung ke daftar pengemudi' : ''}</div>
              </div>
            </div>
            <div className="flex items-start gap-2 mt-2">
              <Icon name="users" className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold text-slate-400">PENGGANTI</div>
                <div className="text-[12.5px] font-extrabold text-slate-600">{backupName || '—'}</div>
                {backupName ? <div className="text-[11px] text-slate-400 font-semibold">{(backupDrv ? backupDrv.phone : veh?.backPhone) || '-'} • {(backupDrv ? [backupDrv.simType, backupDrv.simNumber].filter(Boolean).join(' - ') : veh?.backSim) || '-'}</div> : null}
              </div>
            </div>
            {veh.driverConflict ? <div className="mt-2 text-[11.5px] font-bold text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2">Data pengemudi armada ini bentrok dengan armada lain. Perbaiki data armada dulu.</div> : null}
          </div>
        ) : null}
      </div>

      {vehicleId ? (
        <div className="mt-4">
          <label className="text-[12px] font-extrabold">RUTE</label>
          {routeOptions.length ? (
            <>
              <select value={routeId} onChange={(e) => changeRoute(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
                {routeOptions.map((r) => <option key={r.id} value={r.id}>{r.from} → {r.to} • {fmtRp(priceForAgency(r, agId))}</option>)}
              </select>
              <div className="mt-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5">
                <div className="text-[15px] font-extrabold">{finalPrice > 0 ? fmtRp(finalPrice) : '— belum ada harga —'}</div>
                <div className="text-[11.5px] text-slate-500 font-medium mt-0.5">Harga otomatis dari rute • jasa agen {fmtRp(agencyById(agId)?.serviceFee ?? DEFAULT_SERVICE)}/kursi (ditentukan admin per agen).</div>
              </div>
              {unknownDuration ? (
                <div className="mt-1.5 text-[11.5px] font-bold text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2">Durasi rute belum diketahui — jadwal tidak bisa disimpan. Lengkapi durasi rute dulu.</div>
              ) : null}
            </>
          ) : (
            <div className="text-[12px] font-bold text-amber-700 bg-amber-50 border-2 border-amber-200 rounded-xl px-3 py-2 mt-1.5">Armada ini belum terhubung ke rute mana pun. Pilih armada lain atau atur armada di halaman Rute.</div>
          )}
        </div>
      ) : null}

      {vehicleId && route ? (
        <>
          <div className="mt-4">
            <label className="text-[12px] font-extrabold">JAM KEBERANGKATAN</label>
            <div className="mt-1.5 flex items-stretch gap-2.5">
              <div className="relative flex-1 flex items-center justify-center bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden">
                <div className="absolute inset-x-0 top-[72px] h-9 border-y-2 border-sky-100 bg-white/70 pointer-events-none z-0"></div>
                <div className="absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none z-20"></div>
                <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none z-20"></div>
                <Wheel items={HOURS} value={hh} onChange={(v) => applyTime(v, mm)} />
                <div className="relative z-10 font-extrabold text-[20px] text-slate-300 pb-0.5">:</div>
                <Wheel items={MINS} value={mm} onChange={(v) => applyTime(hh, v)} />
              </div>
              <div className="w-[104px] shrink-0 bg-slate-50 border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center">
                <div className="font-extrabold text-[20px] text-sky-600">{time}</div>
                <div className="text-[10px] font-extrabold text-slate-400 mt-0.5 flex items-center gap-1"><Icon name="move-vertical" className="w-3 h-3" />GESER</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-[12px] font-extrabold">TANGGAL KEBERANGKATAN <span className="text-sky-600">• bisa pilih banyak</span></label>
            <CalGrid cal={cal} atCur={atCur} dates={dates} today={today} statusFor={statusFor}
              onShift={(d) => setCal((c) => shiftMonth(c, d))}
              onToggle={toggleDate} />
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10.5px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-100 ring-1 ring-emerald-300" />Hijau — belum ada jadwal</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-100 ring-1 ring-amber-300" />Kuning — masih boleh 1</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-100 ring-1 ring-red-300" />Merah — penuh/bentrok/maintenance</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-600" />Biru — tanggal dipilih</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1.5">Dihitung semua rute untuk armada ini • maksimal 2 keberangkatan aktif per tanggal • jeda 30 menit setelah tiba.</div>
            <div className="text-[11.5px] font-semibold text-slate-500 mt-1.5">{selSorted.length ? selSorted.length + ' tanggal dipilih: ' + selLabel : 'Belum ada tanggal dipilih — ketuk tanggal pada kalender.'}</div>
          </div>

          {invalidSelected.length ? (
            <div className="mt-3 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl p-3 text-[11.5px] font-bold">
              ⚠ {invalidSelected.length} tanggal dipilih tidak valid: {invalidSelected.slice(0, 3).map((x) => fmtShort(x.d)).join(', ')}{invalidSelected.length > 3 ? ' +' + (invalidSelected.length - 3) + ' lagi' : ''}
              <div className="text-[11px] font-medium text-red-600 mt-0.5">{invalidSelected[0].st.reason}. Tanggal ini tidak ikut disimpan.</div>
            </div>
          ) : null}

          <button onClick={saveSched} className="mt-4 w-full bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">{!selSorted.length ? 'Simpan Jadwal' : okCount ? 'Simpan ' + okCount + ' Jadwal' : 'Tidak Ada Tanggal Valid'}</button>
        </>
      ) : null}
    </div>
  );
}
