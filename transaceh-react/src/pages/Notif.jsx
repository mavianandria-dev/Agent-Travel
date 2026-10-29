import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { Icon } from '@/components/ui.jsx';

export default function NotifModal() {
  const { user, closeModal, refresh, tick, go, setAgenTab } = useApp();
  void tick;

  /* Hanya pengguna yang masuk; tamu tidak pernah melihat notifikasi —
     modal kini hanya terbuka dari lonceng header yang tampil setelah login. */
  const list = DB.load('notifications', []).filter((n) => user && (n.to === user.email || n.to === 'all')).slice(0, 20);

  const markRead = () => {
    const n = DB.load('notifications', []);
    n.forEach((x) => { if (!user || x.to === user.email) x.read = true; });
    DB.save('notifications', n);
    refresh();
    closeModal();
    refresh();
  };

  const openAction = (n) => {
    const all = DB.load('notifications', []);
    const hit = all.find((x) => x.id === n.id);
    if (hit) { hit.read = true; DB.save('notifications', all); }
    refresh();
    closeModal();
    if (n.bookingId) { go('ticket-detail:' + n.bookingId); return; }
    if (n.requestId) {
      if (user?.role === 'agen') { setAgenTab('fleet'); go('agen'); }
      else if (user?.role === 'pengemudi') go('driver-maintenance');
    }
  };

  return (
    <div className="p-6"><div className="flex items-center justify-between"><h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="bell" className="w-5 h-5 text-sky-600" />Notifikasi</h3><button onClick={() => closeModal()} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button></div>
      <div className="space-y-2 mt-3 max-h-[60vh] overflow-y-auto">{list.map((n) => (
        <div key={n.id} className={'rounded-2xl p-3.5 ' + (n.read ? 'bg-slate-50' : 'bg-sky-50 border border-sky-200')}><div className="flex items-center gap-2"><span className="font-extrabold text-[13px]">{n.title}</span><span className="badge bg-slate-200 text-slate-600 !text-[10px]">{n.ch}</span></div><div className="text-[12.5px] font-medium text-slate-600 mt-0.5">{n.msg}</div><div className="flex items-center justify-between gap-2 mt-1"><div className="text-[11px] text-slate-400">{new Date(n.time).toLocaleString('id-ID')}</div>{n.bookingId || n.requestId ? <button onClick={() => openAction(n)} className="text-[11.5px] font-extrabold text-sky-700 bg-white border border-sky-200 rounded-lg px-2.5 py-1">{n.bookingId ? 'Lihat tiket' : user?.role === 'agen' ? 'Buka Armada' : 'Buka Maintenance'}</button> : null}</div></div>
      ))}{!list.length ? <div className="text-center text-slate-400 text-[13px] py-8">Tidak ada notifikasi</div> : null}</div>
      <button onClick={markRead} className="mt-3 w-full bg-slate-100 font-bold text-[12.5px] py-2.5 rounded-xl">Tandai semua dibaca</button></div>
  );
}
