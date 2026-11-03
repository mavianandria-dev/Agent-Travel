import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, audit } from '@/lib/domain.js';
import { uid, todayStr } from '@/lib/utils.js';
import { IS_SHEETS } from '@/lib/runtime.js';
import { pullSnapshotSoft } from '@/lib/remote.js';
import { Icon } from '@/components/ui.jsx';

/* Ganjalan pelanggan (z-60, di atas host modal z-50): syarat ② alur
   pencairan otomatis. Saat pengemudi menandai "Tiba", tiap pelanggan
   dengan tiket lunas di jadwal itu mendapat layar penuh — rating + ulasan
   + tombol "Rencanakan Keberangkatan Lagi" (menuju beranda). Ganjalan
   menutup sendiri di menit ke-5 — jendela yang sama dengan pelepasan jasa
   agen. Mengisi ulasan lebih awal TIDAK mempercepat pencairan; satu
   tempo tunggal menit ke-5 untuk semua. Flag per jadwal+akun ada di
   localStorage at_gate_<jadwal>_<email>. */

const GATE_MS = 5 * 60 * 1000;

function gateTarget(user) {
  if (!user || user.role !== 'pelanggan') return null;
  const email = String(user.email || '').toLowerCase();
  if (!email) return null;
  const bookings = DB.load('bookings', []);
  const schedules = DB.load('schedules', []);
  const now = Date.now();
  let best = null;
  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    if (!b || b.source !== 'pelanggan') continue;
    if (b.status !== 'paid' && b.status !== 'done') continue;
    if (String(b.userEmail || '').toLowerCase() !== email) continue;
    const s = schedules.find((x) => x.id === b.scheduleId);
    if (!s || s.tripStatus !== 'arrived') continue;
    const t0 = Date.parse(s.arrivedAt || '');
    if (isNaN(t0)) continue;
    if (t0 + GATE_MS <= now) continue; /* jendela lewat — tak muncul lagi */
    const flag = 'at_gate_' + s.id + '_' + email.replace(/[^a-z0-9]/g, '_');
    try { if (localStorage.getItem(flag)) continue; } catch { /* abaikan */ }
    if (!best || t0 < best.t0) best = { b, s, t0, flag };
  }
  return best;
}

export default function GateModal() {
  const { user, go, refresh, toast, tick } = useApp();
  void tick; /* paksa gejala render ulang saat data segar tarik snapshot */
  const [rate, setRate] = useState(5);
  const [rateText, setRateText] = useState('');
  /* Sisa jendela hanya dihitung di efek/interval (bukan saat render). */
  const [remain, setRemain] = useState(null);

  const target = gateTarget(user);

  useEffect(() => {
    if (!target) return undefined; /* ganjalan lenyap sendiri saat jendela lewat */
    const iv = setInterval(() => {
      const rem = target.t0 + GATE_MS - Date.now();
      if (rem <= 0) { setRemain(null); go('home'); } /* tenggat → beranda, tanpa toast */
      else setRemain(rem);
    }, 1000);
    return () => clearInterval(iv);
  }, [target, go]);

  /* Mode Sheets: tarikan lembut supaya arrivedAt segar (ganjalan tidak
     telat lebih dari detak pullSnapshotSoft ~8 dtk). */
  useEffect(() => {
    if (!IS_SHEETS || !target) return undefined;
    const iv = setInterval(() => {
      pullSnapshotSoft().then((pulled) => { if (pulled) refresh(); });
    }, 20000);
    return () => clearInterval(iv);
  }, [target, refresh]);

  /* Kunci gulir halaman di belakang ganjalan — dikelola sendiri, tanpa
     menyentuh state modal (ganjalan lebih tinggi dari host modal). */
  useEffect(() => {
    if (target) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [target]);

  if (!target || remain === null) return null;
  const { b, s, flag } = target;
  const r = routeById(s.routeId);
  const pax = (b.passengers || [])[0] || {};
  const mm = String(Math.floor(Math.max(0, remain) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((Math.max(0, remain) % 60000) / 1000)).padStart(2, '0');

  const simpanDanHome = () => {
    /* Pola ulasan persis TicketDetail: rating ke booking + unshift reviews. */
    const arr = DB.load('bookings', []);
    const tgt = arr.find((x) => x.id === b.id);
    if (tgt) { tgt.rating = rate; DB.save('bookings', arr); }
    const rv = DB.load('reviews', []);
    rv.unshift({ id: uid('RV'), agencyId: s.agencyId, user: user.name || pax.name || 'Penumpang', rating: rate, text: rateText || 'Perjalanan menyenangkan!', date: todayStr(0), trip: r ? (r.from + ' → ' + r.to) : (b.code || '') });
    DB.save('reviews', rv);
    try { localStorage.setItem(flag, '1'); } catch { /* abaikan */ }
    audit('review', b.code + ' ★' + rate + ' (ganjalan)');
    toast('Ulasan terkirim. Terima kasih!');
    refresh();
    go('home');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-center justify-center p-4">
      <div className="bg-white w-full sm:max-w-md rounded-3xl shadow-pop p-5 sm:p-6 anim" style={{ animation: 'pop .3s both' }}>
        <div className="flex items-center gap-2">
          <Icon name="star" className="w-6 h-6 text-amber-500" />
          <h3 className="font-extrabold text-[17px]">Perjalananmu selesai — ulas ya!</h3>
          <div className="flex-1"></div>
          <span className="text-[11px] font-extrabold text-slate-400 tabular-nums">{mm}:{ss}</span>
        </div>
        <p className="text-[13px] text-slate-500 font-medium mt-1">Tiket {b.code} • {r ? `${r.from} → ${r.to}` : '-'} • {s.date} {s.time}. Ceritakan pengalamanmu, lalu rencanakan keberangkatan lagi.</p>

        <div className="flex gap-1.5 mt-4 justify-center" role="radiogroup" aria-label="Penilaian">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRate(n)}
              className={'text-3xl leading-none transition-transform ' + (n <= rate ? 'text-amber-400 scale-110' : 'text-slate-200 scale-100')}
              aria-label={n + ' bintang'}>★</button>
          ))}
        </div>
        <div className="text-center text-[11.5px] font-bold text-slate-400">{['Mengecewakan', 'Kurang', 'Cukup', 'Puas', 'Luar biasa'][rate - 1]}</div>

        <textarea rows={2} value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="Ceritakan pengalamanmu..." className="w-full mt-3 text-[13px] bg-slate-50 border border-slate-200 rounded-xl p-3 focus-ring"></textarea>

        <button onClick={simpanDanHome} className="w-full mt-3 bg-green-500 text-white text-[14px] font-extrabold py-3 rounded-2xl">Rencanakan Keberangkatan Lagi</button>
        <p className="text-[11px] text-slate-400 font-medium text-center mt-2">Jendela ini menunggumu hingga 5 menit setelah tiba, lalu menutup sendiri.</p>
      </div>
    </div>
  );
}
