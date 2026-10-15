import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { setSession, seatsLeft, audit } from '@/lib/domain.js';
import { fmtRp, todayStr } from '@/lib/utils.js';
import { Icon } from '@/components/ui.jsx';

export default function Home() {
  const { go, toast, refresh, setBw, bw, tick } = useApp();
  void tick;

  const routes = DB.load('routes', []).filter((r) => r.active);
  const reviews = DB.load('reviews', []);
  const ags = DB.load('agencies', []).filter((a) => a.status === 'active');
  const scheds = DB.load('schedules', []).filter((s) => s.date >= todayStr(0));

  const quickBook = (routeId) => {
    setBw({ ...bw, step: 1, routeId, date: todayStr(1), scheduleId: null, seats: [], passengers: [], pickup: '', voucher: '', discount: 0 });
    go('search');
  };

  const demoLogin = (email, pass) => {
    const u = DB.load('users', []).find((x) => x.email === email && x.pass === pass);
    if (!u) return;
    setSession(u);
    audit('login', u.email + ' (demo)');
    refresh();
    if (u.role === 'agen') go('agen');
    else if (u.role === 'pengemudi') go('driver');
    else if (u.role === 'superadmin') go('admin');
    else go('home');
    toast('Masuk sebagai ' + u.role + ' — ' + u.name);
  };

  const demos = [
    ['user@demo.com', 'user123', 'Pelanggan', 'ticket'],
    ['agen@barakah.com', 'agen123', 'Travel Agen', 'building-2'],
    ['pengemudi@barakah.com', 'pengemudi123', 'Pengemudi', 'car-front'],
    ['admin@transaceh.id', 'admin123', 'Super Admin', 'shield-check'],
  ];

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="anim bg-white rounded-3xl shadow-card p-5">
          <div className="flex items-center justify-between"><h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="route" className="w-5 h-5 text-sky-600" />Rute Populer</h2>
            <button onClick={() => go('search')} className="text-[12px] font-bold text-sky-600 hover:underline">Lihat semua</button></div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            {routes.map((r, i) => {
              const opts = scheds.filter((s) => s.routeId === r.id);
              const minP = opts.length ? Math.min(...opts.map((s) => s.price)) : r.basePrice;
              const left = opts.reduce((a, s) => a + seatsLeft(s.id), 0);
              return (
                <div key={r.id} onClick={() => quickBook(r.id)} className={'card-hover border-2 rounded-2xl p-4 cursor-pointer ' + (i === 0 ? 'border-sky-500 bg-sky-50/50' : 'border-slate-100 bg-white')}>
                  <div className="flex items-start justify-between"><div className="font-extrabold text-[15px]">{r.from} <span className="text-sky-500">→</span> {r.to}</div>{i === 0 ? <span className="badge bg-red-500 text-white">TERLARIS</span> : null}</div>
                  <div className="text-[12px] text-slate-500 font-medium mt-0.5 flex items-center gap-2"><Icon name="clock" className="w-3.5 h-3.5" />{r.duration} • {r.distance}</div>
                  <div className="flex items-center justify-between mt-3"><div><div className="text-[11px] text-slate-400 font-bold">MULAI DARI</div><div className="font-extrabold text-sky-700 text-[17px]">{fmtRp(minP)}</div></div>
                    <span className={'badge ' + (left > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{left} kursi tersisa</span></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="anim anim-1 bg-white rounded-3xl shadow-card p-5">
          <h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="star" className="w-5 h-5 text-amber-500" />Ulasan Penumpang</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">{reviews.slice(0, 4).map((rv) => (
            <div key={rv.id || rv.user} className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100"><div className="flex items-center gap-1 text-amber-500">{'★'.repeat(rv.rating)}<span className="text-[11px] text-slate-400 font-bold ml-1">{rv.trip || ''}</span></div>
              <p className="text-[13px] font-medium mt-1.5 leading-snug">&quot;{rv.text}&quot;</p><div className="text-[12px] font-bold mt-2">— {rv.user}</div></div>
          ))}</div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="anim anim-1 bg-[#0b2447] text-white rounded-3xl p-5 shadow-card">
          <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="user-round" className="w-5 h-5 text-sky-300" />Akun Demo — 1 Klik Masuk</h3>
          <p className="text-[12px] text-slate-300 font-medium mt-1">Jelajahi semua 4 level user tanpa daftar.</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {demos.map((d) => (
              <button key={d[0]} onClick={() => demoLogin(d[0], d[1])} className="bg-white/10 hover:bg-sky-500 rounded-2xl p-3 text-left transition group"><Icon name={d[3]} className="w-5 h-5 text-sky-300 group-hover:text-white" /><div className="font-extrabold text-[13px] mt-1">{d[2]}</div><div className="text-[10px] text-slate-300 font-mono">{d[0]}</div></button>
            ))}
          </div>
        </div>
        <div className="anim anim-2 bg-white rounded-3xl shadow-card p-5">
          <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="building-2" className="w-5 h-5 text-sky-600" />Travel Partner</h3>
          {ags.map((a) => (
            <div key={a.id} className="flex items-center gap-3 mt-3 p-2.5 rounded-2xl hover:bg-slate-50 transition"><div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white font-extrabold text-lg shrink-0">{(a.name || '?')[0]}</div>
              <div className="flex-1 min-w-0"><div className="font-extrabold text-[13.5px] truncate">{a.name}</div><div className="text-[12px] text-slate-500 font-medium flex items-center gap-1"><Icon name="star" className="w-3 h-3 text-amber-500 fill-amber-400" />{a.rating} • {a.trips}+ trip</div></div>
              <span className="badge bg-green-100 text-green-700">Aktif</span></div>
          ))}
        </div>
        <div className="anim anim-3 bg-gradient-to-br from-sky-500 to-blue-700 text-white rounded-3xl p-5 shadow-card">
          <div className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="badge-percent" className="w-5 h-5" />Punya kode promo?</div>
          <div className="text-[12.5px] opacity-90 font-medium mt-1">HEMAT20 — diskon 20% • CALANG50 — potong Rp15rb</div>
          <button onClick={() => go('search')} className="mt-3 w-full bg-white text-sky-700 font-extrabold text-[13px] py-2.5 rounded-xl hover:bg-sky-50 transition">Pakai Sekarang</button>
        </div>
      </div>
    </div>
  );
}
