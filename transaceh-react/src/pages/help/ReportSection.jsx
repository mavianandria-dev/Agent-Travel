import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { audit, notify } from '@/lib/domain.js';
import { Icon } from '@/components/ui.jsx';
import { REPORT_CATEGORIES, SUPPORT_CONTACT } from '@/lib/supportContent.js';
import { createTicket, loadGuest, rememberGuest, fmtDateTime } from '@/lib/support.js';

export default function ReportSection({ onTrack }) {
  const { user, toast, refresh } = useApp();
  const guest = loadGuest();
  const [form, setForm] = useState({
    name: (user && user.name) || guest.name || '',
    email: (user && user.email) || guest.email || '',
    phone: (user && user.phone) || guest.phone || '',
    category: '',
    subject: '',
    bookingCode: '',
    description: '',
  });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const bookings = user ? DB.load('bookings', []).filter((b) => b.userEmail === user.email) : [];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    let msg = '';
    if (name.length < 2) msg = 'Nama lengkap wajib diisi minimal 2 karakter.';
    else if (!/.+@.+\..+/.test(email)) msg = 'Format email belum benar.';
    else if (phone.replace(/\D/g, '').length < 9) msg = 'Nomor HP/WhatsApp minimal 9 digit angka.';
    else if (!form.category) msg = 'Pilih kategori masalah.';
    else if (form.subject.trim().length < 4) msg = 'Subjek laporan minimal 4 karakter.';
    else if (form.description.trim().length < 10) msg = 'Kronologi masalah minimal 10 karakter.';
    if (msg) { setErr(msg); toast(msg, 'err'); return; }
    setErr('');
    const ticket = createTicket({
      channel: 'report',
      user: user || null,
      guest: user ? null : { name, email, phone },
      category: form.category,
      subject: form.subject.trim(),
      bookingCode: form.bookingCode.trim(),
      description: form.description.trim(),
    });
    audit('support_report', ticket.code + ' • ' + ticket.category);
    DB.load('users', []).filter((u) => u.role === 'superadmin').forEach((u) => {
      notify(u.email, 'Laporan baru — ' + ticket.code, ticket.subject + ' • ' + ticket.userName, 'app');
    });
    if (user) notify(user.email, 'Laporan diterima — ' + ticket.code, 'Tim CS akan meninjau laporanmu. Pantau statusnya di Pusat Bantuan.', 'app');
    if (!user) rememberGuest({ name, email, phone, code: ticket.code });
    refresh();
    setDone(ticket);
    toast('Laporan terkirim — ' + ticket.code);
  };

  const copy = () => {
    if (!done) return;
    if (navigator.clipboard) navigator.clipboard.writeText(done.code);
    toast('Kode laporan disalin');
  };

  if (done) {
    return (
      <div className="bg-white rounded-3xl shadow-card p-5 sm:p-7">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-16 h-16 rounded-3xl bg-green-100 text-green-600 flex items-center justify-center mx-auto"><Icon name="circle-check-big" className="w-9 h-9" /></div>
          <h2 className="font-extrabold text-[21px] mt-3">Laporan berhasil dikirim</h2>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Tim CS akan meninjau laporanmu dan membalas melalui status laporan. Simpan kode berikut untuk melacak.</p>
          <div className="mt-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Kode laporan</div>
            <div className="font-mono font-extrabold text-[24px] tracking-wider text-[#0b2447] mt-1">{done.code}</div>
            <div className="text-[11.5px] text-slate-500 font-medium mt-1">{fmtDateTime(done.createdAt)} • {done.category}</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button onClick={copy} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[13px] py-3 rounded-2xl flex items-center justify-center gap-2"><Icon name="copy" className="w-4 h-4" />Salin Kode</button>
            <button onClick={() => onTrack(done.code)} className="flex-1 bg-[#0b2447] hover:bg-sky-700 text-white font-extrabold text-[13px] py-3 rounded-2xl flex items-center justify-center gap-2"><Icon name="clipboard-list" className="w-4 h-4" />Lacak Status</button>
          </div>
          <button onClick={() => { setDone(null); set('category', ''); set('subject', ''); set('bookingCode', ''); set('description', ''); }} className="mt-3 text-[12px] font-extrabold text-sky-600">Buat laporan lain</button>
          <div className="mt-4 text-[11.5px] text-slate-400 font-medium">Butuh respons cepat? WhatsApp CS di {SUPPORT_CONTACT.waDisplay} ({SUPPORT_CONTACT.hours}).</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><Icon name="file-text" className="w-5 h-5" /></div>
          <div><h2 className="font-extrabold text-[17px]">Laporkan Masalah</h2><p className="text-[12px] text-slate-500 font-medium mt-0.5">Ceritakan kendala yang kamu alami. Semakin lengkap, semakin cepat kami bantu.</p></div>
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
          <div><label className="text-[12px] font-extrabold">NAMA LENGKAP <span className="text-red-500">*</span></label><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nama sesuai akun" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
          <div><label className="text-[12px] font-extrabold">EMAIL <span className="text-red-500">*</span></label><input value={form.email} onChange={(e) => set('email', e.target.value)} inputMode="email" placeholder="email@contoh.com" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
          <div><label className="text-[12px] font-extrabold">NO HP / WHATSAPP <span className="text-red-500">*</span></label><input value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d+\s-]/g, ''))} inputMode="tel" placeholder="08xxxxxxxxxx" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
          <div><label className="text-[12px] font-extrabold">KATEGORI <span className="text-red-500">*</span></label><select value={form.category} onChange={(e) => set('category', e.target.value)} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring bg-white"><option value="">— Pilih kategori —</option>{REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="text-[12px] font-extrabold">SUBJEK <span className="text-red-500">*</span></label><input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Ringkasan singkat masalah" maxLength={80} className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" /></div>
          <div className="sm:col-span-2"><label className="text-[12px] font-extrabold">KODE BOOKING <span className="text-slate-400">(opsional)</span></label><input list="support-booking-codes" value={form.bookingCode} onChange={(e) => set('bookingCode', e.target.value)} placeholder="cth: TRX-1234" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
            <datalist id="support-booking-codes">{bookings.map((b) => <option key={b.id} value={b.code}>{b.code} • {b.status}</option>)}</datalist>
            {user ? <div className="text-[11px] text-slate-400 font-medium mt-1">{bookings.length ? 'Pilih dari booking akunmu atau ketik manual.' : 'Belum ada booking di akun ini.'}</div> : <div className="text-[11px] text-slate-400 font-medium mt-1">Isi jika masalah terkait tiket/perjalanan tertentu.</div>}
          </div>
          <div className="sm:col-span-2"><label className="text-[12px] font-extrabold">KRONOLOGI MASALAH <span className="text-red-500">*</span></label><textarea rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Jelaskan apa yang terjadi, kapan, dan apa yang sudah kamu coba…" className="w-full mt-1 text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring resize-y" /><div className="text-[11px] text-slate-400 font-medium mt-1">{form.description.length} karakter</div></div>
        </div>

        {err ? <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-[12px] font-bold rounded-xl px-3 py-2 flex items-center gap-2"><Icon name="triangle-alert" className="w-4 h-4 shrink-0" />{err}</div> : null}
        <button onClick={submit} className="mt-4 w-full bg-[#0b2447] hover:bg-sky-700 text-white font-extrabold text-[13.5px] py-3 rounded-2xl flex items-center justify-center gap-2 transition"><Icon name="send" className="w-4 h-4" />Kirim Laporan</button>
        <p className="text-[11px] text-slate-400 font-medium mt-2 text-center">Kode laporan akan muncul setelah laporan terkirim. Gunakan email/WA yang sama untuk melacaknya.</p>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
          <h3 className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="circle-help" className="w-4 h-4 text-sky-600" />Agar cepat ditangani</h3>
          <div className="mt-3 space-y-2.5 text-[12px] font-medium text-slate-600">
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">1</span><span>Sertakan kode booking jika terkait tiket.</span></div>
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">2</span><span>Tulis kronologi singkat, jelas, dan berurutan.</span></div>
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">3</span><span>Gunakan kontak aktif agar CS bisa menghubungi.</span></div>
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">4</span><span>Simpan kode laporan untuk memantau status.</span></div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#0b2447] to-sky-700 text-white rounded-3xl p-4 sm:p-5">
          <div className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="headset" className="w-4 h-4" />Butuh respons cepat?</div>
          <p className="text-[11.5px] text-slate-300 font-medium mt-1">Hubungi CS langsung pada jam layanan.</p>
          <div className="text-[12.5px] font-extrabold mt-2">{SUPPORT_CONTACT.waDisplay}</div>
          <div className="text-[11px] text-slate-300 font-medium">{SUPPORT_CONTACT.hours}</div>
          <a href={'https://wa.me/' + SUPPORT_CONTACT.waNumber + '?text=' + encodeURIComponent('Halo CS TransAceh, saya butuh bantuan.')} target="_blank" rel="noreferrer" className="mt-3 w-full bg-white text-sky-700 font-extrabold text-[12px] py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="message-circle" className="w-4 h-4" />WhatsApp CS</a>
        </div>
      </div>
    </div>
  );
}
