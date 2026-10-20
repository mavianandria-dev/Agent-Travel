import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { Icon } from '@/components/ui.jsx';
import { SUPPORT_CONTACT } from '@/lib/supportContent.js';

export default function ContactSection({ onReport, onChat }) {
  const { tick } = useApp();
  void tick;
  const agencies = DB.load('agencies', []).filter((a) => a.status === 'active');
  const waLink = 'https://wa.me/' + SUPPORT_CONTACT.waNumber + '?text=' + encodeURIComponent('Halo CS TransAceh, saya butuh bantuan.');
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><Icon name="headset" className="w-5 h-5" /></div>
          <div><h2 className="font-extrabold text-[17px]">Kontak Layanan Pelanggan</h2><p className="text-[12px] text-slate-500 font-medium mt-0.5">Tim CS TransAceh siap membantu di jam layanan.</p></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2.5 mt-4">
          <a href={waLink} target="_blank" rel="noreferrer" className="border-2 border-slate-100 hover:border-green-300 rounded-2xl p-3.5 transition group">
            <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center"><Icon name="message-circle" className="w-5 h-5" /></div>
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400 mt-2">WhatsApp</div>
            <div className="font-extrabold text-[13px] mt-0.5 group-hover:text-green-700">{SUPPORT_CONTACT.waDisplay}</div>
          </a>
          <a href={'tel:' + SUPPORT_CONTACT.phone.replace(/\s/g, '')} className="border-2 border-slate-100 hover:border-sky-300 rounded-2xl p-3.5 transition group">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center"><Icon name="phone" className="w-5 h-5" /></div>
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400 mt-2">Telepon</div>
            <div className="font-extrabold text-[13px] mt-0.5 group-hover:text-sky-700">{SUPPORT_CONTACT.phone}</div>
          </a>
          <a href={'mailto:' + SUPPORT_CONTACT.email} className="border-2 border-slate-100 hover:border-violet-300 rounded-2xl p-3.5 transition group">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><Icon name="mail" className="w-5 h-5" /></div>
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400 mt-2">Email</div>
            <div className="font-extrabold text-[12.5px] mt-0.5 group-hover:text-violet-700 truncate">{SUPPORT_CONTACT.email}</div>
          </a>
        </div>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 bg-slate-50 rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-[11.5px] font-semibold text-slate-600"><Icon name="clock" className="w-4 h-4 text-sky-600 shrink-0" />{SUPPORT_CONTACT.hours} • {SUPPORT_CONTACT.response}</div>
          <button onClick={onChat} className="bg-sky-600 text-white font-extrabold text-[12px] px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="headset" className="w-4 h-4" />Live Chat</button>
          <button onClick={onReport} className="bg-slate-100 text-slate-700 font-extrabold text-[12px] px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="file-text" className="w-4 h-4" />Laporkan</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div><h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="building-2" className="w-5 h-5 text-sky-600" />Kontak Travel Partner</h3><p className="text-[12px] text-slate-500 font-medium mt-0.5">Untuk masalah perjalanan spesifik, hubungi agen pada e-tiket.</p></div>
          <span className="badge bg-green-100 text-green-700 shrink-0">{agencies.length} aktif</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
          {agencies.map((a) => (
            <div key={a.id} className="border-2 border-slate-100 rounded-2xl p-3.5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white font-extrabold flex items-center justify-center shrink-0">{(a.name || '?')[0]}</div>
                <div className="min-w-0 flex-1"><div className="font-extrabold text-[13px] truncate">{a.name}</div><div className="text-[11px] text-slate-500 font-medium truncate">{a.address || '-'}</div></div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <a href={'tel:' + String(a.phone || '').replace(/\s/g, '')} className="flex-1 bg-slate-50 hover:bg-sky-50 text-slate-700 font-extrabold text-[11.5px] py-2 rounded-xl flex items-center justify-center gap-1.5"><Icon name="phone" className="w-3.5 h-3.5" />Telepon</a>
                <a href={'https://wa.me/' + String(a.phone || '').replace(/\D/g, '').replace(/^0/, '62') + '?text=' + encodeURIComponent('Halo ' + a.name + ', saya butuh bantuan terkait perjalanan.')} target="_blank" rel="noreferrer" className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 font-extrabold text-[11.5px] py-2 rounded-xl flex items-center justify-center gap-1.5"><Icon name="message-circle" className="w-3.5 h-3.5" />WhatsApp</a>
              </div>
            </div>
          ))}
        </div>
        {!agencies.length ? <div className="text-[12px] text-slate-400 font-medium text-center py-4">Belum ada agen aktif.</div> : null}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-2.5">
        <Icon name="shield-check" className="w-5 h-5 text-amber-600 shrink-0" />
        <div className="text-[11.5px] text-amber-800 font-medium"><b>Jaga keamanan akun.</b> Tim TransAceh tidak pernah meminta kata sandi atau kode OTP melalui chat, telepon, maupun WhatsApp. Jangan bagikan data pembayaran kepada pihak yang tidak dikenal.</div>
      </div>
    </div>
  );
}
