/* Lapisan data & logika Pusat Bantuan (localStorage simulation). */
import { DB } from '@/lib/db.js';
import { uid } from '@/lib/utils.js';
import { FAQ_CATEGORIES, BOT_FALLBACK_SUGGESTIONS, BOT_PROMPTS, allFaqs, faqById } from '@/lib/supportContent.js';

export const TICKETS_KEY = 'supportTickets';
export const GUEST_KEY = 'supportGuest';
const GUEST_TICKETS_KEY = 'guest_support_tickets';

/** Tiket guest tetap lokal (tanpa akun); tiket pengguna login disinkronkan. */
function ticketsKey() {
  if (!DB.isRemote()) return TICKETS_KEY;
  const session = DB.load('session', null);
  return session && session.uid ? TICKETS_KEY : GUEST_TICKETS_KEY;
}

export const STATUS_META = {
  new: { label: 'Baru', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  process: { label: 'Diproses', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  waiting: { label: 'Menunggu Pelanggan', cls: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  resolved: { label: 'Selesai', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

export const CHANNEL_META = {
  report: { label: 'Laporan', icon: 'file-text', cls: 'bg-slate-100 text-slate-600' },
  chat: { label: 'Live Chat', icon: 'messages-square', cls: 'bg-sky-100 text-sky-700' },
};

export const STATUS_FLOW = {
  report: ['new', 'process', 'waiting', 'resolved'],
  chat: ['new', 'process', 'resolved'],
};

export const STATUS_ORDER = { new: 0, process: 1, waiting: 2, resolved: 3 };

export function loadTickets() {
  const arr = DB.load(ticketsKey(), []);
  return Array.isArray(arr) ? arr : [];
}

export function saveTickets(arr) {
  DB.save(ticketsKey(), Array.isArray(arr) ? arr : []);
}

export function sortTickets(arr) {
  return [...arr].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function findTicket(code) {
  const c = String(code || '').trim().toUpperCase();
  return loadTickets().find((t) => String(t.code || '').toUpperCase() === c) || null;
}

export function ticketsForEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return [];
  return sortTickets(loadTickets().filter((t) => String(t.userEmail || '').toLowerCase() === e));
}

export function ticketStats(list) {
  const all = Array.isArray(list) ? list : loadTickets();
  return {
    total: all.length,
    open: all.filter((t) => t.status !== 'resolved').length,
    new: all.filter((t) => t.status === 'new').length,
    process: all.filter((t) => t.status === 'process').length,
    waiting: all.filter((t) => t.status === 'waiting').length,
    resolved: all.filter((t) => t.status === 'resolved').length,
    chat: all.filter((t) => t.channel === 'chat').length,
  };
}

function dateCode() {
  const d = new Date();
  return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

export function makeTicketCode(channel = 'report') {
  const prefix = channel === 'chat' ? 'CHT' : 'ADU';
  const used = new Set(loadTickets().map((t) => String(t.code || '').toUpperCase()));
  let code = '';
  do {
    code = prefix + '-' + dateCode() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (used.has(code));
  return code;
}

function makeMessage(from, text, author) {
  return { id: uid('MSG'), from, text: String(text || '').trim(), author: author || '', at: new Date().toISOString() };
}

export function createTicket({ channel = 'report', user = null, guest = null, category = '', subject = '', bookingCode = '', description = '', systemMessage = '' } = {}) {
  const now = new Date().toISOString();
  const name = String((user && user.name) || (guest && guest.name) || '').trim();
  const email = String((user && user.email) || (guest && guest.email) || '').trim().toLowerCase();
  const phone = String((user && user.phone) || (guest && guest.phone) || '').trim();
  const isChat = channel === 'chat';
  const cat = String(category || (isChat ? 'Live Chat' : 'Lainnya')).trim();
  const subj = String(subject || (isChat ? 'Live Chat' : cat)).trim();
  const desc = String(description || '').trim();
  const t = {
    id: uid('ST'),
    code: makeTicketCode(channel),
    channel: isChat ? 'chat' : 'report',
    userId: (user && user.id) || null,
    userEmail: email,
    userName: name || 'Pengunjung',
    userPhone: phone,
    agencyId: (user && user.agencyId) || null,
    isGuest: !user,
    category: cat,
    subject: subj,
    bookingCode: String(bookingCode || '').trim().toUpperCase(),
    description: desc,
    status: 'new',
    messages: [],
    statusHistory: [{ status: 'new', at: now, by: name || 'Pengguna', note: isChat ? 'Live chat dimulai' : 'Laporan dibuat' }],
    createdAt: now,
    updatedAt: now,
  };
  if (desc) t.messages.push(makeMessage('user', desc, name || 'Pengguna'));
  if (systemMessage) t.messages.push(makeMessage('system', systemMessage, 'Tim TransAceh'));
  const arr = loadTickets();
  arr.unshift(t);
  saveTickets(arr);
  return t;
}

export function addMessage(code, from, text, author) {
  const arr = loadTickets();
  const t = arr.find((x) => String(x.code || '').toUpperCase() === String(code || '').toUpperCase());
  const body = String(text || '').trim();
  if (!t || !body) return null;
  if (t.status === 'resolved' && from === 'user') return null;
  const now = new Date().toISOString();
  t.messages = Array.isArray(t.messages) ? t.messages : [];
  t.messages.push(makeMessage(from, body, author));
  const prev = t.status;
  if (from === 'cs' && (t.status === 'new' || t.status === 'waiting')) t.status = 'process';
  if (from === 'user' && t.status === 'waiting') t.status = 'process';
  if (t.status !== prev) {
    t.statusHistory = Array.isArray(t.statusHistory) ? t.statusHistory : [];
    t.statusHistory.push({ status: t.status, at: now, by: author || 'Sistem', note: from === 'cs' ? 'CS membalas laporan' : 'Pelanggan membalas' });
  }
  t.updatedAt = now;
  saveTickets(arr);
  return t;
}

export function changeStatus(code, status, by, note) {
  if (!STATUS_META[status]) return null;
  const arr = loadTickets();
  const t = arr.find((x) => String(x.code || '').toUpperCase() === String(code || '').toUpperCase());
  if (!t) return null;
  if (t.status === status) return t;
  const now = new Date().toISOString();
  t.status = status;
  t.statusHistory = Array.isArray(t.statusHistory) ? t.statusHistory : [];
  t.statusHistory.push({ status, at: now, by: by || 'CS TransAceh', note: note || '' });
  if (status === 'resolved') {
    t.messages = Array.isArray(t.messages) ? t.messages : [];
    t.messages.push(makeMessage('system', 'Laporan ditandai selesai oleh ' + (by || 'CS TransAceh') + '.', 'Sistem'));
  }
  t.updatedAt = now;
  saveTickets(arr);
  return t;
}

export function findByCodeAndContact(code, contact) {
  const c = String(code || '').trim().toUpperCase();
  const raw = String(contact || '').trim().toLowerCase();
  const digits = raw.replace(/\D/g, '');
  if (!c || (!raw && !digits)) return null;
  return loadTickets().find((t) => {
    if (String(t.code || '').toUpperCase() !== c) return false;
    const email = String(t.userEmail || '').toLowerCase();
    const phone = String(t.userPhone || '').replace(/\D/g, '');
    return (raw && email && email === raw) || (digits && phone && phone === digits);
  }) || null;
}

export function loadGuest() {
  try {
    const v = localStorage.getItem('at_' + GUEST_KEY);
    return v ? (JSON.parse(v) || {}) : {};
  } catch {
    return {};
  }
}

export function rememberGuest(patch) {
  try {
    localStorage.setItem('at_' + GUEST_KEY, JSON.stringify({ ...loadGuest(), ...(patch || {}) }));
  } catch { /* abaikan */ }
}

export function isSupportOnline() {
  const h = new Date().getHours();
  return h >= 8 && h < 21;
}

export function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

export function fmtDateShort(iso) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
}

/* ---------- Chatbot berbasis aturan + pencarian FAQ ---------- */
const STOP = new Set(['yang', 'dan', 'atau', 'saya', 'aku', 'mau', 'ingin', 'untuk', 'dengan', 'bagaimana', 'cara', 'apa', 'apakah', 'di', 'ke', 'dari', 'ini', 'itu', 'bisa', 'tidak', 'dong', 'ya', 'kah', 'ada', 'sudah', 'belum', 'tolong', 'mohon', 'tentang', 'kalau', 'jika', 'the', 'is', 'how', 'to']);

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function answerForFaq(id, prefix, suggestions) {
  const f = faqById(id);
  if (!f) return null;
  return {
    text: (prefix ? prefix + '\n\n' : '') + f.a,
    suggestions: suggestions || BOT_PROMPTS,
    matchedFaq: f,
  };
}

const BOT_RULES = [
  { test: /(refund|batal|uang kembali|pengembalian|dana kembali)/, id: 'cara-batal' },
  { test: /(persen|estimasi|berapa.*kembali)/, id: 'persen-refund' },
  { test: /(komponen|jasa agen|fee|biaya.*kembali)/, id: 'komponen-refund' },
  { test: /(lama|berapa hari|kapan.*masuk)/, id: 'lama-refund' },
  { test: /(bayar|qris|virtual account|va\b|e-?wallet|ovo|gopay|dana|shopee)/, id: 'metode-bayar' },
  { test: /(batas|15 menit|kadaluarsa|kedaluwarsa|expired|waktu habis)/, id: 'batas-bayar' },
  { test: /(gagal|terputus|saldo|belum berubah)/, id: 'bayar-gagal' },
  { test: /(promo|voucher|diskon|kode)/, id: 'kode-promo' },
  { test: /(kirim.*wa|whatsapp.*tiket|bagikan tiket)/, id: 'kirim-etiket' },
  { test: /(e-?tiket|qr|tiket saya|cetak|pdf)/, id: 'dapat-etiket' },
  { test: /(jemput|lokasi|alamat|koordinat)/, id: 'titik-jemput' },
  { test: /(bagasi|koper|barang|kabin)/, id: 'bagasi' },
  { test: /(ubah jadwal|ganti jadwal|reschedule|pindah jadwal)/, id: 'ubah-jadwal' },
  { test: /(profil|ganti nama|nomor hp|ubah nama)/, id: 'ubah-profil' },
  { test: /(lupa|kata sandi|password)/, id: 'lupa-password' },
  { test: /(login|daftar|masuk|akun)/, id: 'daftar-masuk' },
  { test: /(lacak|kode laporan|status laporan)/, id: 'lacak-laporan' },
  { test: /(lapor|aduan|komplain|keluhan|masalah)/, id: 'cara-lapor' },
  { test: /(live chat|cs|customer service|kontak|telepon|email|whatsapp|hubungi)/, id: 'kontak-cs' },
  { test: /(kursi|seat)/, id: 'pilih-kursi' },
  { test: /(pesan|booking)/, id: 'cara-pesan-tiket' },
];

export function botReply(input) {
  const q = norm(input);
  if (!q) {
    return { text: 'Silakan tulis pertanyaanmu, atau pilih salah satu topik di bawah.', suggestions: BOT_PROMPTS, fallback: true };
  }
  if (/^(halo|hai|hi|hello|pagi|siang|sore|malam|assalamualaikum)\b/.test(q)) {
    return {
      text: 'Halo! Saya Asisten TransAceh. Saya bisa membantu soal pemesanan, pembayaran, e-tiket, pembatalan/refund, akun, dan layanan bantuan. Ada yang bisa saya bantu?',
      suggestions: BOT_PROMPTS,
    };
  }
  if (/(terima kasih|makasih|thanks|thank you)/.test(q)) {
    return { text: 'Sama-sama! Semoga perjalananmu lancar. Kalau masih ada pertanyaan, saya siap membantu.', suggestions: BOT_PROMPTS };
  }
  for (const rule of BOT_RULES) {
    if (rule.test.test(q)) {
      const ans = answerForFaq(rule.id);
      if (ans) return ans;
    }
  }
  const tokens = q.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
  let best = null;
  let bestScore = 0;
  allFaqs().forEach((f) => {
    const hay = norm(f.q + ' ' + f.a + ' ' + f.categoryLabel);
    const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { best = f; bestScore = score; }
  });
  if (best && bestScore >= 1) {
    return {
      text: 'Mungkin jawaban ini membantu:\n\n' + best.a,
      suggestions: BOT_PROMPTS,
      matchedFaq: best,
    };
  }
  return {
    text: 'Maaf, saya belum menemukan jawaban yang tepat. Kamu bisa mencoba kata kunci lain, membuat laporan agar ditangani CS, atau beralih ke Live Chat.',
    suggestions: BOT_FALLBACK_SUGGESTIONS,
    fallback: true,
  };
}

export function faqCategoryCount(categoryId) {
  const c = FAQ_CATEGORIES.find((x) => x.id === categoryId);
  return c ? c.faqs.length : 0;
}
