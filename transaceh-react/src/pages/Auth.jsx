import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { setSession, agencyById, audit, notify, schedById, routeById } from '@/lib/domain.js';
import { uid } from '@/lib/utils.js';
import { Icon, fmtDate } from '@/components/ui.jsx';
import { peekCheckoutDraft, resumeCheckout } from '@/lib/checkoutDraft.js';

/* Setelah auth berhasil: kalau ada draft checkout dari tamu, langsung
   lanjutkan pesanannya ke ringkasan pembayaran. Selain itu, arahkan sesuai role.
   Return true bila pesanan dilanjutkan. */
function landAfterAuth(u, { go, setBw, toast }) {
  if (u.role === 'pelanggan') {
    const { draft, notices } = resumeCheckout();
    if (draft) {
      setBw(draft);
      go('search');
      if (notices.length) toast(notices[0], 'warn');
      else toast('Lanjutkan pesananmu — cek ringkasan lalu bayar.', 'info');
      return true;
    }
  }
  if (u.role === 'agen') go('agen');
  else if (u.role === 'pengemudi') go('driver');
  else if (u.role === 'superadmin') go('admin');
  else go('home');
  return false;
}

/* Banner di halaman masuk/daftar: meyakinkan pengguna bahwa pesanan yang
   sudah diisi tidak hilang selama ia masuk / mendaftar. */
function ResumeBanner() {
  const bw = peekCheckoutDraft();
  if (!bw) return null;
  const r = routeById(bw.routeId);
  const s = schedById(bw.scheduleId);
  return (
    <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl p-3.5 flex gap-2.5">
      <Icon name="receipt-text" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-[12.5px] font-semibold text-amber-900 leading-snug">
        <div className="font-extrabold text-[13.5px]">Pesananmu menunggu dilanjutkan</div>
        {r ? <div>{r.from} → {r.to}{bw.date ? ' • ' + fmtDate(bw.date) : ''}{s && s.time ? ' • ' + s.time + ' WIB' : ''} • {(bw.seats || []).length} kursi</div> : null}
        <div className="text-amber-700">Masuk atau daftar dulu — pesanan tetap tersimpan dan kamu langsung diarahkan ke pembayaran.</div>
      </div>
    </div>
  );
}

function useDemoLogin() {
  const { toast, refresh, go, setBw } = useApp();
  return (email, pass) => {
    const u = DB.load('users', []).find((x) => x.email === email && x.pass === pass);
    if (!u) return;
    setSession(u);
    audit('login', u.email + ' (demo)');
    refresh();
    if (!landAfterAuth(u, { go, setBw, toast })) toast('Masuk sebagai ' + u.role + ' — ' + u.name);
  };
}

export function Login() {
  const { go, toast, refresh, setBw } = useApp();
  const demoLogin = useDemoLogin();
  const [email, setEmail] = useState('user@demo.com');
  const [pass, setPass] = useState('user123');
  const [show, setShow] = useState(false);

  const doLogin = () => {
    const e = email.trim().toLowerCase();
    const u = DB.load('users', []).find((x) => x.email.toLowerCase() === e && x.pass === pass);
    if (!u) { toast('Email / password salah', 'err'); return; }
    if (u.role === 'pengemudi' && (u.status || 'active') !== 'active') { toast('Akun pengemudi dinonaktifkan — hubungi travel Anda', 'warn'); return; }
    if (u.role === 'agen') {
      const agx = u.agencyId ? agencyById(u.agencyId) : null;
      if ((u.status || 'active') === 'pending' || !agx || agx.status !== 'active') { toast('Akun agen menunggu persetujuan super admin', 'warn'); return; }
    }
    setSession(u);
    audit('login', u.email);
    refresh();
    if (!landAfterAuth(u, { go, setBw, toast })) toast('Halo, ' + u.name + '! Masuk sebagai ' + u.role);
  };

  return (
    <div className="anim max-w-md mx-auto bg-white rounded-3xl shadow-card p-7 mt-4">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center mx-auto"><Icon name="car-front" className="w-7 h-7 text-white" /></div>
      <h2 className="font-extrabold text-[22px] text-center mt-3 tracking-tight">Selamat datang kembali</h2><p className="text-[13px] text-slate-500 text-center font-medium">Masuk untuk booking &amp; kelola travel</p>
      <ResumeBanner />
      <label className="text-[12px] font-extrabold mt-4 block">EMAIL</label><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-1 w-full text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" />
      <label className="text-[12px] font-extrabold mt-3 block">PASSWORD</label><div className="relative mt-1"><input value={pass} onChange={(e) => setPass(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" className="w-full text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 pr-12 focus-ring" /><button type="button" onClick={() => setShow(!show)} aria-label="Tampilkan password" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600 p-1"><Icon name={show ? 'eye-off' : 'eye'} className="w-5 h-5 pointer-events-none" /></button></div>
      <button onClick={doLogin} className="mt-4 w-full bg-[#0b2447] hover:bg-sky-600 text-white font-extrabold py-3.5 rounded-2xl transition">Masuk</button>
      <div className="text-[12.5px] text-center mt-3 font-semibold text-slate-500">Belum punya akun? <button onClick={() => go('register')} className="text-sky-600 font-extrabold">Daftar gratis</button></div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button onClick={() => demoLogin('agen@barakah.com', 'agen123')} className="bg-sky-50 text-sky-700 text-[11.5px] font-extrabold py-2 rounded-xl">Demo Agen</button>
        <button onClick={() => demoLogin('admin@transaceh.id', 'admin123')} className="bg-violet-50 text-violet-700 text-[11.5px] font-extrabold py-2 rounded-xl">Demo Admin</button>
      </div></div>
  );
}

export function Register() {
  const { go, toast, refresh, setBw } = useApp();
  const demoLogin = useDemoLogin();
  const [rgRole, setRgRole] = useState('pelanggan');
  const [n, setN] = useState('');
  const [e, setE] = useState('');
  const [ph, setPh] = useState('');
  const [p, setP] = useState('');
  const [show, setShow] = useState(false);
  const [agN, setAgN] = useState('');
  const [agA, setAgA] = useState('');

  const doRegister = () => {
    const nn = n.trim();
    const ee = e.trim().toLowerCase();
    const php = ph.trim();
    if (!nn || !ee || !p) { toast('Lengkapi semua field', 'warn'); return; }
    if (DB.load('users', []).some((x) => x.email.toLowerCase() === ee)) { toast('Email sudah terdaftar', 'err'); return; }
    if (rgRole === 'agen') {
      const tname = agN.trim();
      const addr = agA.trim();
      if (!tname || !addr) { toast('Isi nama & alamat travel', 'err'); return; }
      const agId = uid('AG');
      const ags = DB.load('agencies', []);
      ags.push({ id: agId, name: tname, logo: '', address: addr, phone: php || '-', bank: '-', status: 'pending', feeType: 'percent', feeValue: 8, refundPolicy: [{ minH: 72, pct: 100 }, { minH: 24, pct: 50 }, { minH: 0, pct: 0 }], rating: 5.0, trips: 0 });
      DB.save('agencies', ags);
      refresh();
      const arr = DB.load('users', []);
      arr.push({ id: uid('U'), name: nn, email: ee, phone: php, wa: php, pass: p, role: 'agen', agencyId: agId, status: 'pending', photo: '' });
      DB.save('users', arr);
      refresh();
      audit('agency_register', tname + ' • ' + ee);
      setRgRole('pelanggan');
      go('login');
      toast('Pendaftaran terkirim — menunggu persetujuan super admin', 'info');
      return;
    }
    const u = { id: uid('U'), name: nn, email: ee, phone: php, pass: p, role: 'pelanggan', agencyId: null, status: 'active', favorites: [] };
    const arr = DB.load('users', []);
    arr.push(u);
    DB.save('users', arr);
    refresh();
    setSession(u);
    audit('register', ee);
    notify(ee, 'Akun dibuat', 'Selamat datang! Pakai kode HEMAT20 untuk diskon.', 'app');
    refresh();
    if (!landAfterAuth(u, { go, setBw, toast })) {
      go('home');
      toast('Akun dibuat. Selamat datang, ' + nn + '!');
    }
  };

  return (
    <div className="anim max-w-md mx-auto bg-white rounded-3xl shadow-card p-7 mt-4">
      <h2 className="font-extrabold text-[22px] tracking-tight">Buat akun baru</h2><p className="text-[13px] text-slate-500 font-medium">Gratis, 30 detik.</p>
      <ResumeBanner />
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <button type="button" onClick={() => setRgRole('pelanggan')} className={'font-extrabold text-[13px] py-2.5 rounded-2xl border-2 ' + (rgRole === 'pelanggan' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500')}>Penumpang</button>
        <button type="button" onClick={() => setRgRole('agen')} className={'font-extrabold text-[13px] py-2.5 rounded-2xl border-2 ' + (rgRole === 'agen' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500')}>Agen Travel</button></div>
      <div className="grid grid-cols-2 gap-2.5 mt-2.5"><input value={n} onChange={(ev) => setN(ev.target.value)} autoComplete="name" placeholder="Nama lengkap" className="col-span-2 text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" />
        <input value={e} onChange={(ev) => setE(ev.target.value)} autoComplete="email" placeholder="Email" className="text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /><input value={ph} onChange={(ev) => setPh(ev.target.value)} autoComplete="tel" inputMode="tel" placeholder="No HP" className="text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /></div>
      {rgRole === 'agen' ? (
        <div className="grid grid-cols-1 gap-2.5 mt-2.5">
          <div><label className="text-[12px] font-extrabold">NAMA TRAVEL</label><input value={agN} onChange={(ev) => setAgN(ev.target.value)} placeholder="cth: Barakah Travel" className="w-full mt-1 text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /></div>
          <div><label className="text-[12px] font-extrabold">ALAMAT TRAVEL</label><input value={agA} onChange={(ev) => setAgA(ev.target.value)} placeholder="cth: Jl. Merdeka No.12, Aceh Jaya" className="w-full mt-1 text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /></div></div>
      ) : null}
      <div className="relative mt-2.5"><input value={p} onChange={(ev) => setP(ev.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Password" className="w-full text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 pr-12 focus-ring" /><button type="button" onClick={() => setShow(!show)} aria-label="Tampilkan password" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600 p-1"><Icon name={show ? 'eye-off' : 'eye'} className="w-5 h-5 pointer-events-none" /></button></div>
      {rgRole === 'agen' ? <div className="mt-2.5"><p className="text-[12px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Pendaftaran agen travel butuh persetujuan super admin sebelum bisa masuk.</p></div> : null}
      <button onClick={doRegister} className="mt-4 w-full bg-sky-600 text-white font-extrabold py-3.5 rounded-2xl">Daftar</button>
      <button onClick={() => { toast('Google OAuth (simulasi) — login berhasil'); demoLogin('user@demo.com', 'user123'); }} className="mt-2 w-full bg-white border-2 border-slate-200 font-extrabold text-[13px] py-3 rounded-2xl flex items-center justify-center gap-2"><span className="font-extrabold text-sky-500 text-[16px]">G</span> Daftar dengan Google</button>
      <div className="text-[12.5px] text-center mt-3 font-semibold text-slate-500">Sudah punya akun? <button onClick={() => go('login')} className="text-sky-600 font-extrabold">Masuk</button></div></div>
  );
}
