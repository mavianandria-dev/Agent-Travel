import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyPending } from '@/lib/domain.js';
import { Icon } from '@/components/ui.jsx';
import NotifModal from '@/pages/Notif.jsx';

function useClock() {
  const [hm, setHm] = useState('--:--');
  useEffect(() => {
    const f = () => {
      const d = new Date();
      setHm(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
    };
    f();
    const iv = setInterval(f, 1000);
    return () => clearInterval(iv);
  }, []);
  return hm;
}

export default function Header() {
  const { user, go, t, lang, setLang, openModal, logout, setAgenTab } = useApp();
  const clock = useClock();
  const unread = user ? DB.load('notifications', []).filter((n) => n.to === user.email && !n.read).length : 0;

  const avatarDest = () => {
    if (!user) return;
    if (user.role === 'pelanggan') go('profile');
    else if (user.role === 'agen') { if (agencyPending(user)) go('agen-pending'); else { setAgenTab('setting'); go('agen'); } }
    else if (user.role === 'pengemudi') go('driver');
    else go('admin');
  };

  return (
    <header className="no-print sticky top-0 z-40 bg-[#0b2447]/95 backdrop-blur border-b border-white/10 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-[58px] flex items-center gap-2 sm:gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shrink-0">
          <Icon name="car-front" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </div>
        <div className="leading-tight min-w-0">
          <div className="font-extrabold tracking-tight text-[15px] sm:text-[17px]">Trans<span className="text-sky-400">Aceh</span></div>
          <div className="text-[10px] sm:text-[11px] text-slate-300 font-medium -mt-0.5 truncate">Travel Antar Kota • Calang – B. Aceh</div>
        </div>
        <div className="flex-1"></div>
        <div className="hidden md:flex items-center gap-2 text-[12px] font-semibold bg-white/10 rounded-full px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span><span>{clock}</span><span className="text-slate-300">WIB</span>
        </div>
        <button onClick={() => { setLang(lang === 'id' ? 'en' : 'id'); }} aria-label="Ganti bahasa" className="text-[12px] font-extrabold bg-white/10 hover:bg-white/20 active:scale-95 rounded-full px-3 py-2 flex items-center gap-1.5 transition min-h-[40px]">
          <Icon name="languages" className="w-3.5 h-3.5" /><span>{lang.toUpperCase()}</span>
        </button>
        <button onClick={() => openModal(<NotifModal />)} aria-label="Notifikasi" className="relative w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition">
          <Icon name="bell" className="w-5 h-5" />
          {unread > 0 ? <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0b2447]"></span> : null}
        </button>
        <div>
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-[13px] font-bold">{user.name}</div>
                <div className="text-[10px] uppercase tracking-wider font-extrabold text-sky-300">{user.role}</div>
              </div>
              <button onClick={avatarDest} aria-label="Profil" className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center font-extrabold text-sm border-2 border-white/30 active:scale-95">
                {(user.name[0] || '?').toUpperCase()}
              </button>
              <button onClick={logout} title={t('logout')} aria-label={t('logout')} className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500 active:scale-95 flex items-center justify-center transition">
                <Icon name="log-out" className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5 sm:gap-2">
              <button onClick={() => go('login')} className="text-[13px] font-bold bg-white/10 hover:bg-white/20 active:scale-95 px-3 sm:px-4 py-2 min-h-[40px] rounded-full transition">{t('login')}</button>
              <button onClick={() => go('register')} className="text-[13px] font-extrabold bg-sky-500 hover:bg-sky-400 active:scale-95 px-3 sm:px-4 py-2 min-h-[40px] rounded-full transition shadow-lg">{t('register')}</button>
            </div>
          )}
        </div>
      </div>
      <div id="roleTabs" className="hscroll max-w-7xl mx-auto px-3 sm:px-4 pb-2.5 flex gap-2 overflow-x-auto" style={{ display: user && ['agen', 'pengemudi', 'superadmin'].includes(user.role) ? 'none' : '' }}>
        <RoleTabs />
      </div>
    </header>
  );
}

export function RoleTabs() {
  const { user, view, go, t } = useApp();
  if (user && ['agen', 'pengemudi', 'superadmin'].includes(user.role)) return null;
  const tabs = tabsFor(user, t);
  return (
    <>
      {tabs.map((x) => (
        <button key={x.v} onClick={() => go(x.v)} className={`navbtn ${view === x.v || (view.startsWith('agen') && x.v === 'agen') || (view.startsWith('admin') && x.v === 'admin') ? 'active' : ''} flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 min-h-[40px] rounded-full bg-white/10 whitespace-nowrap active:scale-95`}>
          <Icon name={x.icon} className="w-3.5 h-3.5" />{x.label}
        </button>
      ))}
    </>
  );
}

export function tabsFor(u, t) {
  if (!u) return [{ v: 'home', icon: 'home', label: 'Beranda' }, { v: 'search', icon: 'search', label: t('search') }, { v: 'login', icon: 'ticket', label: t('myticket') }, { v: 'help', icon: 'circle-help', label: t('help') }];
  if (u.role === 'pelanggan') return [{ v: 'home', icon: 'home', label: 'Beranda' }, { v: 'search', icon: 'search', label: 'Pesan' }, { v: 'tickets', icon: 'ticket', label: t('myticket') }, { v: 'history', icon: 'history', label: t('history') }, { v: 'help', icon: 'circle-help', label: t('help') }, { v: 'profile', icon: 'user', label: 'Profil' }];
  if (u.role === 'agen') {
    /* Agen yang belum lengkap: hanya satu tab, menuju halaman kelengkapan data */
    if (agencyPending(u)) return [{ v: 'agen-pending', icon: 'clipboard-list', label: 'Kelengkapan Data' }];
    return [{ v: 'agen', icon: 'layout-dashboard', label: t('dashboard') }, { v: 'agen-book', icon: 'clipboard-list', label: t('bookings') }, { v: 'agen-sched', icon: 'calendar-days', label: t('schedules') }, { v: 'agen-fleet', icon: 'car', label: t('vehicles') }, { v: 'agen-fin', icon: 'wallet', label: t('finance') }];
  }
  if (u.role === 'pengemudi') return [{ v: 'driver', icon: 'car-front', label: t('tasks') }, { v: 'driver-trips', icon: 'route', label: 'Trip' }];
  if (u.role === 'superadmin') return [{ v: 'admin', icon: 'shield-check', label: 'Admin' }, { v: 'admin-tx', icon: 'receipt-text', label: t('transactions') }, { v: 'admin-ag', icon: 'building-2', label: t('agencies') }, { v: 'admin-refund', icon: 'settings', label: 'Refund' }, { v: 'admin-master', icon: 'database', label: t('master') }];
  return [];
}

export function BottomNav() {
  const { user, view, go, t } = useApp();
  if (user && ['agen', 'pengemudi', 'superadmin'].includes(user.role)) return null;
  const tabs = tabsFor(user, t).slice(0, 5);
  return (
    <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/97 backdrop-blur border-t border-slate-200 px-2 pt-1.5 flex gap-1 overflow-x-auto shadow-[0_-8px_30px_-12px_rgba(11,36,71,.25)]" style={{ paddingBottom: 'max(10px,env(safe-area-inset-bottom))' }}>
      {tabs.map((x) => (
        <button key={x.v} onClick={() => go(x.v)} aria-label={x.label} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[10px] leading-none font-bold min-w-[60px] min-h-[56px] active:scale-95 transition ${view === x.v ? 'text-sky-600 bg-sky-50' : 'text-slate-400'}`}>
          <Icon name={x.icon} className="w-[22px] h-[22px]" /><span className="truncate max-w-[64px]">{x.label}</span>
        </button>
      ))}
    </nav>
  );
}
