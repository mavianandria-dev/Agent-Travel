import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { audit, notify } from '@/lib/domain.js';
import { Icon } from '@/components/ui.jsx';
import { BOT_PROMPTS, SUPPORT_CONTACT } from '@/lib/supportContent.js';
import { addMessage, botReply, createTicket, fmtDateTime, isSupportOnline, loadGuest, loadTickets, rememberGuest, sortTickets } from '@/lib/support.js';

function notifyAdmins(title, msg) {
  DB.load('users', []).filter((u) => u.role === 'superadmin').forEach((u) => notify(u.email, title, msg, 'app'));
}

export default function ChatSection({ onReport }) {
  const { user, toast, refresh, tick } = useApp();
  void tick;
  const guest = loadGuest();
  const [mode, setMode] = useState('bot');
  const [botInput, setBotInput] = useState('');
  const [botMsgs, setBotMsgs] = useState([{
    id: 'bot-welcome',
    from: 'bot',
    text: 'Halo' + (user && user.name ? ' ' + user.name.split(' ')[0] : '') + '! Saya Asisten TransAceh. Saya bisa membantu soal pemesanan, pembayaran, e-tiket, refund, akun, dan layanan bantuan. Ada yang bisa saya bantu?',
    suggestions: BOT_PROMPTS,
  }]);
  const [name, setName] = useState((user && user.name) || guest.name || '');
  const [email, setEmail] = useState((user && user.email) || guest.email || '');
  const [phone, setPhone] = useState((user && user.phone) || guest.phone || '');
  const [chatCode, setChatCode] = useState(guest.chatCode || '');
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  const mounted = useRef(false);
  const all = loadTickets();
  const activeCustomer = user ? sortTickets(all.filter((t) => t.channel === 'chat' && String(t.userEmail || '').toLowerCase() === String(user.email || '').toLowerCase() && t.status !== 'resolved'))[0] : null;
  const activeGuest = !user && chatCode ? all.find((t) => t.code === chatCode) : null;
  const active = user ? activeCustomer : activeGuest;
  const online = isSupportOnline();
  const messages = active && Array.isArray(active.messages) ? active.messages : [];
  const activeCode = active ? active.code : '';

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (endRef.current) endRef.current.scrollIntoView({ block: 'nearest' });
  }, [mode, messages.length, botMsgs.length, activeCode]);

  const askBot = (text) => {
    const q = String(text || '').trim();
    if (!q) return;
    const reply = botReply(q);
    setBotMsgs((prev) => [...prev, { id: 'u-' + Date.now(), from: 'user', text: q }, { id: 'b-' + Date.now() + 1, from: 'bot', text: reply.text, suggestions: reply.suggestions, fallback: reply.fallback }]);
    setBotInput('');
  };

  const startChat = () => {
    if (!user) {
      if (name.trim().length < 2) { toast('Nama minimal 2 karakter.', 'err'); return; }
      if (!/.+@.+\..+/.test(email.trim())) { toast('Format email belum benar.', 'err'); return; }
      if (phone.replace(/\D/g, '').length < 9) { toast('Nomor HP/WhatsApp minimal 9 digit.', 'err'); return; }
    }
    const ticket = createTicket({
      channel: 'chat',
      user: user || null,
      guest: user ? null : { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() },
      category: 'Live Chat',
      subject: 'Live Chat',
      systemMessage: 'Halo ' + ((user && user.name) || name || 'kak') + '! Tim CS TransAceh akan membalas pesanmu. Jam layanan ' + SUPPORT_CONTACT.hours + '.',
    });
    if (!user) {
      rememberGuest({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), chatCode: ticket.code });
      setChatCode(ticket.code);
    }
    notifyAdmins('Live chat baru — ' + ticket.code, (ticket.userName || 'Pengunjung') + ' membuka live chat.');
    audit('support_chat_start', ticket.code);
    refresh();
    toast('Live chat dimulai — ' + ticket.code);
  };

  const sendLive = () => {
    if (!active) return;
    const text = draft.trim();
    if (text.length < 1) return;
    const updated = addMessage(active.code, 'user', text, (user && user.name) || active.userName || 'Pengunjung');
    if (!updated) { toast('Chat ini sudah selesai. Mulai chat baru untuk melanjutkan.', 'info'); return; }
    notifyAdmins('Pesan live chat — ' + active.code, text.slice(0, 90));
    refresh();
    setDraft('');
  };

  const newGuestChat = () => {
    setChatCode('');
    rememberGuest({ chatCode: '' });
  };

  const label = online ? 'CS online' : 'CS offline';

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-3xl shadow-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100">
          <div className="flex items-start gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><Icon name={mode === 'bot' ? 'bot' : 'headset'} className="w-5 h-5" /></div>
            <div className="flex-1"><h2 className="font-extrabold text-[17px]">Tanya Asisten</h2><p className="text-[12px] text-slate-500 font-medium mt-0.5">Chatbot 24 jam atau live chat dengan CS TransAceh.</p></div>
          </div>
          <div className="flex gap-1.5 bg-slate-100 rounded-2xl p-1 mt-3">
            <button onClick={() => setMode('bot')} className={'flex-1 text-[12px] font-extrabold py-2 rounded-xl flex items-center justify-center gap-1.5 ' + (mode === 'bot' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500')}><Icon name="bot" className="w-4 h-4" />Chatbot</button>
            <button onClick={() => setMode('live')} className={'flex-1 text-[12px] font-extrabold py-2 rounded-xl flex items-center justify-center gap-1.5 ' + (mode === 'live' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500')}><Icon name="headset" className="w-4 h-4" />Live Chat CS</button>
          </div>
        </div>

        {mode === 'bot' ? (
          <div>
            <div className="bg-slate-50 p-4 h-[300px] sm:h-[330px] overflow-y-auto">
              <div className="space-y-3">
                {botMsgs.map((m) => (
                  <div key={m.id} className={'flex ' + (m.from === 'user' ? 'justify-end' : 'justify-start')}>
                    {m.from === 'bot' ? <span className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center mr-2 shrink-0 mt-0.5"><Icon name="bot" className="w-4 h-4" /></span> : null}
                    <div className={'max-w-[85%]'}>
                      <div className={'rounded-2xl px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed whitespace-pre-line ' + (m.from === 'user' ? 'bg-sky-600 text-white rounded-br-md' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm')}>{m.text}</div>
                      {m.from === 'bot' && m.suggestions && m.suggestions.length ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">{m.suggestions.map((s) => <button key={s} onClick={() => askBot(s)} className="text-[11px] font-extrabold bg-sky-100 hover:bg-sky-200 text-sky-700 px-2.5 py-1.5 rounded-full">{s}</button>)}</div>
                      ) : null}
                      {m.from === 'bot' && m.fallback ? (
                        <div className="flex gap-1.5 mt-2"><button onClick={onReport} className="text-[11px] font-extrabold bg-[#0b2447] text-white px-2.5 py-1.5 rounded-full">Buat Laporan</button><button onClick={() => setMode('live')} className="text-[11px] font-extrabold bg-green-500 text-white px-2.5 py-1.5 rounded-full">Live Chat</button></div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div ref={endRef}></div>
              </div>
            </div>
            <div className="p-3 sm:p-4 border-t border-slate-100 flex gap-2">
              <input value={botInput} onChange={(e) => setBotInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') askBot(botInput); }} placeholder="Tulis pertanyaanmu…" className="flex-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
              <button onClick={() => askBot(botInput)} aria-label="Kirim" className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0"><Icon name="send" className="w-5 h-5" /></button>
            </div>
          </div>
        ) : (
          <div>
            {active ? (
              <>
                <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
                  <span className={'w-2 h-2 rounded-full ' + (active.status === 'resolved' ? 'bg-slate-400' : 'bg-green-500 animate-pulse')}></span>
                  <div className="min-w-0 flex-1"><div className="text-[12px] font-extrabold text-sky-900">{active.status === 'resolved' ? 'Live chat selesai' : label}</div><div className="text-[10.5px] text-sky-700 font-semibold font-mono">{active.code}</div></div>
                  <span className="badge bg-white text-sky-700 border border-sky-100">{active.status === 'resolved' ? 'Selesai' : 'Terhubung'}</span>
                </div>
                <div className="bg-slate-50 p-4 h-[250px] sm:h-[260px] overflow-y-auto">
                  <div className="space-y-2.5">
                    {messages.map((m) => {
                      if (m.from === 'system') return <div key={m.id} className="text-center"><span className="inline-block text-[10.5px] font-bold text-slate-400 bg-white border border-slate-100 rounded-full px-3 py-1">{m.text}</span></div>;
                      const mine = m.from === 'user';
                      return (
                        <div key={m.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
                          <div className={'max-w-[85%] rounded-2xl px-3.5 py-2.5 ' + (mine ? 'bg-sky-600 text-white rounded-br-md' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md')}>
                            {!mine ? <div className="text-[10px] font-extrabold text-sky-600 mb-0.5">{m.author || 'CS TransAceh'}</div> : null}
                            <div className="text-[12.5px] font-medium leading-relaxed whitespace-pre-line">{m.text}</div>
                            <div className={'text-[9.5px] font-semibold mt-1 ' + (mine ? 'text-sky-100' : 'text-slate-400')}>{fmtDateTime(m.at)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef}></div>
                  </div>
                </div>
                {active.status === 'resolved' ? (
                  <div className="p-3 sm:p-4 border-t border-slate-100"><button onClick={newGuestChat} className="w-full bg-[#0b2447] text-white font-extrabold text-[12.5px] py-2.5 rounded-xl">Mulai Chat Baru</button></div>
                ) : (
                  <div className="p-3 sm:p-4 border-t border-slate-100 flex gap-2">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendLive(); }} placeholder="Tulis pesan untuk CS…" className="flex-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
                    <button onClick={sendLive} aria-label="Kirim" className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0"><Icon name="send" className="w-5 h-5" /></button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 sm:p-6">
                <div className="flex items-center gap-2 bg-slate-50 rounded-2xl p-3">
                  <span className={'w-2.5 h-2.5 rounded-full ' + (online ? 'bg-green-500' : 'bg-slate-400')}></span>
                  <div className="text-[12px] font-extrabold">{online ? 'CS sedang online' : 'CS sedang offline'}</div>
                  <div className="text-[11px] text-slate-500 font-medium ml-auto">{SUPPORT_CONTACT.hours}</div>
                </div>
                {!user ? (
                  <>
                    <p className="text-[12px] text-slate-500 font-medium mt-3">Isi data kontak agar CS bisa membantu dan kamu bisa kembali ke percakapan ini.</p>
                    <div className="grid sm:grid-cols-2 gap-2.5 mt-2">
                      <div className="sm:col-span-2"><label className="text-[12px] font-extrabold">NAMA <span className="text-red-500">*</span></label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
                      <div><label className="text-[12px] font-extrabold">EMAIL <span className="text-red-500">*</span></label><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="email@contoh.com" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
                      <div><label className="text-[12px] font-extrabold">NO HP / WA <span className="text-red-500">*</span></label><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ''))} inputMode="tel" placeholder="08xxxxxxxxxx" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 bg-sky-50 rounded-2xl p-3 text-[12px] font-semibold text-sky-900">Kamu akan terhubung sebagai <b>{user.name}</b> • {user.email}</div>
                )}
                <button onClick={startChat} className="mt-4 w-full bg-[#0b2447] hover:bg-sky-700 text-white font-extrabold text-[13px] py-3 rounded-2xl flex items-center justify-center gap-2"><Icon name="headset" className="w-4 h-4" />Mulai Live Chat</button>
                <p className="text-[10.5px] text-slate-400 font-medium mt-2 text-center">Pesan tersimpan di browser ini dan disinkronkan antar-tab. Untuk respons di luar jam layanan, gunakan laporan.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
          <h3 className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="circle-help" className="w-4 h-4 text-sky-600" />Tips menggunakan chat</h3>
          <div className="mt-2.5 space-y-2 text-[11.5px] text-slate-500 font-medium">
            <div>• Gunakan chatbot untuk pertanyaan umum agar langsung dijawab.</div>
            <div>• Sertakan kode booking saat bertanya soal perjalanan tertentu.</div>
            <div>• Live chat dilayani setiap hari {SUPPORT_CONTACT.hours}.</div>
            <div>• Gunakan tab Status Laporan untuk melihat riwayat percakapan.</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#0b2447] to-sky-700 text-white rounded-3xl p-4 sm:p-5">
          <div className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="phone" className="w-4 h-4" />Kontak langsung</div>
          <div className="text-[12.5px] font-extrabold mt-2">{SUPPORT_CONTACT.waDisplay}</div>
          <div className="text-[11px] text-slate-300 font-medium">{SUPPORT_CONTACT.email}</div>
          <div className="text-[11px] text-slate-300 font-medium mt-1">{SUPPORT_CONTACT.hours}</div>
          <a href={'https://wa.me/' + SUPPORT_CONTACT.waNumber + '?text=' + encodeURIComponent('Halo CS TransAceh, saya butuh bantuan.')} target="_blank" rel="noreferrer" className="mt-3 w-full bg-white text-sky-700 font-extrabold text-[12px] py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="message-circle" className="w-4 h-4" />WhatsApp CS</a>
        </div>
        <button onClick={onReport} className="w-full bg-white rounded-3xl shadow-card p-4 text-left border-2 border-transparent hover:border-sky-200 transition">
          <div className="font-extrabold text-[13px] flex items-center gap-2"><Icon name="file-text" className="w-4 h-4 text-sky-600" />Lebih nyaman lewat laporan?</div>
          <div className="text-[11.5px] text-slate-500 font-medium mt-1">Buat laporan dengan kode pelacakan dan balasan CS.</div>
        </button>
      </div>
    </div>
  );
}
