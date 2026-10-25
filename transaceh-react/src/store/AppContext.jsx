import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { T } from '@/lib/i18n.js';
import { todayStr } from '@/lib/utils.js';
import { currentUser, setSession, cleanupHolds, syncScheduleLifecycle, syncMaintenanceResolutions, audit, agencyPending } from '@/lib/domain.js';
import { clearCheckoutDraft } from '@/lib/checkoutDraft.js';
import { IS_SHEETS } from '@/lib/runtime.js';
import { signOutRemote, loadSnapshot } from '@/lib/remote.js';
import { DB } from '@/lib/db.js';
import { clearToken, getToken } from '@/lib/sheetsApi.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const freshBW = () => ({ step: 1, routeId: 'R1', date: todayStr(1), scheduleId: null, seats: [], passengers: [], pickup: '', pickupAddr: '', pickupCoords: '', voucher: '', discount: 0 });

const CUSTOMER_VIEWS = ['home', 'search', 'tickets', 'history', 'profile', 'help'];
export { CUSTOMER_VIEWS };

const roleHome = (role) => (role === 'agen' ? 'agen' : role === 'pengemudi' ? 'driver' : 'admin');

const initialView = () => {
  try {
    const u = currentUser();
    if (u && u.role === 'agen' && agencyPending(u)) return 'agen-pending';
    if (u && u.role !== 'pelanggan' && CUSTOMER_VIEWS.includes('home')) return roleHome(u.role);
  } catch { /* abaikan, pakai home */ }
  return 'home';
};

export { roleHome, initialView };

export function AppProvider({ children }) {
  const [view, setView] = useState(initialView);
  const [lang, setLangState] = useState(() => localStorage.getItem('at_lang') || 'id');
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [bw, setBw] = useState(freshBW);
  const [payMethod, setPayMethod] = useState('QRIS');
  const [agenTab, setAgenTab] = useState('dashboard');
  const [filter, setFilter] = useState({ q: '', date: '', status: '' });
  const [vehEdit, setVehEdit] = useState(null);
  const [drvEdit, setDrvEdit] = useState(null);
  const [navLoading, setNavLoading] = useState(true);
  const navToken = useRef(0);
  const toastId = useRef(0);

  const refresh = useCallback(() => setTick((x) => x + 1), []);
  const user = useMemo(() => currentUser(), [tick, view]);
  const t = useCallback((k) => (T[lang] && T[lang][k]) || T.id[k] || k, [lang]);

  const toast = useCallback((msg, type = 'ok') => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, msg, type }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3600);
  }, []);

  const go = useCallback((v) => {
    const u = currentUser();
    let target = (u && u.role !== 'pelanggan' && CUSTOMER_VIEWS.includes(v)) ? roleHome(u.role) : v;
    /* Agen yang kelengkapan datanya belum lengkap hanya boleh di halaman kelengkapan data. */
    if (u && u.role === 'agen' && agencyPending(u) && target.startsWith('agen') && target !== 'agen-pending') target = 'agen-pending';
    const my = ++navToken.current;
    setModal(null);
    setNavLoading(true);
    setTimeout(() => {
      if (navToken.current !== my) return;
      setView(target);
      setNavLoading(false);
      window.scrollTo({ top: 0 });
    }, 420);
  }, []);

  useEffect(() => {
    const my = ++navToken.current;
    const t = setTimeout(() => {
      if (navToken.current !== my) return;
      setNavLoading(false);
    }, 420);
    return () => clearTimeout(t);
  }, []);

  const openModal = useCallback((node) => setModal(node), []);
  const closeModal = useCallback(() => setModal(null), []);
  const setLang = useCallback((l) => { localStorage.setItem('at_lang', l); setLangState(l); }, []);

  const logout = useCallback(async () => {
    audit('logout', (currentUser() || {}).email || '');
    if (IS_SHEETS) {
      try {
        await signOutRemote();
      } catch {
        toast('Gagal memuat data publik setelah keluar.', 'err');
      }
    } else {
      setSession(null);
    }
    clearCheckoutDraft();
    setBw(freshBW());
    setFilter({ q: '', date: '', status: '' });
    setView('home');
    setModal(null);
    setTick((x) => x + 1);
    toast('Keluar. Sampai jumpa!', 'info');
  }, [toast]);

  useEffect(() => {
    if (!IS_SHEETS) return undefined;
    DB.setSyncErrorHandler(async (err) => {
      const code = String((err && err.code) || '');
      if (code === 'UNAUTHORIZED' || code === 'ACCOUNT_BLOCKED') {
        /* Jangan biarkan cache berisi data peran lama setelah sesi dicabut. */
        clearToken();
        setSession(null);
        DB.clear();
        clearCheckoutDraft();
        setBw(freshBW());
        setModal(null);
        setView('home');
        try {
          const snap = await loadSnapshot(null);
          DB.hydrate(snap.records, snap.revisions);
        } catch { /* data publik akan dimuat ulang saat refresh */ }
        setTick((x) => x + 1);
        toast('Sesi berakhir. Silakan masuk lagi.', 'err');
        return;
      }
      try {
        const token = getToken();
        if (token) {
          const snap = await loadSnapshot(token);
          if (snap.user) setSession(snap.user);
        }
      } catch { /* biarkan pengguna memakai data terakhir */ }
      setTick((x) => x + 1);
      if (code === 'REV_CONFLICT') {
        toast('Data sudah berubah di server. Data dimuat ulang; silakan ulangi perubahan.', 'warn');
      } else if (code === 'SEAT_CONFLICT') {
        toast(err.message || 'Kursi sudah terpakai. Data dimuat ulang.', 'err');
      } else {
        toast((err && err.message) || 'Perubahan gagal disimpan ke server.', 'err');
      }
    });
    return () => DB.setSyncErrorHandler(null);
  }, [toast]);

  useEffect(() => {
    if (IS_SHEETS) return undefined;
    cleanupHolds();
    const holdIv = setInterval(cleanupHolds, 10000);
    const scheduleIv = setInterval(() => {
      const lifecycleChanged = syncScheduleLifecycle();
      const maintenanceChanged = syncMaintenanceResolutions();
      if (lifecycleChanged || maintenanceChanged) setTick((x) => x + 1);
    }, 60000);
    return () => { clearInterval(holdIv); clearInterval(scheduleIv); };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || !e.key.startsWith('at_')) return;
      setTick((x) => x + 1);
      if (['at_vehicles', 'at_schedules', 'at_bookings', 'at_maintenanceRequests'].includes(e.key)) {
        toast('Data terbaru diterima (sinkron antar pengguna)', 'info');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [toast]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { document.body.style.overflow = modal ? 'hidden' : ''; }, [modal]);

  const value = useMemo(() => ({
    view, go, user, lang, setLang, t, tick, refresh,
    toasts, toast, modal, openModal, closeModal,
    bw, setBw, payMethod, setPayMethod,
    agenTab, setAgenTab, filter, setFilter,
    vehEdit, setVehEdit, drvEdit, setDrvEdit, logout, navLoading,
  }), [view, go, user, lang, setLang, t, tick, refresh, toasts, toast, modal, openModal, closeModal, bw, payMethod, agenTab, filter, vehEdit, drvEdit, logout, navLoading]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
