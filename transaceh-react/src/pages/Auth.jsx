import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { setSession, audit, notify, schedById, routeById, agencyPending, checkAgenAccess, checkAccountAccess } from '@/lib/domain.js';
import { uid, inC } from '@/lib/utils.js';
import { Icon, fmtDate, Sec } from '@/components/ui.jsx';
import { peekCheckoutDraft, resumeCheckout } from '@/lib/checkoutDraft.js';
import { IS_SHEETS } from '@/lib/runtime.js';
import { signInRemote, registerRemote } from '@/lib/remote.js';

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
  if (u.role === 'agen') {
    /* KYC belum lengkap tetap boleh masuk — hanya diarahkan ke halaman kelengkapan data */
    go(agencyPending(u) ? 'agen-pending' : 'agen');
  } else if (u.role === 'pengemudi') go('driver');
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

/* Validasi pendaftaran — fungsi murni (bukan komponen) supaya bisa diuji
   terpisah dari UI. Return null bila valid, atau pesan error pertama. */
export function validatePaxSignup({ n, e, ph, p, p2 }, users) {
  const nn = (n || '').trim();
  const ee = (e || '').trim().toLowerCase();
  const php = (ph || '').trim();
  if (!nn) return 'Nama lengkap wajib diisi';
  if (!ee) return 'Email wajib diisi';
  if (!/.+@.+\..+/.test(ee)) return 'Format email belum benar';
  const list = users || DB.load('users', []);
  if (list.some((x) => (x.email || '').toLowerCase() === ee)) return 'Email sudah terdaftar';
  if (!php) return 'No HP wajib diisi';
  if (php.replace(/\D/g, '').length < 9) return 'No HP minimal 9 digit angka';
  if (!p) return 'Password wajib diisi';
  if (p.length < 8) return 'Password minimal 8 karakter';
  if (!p2) return 'Ulangi password wajib diisi';
  if (p2 !== p) return 'Ulangi password tidak sama';
  return null;
}

export function validateAgenSignup(v, users) {
  const base = validatePaxSignup(v, users);
  if (base) return base;
  if (!(v.agN || '').trim()) return 'Nama travel wajib diisi';
  if (!(v.agA || '').trim()) return 'Alamat travel wajib diisi';
  return null;
}

function useDemoLogin() {
  const { toast, refresh, go, setBw } = useApp();
  return (email, pass) => {
    if (IS_SHEETS) return;
    const u = DB.load('users', []).find((x) => x.email === email && x.pass === pass);
    if (!u) return;
    const blocked = checkAccountAccess(u);
    if (blocked) { toast(blocked, 'warn'); return; }
    setSession(u);
    audit('login', u.email + ' (demo)');
    refresh();
    if (!landAfterAuth(u, { go, setBw, toast })) toast('Masuk sebagai ' + u.role + ' — ' + u.name);
  };
}

export function Login() {
  const { go, toast, refresh, setBw } = useApp();
  const demoLogin = useDemoLogin();
  const [email, setEmail] = useState(IS_SHEETS ? '' : 'user@demo.com');
  const [pass, setPass] = useState(IS_SHEETS ? '' : 'user123');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    if (busy) return;
    const e = email.trim().toLowerCase();
    if (!e || !pass) { toast('Email dan password wajib diisi', 'err'); return; }
    if (IS_SHEETS) {
      setBusy(true);
      try {
        const u = await signInRemote(e, pass);
        refresh();
        if (!landAfterAuth(u, { go, setBw, toast })) toast('Halo, ' + u.name + '! Masuk sebagai ' + u.role);
      } catch (err) {
        toast(err.message || 'Email / password salah', 'err');
      } finally {
        setBusy(false);
      }
      return;
    }
    const u = DB.load('users', []).find((x) => x.email.toLowerCase() === e && x.pass === pass);
    if (!u) { toast('Email / password salah', 'err'); return; }
    const accountBlock = checkAccountAccess(u);
    if (accountBlock) { toast(accountBlock, 'warn'); return; }
    if (u.role === 'agen') {
      const blocked = checkAgenAccess(u);
      if (blocked) { toast(blocked, 'warn'); return; }
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
      <label className="text-[12px] font-extrabold mt-4 block">EMAIL</label><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nama@email.com" className="mt-1 w-full text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" />
      <label className="text-[12px] font-extrabold mt-3 block">PASSWORD</label><div className="relative mt-1"><input value={pass} onChange={(e) => setPass(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan password" className="w-full text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 pr-12 focus-ring" /><button type="button" onClick={() => setShow(!show)} aria-label="Tampilkan password" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600 p-1"><Icon name={show ? 'eye-off' : 'eye'} className="w-5 h-5 pointer-events-none" /></button></div>
      <button onClick={doLogin} disabled={busy} className="mt-4 w-full bg-[#0b2447] hover:bg-sky-600 disabled:opacity-60 text-white font-extrabold py-3.5 rounded-2xl transition">{busy ? 'Memproses…' : 'Masuk'}</button>
      <div className="text-[12.5px] text-center mt-3 font-semibold text-slate-500">Belum punya akun? <button onClick={() => go('register')} className="text-sky-600 font-extrabold">Daftar gratis</button></div>
      <div className="text-[12px] text-center mt-2 font-semibold text-slate-400">atau</div>
      <div className="text-[12.5px] text-center mt-2 font-semibold text-slate-500">Ingin menjadi mitra kami? <button onClick={() => go('register-agen')} className="text-sky-600 font-extrabold">Daftar agen travel</button></div>
      {!IS_SHEETS ? (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => demoLogin('agen@barakah.com', 'agen123')} className="bg-sky-50 text-sky-700 text-[11.5px] font-extrabold py-2 rounded-xl">Demo Agen</button>
          <button onClick={() => demoLogin('admin@transaceh.id', 'admin123')} className="bg-violet-50 text-violet-700 text-[11.5px] font-extrabold py-2 rounded-xl">Demo Admin</button>
        </div>
      ) : null}</div>
  );
}

export function Register() {
  const { go, toast, refresh, setBw } = useApp();
  const demoLogin = useDemoLogin();
  const [n, setN] = useState('');
  const [e, setE] = useState('');
  const [ph, setPh] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const doRegister = async () => {
    if (busy) return;
    const err = validatePaxSignup({ n, e, ph, p, p2 });
    if (err) { toast(err, 'err'); return; }
    const nn = n.trim();
    const ee = e.trim().toLowerCase();
    const php = ph.trim();
    if (IS_SHEETS) {
      setBusy(true);
      try {
        const data = await registerRemote({ name: nn, email: ee, phone: php, password: p, role: 'pelanggan' });
        const u = data.user;
        refresh();
        if (!landAfterAuth(u, { go, setBw, toast })) {
          go('home');
          toast('Akun dibuat. Selamat datang, ' + nn + '!');
        }
      } catch (e2) {
        toast(e2.message || 'Pendaftaran gagal', 'err');
      } finally {
        setBusy(false);
      }
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
      <div className="grid grid-cols-2 gap-2.5 mt-4"><input value={n} onChange={(ev) => setN(ev.target.value)} autoComplete="name" placeholder="Nama lengkap" className="col-span-2 text-[14px] font-semibold border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" />
        <input value={e} onChange={(ev) => setE(ev.target.value)} autoComplete="email" placeholder="Email" className="text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /><input value={ph} onChange={(ev) => setPh(ev.target.value)} autoComplete="tel" inputMode="tel" placeholder="No HP" className="text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /></div>
      <div className="relative mt-2.5"><input value={p} onChange={(ev) => setP(ev.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Password" className="w-full text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 pr-12 focus-ring" /><button type="button" onClick={() => setShow(!show)} aria-label="Tampilkan password" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600 p-1"><Icon name={show ? 'eye-off' : 'eye'} className="w-5 h-5 pointer-events-none" /></button></div>
      <div className="relative mt-2.5"><input value={p2} onChange={(ev) => setP2(ev.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Ulangi password" className="w-full text-[14px] border-2 border-slate-200 rounded-2xl px-4 py-3 focus-ring" /></div>
      <button onClick={doRegister} disabled={busy} className="mt-4 w-full bg-sky-600 disabled:opacity-60 text-white font-extrabold py-3.5 rounded-2xl">{busy ? 'Mendaftar…' : 'Daftar'}</button>
      {!IS_SHEETS ? (
        <button onClick={() => { toast('Google OAuth (simulasi) — login berhasil'); demoLogin('user@demo.com', 'user123'); }} className="mt-2 w-full bg-white border-2 border-slate-200 font-extrabold text-[13px] py-3 rounded-2xl flex items-center justify-center gap-2"><span className="font-extrabold text-sky-500 text-[16px]">G</span> Daftar dengan Google</button>
      ) : null}
      <div className="text-[12.5px] text-center mt-3 font-semibold text-slate-500">Sudah punya akun? <button onClick={() => go('login')} className="text-sky-600 font-extrabold">Masuk</button></div>
      <div className="text-[11px] text-center mt-2 font-semibold text-slate-400">atau</div>
      <div className="text-[12.5px] text-center mt-2 font-semibold text-slate-500">Ingin menjadi mitra kami? <button onClick={() => go('register-agen')} className="text-sky-600 font-extrabold">Daftar agen travel</button></div></div>
  );
}

export function RegisterAgen() {
  const { go, toast, refresh } = useApp();
  const [n, setN] = useState('');
  const [e, setE] = useState('');
  const [ph, setPh] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [show, setShow] = useState(false);
  const [agN, setAgN] = useState('');
  const [agA, setAgA] = useState('');
  const [busy, setBusy] = useState(false);

  const doRegisterAgen = async () => {
    if (busy) return;
    const err = validateAgenSignup({ n, e, ph, p, p2, agN, agA });
    if (err) { toast(err, 'err'); return; }
    const nn = n.trim();
    const ee = e.trim().toLowerCase();
    const php = ph.trim();
    const tname = agN.trim();
    const addr = agA.trim();
    if (IS_SHEETS) {
      setBusy(true);
      try {
        await registerRemote({ name: nn, email: ee, phone: php, password: p, role: 'agen', agencyName: tname, agencyAddress: addr });
        go('login');
        toast('Akun berhasil dibuat, silahkan login untuk lengkapi data dan unggah dokumen', 'info');
      } catch (e2) {
        toast(e2.message || 'Pendaftaran gagal', 'err');
      } finally {
        setBusy(false);
      }
      return;
    }
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
    go('login');
    toast('Akun berhasil dibuat, silahkan login untuk lengkapi data dan unggah dokumen', 'info');
  };

  return (
    <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7 mt-4">
      <div className="flex items-start gap-2"><button onClick={() => go('home')} className="bg-slate-100 hover:bg-slate-200 active:scale-95 transition p-2.5 rounded-xl cursor-pointer shrink-0" aria-label="Kembali ke beranda"><Icon name="arrow-left" className="w-4 h-4 pointer-events-none" /></button>
        <div><h2 className="font-extrabold text-[18px]">Daftar sebagai Mitra Travel</h2><p className="text-[12.5px] text-slate-500 font-medium mt-0.5">Gratis — aktif operasi setelah kelengkapan disetujui super admin.</p></div></div>
      <Sec index="A" title="A. DATA AKUN PEMILIK" />
      <div className="space-y-2.5">
        <div><label className="text-[12px] font-extrabold">NAMA LENGKAP <span className="text-red-500">*</span></label><input value={n} onChange={(ev) => setN(ev.target.value)} autoComplete="name" placeholder="Silahkan Masukan Nama Lengkap Anda" className={'w-full mt-1 ' + inC} /></div>
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className="text-[12px] font-extrabold">EMAIL <span className="text-red-500">*</span></label><input value={e} onChange={(ev) => setE(ev.target.value)} autoComplete="email" placeholder="nama@email.com" className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">NO HP / WHATSAPP <span className="text-red-500">*</span></label><input value={ph} onChange={(ev) => setPh(ev.target.value)} autoComplete="tel" inputMode="tel" placeholder="08xxxxxxxxxx" className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">PASSWORD <span className="text-red-500">*</span></label><div className="relative mt-1"><input value={p} onChange={(ev) => setP(ev.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Minimal 8 karakter" className={inC + ' pr-11'} /><button type="button" onClick={() => setShow(!show)} aria-label="Tampilkan password" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600 p-1"><Icon name={show ? 'eye-off' : 'eye'} className="w-5 h-5 pointer-events-none" /></button></div></div>
        <div><label className="text-[12px] font-extrabold">ULANGI PASSWORD <span className="text-red-500">*</span></label><input value={p2} onChange={(ev) => setP2(ev.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Ketik ulang password" className={'w-full mt-1 ' + inC} /></div>
      </div>
      <Sec index="B" title="B. DATA TRAVEL" />
      <div className="space-y-2.5">
        <div><label className="text-[12px] font-extrabold">NAMA TRAVEL <span className="text-red-500">*</span></label><input value={agN} onChange={(ev) => setAgN(ev.target.value)} placeholder="cth: Barakah Travel" className={'w-full mt-1 ' + inC} /></div>
        <div><label className="text-[12px] font-extrabold">ALAMAT TRAVEL <span className="text-red-500">*</span></label><input value={agA} onChange={(ev) => setAgA(ev.target.value)} placeholder="cth: Jl. Merdeka No.12, Aceh Jaya" className={'w-full mt-1 ' + inC} /></div>
        <p className="text-[12px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Setelah akun berhasil dibuat, pengguna wajib melengkapi data dan unggah dokumen.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-5"><button onClick={() => go('home')} className="bg-slate-100 font-extrabold text-[14px] py-3 rounded-2xl">Batal</button><button onClick={doRegisterAgen} disabled={busy} className="bg-sky-600 disabled:opacity-60 text-white font-extrabold text-[14px] py-3 rounded-2xl">{busy ? 'Mengirim…' : 'Daftar Akun'}</button></div>
      <div className="text-[12.5px] text-center mt-3 font-semibold text-slate-500">Sudah punya akun? <button onClick={() => go('login')} className="text-sky-600 font-extrabold">Masuk</button></div></div>
  );
}