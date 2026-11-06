import { useRef, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { schedById, routeById, takenSeats, schedSeatCap, setScheduleTripStatus, areaNameMatches } from '@/lib/domain.js';
import { fmtClock } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';
import { MapPicker } from '@/components/MapPicker.jsx';

/* Tagging lokasi wajib pengemudi — syarat klik "Berangkat" (kabupaten/kota
   DARI) dan klik "Tiba di Tujuan" (kabupaten/kota KE). Modal tagging berpeta:
   pin Leaflet bisa digeser/iscari/diambil dari GPS bawaan ("Lokasi saya").
   Leaflet tetap dimuat dinamis oleh MapPicker — hanya saat modal dibuka. */

/** Cocokkan target rute dengan daftar penanda wilayah hasil reverse geocode. */
function matchTarget(target, j) {
  const a = j.address || {};
  const cands = [a.county, a.city, a.town, a.municipality, a.state_district, a.village, a.suburb, String(j.display_name || '')];
  /* Segmen alamat juga kandidat — nama kabupaten biasanya jadi segmen ujung. */
  if (j.display_name) cands.push(...String(j.display_name).split(','));
  return areaNameMatches(target, cands) ? (a.county || a.city || a.town || a.municipality || a.state_district || a.village || target) : null;
}

/** Panel tagging berpeta: pin peta → alamat Nominatim → cek daerah. Tag utuh
 *  (koordinat, alamat, daerah, jam) baru dipegang bila daerahnya cocok; tombol
 *  konfirmasi di modal mengharuskan tag ini ada. */
export function GeoTagPanel({ target, tag, setTag }) {
  const [phase, setPhase] = useState('idle'); // idle | busy | err
  const [msg, setMsg] = useState('');
  const rvTimer = useRef(null);
  const rvSeq = useRef(0);
  const ok = !!(tag && tag.ok);

  const inspect = (lat, lng) => {
    const seq = ++rvSeq.current;
    setPhase('busy'); setMsg('Membaca nama daerah…');
    fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=id&lat=' + lat + '&lon=' + lng)
      .then((r) => r.json())
      .then((j) => {
        if (seq !== rvSeq.current) return;
        const addr = String(j.display_name || '');
        const area = matchTarget(target, j);
        if (area) {
          setTag({
            lat: Math.round(lat * 1e6) / 1e6,
            lng: Math.round(lng * 1e6) / 1e6,
            acc: 0, /* pin peta: akurasi GPS tidak diketahui — biarkan 0 */
            addr: addr.slice(0, 200),
            area: String(area).slice(0, 80),
            ok: true,
            at: new Date().toISOString()
          });
          setPhase('idle'); setMsg('');
        } else {
          const saw = addr.split(',').slice(-4).join(',').trim() || 'lokasi tak terbaca';
          setPhase('err');
          setMsg('Pin terbaca di "' + saw.slice(0, 120) + '" — tag harus di daerah ' + target + '. Geser pin ke daerah ' + target + ' atau tekan Lokasi saya.');
        }
      })
      .catch(() => { if (seq === rvSeq.current) { setPhase('err'); setMsg('Alamat tak terbaca — periksa sinyal internet, lalu geser pin lagi.'); } });
  };

  const onPin = (val) => {
    const m = /^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/.exec(String(val || '').trim());
    if (!m) return;
    const lat = Number(m[1]), lng = Number(m[3]);
    clearTimeout(rvTimer.current);
    rvTimer.current = setTimeout(() => inspect(lat, lng), 500);
  };

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge bg-sky-100 text-sky-700 !text-[11px] px-2 py-0.5"><Icon name="map-pin" className="w-3.5 h-3.5" /> daerah tag: {target}</span>
        {ok ? <span className="badge bg-green-100 text-green-700 !text-[11px] px-2 py-0.5">Tercocok</span> : <span className="text-[11px] font-extrabold text-amber-600">wajib sebelum lanjut</span>}
      </div>
      <MapPicker
        value={ok ? tag.lat + ', ' + tag.lng : ''}
        onChange={onPin}
      />
      {phase === 'busy' ? <div className="mt-1.5 text-[11.5px] font-bold text-sky-700">{msg}</div> : null}
      {phase === 'err' ? <div className="mt-1.5 text-[11.5px] font-bold text-red-600">{msg}</div> : null}
      {ok ? (
        <div className="mt-1.5 rounded-2xl border-2 border-green-300 bg-green-50 p-2.5 text-green-900 text-[11.5px] font-semibold leading-snug">
          ✅ <b>{tag.area}</b> — {tag.addr || 'alamat tak terbaca'}<br />
          <span className="font-mono text-[10.5px]">{tag.lat}, {tag.lng}</span> • {fmtClock(new Date(tag.at))}
          <button type="button" onClick={() => { setTag(null); setPhase('idle'); setMsg(''); }} className="ml-2 underline text-slate-400 hover:text-slate-600 text-[11px] font-extrabold">pin ulang</button>
        </div>
      ) : null}
      {!ok ? <div className="mt-1 text-[10.5px] text-slate-400 font-medium">Taruh pin dengan sentuh/geser, tombol "Lokasi saya", atau cari nama tempat di kotak pencarian.</div> : null}
    </div>
  );
}

/** Tiba di Tujuan — syarat tagging di kabupaten/kota KE sebelum status ditukar. */
export function ArriveGeoModal({ sid }) {
  const { closeModal, toast, refresh, user } = useApp();
  const s = schedById(sid);
  const [tag, setTag] = useState(null);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const cap = schedSeatCap(sid);
  const confirm = () => {
    if (!setScheduleTripStatus(sid, 'arrived', { by: user?.name || user?.email || 'pengemudi', geo: tag })) {
      toast('Status perjalanan tidak bisa diubah.', 'err');
      return;
    }
    refresh();
    toast('Perjalanan selesai. Booking → Selesai.');
    closeModal();
  };
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="map-pin" className="w-5 h-5 text-sky-600" />Tiba di {r?.to || 'tujuan'}?</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="text-[12.5px] text-slate-500 font-medium mt-1">{r?.from} → {r?.to} • Penumpang {takenSeats(sid).booked.length}/{cap}</div>
      <div className="mt-3 rounded-2xl border p-3 text-[12px] font-semibold bg-sky-50 border-sky-200 text-sky-900">
        Setelah tiba: <b>dana dilepas ke agen</b>, booking lunas jadi <b>Selesai</b>, dan penumpang diminta rating. Tagging di daerah <b>{r?.to || 'kota tujuan'}</b> menjadi bukti.
      </div>
      <div className="mt-3">
        <GeoTagPanel target={r?.to || 'kota tujuan'} tag={tag} setTag={setTag} />
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={closeModal} className="flex-1 bg-slate-100 text-slate-600 font-extrabold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={confirm} disabled={!tag || !tag.ok} className="flex-[2] bg-blue-600 text-white font-extrabold text-[13px] py-2.5 rounded-xl active:scale-[.98] transition disabled:opacity-50 disabled:cursor-not-allowed">Konfirmasi Tiba</button>
      </div>
      <div className="mt-2 text-center text-[11px] text-slate-400">Tombol aktif setelah pin di daerah {r?.to || 'tujuan'} tercocok.</div>
    </div>
  );
}

/** Pengakuan "Tandai Tiba" pada jadwal lewat yang tak tercatat berangkat —
 *  alasan wajib: satu klik ini melepas dana dan menutup jalur refund otomatis
 *  admin, jadi harus berjejak kuat. */
export function AckArriveModal({ sid }) {
  const { closeModal, toast, refresh, user } = useApp();
  const s = schedById(sid);
  const [why, setWhy] = useState('');
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const r = routeById(s.routeId);
  const submit = () => {
    const t = why.trim();
    if (t.length < 10) { toast('Alasan wajib diisi minimal 10 karakter.', 'err'); return; }
    if (!setScheduleTripStatus(sid, 'arrived', { reason: t, by: user?.name || user?.email || 'pengemudi' })) {
      toast('Status perjalanan tidak bisa diubah.', 'err');
      return;
    }
    refresh();
    toast('Perjalanan ditandai tiba.');
    closeModal();
  };
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="triangle-alert" className="w-5 h-5 text-red-500" />Perjalanan Tidak Tercatat Berangkat</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="mt-3 rounded-2xl border-2 p-3 text-[12px] font-semibold bg-red-50 border-red-200 text-red-800 leading-snug">
        <b>{r?.from} → {r?.to}</b><br />
        Tidak ada catatan berangkat untuk jadwal ini. Menandai <b>Tiba</b> artinya:<br />
        ① uang tiket dianggap sah dan dilepas,<br />
        ② admin tidak bisa memproses refund otomatis lagi.<br />
        Jika perjalanan benar-benar terjadi, tulis jelas kapan itu terjadi dan mengapa penandainya terlewat.
      </div>
      <label className="block mt-3">
        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Alasan pengakuan (minimal 10 karakter)</span>
        <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} placeholder="Contoh: perjalanan benar terjadi pukul 10:15, saya lupa klik berangkat karena sinyal" className="mt-1.5 w-full text-[13px] border-2 border-slate-200 rounded-2xl px-3 py-2.5 focus-ring" />
      </label>
      <div className="mt-4 flex gap-2">
        <button onClick={closeModal} className="flex-1 bg-slate-100 text-slate-600 font-extrabold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={submit} className="flex-[2] bg-blue-600 text-white font-extrabold text-[13px] py-2.5 rounded-xl active:scale-[.98] transition">Tandai Tiba</button>
      </div>
    </div>
  );
}
