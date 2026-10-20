import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { audit, notify } from '@/lib/domain.js';
import { Icon, Empty } from '@/components/ui.jsx';
import { SUPPORT_CONTACT } from '@/lib/supportContent.js';
import { STATUS_FLOW, STATUS_META, addMessage, findByCodeAndContact, fmtDateTime, loadGuest, loadTickets, rememberGuest, sortTickets, ticketStats } from '@/lib/support.js';

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return <span className={'badge ' + m.cls}><span className={'w-1.5 h-1.5 rounded-full ' + m.dot}></span>{m.label}</span>;
}

function ChannelBadge({ channel }) {
  const chat = channel === 'chat';
  return <span className={'badge ' + (chat ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600')}><Icon name={chat ? 'messages-square' : 'file-text'} className="w-3 h-3" />{chat ? 'Live Chat' : 'Laporan'}</span>;
}

function Timeline({ ticket }) {
  const flow = STATUS_FLOW[ticket.channel] || STATUS_FLOW.report;
  const cur = flow.indexOf(ticket.status);
  return (
    <div className="flex items-start mt-3">
      {flow.map((s, i) => {
        const m = STATUS_META[s];
        const done = i <= cur;
        return (
          <div key={s} className="flex-1 flex flex-col items-center relative">
            {i > 0 ? <div className={'absolute top-3 right-1/2 w-full h-1 ' + (i <= cur ? 'bg-sky-500' : 'bg-slate-200')}></div> : null}
            <div className={'relative z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 ' + (done ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-300')}><Icon name={done ? 'check' : 'circle'} className="w-3 h-3" /></div>
            <div className={'text-[10px] font-extrabold text-center mt-1 leading-tight ' + (done ? 'text-sky-700' : 'text-slate-400')}>{m.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function Conversation({ ticket }) {
  const list = Array.isArray(ticket.messages) ? ticket.messages : [];
  if (!list.length) return <div className="text-center text-[12px] text-slate-400 font-medium py-5">Belum ada balasan.</div>;
  return (
    <div className="space-y-2.5 mt-3">
      {list.map((m) => {
        if (m.from === 'system') {
          return <div key={m.id} className="text-center"><span className="inline-block text-[10.5px] font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">{m.text}</span></div>;
        }
        const mine = m.from === 'user';
        return (
          <div key={m.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-[86%] rounded-2xl px-3.5 py-2.5 ' + (mine ? 'bg-sky-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md')}>
              {!mine ? <div className="text-[10px] font-extrabold opacity-70 mb-0.5">{m.author || 'CS TransAceh'}</div> : null}
              <div className="text-[12.5px] font-medium leading-relaxed whitespace-pre-line">{m.text}</div>
              <div className={'text-[9.5px] font-semibold mt-1 ' + (mine ? 'text-sky-100' : 'text-slate-400')}>{fmtDateTime(m.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketDetailView({ ticket, onBack, guest }) {
  const { user, toast, refresh } = useApp();
  const [reply, setReply] = useState('');
  const mine = user ? user.name : (guest && guest.name) || ticket.userName || 'Pengunjung';
  const send = () => {
    const text = reply.trim();
    if (text.length < 2) { toast('Tulis pesan terlebih dahulu', 'err'); return; }
    const updated = addMessage(ticket.code, 'user', text, mine);
    if (!updated) { toast('Laporan sudah selesai dan tidak bisa dibalas.', 'info'); return; }
    DB.load('users', []).filter((u) => u.role === 'superadmin').forEach((u) => {
      notify(u.email, 'Balasan pelanggan — ' + ticket.code, text.slice(0, 90), 'app');
    });
    audit('support_customer_reply', ticket.code);
    refresh();
    setReply('');
    toast('Pesan terkirim ke CS');
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5 anim">
      <div className="flex items-start gap-2">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0" aria-label="Kembali"><Icon name="arrow-left" className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono font-extrabold text-[13px] text-[#0b2447]">{ticket.code}</span><ChannelBadge channel={ticket.channel} /><StatusBadge status={ticket.status} /></div>
          <h2 className="font-extrabold text-[16px] mt-1 leading-snug">{ticket.subject}</h2>
          <div className="text-[11.5px] text-slate-500 font-medium">{ticket.category}{ticket.bookingCode ? ' • Booking ' + ticket.bookingCode : ''} • {fmtDateTime(ticket.createdAt)}</div>
        </div>
      </div>

      <Timeline ticket={ticket} />

      {ticket.status === 'resolved' ? <div className="mt-3 bg-green-50 border border-green-200 text-green-800 text-[12px] font-bold rounded-xl px-3 py-2.5 flex items-center gap-2"><Icon name="circle-check-big" className="w-4 h-4 shrink-0" />Laporan ini sudah selesai. Terima kasih sudah menghubungi TransAceh.</div> : null}

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Percakapan</div>
        <Conversation ticket={ticket} />
      </div>

      {ticket.status !== 'resolved' ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <label className="text-[12px] font-extrabold">Tambah Balasan</label>
          <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Tulis informasi tambahan untuk CS…" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring resize-y" />
          <div className="flex gap-2 mt-2">
            <button onClick={send} className="flex-1 bg-[#0b2447] text-white font-extrabold text-[12.5px] py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="send" className="w-4 h-4" />Kirim ke CS</button>
            <a href={'https://wa.me/' + SUPPORT_CONTACT.waNumber} target="_blank" rel="noreferrer" className="px-4 bg-green-50 text-green-700 font-extrabold text-[12.5px] rounded-xl flex items-center gap-1.5"><Icon name="message-circle" className="w-4 h-4" />WA</a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function StatusSection({ initialCode, onReport }) {
  const { user, toast, refresh, tick } = useApp();
  void tick;
  const guest = loadGuest();
  const [code, setCode] = useState(initialCode || guest.code || '');
  const [contact, setContact] = useState(guest.email || guest.phone || '');
  const [guestCode, setGuestCode] = useState('');
  const [selected, setSelected] = useState(user ? (initialCode || '') : '');
  const [filter, setFilter] = useState('all');

  if (user) {
    const all = sortTickets(loadTickets().filter((t) => String(t.userEmail || '').toLowerCase() === String(user.email || '').toLowerCase()));
    const stats = ticketStats(all);
    const list = all.filter((t) => filter === 'all' ? true : filter === 'open' ? t.status !== 'resolved' : t.status === 'resolved');
    const active = selected ? all.find((t) => t.code === selected) : null;
    if (active) return <TicketDetailView ticket={active} onBack={() => setSelected('')} />;
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div><h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="clipboard-list" className="w-5 h-5 text-sky-600" />Status Laporan</h2><p className="text-[12px] text-slate-500 font-medium mt-0.5">Pantau laporan dan percakapan dengan CS.</p></div>
            <button onClick={onReport} className="bg-sky-600 text-white font-extrabold text-[12px] px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shrink-0"><Icon name="plus" className="w-4 h-4" />Laporan Baru</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-sky-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-600">Aktif</div><div className="font-extrabold text-[20px] mt-0.5">{stats.open}</div></div>
            <div className="bg-violet-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600">Menunggu</div><div className="font-extrabold text-[20px] mt-0.5">{stats.waiting}</div></div>
            <div className="bg-green-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-green-600">Selesai</div><div className="font-extrabold text-[20px] mt-0.5">{stats.resolved}</div></div>
          </div>
          <div className="flex gap-1.5 mt-3">
            {[['all', 'Semua'], ['open', 'Aktif'], ['done', 'Selesai']].map((x) => <button key={x[0]} onClick={() => setFilter(x[0])} className={'text-[12px] font-extrabold px-3.5 py-2 rounded-xl border-2 ' + (filter === x[0] ? 'bg-[#0b2447] text-white border-[#0b2447]' : 'bg-white text-slate-500 border-slate-200')}>{x[1]}</button>)}
          </div>
        </div>

        {list.length ? (
          <div className="space-y-2">
            {list.map((t) => (
              <button key={t.code} onClick={() => setSelected(t.code)} className="w-full text-left bg-white rounded-2xl shadow-card border-2 border-transparent hover:border-sky-200 p-4 transition">
                <div className="flex items-center gap-1.5 flex-wrap"><span className="font-mono font-extrabold text-[12px] text-[#0b2447]">{t.code}</span><ChannelBadge channel={t.channel} /><StatusBadge status={t.status} /><span className="text-[10.5px] text-slate-400 font-semibold ml-auto">{fmtDateTime(t.updatedAt)}</span></div>
                <div className="font-extrabold text-[13.5px] mt-1.5">{t.subject}</div>
                <div className="text-[11.5px] text-slate-500 font-medium">{t.category}{t.bookingCode ? ' • Booking ' + t.bookingCode : ''}</div>
                <div className="text-[11.5px] text-slate-400 font-medium mt-1 line-clamp-2">{(t.messages || []).slice(-1)[0]?.text || t.description}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-card p-5"><Empty icon="clipboard-list" msg={all.length ? 'Tidak ada laporan pada filter ini.' : 'Belum ada laporan.'} /><div className="text-center"><button onClick={onReport} className="bg-[#0b2447] text-white text-[12.5px] font-extrabold px-5 py-2.5 rounded-xl">Buat Laporan Pertama</button></div></div>
        )}
        <div className="text-[11px] text-slate-400 font-medium text-center">Butuh bantuan cepat? WhatsApp CS {SUPPORT_CONTACT.waDisplay} • {SUPPORT_CONTACT.hours}</div>
      </div>
    );
  }

  const verified = guestCode ? loadTickets().find((t) => t.code === guestCode) : null;
  const lookup = () => {
    const found = findByCodeAndContact(code, contact);
    if (!found) { toast('Kode laporan dan kontak tidak cocok.', 'err'); return; }
    setGuestCode(found.code);
    rememberGuest({ code: found.code, email: found.userEmail, phone: found.userPhone });
    refresh();
  };
  if (verified) return <TicketDetailView ticket={verified} guest={guest} onBack={() => { setGuestCode(''); setSelected(''); }} />;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><Icon name="clipboard-list" className="w-5 h-5" /></div>
          <div><h2 className="font-extrabold text-[17px]">Lacak Status Laporan</h2><p className="text-[12px] text-slate-500 font-medium mt-0.5">Masukkan kode laporan dan kontak yang dipakai saat melapor.</p></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
          <div><label className="text-[12px] font-extrabold">KODE LAPORAN <span className="text-red-500">*</span></label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ADU-XXXXXX-XXXX" className="w-full mt-1 font-mono text-[13px] font-bold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
          <div><label className="text-[12px] font-extrabold">EMAIL / NO HP <span className="text-red-500">*</span></label><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email atau 08xxxxxxxxxx" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
        </div>
        <button onClick={lookup} className="mt-3 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-3 rounded-2xl flex items-center justify-center gap-2"><Icon name="search" className="w-4 h-4" />Cari Laporan</button>
        {guest.code ? <button onClick={() => { setCode(guest.code); setContact(guest.email || guest.phone || ''); }} className="mt-2 w-full bg-sky-50 text-sky-700 font-extrabold text-[12px] py-2.5 rounded-xl">Gunakan laporan terakhir — {guest.code}</button> : null}
        <div className="mt-4 bg-slate-50 rounded-2xl p-3.5 text-[11.5px] text-slate-500 font-medium flex gap-2"><Icon name="info" className="w-4 h-4 shrink-0 text-sky-600" /><span>Pengunjung bisa melacak laporan tanpa akun. Simpan kode laporan dan gunakan email atau nomor HP yang sama saat membuat laporan.</span></div>
      </div>
      <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <h3 className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="headset" className="w-4 h-4 text-sky-600" />Belum punya laporan?</h3>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Buat laporan baru dan dapatkan kode untuk memantau penanganannya.</p>
        <button onClick={onReport} className="mt-3 w-full bg-sky-600 text-white font-extrabold text-[12.5px] py-2.5 rounded-xl">Laporkan Masalah</button>
        <div className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] text-slate-500 font-medium">Butuh jawaban langsung?<br /><a href={'https://wa.me/' + SUPPORT_CONTACT.waNumber} target="_blank" rel="noreferrer" className="text-green-600 font-extrabold">WhatsApp {SUPPORT_CONTACT.waDisplay}</a></div>
      </div>
    </div>
  );
}
