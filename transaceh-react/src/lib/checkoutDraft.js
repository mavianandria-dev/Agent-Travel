/* Draft checkout untuk tamu.
   Tamu boleh mengisi wizard pemesanan tanpa login. Saat menekan tombol Bayar,
   isian wizard (state `bw`) disimpan ke localStorage supaya bisa dilanjutkan
   setelah pengguna masuk / mendaftar. Berkedaluwarsa sendiri supaya tidak
   menghidupkan kembali pesanan lama. */

import { DB } from '@/lib/db.js';
import { todayStr } from '@/lib/utils.js';
import { schedById, schedReady, takenSeats, routeById, isRouteSuspended, routeBookable } from '@/lib/domain.js';

const KEY_RAW = 'at_checkout_draft';
const TTL_MS = 30 * 60 * 1000;

const drop = () => { try { localStorage.removeItem(KEY_RAW); } catch (e) { /* abaikan */ } };

/** Simpan isian wizard tamu (hanya yang sudah pilih jadwal). */
export function saveCheckoutDraft(bw) {
  if (!bw || !bw.scheduleId) return;
  DB.save('checkout_draft', { bw: { ...bw }, ts: Date.now() });
}

/** Baca draft tanpa menghapusnya — untuk banner di halaman masuk/daftar. */
export function peekCheckoutDraft() {
  const d = DB.load('checkout_draft', null);
  if (!d || !d.bw || !d.bw.scheduleId) { drop(); return null; }
  if (!d.ts || Date.now() - d.ts > TTL_MS) { drop(); return null; }
  if (d.bw.date && d.bw.date < todayStr(0)) { drop(); return null; }
  return d.bw;
}

/** Ambil + hapus draft (dipakai sekali saat auth berhasil). */
export function takeCheckoutDraft() {
  const bw = peekCheckoutDraft();
  drop();
  return bw;
}

export function clearCheckoutDraft() { drop(); }

/**
 * Lanjutkan pesanan tamu: ambil draft, lalu validasi ulang karena kursi /
 * jadwal bisa berubah selama pengguna masuk. Return draft yang sudah dibersihkan
 * + pesan singkat untuk ditampilkan.
 */
export function resumeCheckout() {
  const bw = takeCheckoutDraft();
  if (!bw) return { draft: null, notices: [] };

  const notices = [];
  const draft = { ...bw, seats: [...(bw.seats || [])], passengers: [...(bw.passengers || [])] };

  if (!routeBookable(routeById(draft.routeId))) {
    Object.assign(draft, { step: 1, scheduleId: null, seats: [], passengers: [], pickup: '', pickupAddr: '', pickupCoords: '', voucher: '', discount: 0 });
    notices.push('Rute pilihanmu sudah tidak tersedia — mulai pencarian baru ya.');
    return { draft, notices };
  }

  const s = schedById(draft.scheduleId);
  const schedOk = s && s.routeId === draft.routeId && s.date === draft.date && s.status === 'open'
    && schedReady(s) && !isRouteSuspended(routeById(s.routeId), s.agencyId);

  if (!schedOk) {
    draft.step = 3;
    draft.scheduleId = null;
    draft.seats = [];
    draft.passengers = [];
    notices.push('Jadwal pilihanmu sudah tidak tersedia — pilih tanggal & armada lagi ya.');
    return { draft, notices };
  }

  const tk = takenSeats(draft.scheduleId);
  const clash = draft.seats.filter((x) => tk.paid.includes(x) || tk.hold.includes(x));
  if (clash.length) {
    draft.seats = draft.seats.filter((x) => !clash.includes(x));
    draft.passengers = draft.passengers.filter((p) => !clash.includes(p.seat));
    notices.push('Kursi ' + clash.join(', ') + ' sudah terisi — silakan pilih kursi lain.');
  }
  if (!draft.seats.length && draft.step >= 4) draft.step = 4;

  return { draft, notices };
}