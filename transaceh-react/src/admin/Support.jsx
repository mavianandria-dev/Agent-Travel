import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { audit, notify } from '@/lib/domain.js';
import { Icon, Empty } from '@/components/ui.jsx';
import { CHANNEL_META, STATUS_META, addMessage, changeStatus, fmtDateTime, loadTickets, sortTickets, ticketStats } from '@/lib/support.js';

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return <span className={'badge ' + m.cls}><span className={'w-1.5 h-1.5 rounded-full ' + m.dot}></span>{m.label}</span>;
}

export default function Support() {
  const { user, toast, refresh, tick } = useApp();
  void tick;
  const all = sortTickets(loadTickets());
  const stats = ticketStats(all);
  const [statusF, setStatusF] = useState('all');
  const [channelF, setChannelF] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('');
  const [reply, setReply] = useState('');
  const filtered = all.filter((t) => {
    if (statusF !== 'all' && t.status !== statusF) return false;
    if (channelF !== 'all' && t.channel !== channelF) return false;
    const key = q.trim().toLowerCase();
    if (!key) return true;
    return [t.code, t.subject, t.userName, t.userEmail, t.category, t.bookingCode].join(' ').toLowerCase().includes(key);
  });
  const active = (sel ? all.find((t) => t.code === sel) : null) || filtered[0] || null;

  const doReply = () => {
    if (!active) return;
    const text = reply.trim();
    if (!text) { toast('Tulis balasan terlebih dahulu', 'err'); return; }
    const updated = addMessage(active.code, 'cs', text, (user && user.name) || 'CS TransAceh');
    if (!updated) { toast('Gagal mengirim balasan', 'err'); return; }
    if (updated.userEmail) notify(updated.userEmail, 'Balasan CS — ' + updated.code, text.slice(0, 100), 'app');
    audit('support_reply', updated.code);
    refresh();
    setReply('');
    toast('Balasan terkirim');
  };

  const setStatus = (status) => {
    if (!active || active.status === status) return;
    const updated = changeStatus(active.code, status, (user && user.name) || 'CS TransAceh', 'Diperbarui dari panel admin');
    if (!updated) return;
    if (updated.userEmail) notify(updated.userEmail, 'Status laporan diperbarui — ' + updated.code, STATUS_META[status].label + '. Buka Pusat Bantuan → Status Laporan untuk melihat detail.', 'app');
    audit('support_status', updated.code + ' → ' + status);
    refresh();
    toast('Status diubah menjadi ' + STATUS_META[status].label);
  };

  const filters = [['all', 'Semua', stats.total], ['new', 'Baru', stats.new], ['process', 'Diproses', stats.process], ['waiting', 'Menunggu', stats.waiting], ['resolved', 'Selesai', stats.resolved]];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-extrabold text-[18px] flex items-center gap-2"><Icon name="life-buoy" className="w-5 h-5 text-sky-600" />Pusat Bantuan & Laporan</h2>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Balas laporan pengunjung/pelanggan dan pantau live chat.</p>
          </div>
          <span className="badge bg-amber-100 text-amber-700"><Icon name="info" className="w-3 h-3" />Mode demo • data browser ini</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div className="bg-sky-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-600">Baru</div><div className="font-extrabold text-[20px]">{stats.new}</div></div>
          <div className="bg-amber-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Diproses</div><div className="font-extrabold text-[20px]">{stats.process}</div></div>
          <div className="bg-violet-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600">Menunggu</div><div className="font-extrabold text-[20px]">{stats.waiting}</div></div>
          <div className="bg-green-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-green-600">Selesai</div><div className="font-extrabold text-[20px]">{stats.resolved}</div></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-card p-4">
          <div className="flex flex-wrap gap-1.5 pb-1">
            {filters.map((x) => (
              <button key={x[0]} onClick={() => { setStatusF(x[0]); setSel(''); setReply(''); }} className={'shrink-0 text-[11px] font-extrabold px-3 py-2 rounded-xl border-2 flex items-center gap-1.5 ' + (statusF === x[0] ? 'bg-[#0b2447] text-white border-[#0b2447]' : 'bg-white text-slate-500 border-slate-200')}>{x[1]}<span className={'badge ' + (statusF === x[0] ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500')}>{x[2]}</span></button>
            ))}
          </div>
          <div className="flex gap-2 mt-2.5">
            <select value={channelF} onChange={(e) => { setChannelF(e.target.value); setSel(''); setReply(''); }} className="text-[12px] font-bold border-2 border-slate-200 rounded-xl px-2.5 py-2 bg-white focus-ring"><option value="all">Semua kanal</option><option value="report">Laporan</option><option value="chat">Live Chat</option></select>
            <input value={q} onChange={(e) => { setQ(e.target.value); setSel(''); setReply(''); }} placeholder="Cari kode/nama…" className="flex-1 min-w-0 text-[12px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2 focus-ring" />
          </div>

          <div className="mt-3 space-y-2 max-h-[620px] overflow-y-auto pr-0.5">
            {filtered.map((t) => (
              <button key={t.code} onClick={() => { setSel(t.code); setReply(''); }} className={'w-full text-left rounded-2xl border-2 p-3 transition ' + (active && active.code === t.code ? 'border-sky-400 bg-sky-50/60' : 'border-slate-100 hover:border-sky-200')}>
                <div className="flex items-center gap-1.5 flex-wrap"><span className="font-mono font-extrabold text-[11px] text-[#0b2447]">{t.code}</span><StatusBadge status={t.status} /><span className={'badge ml-auto ' + (CHANNEL_META[t.channel] || CHANNEL_META.report).cls}><Icon name={(CHANNEL_META[t.channel] || CHANNEL_META.report).icon} className="w-3 h-3" />{(CHANNEL_META[t.channel] || CHANNEL_META.report).label}</span></div>
                <div className="font-extrabold text-[12.5px] mt-1.5 truncate">{t.subject}</div>
                <div className="text-[11px] text-slate-500 font-medium truncate">{t.userName} • {t.category}</div>
                <div className="text-[10.5px] text-slate-400 font-medium mt-0.5 truncate">{(t.messages || []).slice(-1)[0]?.text || t.description || '—'}</div>
                <div className="text-[9.5px] text-slate-400 font-semibold mt-1">{fmtDateTime(t.updatedAt)}</div>
              </button>
            ))}
            {!filtered.length ? <Empty icon="clipboard-list" msg="Tidak ada laporan pada filter ini." /> : null}
          </div>
        </div>

        <div className="lg:col-span-3">
          {active ? (
            <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono font-extrabold text-[13px] text-[#0b2447]">{active.code}</span><StatusBadge status={active.status} /><span className={'badge ' + (CHANNEL_META[active.channel] || CHANNEL_META.report).cls}><Icon name={(CHANNEL_META[active.channel] || CHANNEL_META.report).icon} className="w-3 h-3" />{(CHANNEL_META[active.channel] || CHANNEL_META.report).label}</span>{active.isGuest ? <span className="badge bg-amber-100 text-amber-700">Pengunjung</span> : null}</div>
              <h3 className="font-extrabold text-[16px] mt-1.5">{active.subject}</h3>
              <div className="text-[11.5px] text-slate-500 font-medium">{active.category}{active.bookingCode ? ' • Booking ' + active.bookingCode : ''} • {fmtDateTime(active.createdAt)}</div>

              <div className="grid sm:grid-cols-2 gap-2 mt-3">
                <div className="bg-slate-50 rounded-xl px-3 py-2"><div className="text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400">Nama</div><div className="text-[12px] font-bold truncate">{active.userName || '-'}</div></div>
                <div className="bg-slate-50 rounded-xl px-3 py-2"><div className="text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400">Kontak</div><div className="text-[12px] font-bold truncate">{active.userEmail || active.userPhone || '-'}</div><div className="text-[10.5px] text-slate-500 font-semibold truncate">{active.userPhone || ''}</div></div>
              </div>

              <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
                {(active.messages || []).map((m) => {
                  if (m.from === 'system') return <div key={m.id} className="text-center my-2"><span className="inline-block text-[10px] font-bold text-slate-400 bg-slate-50 rounded-full px-3 py-1">{m.text}</span></div>;
                  const mine = m.from === 'cs';
                  return (
                    <div key={m.id} className={'flex mb-2 ' + (mine ? 'justify-end' : 'justify-start')}>
                      <div className={'max-w-[85%] rounded-2xl px-3.5 py-2.5 ' + (mine ? 'bg-sky-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md')}>
                        <div className={'text-[10px] font-extrabold mb-0.5 ' + (mine ? 'text-sky-100' : 'text-slate-500')}>{m.author || (mine ? 'CS TransAceh' : active.userName)}</div>
                        <div className="text-[12.5px] font-medium leading-relaxed whitespace-pre-line">{m.text}</div>
                        <div className={'text-[9.5px] font-semibold mt-1 ' + (mine ? 'text-sky-100' : 'text-slate-400')}>{fmtDateTime(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                {active.status === 'resolved' ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-[12px] font-bold text-green-800 flex items-center gap-2"><Icon name="circle-check-big" className="w-4 h-4" />Laporan sudah selesai.<button onClick={() => setStatus('process')} className="ml-auto text-[11px] font-extrabold text-sky-700 bg-white px-3 py-1.5 rounded-lg">Buka Kembali</button></div>
                ) : (
                  <>
                    <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Tulis balasan untuk pelanggan…" className="w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring resize-y" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={doReply} className="flex-1 bg-[#0b2447] text-white font-extrabold text-[12.5px] py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="send" className="w-4 h-4" />Kirim Balasan</button>
                      {active.status !== 'process' ? <button onClick={() => setStatus('process')} className="px-3 bg-amber-50 text-amber-700 font-extrabold text-[12px] rounded-xl">Proses</button> : null}
                      {active.channel === 'report' && active.status !== 'waiting' ? <button onClick={() => setStatus('waiting')} className="px-3 bg-violet-50 text-violet-700 font-extrabold text-[12px] rounded-xl">Minta Info</button> : null}
                      <button onClick={() => setStatus('resolved')} className="px-3 bg-green-50 text-green-700 font-extrabold text-[12px] rounded-xl">Selesai</button>
                    </div>
                  </>
                )}
                {active.isGuest ? <div className="text-[10.5px] text-slate-400 font-medium mt-2">Pengunjung dapat melihat balasan melalui kode laporan + email/WA di tab Status Laporan.</div> : <div className="text-[10.5px] text-slate-400 font-medium mt-2">Notifikasi balasan dikirim ke pusat notifikasi pelanggan.</div>}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-card p-5"><Empty icon="life-buoy" msg="Pilih laporan untuk melihat detail." /></div>
          )}
        </div>
      </div>
    </div>
  );
}
