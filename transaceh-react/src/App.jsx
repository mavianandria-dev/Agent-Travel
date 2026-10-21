import { useEffect } from 'react';
import { AppProvider, useApp } from '@/store/AppContext.jsx';
import Header, { BottomNav } from '@/components/Header.jsx';
import Toasts from '@/components/Toasts.jsx';
import Hero from '@/components/Hero.jsx';
import Home from '@/pages/Home.jsx';
import Search from '@/pages/Search.jsx';
import Tickets from '@/pages/Tickets.jsx';
import TicketDetail from '@/pages/TicketDetail.jsx';
import History from '@/pages/History.jsx';
import Profile from '@/pages/Profile.jsx';
import Help from '@/pages/Help.jsx';
import { Login, Register, RegisterAgen } from '@/pages/Auth.jsx';
import Agen from '@/agen/Agen.jsx';
import KycWizard from '@/agen/KycWizard.jsx';
import VehForm from '@/agen/VehForm.jsx';
import DrvForm from '@/agen/DrvForm.jsx';
import DriverPanel from '@/driver/DriverPanel.jsx';
import Admin from '@/admin/Admin.jsx';
import { DB } from '@/lib/db.js';
import { schedById, notify, agencyPending } from '@/lib/domain.js';
import { todayStr } from '@/lib/utils.js';

const AGEN_VIEW_TAB = { 'agen-book': 'book', 'agen-sched': 'sched', 'agen-fleet': 'fleet', 'agen-fin': 'fin' };

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="skel h-14"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="skel h-40"></div><div className="skel h-40"></div><div className="skel h-40"></div></div>
      <div className="skel h-56"></div>
    </div>
  );
}

function Router() {
  const { view, user, modal, closeModal, setAgenTab, navLoading, go } = useApp();

  useEffect(() => {
    if (AGEN_VIEW_TAB[view]) setAgenTab(AGEN_VIEW_TAB[view]);
  }, [view, setAgenTab]);

  // Pengaman: user non-pelanggan tak boleh berada di view pelanggan (mis. sisa state)
  useEffect(() => {
    if (user && user.role !== 'pelanggan' && ['home', 'search', 'tickets', 'history', 'profile', 'help'].includes(view)) go(view);
  }, [view, user, go]);

  // H-1 reminder simulation (sekali per mount)
  useEffect(() => {
    const bk = DB.load('bookings', []);
    let ch = false;
    bk.forEach((b) => {
      if (b.status === 'paid' && schedById(b.scheduleId)?.date === todayStr(1) && !b.reminded) {
        b.reminded = true; ch = true;
        notify(b.userEmail, 'Pengingat H-1', 'Besok ' + schedById(b.scheduleId).time + ' WIB berangkat. Standby di titik jemput ya!', 'WA');
      }
    });
    if (ch) DB.save('bookings', bk);
  }, []);

  let page;
  if (view.startsWith('ticket-detail:')) page = user ? <TicketDetail bid={view.split(':')[1]} /> : <Login />;
  else if (view === 'home') page = <Home />;
  else if (view === 'search') page = <Search />;
  else if (view === 'tickets') page = user ? <Tickets /> : <Login />;
  else if (view === 'history') page = user ? <History /> : <Login />;
  else if (view === 'profile') page = user ? <Profile /> : <Login />;
  else if (view === 'help') page = <Help />;
  else if (view === 'login') page = <Login />;
  else if (view === 'register') page = <Register />;
  else if (view === 'register-agen') page = <RegisterAgen />;
  else if (view.startsWith('agen')) {
    if (!user) page = <Login />;
    else if (view === 'agen-pending' || agencyPending(user)) page = <KycWizard />;
    else if (view === 'agen-drvform') page = <DrvForm />;
    else if (view === 'agen-vehform') page = <VehForm />;
    else page = <Agen />;
  } else if (view.startsWith('driver')) page = user ? <DriverPanel /> : <Login />;
  else if (view.startsWith('admin')) page = user ? <Admin /> : <Login />;
  else page = <Home />;

  return (
    <>
      <Header />
      {view === 'home' ? <Hero /> : null}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 pb-32 md:pb-16 pt-3 sm:pt-5 min-h-[70vh]">{navLoading ? <Skeleton /> : page}</main>
      <BottomNav />
      {modal ? (
        <div className="fixed inset-0 z-50 modal-bg flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div id="modalBox" className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-pop anim" style={{ animation: 'pop .3s both' }}>
            {modal}
          </div>
        </div>
      ) : null}
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
