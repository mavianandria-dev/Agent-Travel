import { DB } from '@/lib/db.js';
import { servicePerSeat, platformFeeOf } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';

/* Tabel "Ringkasan & Pembayaran" — Model B, 4 kolom:
   [ Nama | Jumlah | Harga satuan | Jumlah total ]
   Baris 1 Tiket (harga rute milik agen + jasa agen, per kursi) • baris 2
   Diskon voucher (persen di kolom Jumlah, total di kolom Jumlah total —
   selalu tampil walau 0) • baris 3 Subtotal (= Tiket − Diskon) • baris 4
   Fee platform (satuan = tarif admin: Persen → "8%", Flat Rp → Rp/kursi;
   baris diredupkan abu-abu + miring) • baris Total opsional.
   Murni tampilan: angka selalu dari splitFare segar; booking & jurnal
   4 kolom tidak pernah tersentuh komponen ini. */
export function FareChain({ s, fare, n, discLabel = '0%', totalLabel = 'Total Bayar', showTotal = true }) {
  const seats = Math.max(1, Number(n) || 1);
  const f = fare || {};
  const q = (Number(f.quoteTicket) || 0) + (Number(f.quoteService) || 0);
  /* Harga satuan = harga rute + jasa agen per kursi; bila jadwal tak
     tersedia, tarik mundur dari nilai quote splitFare. */
  const unit = s && Number(s.price) ? (Number(s.price) || 0) + servicePerSeat(s) : Math.round(q / seats);
  const tiketTotal = unit * seats;
  /* Kolom "Harga satuan" baris fee = tarif admin (fee global, dihitung ulang
     saat Bayar sehingga selalu senada dengan yang ditagih server):
     persen → tarif %; flat Rp → nilai per kursi (fee = flat × n). */
  const pf = platformFeeOf();
  const flatFee = String((pf && pf.type) || 'percent') === 'flat';
  const feeTarif = flatFee ? fmtRp(Number(pf.value) || 0) : ((Number(pf.value) || 8) + '%');
  const C = 'grid grid-cols-[1fr_2.9rem_5.4rem_6.4rem] gap-x-2 items-baseline';
  const cap = 'text-[10.5px] font-extrabold uppercase tracking-wide text-slate-400';
  return (
    <div className="space-y-1 text-[13px] font-semibold">
      <div className={C + ' ' + cap}>
        <span>&nbsp;</span>
        <span className="text-right">Jumlah</span>
        <span className="text-right">Harga satuan</span>
        <span className="text-right">Jumlah total</span>
      </div>
      {/* baris 1 — Tiket: harga rute agensi + jasa agen, per kursi */}
      <div className={C}><span>Tiket</span><span className="text-right">x{seats}</span><span className="text-right">{fmtRp(unit)}</span><span className="text-right font-bold">{fmtRp(tiketTotal)}</span></div>
      {/* baris 2 — Diskon voucher (tiket-dulu): tanpa voucher tampil 0% / − Rp 0 */}
      <div className={C + ' text-green-700'}><span>Diskon voucher</span><span className="text-right">{discLabel}</span><span className="text-right" /><span className="text-right font-bold">&minus; {fmtRp(f.disc || 0)}</span></div>
      {/* baris 3 — Subtotal = baris 1 − baris 2 */}
      <div className={C + ' pt-1'}><span className="font-extrabold">Subtotal</span><span /><span className="text-right" /><span className="text-right font-extrabold">{fmtRp(f.subtotal)}</span></div>
      {/* baris 4 — Fee platform: satuan = tarif admin; baris diredupkan (abu-abu + miring) */}
      <div className={C + ' text-slate-400 italic'}><span>Fee platform</span><span className="text-right">x{seats}</span><span className="text-right">{feeTarif}</span><span className="text-right font-bold">{fmtRp(f.fee)}</span></div>
      {showTotal ? (
        <div className="flex justify-between font-extrabold text-[16px] pt-2 mt-1"><span>{totalLabel}</span><span className="text-sky-700">{fmtRp(f.total)}</span></div>
      ) : null}
    </div>
  );
}

/* Label kolom Jumlah baris Diskon: persen voucher (percent) atau — (flat). */
export function discLabelOf(code) {
  if (!code) return '0%';
  const v = (DB.load('vouchers', []) || []).find((x) => x.code === String(code).toUpperCase() && x.active);
  if (!v) return '0%';
  return v.type === 'percent' ? (Number(v.value) + '%') : '\u2014';
}
