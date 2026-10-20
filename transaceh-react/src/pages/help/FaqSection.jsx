import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { Icon, Empty } from '@/components/ui.jsx';
import { FAQ_CATEGORIES, GUIDES, searchFaq } from '@/lib/supportContent.js';

function GuideModal({ guide }) {
  const { closeModal } = useApp();
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><Icon name={guide.icon} className="w-6 h-6" /></div>
        <div className="flex-1"><h3 className="font-extrabold text-[17px] leading-tight">{guide.title}</h3><p className="text-[12.5px] text-slate-500 font-medium mt-0.5">{guide.desc}</p></div>
        <button onClick={closeModal} aria-label="Tutup" className="text-slate-400 p-1"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="space-y-3 mt-4">
        {guide.steps.map((s, i) => (
          <div key={i} className="flex gap-3">
            <span className="w-7 h-7 rounded-full bg-[#0b2447] text-white text-[12px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <p className="text-[13px] font-medium leading-relaxed text-slate-600">{s}</p>
          </div>
        ))}
      </div>
      <button onClick={closeModal} className="mt-5 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[13px] py-3 rounded-2xl transition">Tutup panduan</button>
    </div>
  );
}

export default function FaqSection({ query, setQuery, onChat, onReport }) {
  const { openModal } = useApp();
  const [cat, setCat] = useState('all');
  const [open, setOpen] = useState('cara-pesan-tiket');
  const list = searchFaq(query, cat);

  const guide = (g) => openModal(<GuideModal guide={g} />);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="book-open" className="w-5 h-5 text-sky-600" />Panduan Cepat</h2>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Langkah singkat untuk hal yang paling sering dibutuhkan.</p>
          </div>
          <span className="badge bg-sky-100 text-sky-700 shrink-0">{GUIDES.length} panduan</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
          {GUIDES.map((g) => (
            <button key={g.id} onClick={() => guide(g)} className="text-left border-2 border-slate-100 hover:border-sky-300 hover:bg-sky-50/40 rounded-2xl p-3.5 transition group">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 group-hover:bg-sky-600 group-hover:text-white transition"><Icon name={g.icon} className="w-5 h-5" /></span>
                <div className="flex-1 min-w-0"><div className="font-extrabold text-[13.5px] truncate">{g.title}</div><div className="text-[11.5px] text-slate-500 font-medium truncate">{g.desc}</div></div>
                <Icon name="arrow-right" className="w-4 h-4 text-slate-300 group-hover:text-sky-600 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="circle-help" className="w-5 h-5 text-sky-600" />Pertanyaan Umum</h2>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">{list.length} pertanyaan{query ? ' cocok dengan pencarianmu' : ' tersedia'}.</p>
          </div>
          {query ? <button onClick={() => setQuery('')} className="text-[12px] font-extrabold text-sky-600 bg-sky-50 px-3 py-2 rounded-xl flex items-center gap-1.5"><Icon name="x" className="w-3.5 h-3.5" />Reset cari</button> : null}
        </div>

        <div className="flex gap-1.5 mt-3 overflow-x-auto hscroll pb-1">
          <button onClick={() => setCat('all')} className={'shrink-0 text-[12px] font-extrabold px-3.5 py-2 rounded-xl border-2 transition ' + (cat === 'all' ? 'bg-[#0b2447] text-white border-[#0b2447]' : 'bg-white text-slate-500 border-slate-200 hover:border-sky-300')}>Semua</button>
          {FAQ_CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={'shrink-0 text-[12px] font-extrabold px-3.5 py-2 rounded-xl border-2 transition flex items-center gap-1.5 ' + (cat === c.id ? 'bg-[#0b2447] text-white border-[#0b2447]' : 'bg-white text-slate-500 border-slate-200 hover:border-sky-300')}>
              <Icon name={c.icon} className="w-3.5 h-3.5" />{c.label}
            </button>
          ))}
        </div>

        {list.length ? (
          <div className="mt-3 space-y-2">
            {list.map((f) => {
              const isOpen = open === f.id;
              return (
                <div key={f.id} className={'border-2 rounded-2xl transition ' + (isOpen ? 'border-sky-200 bg-sky-50/30' : 'border-slate-100 bg-white')}>
                  <button onClick={() => setOpen(isOpen ? '' : f.id)} aria-expanded={isOpen} className="w-full flex items-center gap-3 text-left px-3.5 py-3">
                    <span className={'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ' + (isOpen ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500')}><Icon name={f.icon} className="w-4 h-4" /></span>
                    <span className="flex-1 font-extrabold text-[13px] leading-snug">{f.q}</span>
                    <Icon name="chevron-down" className={'w-4 h-4 text-slate-400 shrink-0 transition-transform ' + (isOpen ? 'rotate-180' : '')} />
                  </button>
                  {isOpen ? <div className="px-4 pb-4 pl-[3.75rem]"><p className="text-[12.5px] text-slate-600 font-medium leading-relaxed whitespace-pre-line">{f.a}</p><div className="text-[10.5px] font-extrabold uppercase tracking-wider text-sky-600 mt-2">{f.categoryLabel}</div></div> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3">
            <Empty icon="search" msg={'Tidak ada FAQ untuk "' + query + '".'} />
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button onClick={() => { setQuery(''); setCat('all'); }} className="bg-slate-100 text-slate-700 font-extrabold text-[12.5px] px-4 py-2.5 rounded-xl">Reset pencarian</button>
              <button onClick={onChat} className="bg-sky-600 text-white font-extrabold text-[12.5px] px-4 py-2.5 rounded-xl">Tanya Chatbot</button>
            </div>
          </div>
        )}

        <div className="mt-4 bg-gradient-to-r from-[#0b2447] to-sky-700 rounded-2xl p-4 text-white flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1"><div className="font-extrabold text-[13.5px]">Belum menemukan jawaban?</div><div className="text-[11.5px] text-slate-300 font-medium">Tanya chatbot, buat laporan, atau hubungi CS kami.</div></div>
          <div className="flex gap-2">
            <button onClick={onChat} className="bg-white/15 hover:bg-white/25 text-white font-extrabold text-[12px] px-3.5 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="bot" className="w-4 h-4" />Chatbot</button>
            <button onClick={onReport} className="bg-white text-sky-700 font-extrabold text-[12px] px-3.5 py-2.5 rounded-xl">Buat Laporan</button>
          </div>
        </div>
      </div>
    </div>
  );
}
