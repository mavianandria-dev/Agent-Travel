import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { Icon } from '@/components/ui.jsx';

export default function NotifModal() {
  const { user, closeModal, refresh, tick } = useApp();
  void tick;

  const list = DB.load('notifications', []).filter((n) => !user || n.to === user.email || n.to === 'all').slice(0, 20);

  const markRead = () => {
    const n = DB.load('notifications', []);
    n.forEach((x) => { if (!user || x.to === user.email) x.read = true; });
    DB.save('notifications', n);
    refresh();
    closeModal();
    refresh();
  };

  return (
    <div className="p-6"><div className="flex items-center justify-between"><h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="bell" className="w-5 h-5 text-sky-600" />Notifikasi</h3><button onClick={() => closeModal()} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="space-y-2 mt-3 max-h-[60vh] overflow-y-auto">{list.map((n) => (
        <div key={n.id} className={'rounded-2xl p-3.5 ' + (n.read ? 'bg-slate-50' : 'bg-sky-50 border border-sky-200')}><div className="flex items-center gap-2"><span className="font-extrabold text-[13px]">{n.title}</span><span className="badge bg-slate-200 text-slate-600 !text-[10px]">{n.ch}</span></div><div className="text-[12.5px] font-medium text-slate-600 mt-0.5">{n.msg}</div><div className="text-[11px] text-slate-400 mt-1">{new Date(n.time).toLocaleString('id-ID')}</div></div>
      ))}{!list.length ? <div className="text-center text-slate-400 text-[13px] py-8">Tidak ada notifikasi</div> : null}</div>
      <button onClick={markRead} className="mt-3 w-full bg-slate-100 font-bold text-[12.5px] py-2.5 rounded-xl">Tandai semua dibaca</button></div>
  );
}
