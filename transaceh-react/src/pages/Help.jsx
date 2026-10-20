import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { Icon } from '@/components/ui.jsx';
import { SUPPORT_CONTACT } from '@/lib/supportContent.js';
import { isSupportOnline, ticketStats, ticketsForEmail } from '@/lib/support.js';
import FaqSection from './help/FaqSection.jsx';
import ReportSection from './help/ReportSection.jsx';
import StatusSection from './help/StatusSection.jsx';
import ChatSection from './help/ChatSection.jsx';
import ContactSection from './help/ContactSection.jsx';

const TABS = [
  ['faq', 'book-open', 'Panduan & FAQ'],
  ['report', 'file-text', 'Laporkan Masalah'],
  ['status', 'clipboard-list', 'Status Laporan'],
  ['chat', 'headset', 'Live Chat'],
  ['contact', 'phone', 'Kontak CS'],
];

export default function Help() {
  const { user, tick } = useApp();
  void tick;
  const [tab, setTab] = useState('faq');
  const [query, setQuery] = useState('');
  const [trackCode, setTrackCode] = useState('');
  const online = isSupportOnline();
  const stats = user ? ticketStats(ticketsForEmail(user.email)) : null;

  const openTab = (t) => {
    setTab(t);
    if (t !== 'status') setTrackCode('');
  };

  const search = (v) => {
    setQuery(v);
    if (tab !== 'faq') setTab('faq');
  };

  return (
    <div className="space-y-4">
      <div className="anim relative overflow-hidden bg-gradient-to-br from-[#0b2447] via-[#0b3a72] to-sky-600 text-white rounded-3xl p-5 sm:p-7 shadow-card">
        <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full bg-white/10"></div>
        <div className="absolute -right-3 top-16 w-28 h-28 rounded-full bg-sky-300/10"></div>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-white/15 text-sky-100"><Icon name="life-buoy" className="w-3.5 h-3.5" />PUSAT BANTUAN</span>
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><span className={'w-2 h-2 rounded-full ' + (online ? 'bg-green-400' : 'bg-slate-400')}></span>{online ? 'CS online' : 'CS offline'} • {SUPPORT_CONTACT.hours}</span>
          </div>
          <h1 className="font-extrabold text-[24px] sm:text-[30px] tracking-tight leading-tight mt-2">Ada yang bisa kami bantu?</h1>
          <p className="text-[12.5px] sm:text-[13.5px] text-slate-300 font-medium mt-1 max-w-2xl">Cari panduan, laporkan masalah, lacak laporan, atau ngobrol langsung dengan asisten dan CS TransAceh.</p>

          <div className="relative max-w-2xl mt-4">
            <Icon name="search" className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => search(e.target.value)} placeholder="Cari bantuan: refund, e-tiket, pembayaran…" className="w-full bg-white text-slate-800 text-[13px] font-semibold rounded-2xl pl-11 pr-11 py-3.5 border-2 border-white/20 focus-ring shadow-lg" />
            {query ? <button onClick={() => setQuery('')} aria-label="Hapus pencarian" className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><Icon name="x" className="w-4 h-4" /></button> : null}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {['Cara pesan', 'Pembayaran', 'Refund', 'E-tiket'].map((x) => (
              <button key={x} onClick={() => search(x)} className="text-[11px] font-extrabold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition">{x}</button>
            ))}
            {stats && stats.open > 0 ? <button onClick={() => openTab('status')} className="text-[11px] font-extrabold bg-amber-400/20 text-amber-100 hover:bg-amber-400/30 px-3 py-1.5 rounded-full transition flex items-center gap-1.5"><Icon name="clock" className="w-3.5 h-3.5" />{stats.open} laporan aktif</button> : null}
          </div>
        </div>
      </div>

      <div className="anim anim-1 bg-white rounded-2xl shadow-card p-1.5 flex flex-wrap sm:flex-nowrap gap-1 sm:overflow-x-auto hscroll">
        {TABS.map(([v, icon, label]) => (
          <button key={v} onClick={() => openTab(v)} className={'flex items-center gap-1.5 text-[12px] font-extrabold px-3.5 py-2.5 rounded-xl whitespace-nowrap transition ' + (tab === v ? 'bg-[#0b2447] text-white shadow' : 'text-slate-500 hover:bg-slate-100')}>
            <Icon name={icon} className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="anim anim-2">
        {tab === 'faq' ? <FaqSection query={query} setQuery={setQuery} onChat={() => openTab('chat')} onReport={() => openTab('report')} /> : null}
        {tab === 'report' ? <ReportSection onTrack={(code) => { setTrackCode(code); setTab('status'); }} /> : null}
        {tab === 'status' ? <StatusSection initialCode={trackCode} onReport={() => openTab('report')} /> : null}
        {tab === 'chat' ? <ChatSection onReport={() => openTab('report')} /> : null}
        {tab === 'contact' ? <ContactSection onReport={() => openTab('report')} onChat={() => openTab('chat')} /> : null}
      </div>

      {tab !== 'contact' ? (
        <div className="bg-white rounded-2xl shadow-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 text-[11.5px] text-slate-500 font-medium flex items-center gap-2"><Icon name="headset" className="w-4 h-4 text-sky-600 shrink-0" />Butuh bantuan langsung? CS TransAceh siap membantu pada jam layanan.</div>
          <button onClick={() => openTab('contact')} className="text-[12px] font-extrabold text-sky-600 self-start sm:self-auto">Lihat kontak CS →</button>
        </div>
      ) : null}
    </div>
  );
}
