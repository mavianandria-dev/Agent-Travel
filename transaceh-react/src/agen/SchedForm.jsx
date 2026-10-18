import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyById, routeById, vehicleById, vehName, driverByName, schedConflict, corridorClash, priceForAgency, routeOfferedTo, audit, DEFAULT_SERVICE } from '@/lib/domain.js';
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

/* Kalender bulanan multi-pilih: tanggal bulat, hari lampau nonaktif. */
function CalGrid({ cal, atCur, dates, today, onShift, onToggle }) {
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
          const past = key < today;
          const sel = dates.has(key);
          const isToday = key === today;
          return (
            <button key={key} type="button" disabled={past} onClick={() => onToggle(key)}
              className={'w-9 h-9 rounded-full text-[12.5px] flex items-center justify-center transition ' +
                (sel ? 'bg-sky-600 text-white font-extrabold shadow-sm'
                  : past ? 'text-slate-200 font-bold'
                    : isToday ? 'font-extrabold text-sky-700 ring-2 ring-sky-200'
                      : 'font-bold text-slate-700 hover:bg-slate-100')}>
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
  const vs = DB.load('vehicles', []).filter((v) => v.agencyId === agId && v.status === 'aktif');
  const [routeId, setRouteId] = useState(routes[0]?.id || '');
  const [vehicleId, setVehicleId] = useState(vs[0]?.id || '');
  const [hh, setHh] = useState('07');
  const [mm, setMm] = useState('00');
  const [dates, setDates] = useState(() => new Set());
  const [cal, setCal] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });

  const today = todayStr(0);
  const atCur = cal.y === Number(today.slice(0, 4)) && cal.m === Number(today.slice(5, 7)) - 1;
  const time = hh + ':' + mm;
  /* armada rute: milik agen sendiri + ditetapkan di rute tsb; rute tanpa daftar armada → semua armada agen */
  const assigned = routeById(routeId)?.vehicleIds || [];
  const availV = assigned.length ? vs.filter((v) => assigned.includes(v.id)) : vs;
  const vidOk = availV.some((v) => v.id === vehicleId) ? vehicleId : (availV[0]?.id || '');
  const veh = vehicleById(vidOk);
  const drvAuto = veh ? driverByName(agId, veh.drvName) : null;
  const backupName = veh && veh.hasBackup === 'Ya' ? (veh.backName || '') : '';
  const selSorted = [...dates].sort();
  const selLabel = selSorted.slice(0, 6).map(fmtShort).join(', ') + (selSorted.length > 6 ? ' +' + (selSorted.length - 6) + ' lagi' : '');
  const clashList = selSorted.map((d) => ({ d, s: schedConflict(d, time, vidOk, drvAuto ? drvAuto.id : '', veh ? veh.drvName : '') })).filter((x) => x.s);
  /* jam kembar: koridor sama + tanggal sama + jam sama, milik agen ini saja */
  const dupList = selSorted.map((d) => ({ d, s: corridorClash(d, time, routeId, agId) })).filter((x) => x.s && !clashList.some((c) => c.d === x.d));
  const skipped = (d) => clashList.some((x) => x.d === d) || dupList.some((x) => x.d === d);
  const okCount = selSorted.length - clashList.length - dupList.length;
  const finalPrice = priceForAgency(routeById(routeId), agId);

  const saveSched = () => {
    if (!selSorted.length) { toast('Pilih minimal 1 tanggal dulu', 'err'); return; }
    const r = routeById(routeId);
    if (!r) { toast('Pilih rute dulu', 'err'); return; }
    if (!(finalPrice > 0)) { toast('Rute belum punya harga — usulkan harga via halaman Rute', 'err'); return; }
    if (!vidOk) { toast('Belum ada armada tersedia di rute ini — tambah armada dulu', 'err'); return; }
    if (!okCount) { toast('Semua tanggal bentrok — tidak ada jadwal yang bisa disimpan', 'err'); return; }
    const ok = selSorted.filter((d) => !skipped(d));
    const arr = DB.load('schedules', []);
    ok.forEach((d) => {
      arr.push({ id: 'S-' + Math.random().toString(36).slice(2, 7).toUpperCase(), agencyId: agId, routeId: r.id, date: d, time, vehicleId: vidOk, driverId: drvAuto ? drvAuto.id : null, driverName: veh ? veh.drvName : '', backupName, price: finalPrice, status: 'open', tripStatus: 'scheduled', blockedSeats: [], createdAt: new Date().toISOString() });
    });
    DB.save('schedules', arr); refresh();
    audit('schedule_create', r.from + '→' + r.to + ' ' + time + ' • ' + ok.length + ' tanggal • ' + ok.slice(0, 6).join(', ') + (ok.length > 6 ? '…' : ''));
    closeModal();
    toast(ok.length + ' jadwal disimpan' + (clashList.length + dupList.length ? ' • ' + (clashList.length + dupList.length) + ' tanggal bentrok dilewati' : ''));
    refresh();
    if (onDone) onDone();
  };

  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[17px]">Tambah Jadwal</h3>

      <div className="mt-3">
        <label className="text-[12px] font-extrabold">JAM KEBERANGKATAN</label>
        <div className="mt-1.5 flex items-stretch gap-2.5">
          <div className="relative flex-1 flex items-center justify-center bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden">
            <div className="absolute inset-x-0 top-[72px] h-9 border-y-2 border-sky-100 bg-white/70 pointer-events-none z-0"></div>
            <div className="absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none z-20"></div>
            <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none z-20"></div>
            <Wheel items={HOURS} value={hh} onChange={setHh} />
            <div className="relative z-10 font-extrabold text-[20px] text-slate-300 pb-0.5">:</div>
            <Wheel items={MINS} value={mm} onChange={setMm} />
          </div>
          <div className="w-[104px] shrink-0 bg-slate-50 border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center">
            <div className="font-extrabold text-[20px] text-sky-600">{time}</div>
            <div className="text-[10px] font-extrabold text-slate-400 mt-0.5 flex items-center gap-1"><Icon name="move-vertical" className="w-3 h-3" />GESER</div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-[12px] font-extrabold">TANGGAL KEBERANGKATAN <span className="text-sky-600">• bisa pilih banyak</span></label>
        <CalGrid cal={cal} atCur={atCur} dates={dates} today={today}
          onShift={(d) => setCal((c) => shiftMonth(c, d))}
          onToggle={(key) => setDates((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })} />
        <div className="text-[11.5px] font-semibold text-slate-500 mt-1.5">{selSorted.length ? selSorted.length + ' tanggal dipilih: ' + selLabel : 'Belum ada tanggal dipilih — ketuk tanggal pada kalender.'}</div>
      </div>

      <div className="mt-4">
        <label className="text-[12px] font-extrabold">RUTE</label>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{routes.map((r) => <option key={r.id} value={r.id}>{r.from} → {r.to} • {fmtRp(priceForAgency(r, agId))}</option>)}</select>
        <div className="mt-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5">
          <div className="text-[15px] font-extrabold">{finalPrice > 0 ? fmtRp(finalPrice) : '— belum ada harga —'}</div>
          <div className="text-[11.5px] text-slate-500 font-medium mt-0.5">Harga otomatis dari rute • jasa agen {fmtRp(agencyById(agId)?.serviceFee ?? DEFAULT_SERVICE)}/kursi (ditentukan admin per agen).</div>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-[12px] font-extrabold">ARMADA <span className="text-sky-600">• dari armada rute ini</span></label>
        <select value={vidOk} onChange={(e) => setVehicleId(e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">{availV.map((v) => <option key={v.id} value={v.id}>{vehName(v)} • {v.plate}</option>)}</select>
        {!availV.length ? <div className="text-[12px] font-bold text-amber-700 bg-amber-50 border-2 border-amber-200 rounded-xl px-3 py-2 mt-1.5">Belum ada armada aktif untuk rute ini — tambah armada dulu di halaman Armada.</div>
        : !assigned.length ? <div className="text-[11.5px] text-slate-500 font-medium bg-slate-50 rounded-xl px-3 py-2 mt-1.5">Rute ini belum punya daftar armada — semua armada aktif Anda ditampilkan.</div>
        : <div className="text-[11.5px] text-slate-500 font-medium bg-slate-50 rounded-xl px-3 py-2 mt-1.5">{assigned.length} armada ditetapkan di rute ini.</div>}
        {veh ? (
          <div className="mt-2 bg-slate-50 rounded-2xl p-3">
            <div className="flex items-start gap-2">
              <Icon name="user" className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold text-slate-400">PENGEMUDI</div>
                <div className="text-[12.5px] font-extrabold">{veh.drvName || '—'}</div>
                <div className="text-[11px] text-slate-400 font-semibold">{veh.drvPhone || '-'} • {veh.drvSim || '-'}{veh.drvName && !drvAuto ? ' • belum terhubung ke daftar pengemudi' : ''}</div>
              </div>
            </div>
            <div className="flex items-start gap-2 mt-2">
              <Icon name="users" className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold text-slate-400">PENGGANTI</div>
                <div className="text-[12.5px] font-extrabold text-slate-600">{backupName || '—'}</div>
                {backupName ? <div className="text-[11px] text-slate-400 font-semibold">{veh.backPhone || '-'} • {veh.backSim || '-'}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {clashList.length ? (
        <div className="mt-3 bg-amber-50 border-2 border-amber-200 text-amber-700 rounded-xl p-3 text-[11.5px] font-bold">
          ⚠ {clashList.length} tanggal bentrok, akan dilewati: {clashList.slice(0, 3).map((x) => fmtShort(x.d) + ' (' + x.s.time + ')').join(', ')}{clashList.length > 3 ? ' +' + (clashList.length - 3) + ' lagi' : ''}
          <div className="text-[11px] font-medium text-amber-600 mt-0.5">Armada/pengemudi sudah terjadwal dalam jeda &lt; 4 jam di tanggal tersebut — jam:menit keberangkatan yang menentukan.</div>
        </div>
      ) : null}

      {dupList.length ? (
        <div className="mt-3 bg-amber-50 border-2 border-amber-200 text-amber-700 rounded-xl p-3 text-[11.5px] font-bold">
          ⚠ {dupList.length} tanggal dilewati: jam {time} sudah dipakai rute lain di koridor yang sama — {dupList.slice(0, 3).map((x) => fmtShort(x.d)).join(', ')}{dupList.length > 3 ? ' +' + (dupList.length - 3) + ' lagi' : ''}
          <div className="text-[11px] font-medium text-amber-600 mt-0.5">Jam keberangkatan harus berbeda tiap rute pada koridor (DARI→KE) yang sama di tanggal tersebut.</div>
        </div>
      ) : null}

      <button onClick={saveSched} className="mt-4 w-full bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">{!selSorted.length ? 'Simpan Jadwal' : okCount ? 'Simpan ' + okCount + ' Jadwal' : 'Semua Tanggal Bentrok'}</button>
    </div>
  );
}
