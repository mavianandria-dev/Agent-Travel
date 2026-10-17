/* Peta pemilih titik jemput (Leaflet + tile OpenStreetMap).
   Leaflet dimuat dinamis saat peta benar-benar tampil — bundle awal tetap ringan
   dan aman dirender di luar browser (SSR/smoke).
   Props:
   - value      : string "lat, lng" (format yang sama dengan validCoords)
   - onChange   : (value) => void — dipanggil tiap pin dipasang/digeser
   - onAddress  : (text, force) => void — alamat hasil reverse-geocode Nominatim
   - center     : [lat, lng] opsional — titik awal peta (mis. kota asal rute) */
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { useApp } from '@/store/AppContext.jsx';
import { Icon } from '@/components/ui.jsx';

const DEF_CENTER = [5.0, 96.0];
const PIN_HTML = '<div style="transform:translate(-17px,-34px)"><svg width="34" height="34" viewBox="0 0 24 24" fill="#0284c7" stroke="#ffffff" stroke-width="1.2" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));display:block"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg></div>';

const parseCoords = (s) => {
  const m = /^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/.exec((s || '').trim());
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[3]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
};
const fmtCoords = (lat, lng) => lat.toFixed(6) + ', ' + lng.toFixed(6);

export function MapPicker({ value, onChange, onAddress, center }) {
  const { toast } = useApp();
  const boxRef = useRef(null);
  const LRef = useRef(null);
  const apiRef = useRef(null);
  const markerRef = useRef(null);
  const revTimer = useRef(null);
  const revSeq = useRef(0);
  const qTimer = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { coords: parseCoords(value), center };
  const propsRef = useRef({});
  propsRef.current = { onChange, onAddress, toast };
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [retry, setRetry] = useState(0);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  /* Reverse-geocode Nominatim (debounce 700ms). force=true → timpa alamat walau sudah terisi. */
  const queueReverse = (lat, lng, force) => {
    clearTimeout(revTimer.current);
    const seq = ++revSeq.current;
    revTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=id&lat=' + lat + '&lon=' + lng);
        const j = await res.json();
        if (seq !== revSeq.current) return;
        const txt = j && j.display_name;
        if (txt && propsRef.current.onAddress) propsRef.current.onAddress(txt, force);
      } catch { /* alamat opsional — abaikan bila gagal/offline */ }
    }, 700);
  };

  /* Toast via provider (dipanggil dari handler, bukan saat render). */
  const say = (msg, kind) => { const fn = propsRef.current.toast; if (fn) fn(msg, kind); };

  /* Muat leaflet secara dinamis (hanya saat peta dipakai). */
  useEffect(() => {
    let dead = false;
    setStatus('loading');
    (async () => {
      try {
        const mod = await import('leaflet');
        if (dead) return;
        LRef.current = mod.default;
        setStatus('ready');
      } catch {
        if (!dead) setStatus('error');
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  /* Inisialisasi peta + pin saat leaflet siap. */
  useEffect(() => {
    if (status !== 'ready' || !boxRef.current || apiRef.current) return;
    const L = LRef.current;
    const cur = stateRef.current;
    const hasCenter = Array.isArray(cur.center) && cur.center.length === 2;
    const map = L.map(boxRef.current, { center: cur.coords || (hasCenter ? cur.center : DEF_CENTER), zoom: cur.coords ? 15 : (hasCenter ? 12 : 8) });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    const pin = L.divIcon({ className: '', html: PIN_HTML, iconSize: [0, 0] });
    const report = (lat, lng) => {
      if (propsRef.current.onChange) propsRef.current.onChange(fmtCoords(lat, lng));
      queueReverse(lat, lng, false);
    };
    const sync = (c) => {
      if (!c) {
        if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
        return;
      }
      if (!markerRef.current) {
        markerRef.current = L.marker(c, { draggable: true, icon: pin }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current && markerRef.current.getLatLng();
          if (p) report(p.lat, p.lng);
        });
      } else markerRef.current.setLatLng(c);
    };
    const place = (lat, lng, focus) => {
      sync([lat, lng]);
      if (focus) map.setView([lat, lng], Math.max(map.getZoom() || 13, 15));
      report(lat, lng);
    };
    map.on('click', (e) => place(e.latlng.lat, e.latlng.lng, false));
    apiRef.current = {
      place,
      sync,
      latlng: () => {
        const p = markerRef.current && markerRef.current.getLatLng();
        return p ? [p.lat, p.lng] : null;
      },
    };
    if (cur.coords) sync(cur.coords);
    const t = setTimeout(() => map.invalidateSize(), 60);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      map.remove();
      markerRef.current = null;
      apiRef.current = null;
      revSeq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /* Sinkron bila value berubah dari luar (mis. form di-reset). */
  useEffect(() => {
    if (status !== 'ready' || !apiRef.current) return;
    apiRef.current.sync(parseCoords(value));
  }, [value, status]);

  /* Bersihkan timer saat unmount. */
  useEffect(() => () => {
    clearTimeout(revTimer.current);
    clearTimeout(qTimer.current);
    revSeq.current += 1;
  }, []);

  const runSearch = (term) => {
    const t = term.trim();
    if (t.length < 4) { setResults([]); setOpen(false); return; }
    setSearching(true);
    setOpen(true);
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=id&countrycodes=id&q=' + encodeURIComponent(t))
      .then((r) => r.json())
      .then((j) => { setResults(Array.isArray(j) ? j : []); setOpen(true); })
      .catch(() => { setResults([]); setOpen(true); })
      .finally(() => setSearching(false));
  };
  const onQ = (v) => {
    setQ(v);
    clearTimeout(qTimer.current);
    if (v.trim().length >= 4) qTimer.current = setTimeout(() => runSearch(v), 600);
    else { setResults([]); setOpen(false); }
  };
  const pickResult = (r) => {
    const lat = Number(r.lat), lng = Number(r.lon);
    if (!apiRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    apiRef.current.place(lat, lng, true);
    if (propsRef.current.onAddress && r.display_name) propsRef.current.onAddress(r.display_name, false);
    setQ(r.name || String(r.display_name || '').split(',')[0]);
    setOpen(false);
    setResults([]);
  };
  const myLocation = () => {
    if (!apiRef.current) return;
    if (!navigator.geolocation) { say('Perangkat tidak mendukung GPS', 'err'); return; }
    say('Mencari lokasi…', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (apiRef.current) apiRef.current.place(pos.coords.latitude, pos.coords.longitude, true); },
      () => { say('Gagal ambil lokasi — izin/GPS tidak aktif', 'err'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const forceAddress = () => {
    const p = apiRef.current && apiRef.current.latlng ? apiRef.current.latlng() : null;
    if (!p) { say('Taruh pin di peta dulu', 'warn'); return; }
    queueReverse(p[0], p[1], true);
  };

  const cur = parseCoords(value);
  return (
    <div className="relative z-0">
      {status === 'ready' ? (
        <div className="relative">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-[13px] text-slate-400 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qTimer.current); runSearch(q); } }}
            placeholder="Cari jalan / tempat / gampong…"
            className="w-full text-[13px] font-semibold bg-white border-2 border-slate-200 rounded-xl pl-9 pr-3 py-2.5 focus-ring"
          />
          {open ? (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-56 overflow-auto">
              {searching ? <div className="px-3 py-2.5 text-[12px] font-bold text-slate-400">Mencari…</div> : null}
              {!searching ? results.map((r) => (
                <button key={r.place_id} type="button" onClick={() => pickResult(r)} className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b border-slate-100 last:border-0">
                  <div className="text-[12.5px] font-extrabold">{r.name || String(r.display_name || '').split(',')[0]}</div>
                  <div className="text-[11px] text-slate-400 font-semibold leading-snug">{r.display_name}</div>
                </button>
              )) : null}
              {!searching && !results.length ? <div className="px-3 py-2.5 text-[12px] font-bold text-slate-400">Tidak ada hasil — coba kata lain.</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {status !== 'ready' ? (
        <div className="mt-2 h-[260px] rounded-2xl border-2 border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 font-bold text-[12.5px] gap-2">
          {status === 'error' ? (
            <>
              <Icon name="circle-alert" className="w-6 h-6 text-amber-500" />
              Peta tidak bisa dimuat — periksa internet.
              <button type="button" onClick={() => setRetry((r) => r + 1)} className="bg-[#0b2447] text-white text-[11.5px] font-extrabold px-3.5 py-2 rounded-lg">Coba lagi</button>
            </>
          ) : (
            <>
              <Icon name="timer" className="w-6 h-6 animate-pulse" />
              Memuat peta…
            </>
          )}
        </div>
      ) : null}
      <div ref={boxRef} className={(status === 'ready' ? 'block' : 'hidden') + ' relative z-0 mt-2 h-[260px] rounded-2xl border-2 border-slate-200 overflow-hidden bg-slate-50'}></div>
      {status === 'ready' ? (
        <>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button type="button" onClick={myLocation} className="flex items-center gap-1.5 bg-sky-100 text-sky-700 text-[11.5px] font-extrabold px-3 py-2 rounded-lg"><Icon name="navigation" className="w-3.5 h-3.5" />Lokasi saya</button>
            <button type="button" onClick={forceAddress} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 text-[11.5px] font-extrabold px-3 py-2 rounded-lg"><Icon name="map-pin" className="w-3.5 h-3.5" />Isi alamat dari pin</button>
            <div className="flex-1"></div>
            {cur ? <a href={'https://www.google.com/maps?q=' + cur[0] + ',' + cur[1]} target="_blank" rel="noreferrer" className="text-[11.5px] font-extrabold text-sky-700 underline">Google Maps</a> : null}
          </div>
          <div className="mt-1.5 text-[11px] font-bold text-slate-400">Pin: <span className="font-mono text-slate-600">{value || 'belum dipasang'}</span></div>
        </>
      ) : null}
    </div>
  );
}
