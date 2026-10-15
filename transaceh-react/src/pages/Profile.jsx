import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { audit } from '@/lib/domain.js';
import { Icon } from '@/components/ui.jsx';

export default function Profile() {
  const { user, toast, refresh, tick } = useApp();
  const [name, setName] = useState(user ? user.name : '');
  const [phone, setPhone] = useState(user ? user.phone : '');
  const [favN, setFavN] = useState('');
  const [favP, setFavP] = useState('');
  void tick;

  if (!user) return null;
  const favs = user.favorites || [];
  const logs = DB.load('audit', []).filter((l) => (l.actor || '').includes(user.email)).slice(0, 8);

  const saveProfile = () => {
    const arr = DB.load('users', []);
    const m = arr.find((x) => x.id === user.id);
    if (!m) return;
    m.name = name;
    m.phone = phone;
    DB.save('users', arr);
    refresh();
    audit('profile_update', user.email);
    toast('Profil disimpan');
    refresh();
  };

  const addFav = () => {
    const arr = DB.load('users', []);
    const m = arr.find((x) => x.id === user.id);
    if (!m) return;
    m.favorites = m.favorites || [];
    m.favorites.push({ name: favN || 'Tanpa nama', phone: favP || '-' });
    DB.save('users', arr);
    refresh();
    setFavN('');
    setFavP('');
    toast('Penumpang favorit ditambah');
    refresh();
  };

  const delFav = (i) => {
    const arr = DB.load('users', []);
    const m = arr.find((x) => x.id === user.id);
    if (!m) return;
    m.favorites.splice(i, 1);
    DB.save('users', arr);
    refresh();
  };

  return (
    <div className="anim grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-3xl shadow-card p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-500 to-blue-700 text-white text-3xl font-extrabold flex items-center justify-center mx-auto">{(user.name || '?')[0].toUpperCase()}</div>
        <div className="font-extrabold text-[18px] mt-2">{user.name}</div><div className="badge bg-sky-100 text-sky-700 mt-1">{user.role}</div>
        <div className="text-[13px] text-slate-500 font-medium mt-1">{user.email} • {user.phone}</div>
        <div className="grid grid-cols-2 gap-2 mt-4 text-left">
          <input value={name} onChange={(e) => setName(e.target.value)} className="text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" placeholder="Nama" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" placeholder="No HP" />
        </div>
        <button onClick={saveProfile} className="mt-3 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Simpan Profil</button>
      </div>
      <div className="bg-white rounded-3xl shadow-card p-6">
        <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="users" className="w-5 h-5 text-sky-600" />Penumpang Favorit</h3>
        <p className="text-[12px] text-slate-500 font-medium">Untuk pesan tiket atas nama orang lain.</p>
        <div className="space-y-2 mt-3">{favs.map((f, i) => (<div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 text-[13px] font-bold">{f.name} <span className="text-slate-400 font-medium">{f.phone}</span><div className="flex-1"></div><button onClick={() => delFav(i)} className="text-red-400"><Icon name="trash-2" className="w-4 h-4" /></button></div>))}{!favs.length ? <div className="text-[12px] text-slate-400">Belum ada.</div> : null}</div>
        <div className="flex gap-2 mt-3"><input value={favN} onChange={(e) => setFavN(e.target.value)} placeholder="Nama" className="flex-1 text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><input value={favP} onChange={(e) => setFavP(e.target.value)} placeholder="No HP" className="flex-1 text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" /><button onClick={addFav} className="bg-sky-500 text-white px-3.5 rounded-xl"><Icon name="plus" className="w-5 h-5" /></button></div>
        <div className="mt-4 bg-slate-50 rounded-2xl p-3.5"><div className="font-extrabold text-[13px] flex items-center gap-2"><Icon name="scroll-text" className="w-4 h-4" />Audit Log Akun</div>
          <div className="text-[12px] font-medium text-slate-500 mt-1 space-y-0.5 max-h-28 overflow-y-auto">{logs.map((l) => (<div key={l.id}>• {l.action} — {new Date(l.time).toLocaleString('id-ID')}</div>))}{!logs.length ? '—' : null}</div></div>
      </div></div>
  );
}
