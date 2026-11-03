import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { ledgerEligible, driverById, schedById, routeById, agencyById, scheduleNeedsReview, setScheduleTripStatus, resolveScheduleNoShow, splitFare, fareModelOf, markRefundPaid, startRefundProcessing, LEDGER_SERV_GATE_MS, LEDGER_KLIRING_MS } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';

function NoShowModal({ sid }) {
  const { closeModal, toast, refresh } = useApp();
  const [pct, setPct] = useState(100);
  const s = schedById(sid);
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;
  const paid = DB.load('bookings', []).filter((b) => b.scheduleId === sid && b.status === 'paid');
  const totalPay = paid.reduce((a, b) => a + (Number(b.total) || Number((b.fare || splitFare(s, (b.seats || []).length, b.discount || 0, 'pelanggan', fareModelOf(b))).total) || 0), 0);
  const refund = Math.round(totalPay * (Number(pct) || 0) / 100);
  const submit = () => {
    const res = resolveScheduleNoShow(sid, pct);
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast((res.count || 0) + ' booking dibatalkan • refund ' + fmtRp(res.total || 0));
  };
  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[17px]">Tandai Tidak Berangkat?</h3>
      <p className="text-[13px] text-slate-500 font-medium mt-1">Jadwal akan ditutup. Karena bus tidak berangkat, refund dihitung dari <b>total pembayaran</b> (tiket + jasa agen + fee platform). Admin yang menentukan besarnya.</p>
      <div className="mt-3 bg-slate-50 rounded-2xl p-3 text-[12.5px] font-semibold">
        <div>Jadwal: <b>{s.date} {s.time}</b></div>
        <div>Booking lunas: <b>{paid.length}</b></div>
        <div>Total pembayaran: <b>{fmtRp(totalPay)}</b></div>
      </div>
      <label className="block mt-3 text-[11px] font-extrabold text-slate-500">PERSENTASE REFUND DARI TOTAL</label>
      <input type="number" min="0" max="100" value={pct} onChange={(e) => setPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="mt-1 w-full text-[14px] font-bold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      <div className="mt-2 text-[12.5px] font-semibold text-slate-600">Estimasi refund: <b className="text-green-700">{fmtRp(refund)}</b></div>
      <div className="flex gap-2 mt-4">
        <button onClick={closeModal} className="flex-1 bg-slate-100 font-bold text-[13px] py-2.5 rounded-xl">Batal</button>
        <button onClick={submit} className="flex-1 bg-red-500 text-white font-extrabold text-[13px] py-2.5 rounded-xl">Tutup & Proses Refund</button>
      </div>
    </div>
  );
}

/* Laporan pencairan kini MURNI RIWAYAT — tidak ada tombol pencairan.
   Sistem yang menandai sendiri (otomatis); admin hanya membaca siapa
   sudah berhak berapa. Ini pemantik info baris "akan otomatis tanggal X". */
function tanggalOtomatis(anchor, ms) {
  if (!anchor) return null;
  const t = Date.parse(anchor);
  if (isNaN(t)) return null;
  return new Date(t + ms).toISOString().slice(0, 10);
}

function FilterBar({ agFilter, setAgFilter, agencies }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex-1"></div>
      <select value={agFilter} onChange={(e) => setAgFilter(e.target.value)} className="text-[13px] font-bold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
        <option value="">Semua agen</option>
        {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}

export default function Settlement() {
  const { toast, refresh, openModal } = useApp();
  const [agFilter, setAgFilter] = useState('');
  const agencies = DB.load('agencies', []);
  const ledger = DB.load('ledger', []);
  const bookings = DB.load('bookings', []);
  const codeOf = (e) => bookings.find((b) => b.id === e.bookingId)?.code || '-';

  /* Laporan TIKET pengemudi: layak (menunggu kliring otomatis) + dicairkan. */
  const driverRows = ledger
    .filter((e) => (e.status === 'layak' || e.status === 'dicairkan') && (!agFilter || e.agencyId === agFilter))
    .sort((a, b) => (b.paidOutAt || b.releasedAt || b.createdAt || '').localeCompare(a.paidOutAt || a.releasedAt || a.createdAt || ''));
  const driverPending = driverRows.filter((e) => e.status === 'layak');
  const driverAutoAt = (() => {
    let min = null;
    driverPending.forEach((e) => {
      const s = schedById(e.scheduleId);
      const at = tanggalOtomatis(s?.arrivedAt || e.releasedAt, LEDGER_KLIRING_MS);
      if (at && (min === null || at < min)) min = at;
    });
    return min;
  })();

  /* Laporan JASA agen: hanya baris yang SISTEM sudah menandai terkirim
     (servicePaidOutAt) — era lama tanpa cap jasa tidak ikut tampil. */
  const serviceRows = ledger
    .filter((e) => e.servicePaidOutAt && (!agFilter || e.agencyId === agFilter))
    .sort((a, b) => String(b.servicePaidOutAt || '').localeCompare(String(a.servicePaidOutAt || '')));
  const servicePending = ledger.filter((e) => {
    if (e.servicePaidOutAt || e.status !== 'layak') return false;
    if (agFilter && e.agencyId !== agFilter) return false;
    const s = schedById(e.scheduleId);
    return !!(s?.arrivedAt || e.releasedAt);
  });
  const serviceAutoAt = (() => {
    let min = null;
    servicePending.forEach((e) => {
      const s = schedById(e.scheduleId);
      const at = tanggalOtomatis(s?.arrivedAt || e.releasedAt, LEDGER_SERV_GATE_MS);
      if (at && (min === null || at < min)) min = at;
    });
    return min;
  })();

  const reviewSchedules = DB.load('schedules', [])
    .filter((s) => scheduleNeedsReview(s) && (!agFilter || s.agencyId === agFilter))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const refunds = bookings
    .filter((b) => Number(b.refundAmount) > 0 && b.refundStatus !== 'done')
    .filter((b) => {
      if (!agFilter) return true;
      const s = schedById(b.scheduleId);
      return s && s.agencyId === agFilter;
    })
    .sort((a, b) => String(b.cancelledAt || '').localeCompare(String(a.cancelledAt || '')));

  const rowInfo = (e) => {
    const s = schedById(e.scheduleId);
    const r = s ? routeById(s.routeId) : null;
    const d = e.driverId ? driverById(e.driverId) : null;
    const ag = agencyById(e.agencyId);
    const tiba = (s?.arrivedAt || e.releasedAt || '').slice(0, 10);
    return { s, r, d, ag, tiba };
  };

  return (
    <div className="space-y-4">
      {reviewSchedules.length ? <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="triangle-alert" className="w-5 h-5 text-amber-500" />Jadwal Perlu Penyelesaian ({reviewSchedules.length})</h3>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Konfirmasi trip yang benar-benar terjadi, atau proses refund manual bila jadwal tidak berangkat. Tidak ada refund otomatis.</p>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[900px]"><thead><tr>
          <th>Jadwal</th><th>Rute / Agen</th><th>Pengemudi</th><th>Penumpang Lunas</th><th>Ledger</th><th>Aksi</th>
        </tr></thead><tbody>
          {reviewSchedules.map((s) => {
            const r = routeById(s.routeId);
            const ag = agencyById(s.agencyId);
            const d = driverById(s.driverId);
            const paid = bookings.filter((b) => b.scheduleId === s.id && b.status === 'paid');
            const totalTicket = paid.reduce((a, b) => a + (Number((b.fare || splitFare(s, (b.seats || []).length, b.discount || 0, 'pelanggan', fareModelOf(b))).ticket) || 0), 0);
            const led = ledger.filter((e) => e.scheduleId === s.id);
            return (
              <tr key={s.id}>
                <td className="font-bold">{s.date}<br /><span className="text-sky-600">{s.time}</span></td>
                <td className="text-[12.5px] font-semibold">{r?.from} → {r?.to}<br /><span className="text-slate-400">{ag?.name}</span></td>
                <td className="text-[12.5px] font-semibold">{d?.name || s.driverName || '-'}</td>
                <td className="text-[12.5px] font-semibold">{paid.length} lunas<br /><span className="text-slate-400">{fmtRp(totalTicket)}</span></td>
                <td className="text-[12px] font-semibold">{led.length ? [...new Set(led.map((e) => e.status))].join(', ') : '-'}</td>
                <td><div className="flex flex-wrap gap-1.5">
                  <button onClick={() => {
                    if (!window.confirm('Tandai trip ini sebagai selesai? Ledger akan menjadi layak cair.')) return;
                    if (setScheduleTripStatus(s.id, 'arrived')) { refresh(); toast('Trip ditandai selesai'); }
                  }} className="bg-blue-600 text-white text-[11.5px] font-extrabold px-3 py-2 rounded-lg">Trip Terjadi</button>
                  <button onClick={() => openModal(<NoShowModal sid={s.id} />)} className="bg-red-50 text-red-600 text-[11.5px] font-extrabold px-3 py-2 rounded-lg">Tidak Berangkat</button>
                </div></td>
              </tr>
            );
          })}
        </tbody></table></div>
      </div> : null}

      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="wallet" className="w-5 h-5 text-sky-600" />Refund Perlu Diproses ({refunds.length})</h3>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Dana refund dicatat otomatis saat pembatalan. Tandai selesai setelah dana benar-benar dikembalikan ke pelanggan.</p>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[900px]"><thead><tr>
          <th>Kode / Pelanggan</th><th>Rute / Jadwal</th><th>Alasan</th><th>Nominal</th><th>Status</th><th>Aksi</th>
        </tr></thead><tbody>
          {refunds.map((b) => {
            const s = schedById(b.scheduleId);
            const r = s ? routeById(s.routeId) : null;
            const processing = b.refundStatus === 'diproses';
            return (
              <tr key={b.id}>
                <td className="font-mono font-extrabold">{b.code}<br /><span className="text-[11px] text-slate-400 font-semibold">{b.userEmail}</span></td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}<br /><span className="text-slate-400">{s ? `${s.date} ${s.time}` : '-'}</span></td>
                <td className="text-[12px] font-semibold">{b.cancelReason || '-'}<br /><span className="text-slate-400">{b.cancelledBy || '-'} • {b.refundScope === 'total' ? '100% total' : b.refundScope === 'partial' ? (b.refundPct || 0) + '% dari total' : 'komponen tiket'}</span></td>
                <td className="font-extrabold text-green-700">{fmtRp(b.refundAmount)}</td>
                <td>{processing ? <span className="badge bg-sky-100 text-sky-700">Diproses</span> : <span className="badge bg-amber-100 text-amber-700">Menunggu</span>}</td>
                <td>{processing
                  ? <button onClick={() => {
                    const res = markRefundPaid(b.id);
                    if (!res.ok) { toast(res.msg, 'err'); return; }
                    refresh();
                    toast('Refund ' + b.code + ' ditandai selesai');
                  }} className="bg-green-500 text-white text-[11.5px] font-extrabold px-3 py-2 rounded-lg">Tandai Selesai</button>
                  : <button onClick={() => {
                    const res = startRefundProcessing(b.id);
                    if (!res.ok) { toast(res.msg, 'err'); return; }
                    refresh();
                    toast('Refund ' + b.code + ' mulai diproses');
                  }} className="bg-sky-600 text-white text-[11.5px] font-extrabold px-3 py-2 rounded-lg">Proses Refund</button>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {refunds.length === 0 ? <Empty icon="wallet" msg="Tidak ada refund yang menunggu diproses." /> : null}
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="hand-coins" className="w-5 h-5 text-sky-600" />Riwayat Pencairan Pengemudi (Tiket)</h3>
          <FilterBar agFilter={agFilter} setAgFilter={setAgFilter} agencies={agencies} />
        </div>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Pencairan berjalan <b>otomatis</b>: layak saat tiba, tercatat terkirim ke rekening pengemudi 24 jam kemudian. Tidak ada tombol — laporan ini bukti siapa sudah berhak berapa.</p>
        {(driverPending.length > 0 && driverAutoAt) ? (
          <div className="mt-2 bg-blue-50 text-blue-700 rounded-xl px-3 py-2 text-[12px] font-semibold">{driverPending.length} pos akan otomatis tercatat terkirim paling cepat di {driverAutoAt}</div>
        ) : null}
        <div className="table-wrap mt-3"><table className="data w-full min-w-[820px]"><thead><tr>
          <th>Kode</th><th>Rute</th><th>Pengemudi / Bank</th><th>Nominal Tiket</th><th>Tgl Tiba</th><th>Tgl Cair</th>
        </tr></thead><tbody>
          {driverRows.map((e) => {
            const { r, d, ag, tiba } = rowInfo(e);
            const bank = (d?.bank || '').trim();
            const paidDate = new Date(String(e.paidOutAt || '')).toISOString().slice(0, 10);
            return (
              <tr key={e.id}>
                <td className="font-mono font-extrabold">{codeOf(e)}<br /><span className="text-[11px] text-slate-400 font-semibold">{ag?.name || 'Agen lama'}</span></td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}<br /><span className="text-slate-400">{(e.seats || []).join(', ') || '-'}</span></td>
                <td className="text-[12.5px] font-semibold">{d?.name || '-'}<br /><span className="text-slate-400">{bank || ''}</span>{bank ? null : <span className="badge bg-red-100 text-red-600 ml-1">Rekening kosong</span>}</td>
                <td className="font-extrabold">{fmtRp(e.ticket)}</td>
                <td className="text-[12px] font-semibold">{tiba || '-'}</td>
                <td>{e.paidOutAt
                  ? <span className="text-[12px] font-bold">{paidDate}</span>
                  : (ledgerEligible(e)
                    ? <span className="badge bg-sky-100 text-sky-700">Otomatis</span>
                    : <span className="badge bg-amber-100 text-amber-700">Menunggu kliring 24 jam</span>)}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {driverRows.length === 0 ? <Empty icon="hand-coins" msg="Belum ada pencairan tiket — baris muncul saat tiket lunas dan bus tiba." /> : null}
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="banknote" className="w-5 h-5 text-emerald-600" />Riwayat Pencairan Jasa — Agen</h3>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Jasa agen tercatat terkirim ke rekening agen (dari KYC) tepat 5 menit setelah bus tiba — otomatis, mengikuti jendela ulasan pelanggan.</p>
        {(servicePending.length > 0 && serviceAutoAt) ? (
          <div className="mt-2 bg-emerald-50 text-emerald-700 rounded-xl px-3 py-2 text-[12px] font-semibold">{servicePending.length} pos jasa akan otomatis tercatat terkirim paling cepat di {serviceAutoAt}</div>
        ) : null}
        <div className="table-wrap mt-3"><table className="data w-full min-w-[720px]"><thead><tr>
          <th>Kode</th><th>Rute</th><th>Agen / Rekening</th><th>Nominal Jasa</th><th>Tgl Tiba</th><th>Tgl Cair</th>
        </tr></thead><tbody>
          {serviceRows.map((e) => {
            const { r, ag, tiba } = rowInfo(e);
            const rek = (ag?.bank || '').trim();
            return (
              <tr key={e.id}>
                <td className="font-mono font-extrabold">{codeOf(e)}</td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}<br /><span className="text-slate-400">{(e.seats || []).join(', ') || '-'}</span></td>
                <td className="text-[12.5px] font-semibold">{ag?.name || '-'}<br /><span className="text-slate-400">{rek || ''}</span>{rek ? null : <span className="badge bg-red-100 text-red-600 ml-1">Rekening kosong</span>}</td>
                <td className="font-extrabold text-emerald-700">{fmtRp(e.service)}</td>
                <td className="text-[12px] font-semibold">{tiba || '-'}</td>
                <td className="text-[12px] font-bold">{String(e.servicePaidOutAt || '').slice(0, 10)}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {serviceRows.length === 0 ? <Empty icon="banknote" msg="Belum ada jasa yang tercatat terkirim — muncul 5 menit setelah tag tiba." /> : null}
      </div>
    </div>
  );
}
