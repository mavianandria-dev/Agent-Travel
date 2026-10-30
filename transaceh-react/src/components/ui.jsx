import { useEffect, useRef } from 'react';
import {
  Armchair, ArrowLeft, ArrowRight, BadgePercent, Banknote, Ban, Bell, BellRing, BookOpen, Bot, Building2, Bus,
  Calendar, CalendarDays, CalendarX, Car, CarFront, Check, CheckCheck, ChevronDown, Circle, CircleAlert,
  CircleCheckBig, CircleGauge, CircleHelp, ClipboardList, Clock, Copy, Database, DoorOpen, Eraser,
  Eye, EyeOff, FileSpreadsheet, FileText, Flag, HandCoins, Headset, History, House, IdCard, Image as ImageIcon, Info, Landmark, Languages,
  LayoutDashboard, LayoutGrid, LifeBuoy, Lock, LogOut, Luggage, Mail, MapPin, MessageCircle, MessagesSquare, MousePointerClick,
  MoveVertical, Navigation, Pencil, Percent, Phone, Plus, Printer, QrCode, ReceiptText, Repeat, Route,
  ScanLine, ScrollText, Search, Send, Settings, ShieldCheck, Square, Star, Ticket, Timer, Trash2,
  TriangleAlert, Upload, User, UserRound, Users, Wallet, Wrench, X,
} from 'lucide-react';
import Chart from 'chart.js/auto';
import { useApp } from '@/store/AppContext.jsx';
import { fmtRp } from '@/lib/utils.js';

const MAP = {
  armchair: Armchair, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'badge-percent': BadgePercent,
  banknote: Banknote, ban: Ban, bell: Bell, 'bell-ring': BellRing, 'book-open': BookOpen, bot: Bot, 'building-2': Building2, bus: Bus,
  calendar: Calendar, 'calendar-days': CalendarDays, 'calendar-x': CalendarX, car: Car, 'car-front': CarFront,
  check: Check, 'check-check': CheckCheck, 'chevron-down': ChevronDown, info: Info,
  'circle-alert': CircleAlert, 'circle-check-big': CircleCheckBig, 'circle-gauge': CircleGauge, 'circle-help': CircleHelp,
  'clipboard-list': ClipboardList, clock: Clock, copy: Copy, database: Database, 'door-open': DoorOpen, eraser: Eraser,
  eye: Eye, 'eye-off': EyeOff, 'file-spreadsheet': FileSpreadsheet, 'file-text': FileText, flag: Flag, 'hand-coins': HandCoins, headset: Headset, history: History,
  home: House, 'id-card': IdCard, image: ImageIcon, landmark: Landmark, languages: Languages,
  'layout-dashboard': LayoutDashboard, 'layout-grid': LayoutGrid, 'life-buoy': LifeBuoy, lock: Lock, 'log-out': LogOut,
  luggage: Luggage, mail: Mail, 'map-pin': MapPin, 'message-circle': MessageCircle, 'messages-square': MessagesSquare,
  'mouse-pointer-click': MousePointerClick, 'move-vertical': MoveVertical, navigation: Navigation,
  pencil: Pencil, percent: Percent, phone: Phone, plus: Plus, printer: Printer, 'qr-code': QrCode,
  'receipt-text': ReceiptText, repeat: Repeat, route: Route, 'scan-line': ScanLine,
  'scroll-text': ScrollText, search: Search, send: Send, settings: Settings, 'shield-check': ShieldCheck,
  square: Square, star: Star, ticket: Ticket, timer: Timer, 'trash-2': Trash2, 'triangle-alert': TriangleAlert,
  upload: Upload, user: User, 'user-round': UserRound, users: Users, wallet: Wallet, wrench: Wrench, x: X,
};

export function Icon({ name, className }) {
  const C = MAP[name] || Circle;
  return <C className={className} />;
}

export function fmtDate(d, lang = 'id') {
  try {
    return new Date(d + 'T00:00').toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return d; }
}

export function Sec({ index, title }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-1.5">
      <span className="bg-[#0b2447] text-white text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shrink-0">{index}</span>
      <span className="font-extrabold text-[14px]">{title}</span>
    </div>
  );
}

export function Empty({ icon = 'search', msg = 'Tidak ada data' }) {
  return (
    <div className="text-center py-8 text-slate-400">
      <Icon name={icon} className="w-10 h-10 mx-auto mb-2 opacity-50" />
      <div className="text-[13px] font-bold">{msg}</div>
    </div>
  );
}

export function StatCard({ icon, label, val, sub, color }) {
  return (
    <div className="anim bg-white rounded-3xl shadow-card p-4 card-hover">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl ${color} flex items-center justify-center shrink-0`}>
          <Icon name={icon} className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="font-extrabold text-[17px] sm:text-[22px] mt-2 tracking-tight truncate">{val}</div>
      <div className="text-[12.5px] font-extrabold">{label}</div>
      <div className="text-[11.5px] text-slate-400 font-medium">{sub}</div>
    </div>
  );
}

const STATUS_MAP = {
  pending: ['b-pending', 'Menunggu Bayar'], paid: ['b-paid', 'Lunas'], cancelled: ['b-cancel', 'Dibatalkan'],
  done: ['b-done', 'Selesai'], scheduled: ['b-wait', 'Terjadwal'], ontrip: ['b-pending', 'Berjalan'], arrived: ['b-done', 'Tiba'], missed: ['b-missed', 'Terlewat'],
};

export function BadgeStatus({ st }) {
  const x = STATUS_MAP[st] || ['b-wait', st];
  return <span className={`badge ${x[0]}`}>{x[1]}</span>;
}

export function PillRadios({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map((o) => (
        <label key={o} className="shrink-0 cursor-pointer">
          <input type="radio" className="hidden peer" checked={value === o} onChange={() => onChange(o)} />
          <span className={`inline-block px-3.5 py-2 rounded-xl border-2 text-[12.5px] font-extrabold transition ${value === o ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>{o}</span>
        </label>
      ))}
    </div>
  );
}

export function CheckPills({ options, values, onChange }) {
  const toggle = (o) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o]);
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map((o) => (
        <label key={o} className="shrink-0 cursor-pointer">
          <input type="checkbox" className="hidden peer" checked={values.includes(o)} onChange={() => toggle(o)} />
          <span className={`inline-block px-3.5 py-2 rounded-xl border-2 text-[12.5px] font-extrabold transition ${values.includes(o) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>{o}</span>
        </label>
      ))}
    </div>
  );
}

/* Kecilkan foto sebelum disimpan: sisi terpanjang ≤ 1280px, JPEG 0,8
   (PNG dibiarkan PNG agar transparansi logo tetap). Gagal gambar/dukungan
   canvas → pakai dataURL asli. Output lebih besar dari sumber → batal. */
function compressImage(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1280;
          const sc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * sc));
          const h = Math.max(1, Math.round(img.naturalHeight * sc));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          const out = dataUrl.startsWith('data:image/png')
            ? cv.toDataURL('image/png')
            : cv.toDataURL('image/jpeg', 0.8);
          resolve(out.length < dataUrl.length ? out : null);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch { resolve(null); }
  });
}

export function UpBox({ title, req, src, onPick }) {
  const { toast } = useApp();
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 700 * 1024) { toast('Foto maksimal 700KB — kecilkan dulu', 'err'); e.target.value = ''; return; }
    const r = new FileReader();
    r.onload = async () => {
      const raw = String(r.result || '');
      const compressed = await compressImage(raw);
      onPick(compressed || raw);
    };
    r.readAsDataURL(f);
  };
  return (
    <div>
      <label className="text-[12px] font-extrabold">{title}{req ? <span className="text-red-500"> *</span> : ''}</label>
      <div className="mt-1 flex items-center gap-3">
        {src ? <img src={src} className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200 shrink-0" alt={title} /> : null}
        <label className="flex-1 cursor-pointer border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-2xl px-4 py-3 text-center text-[12.5px] font-bold text-slate-500 transition">
          Pilih foto<input type="file" accept="image/*" className="hidden" onChange={pick} />
        </label>
      </div>
    </div>
  );
}

export function DocRow({ title, src, onView }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-3.5 py-2.5">
      <span className="text-[13px] font-bold flex-1">{title}</span>
      {src ? (
        <>
          <span className="badge bg-green-100 text-green-700">Ada</span>
          <button onClick={onView} className="bg-sky-600 text-white p-2 rounded-xl" aria-label={`Lihat ${title}`}>
            <Icon name="eye" className="w-4 h-4 pointer-events-none" />
          </button>
        </>
      ) : (
        <span className="text-[12px] font-semibold text-slate-400">Belum ada — via Edit</span>
      )}
    </div>
  );
}

export function DocPreview({ title, src, onBack }) {
  const { closeModal } = useApp();
  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-extrabold text-[16px] flex-1">{title}</h3>
        <button onClick={closeModal} className="text-slate-400 shrink-0"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <img src={src} className="w-full max-h-[70vh] object-contain bg-slate-100 rounded-2xl border-2 border-slate-200 mt-3" alt={title} />
      <button onClick={onBack} className="mt-3 w-full bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Kembali</button>
    </div>
  );
}

/* Denah kabin 4 kolom — dipakai booking (interaktif), blokir kursi, & detail armada (statis) */
export function CabinGrid({ layout, paid = [], hold = [], inactive = [], blocked = [], selected = [], checking = [], onPick = () => {}, interactive = false, plate, vehName, legend = true }) {
  const cells = [];
  let skip = false;
  layout.forEach((c, i) => {
    if (skip) { skip = false; return; }
    if (c.type === 'driver' && layout[i + 1] && layout[i + 1].type === 'driver' && i % 4 === 2) {
      cells.push(
        <div key={i} className="seat driver rounded-xl h-[58px] flex items-center justify-center gap-1.5 text-[11px] font-extrabold" style={{ gridColumn: 'span 2' }}>
          <Icon name="circle-gauge" className="w-5 h-5" />PENGEMUDI
        </div>
      );
      skip = true;
      return;
    }
    if (c.type === 'seat' && layout[i + 1] && layout[i + 1].type === 'seatw' && i % 4 === 0) {
      /* Bangku lebar baris-1 (hasil merge r1c1+r1c2): satu kursi span 2 petak. */
      const st = c.sid;
      const isOff = inactive.includes(st);
      const isBlocked = blocked.includes(st);
      const isChecking = interactive && selected.includes(st) && checking.includes(st);
      const cls = isOff || paid.includes(st) ? 'filled' : hold.includes(st) ? 'held' : isBlocked ? 'blocked' : selected.includes(st) ? 'selected' : 'avail';
      const dis = isBlocked ? false : (cls !== 'avail' && cls !== 'selected');
      const icon = isOff ? 'ban' : cls === 'filled' ? 'x' : cls === 'held' ? 'timer' : cls === 'blocked' ? 'ban' : 'armchair';
      const inner = (
        <>
          <Icon name={icon} className="w-4 h-4" />
          <span className="text-[11px]">{st}</span>
          {isOff ? <span className="text-[8px] font-extrabold">OFF</span> : null}
          {cls === 'blocked' ? <span className="text-[8px] font-extrabold">TUTUP</span> : null}
        </>
      );
      cells.push(interactive ? (
        <button key={i} disabled={dis} onClick={() => onPick(st)} aria-label={`Kursi ${st} (bangku lebar)`} title={isOff ? 'Nonaktif oleh agen' : isBlocked ? 'Diblokir — klik untuk buka lagi' : undefined} className={`seat ${cls} rounded-xl h-[58px] min-h-[54px] flex flex-col items-center justify-center font-extrabold text-[14px] active:scale-95${isChecking ? ' animate-pulse ring-2 ring-sky-400/70 ring-offset-1' : ''}`} style={{ gridColumn: 'span 2' }}>
          {inner}
        </button>
      ) : (
        <div key={i} className={`seat ${cls} rounded-xl h-[58px] flex flex-col items-center justify-center font-extrabold text-[14px]`} style={{ gridColumn: 'span 2', cursor: 'default', textDecoration: 'none' }} title={isOff ? 'Nonaktif' : undefined}>
          {inner}
        </div>
      ));
      skip = true;
      return;
    }
    if (c.type === 'seatw') { /* ekor yatim tanpa kepala — tampil kosong */ cells.push(<div key={i} aria-hidden="true" />); return; }
    if (c.type === 'seat' || c.type === 'off') {
      const st = c.sid;
      const isOff = c.type === 'off' || inactive.includes(st);
      const isBlocked = blocked.includes(st);
      const isChecking = interactive && selected.includes(st) && checking.includes(st);
      const cls = isOff || paid.includes(st) ? 'filled' : hold.includes(st) ? 'held' : isBlocked ? 'blocked' : selected.includes(st) ? 'selected' : 'avail';
      const dis = isBlocked ? false : (cls !== 'avail' && cls !== 'selected');
      const icon = isOff ? 'ban' : cls === 'filled' ? 'x' : cls === 'held' ? 'timer' : cls === 'blocked' ? 'ban' : 'armchair';
      const inner = (
        <>
          <Icon name={icon} className="w-4 h-4" />
          <span className="text-[11px]">{st}</span>
          {isOff ? <span className="text-[8px] font-extrabold">OFF</span> : null}
          {cls === 'blocked' ? <span className="text-[8px] font-extrabold">TUTUP</span> : null}
        </>
      );
      cells.push(interactive ? (
        <button key={i} disabled={dis} onClick={() => onPick(st)} aria-label={`Kursi ${st}${isOff ? ' nonaktif' : ''}${isBlocked ? ' diblokir' : ''}`} title={isOff ? 'Nonaktif oleh agen' : isBlocked ? 'Diblokir — klik untuk buka lagi' : undefined} className={`seat ${cls} rounded-xl h-[58px] min-h-[54px] flex flex-col items-center justify-center font-extrabold text-[14px] active:scale-95${isChecking ? ' animate-pulse ring-2 ring-sky-400/70 ring-offset-1' : ''}`}>
          {inner}
        </button>
      ) : (
        <div key={i} className={`seat ${cls} rounded-xl h-[58px] flex flex-col items-center justify-center font-extrabold text-[14px]`} style={{ cursor: 'default', textDecoration: 'none' }} title={isOff ? 'Nonaktif' : undefined}>
          {inner}
        </div>
      ));
      return;
    }
    if (c.type === 'driver') {
      cells.push(
        <div key={i} className="seat driver rounded-xl h-[58px] flex flex-col items-center justify-center text-[10px] font-extrabold">
          <Icon name="circle-gauge" className="w-5 h-5" />PENGEMUDI
        </div>
      );
      return;
    }
    if (c.type === 'luggage') {
      cells.push(
        <div key={i} className="rounded-xl h-[58px] bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-[9px] font-extrabold text-slate-400">
          <Icon name="luggage" className="w-4 h-4" />BAGASI
        </div>
      );
      return;
    }
    if (c.type === 'door' && interactive) {
      cells.push(
        <div key={i} className="rounded-xl h-[58px] bg-amber-100 border-2 border-amber-300 flex flex-col items-center justify-center text-[9px] font-extrabold text-amber-700">
          <Icon name="door-open" className="w-4 h-4" />PINTU
        </div>
      );
      return;
    }
    cells.push(<div key={i} className="h-[58px]"></div>);
  });
  const n = layout.filter((c) => c.type === 'seat').length;
  const off = layout.filter((c) => c.type === 'off').map((c) => c.sid);
  return (
    <>
      {legend ? (
        <div className="flex gap-3 mt-2 text-[11px] font-bold flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: '#dcfce7', borderColor: '#22c55e' }}></span>Aktif ({n})</span>
          {blocked.length ? <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: '#fee2e2', borderColor: '#dc2626' }}></span>Ditutup ({blocked.join(', ')})</span> : null}
          <span className="flex items-center gap-1.5 text-slate-500"><Icon name="ban" className="w-3.5 h-3.5" />Nonaktif ({off.join(', ') || '-'})</span>
        </div>
      ) : null}
      <div className="car-body mt-3 p-4 max-w-[340px] mx-auto shadow-card">
        <div className="car-windshield h-10 flex items-center justify-center text-[11px] font-extrabold text-sky-800 tracking-widest">
          <Icon name="car-front" className="w-4 h-4 mr-1" />DEPAN
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-3">{cells}</div>
        {plate ? <div className="text-center text-[10px] font-extrabold tracking-widest text-slate-400 mt-3">{plate}{vehName ? ` • ${vehName}` : ''}</div> : null}
      </div>
    </>
  );
}

export function useChart(mkConfig) {
  const ref = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (chart.current) chart.current.destroy();
    chart.current = new Chart(ref.current, mkConfig());
    return () => { if (chart.current) { chart.current.destroy(); chart.current = null; } };
  });
  return ref;
}

export function Rp({ n }) { return <>{fmtRp(n)}</>; }
