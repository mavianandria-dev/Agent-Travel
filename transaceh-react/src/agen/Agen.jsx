import { useApp } from '@/store/AppContext.jsx';
import { agencyOf } from '@/lib/domain.js';
import { Icon } from '@/components/ui.jsx';
import Dashboard from './Dashboard.jsx';
import Bookings from './Bookings.jsx';
import Schedules from './Schedules.jsx';
import Fleet from './Fleet.jsx';
import Drivers from './Drivers.jsx';
import Routes from './Routes.jsx';
import Finance from './Finance.jsx';
import Setting from './Setting.jsx';

const TABS = [['dashboard','layout-dashboard','Dashboard'],['book','clipboard-list','Pesanan'],['sched','calendar-days','Jadwal'],['route','route','Rute'],['fleet','bus','Armada'],['driver','id-card','Pengemudi'],['fin','wallet','Keuangan'],['setting','settings','Setting']];

export default function Agen() {
  const { user, agenTab, setAgenTab, go } = useApp();
  const ag = agencyOf(user);
  if (!ag) return <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-7 text-center font-bold text-slate-500">Data travel tidak ditemukan</div>;
  let body = null;
  if (agenTab === 'dashboard') body = <Dashboard ag={ag} />;
  else if (agenTab === 'book') body = <Bookings ag={ag} />;
  else if (agenTab === 'sched') body = <Schedules ag={ag} />;
  else if (agenTab === 'route') body = <Routes ag={ag} />;
  else if (agenTab === 'fleet') body = <Fleet ag={ag} />;
  else if (agenTab === 'driver') body = <Drivers ag={ag} />;
  else if (agenTab === 'fin') body = <Finance ag={ag} />;
  else if (agenTab === 'setting') body = <Setting ag={ag} />;
  else body = <Dashboard ag={ag} />;
  return (
    <div>
      <div className="anim bg-white rounded-3xl shadow-card p-4 flex gap-2 overflow-x-auto no-print">
        {TABS.map((x) => (
          <button key={x[0]} onClick={() => { setAgenTab(x[0]); go('agen'); }} className={`flex items-center gap-1.5 text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl whitespace-nowrap ${agenTab === x[0] ? 'bg-[#0b2447] text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon name={x[1]} className="w-4 h-4" />{x[2]}
          </button>
        ))}
      </div>
      <div className="mt-4">{body}</div>
    </div>
  );
}
