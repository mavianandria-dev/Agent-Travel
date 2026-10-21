import { useApp } from '@/store/AppContext.jsx';
import { Icon } from '@/components/ui.jsx';
import Tasks from './Tasks.jsx';
import Trips from './Trips.jsx';
import Wallet from './Wallet.jsx';
import DriverProfile from './Profile.jsx';

/* Panel driver's: satu halaman dengan tab (pola sama dengan Panel Agen & Panel Admin).
   Tab ditentukan oleh view, jadi link lama (driver-trips, driver-wallet, driver-profile) tetap bekerja. */
const TABS = [
  ['driver', 'car-front', 'Tugas Saya'],
  ['driver-trips', 'route', 'Trip'],
  ['driver-wallet', 'wallet', 'Dompet'],
  ['driver-profile', 'user', 'Profil'],
];

export default function DriverPanel() {
  const { view, go } = useApp();
  let body = null;
  if (view === 'driver-trips') body = <Trips />;
  else if (view === 'driver-wallet') body = <Wallet />;
  else if (view === 'driver-profile') body = <DriverProfile />;
  else body = <Tasks />;
  return (
    <div>
      <div className="anim bg-white rounded-3xl shadow-card p-4 flex gap-2 overflow-x-auto no-print">
        {TABS.map((x) => (
          <button key={x[0]} onClick={() => go(x[0])} className={`flex items-center gap-1.5 text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl whitespace-nowrap ${view === x[0] ? 'bg-[#0b2447] text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon name={x[1]} className="w-4 h-4" />{x[2]}
          </button>
        ))}
      </div>
      <div className="mt-4">{body}</div>
    </div>
  );
}
