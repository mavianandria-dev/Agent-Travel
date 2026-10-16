import { useApp } from '@/store/AppContext.jsx';
import { Icon } from '@/components/ui.jsx';
import { Overview } from './Overview.jsx';
import { Transactions } from './Transactions.jsx';
import { Agencies } from './Agencies.jsx';
import { Routes } from './Routes.jsx';
import Settlement from './Settlement.jsx';
import { Master } from './Master.jsx';

const TABS = [['admin', 'shield-check', 'Overview'], ['admin-tx', 'receipt-text', 'Transaksi'], ['admin-ag', 'building-2', 'Agen'], ['admin-rute', 'route', 'Rute'], ['admin-settle', 'wallet', 'Settlement'], ['admin-master', 'database', 'Master']];

export default function Admin() {
  const { view, go } = useApp();
  let body = null;
  if (view === 'admin') body = <Overview />;
  else if (view === 'admin-tx') body = <Transactions />;
  else if (view === 'admin-ag') body = <Agencies />;
  else if (view === 'admin-rute') body = <Routes />;
  else if (view === 'admin-settle') body = <Settlement />;
  else if (view === 'admin-master') body = <Master />;
  else body = <Overview />;
  return (
    <>
      <div className="anim bg-white rounded-3xl shadow-card p-4 flex gap-2 overflow-x-auto no-print">
        {TABS.map((x) => (
          <button key={x[0]} onClick={() => go(x[0])} className={`flex items-center gap-1.5 text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl whitespace-nowrap ${view === x[0] ? 'bg-[#0b2447] text-white shadow' : 'bg-slate-100 text-slate-500'}`}>
            <Icon name={x[1]} className="w-4 h-4" />{x[2]}
          </button>
        ))}
      </div>
      <div className="mt-4">{body}</div>
    </>
  );
}
