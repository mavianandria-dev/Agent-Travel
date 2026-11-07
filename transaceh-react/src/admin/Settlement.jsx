import { Fragment, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { driverById, schedById, routeById, agencyById, scheduleNeedsReview, setScheduleTripStatus, resolveScheduleNoShow, splitFare, fareModelOf, viaSopirOf, markRefundPaid, startRefundProcessing, LEDGER_SERV_GATE_MS } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';
import { ManifestModal } from '@/agen/Bookings.jsx';
import DriverLedgerTable from '@/components/DriverLedgerTable.jsx';

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
  const [openLedger, setOpenLedger] = useState(null);
  const agencies = DB.load('agencies', []);
  const ledger = DB.load('ledger', []);
  const bookings = DB.load('bookings', []);

  /* Laporan TIKET pengemudi: langsung tercatat terkirim begitu tiba (kliring 0). */
  /* Termasuk yang belum cair (ditahan) — admin melihat penuh: ditahan,
     layak, dicairkan; void tetap tersaring. */
  const driverRows = ledger
    .filter((e) => (e.status === 'ditahan' || e.status === 'layak' || e.status === 'dicairkan') && (!agFilter || e.agencyId === agFilter))
    .sort((a, b) => (b.paidOutAt || b.releasedAt || b.createdAt || '').localeCompare(a.paidOutAt || a.releasedAt || a.createdAt || ''));

  /* Tabel induk: satu baris per keberangkatan (rute + waktu berangkat) —
     nilai dijumlahkan per jadwal; urut keberangkatan terbaru di atas. */
  const depGroups = [];
  const seenSched = {};
  driverRows.forEach((e) => {
    const sid = String(e.scheduleId || '');
    if (!seenSched[sid]) { seenSched[sid] = { sid, items: [] }; depGroups.push(seenSched[sid]); }
    seenSched[sid].items.push(e);
  });
  const depKey = (g) => {
    const s = schedById(g.sid);
    return String(s?.departedAt || (s ? `${s.date || ''}T${s.time || ''}` : '') || '');
  };
  depGroups.sort((a, b) => depKey(b).localeCompare(depKey(a)));
  /* Tanggal + jam:menit waktu perangkat (bukan UTC server) untuk tampilan. */
  const loc = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /* Laporan JASA agen: hanya baris yang SISTEM sudah menandai terkirim
     (servicePaidOutAt) — era lama tanpa cap jasa tidak ikut tampil. */
  const serviceRows = ledger
    .filter((e) => e.servicePaidOutAt && (!agFilter || e.agencyId === agFilter))
    .sort((a, b) => String(b.servicePaidOutAt || '').localeCompare(String(a.servicePaidOutAt || '')));

  /* Tabel jasa agen: satu baris per keberangkatan — nilai dijumlahkan
     per jadwal (pola sama dengan halaman Keuangan agen); urutan kelompok
     mengikuti pencairan terbaru (serviceRows sudah terurut). */
  const servGroups = [];
  const seenServ = {};
  serviceRows.forEach((e) => {
    const sid = String(e.scheduleId || '');
    if (!seenServ[sid]) { seenServ[sid] = { sid, items: [] }; servGroups.push(seenServ[sid]); }
    seenServ[sid].items.push(e);
  });
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
        <p className="text-[12px] text-slate-500 font-medium mt-1">Pencairan berjalan <b>otomatis</b>: begitu bus tiba, dana tiket langsung tercatat terkirim ke rekening pengemudi. Tidak ada tombol — laporan ini bukti siapa sudah berhak berapa. Komisi via sopir (50% jasa untuk tiket jualan langsung) tampil di kolomnya sendiri. Baris <b>Ditahan</b> = tiket sudah lunas tapi bus belum tiba.</p>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[980px]"><thead><tr>
          <th>Nama Travel</th><th>Rute</th><th>Pengemudi / Bank</th><th>Total Nominal Tiket</th><th>Total Komisi Via Sopir</th><th>Total Bersih</th><th>Tgl Cair / Status</th>
        </tr></thead><tbody>
          {depGroups.map((g) => {
            const s = schedById(g.sid);
            const r = s ? routeById(s.routeId) : null;
            const first = g.items[0];
            const d = first.driverId ? driverById(first.driverId) : null;
            const ag = agencyById(first.agencyId);
            const bank = (d?.bank || '').trim();
            const berangkat = loc(s?.departedAt) || (s ? `${s.date || ''} ${s.time || ''}`.trim() : '');
            const tiba = loc(s?.arrivedAt || first.releasedAt);
            const tiket = g.items.reduce((a, e) => a + (Number(e.ticket) || 0), 0);
            /* Komisi via sopir dijumlah per tiket — helper domain; baris
               lama dihitung ulang dari bookingnya. */
            const vs = g.items.reduce((a, e) => a + viaSopirOf(e, bookings), 0);
            /* Status kelompok: semua dicairkan → Dicairkan + jam terakhir;
               ada ditahan → Ditahan; sisanya Layak Cair (pola halaman
               Keuangan agen). */
            const allCair = g.items.every((e) => e.status === 'dicairkan');
            const anyTahan = g.items.some((e) => e.status === 'ditahan');
            const badge = allCair ? ['b-done', 'Dicairkan'] : anyTahan ? ['b-pending', 'Ditahan'] : ['b-paid', 'Layak Cair'];
            const cairAt = allCair ? loc(g.items.map((e) => e.paidOutAt).filter(Boolean).sort().pop()) : '';
            return (
              <Fragment key={g.sid || first.id}>
                {/* Baris dapat diklik → kartu rincian tiket "terselip"
                    terbuka di bawahnya (satu yang terbuka pada satu waktu). */}
                <tr onClick={() => setOpenLedger(openLedger === g.sid ? null : g.sid)} className="cursor-pointer hover:bg-sky-50/60 transition">
                  <td className="font-extrabold">{ag?.name || 'Agen lama'}</td>
                  <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}{berangkat ? <span className="block text-[11px] text-slate-400 font-semibold">Berangkat {berangkat}</span> : null}{tiba ? <span className="block text-[11px] text-slate-400 font-semibold">Tiba {tiba}</span> : null}</td>
                  <td className="text-[12.5px] font-semibold">{d?.name || '-'}<br /><span className="text-slate-400">{bank || ''}</span>{bank ? null : <span className="badge bg-red-100 text-red-600 ml-1">Rekening kosong</span>}</td>
                  <td className="font-extrabold text-green-700">+{fmtRp(tiket)}</td>
                  <td className="font-extrabold text-green-700">{vs > 0 ? `+${fmtRp(vs)}` : <span className="text-slate-300">–</span>}</td>
                  <td className="font-extrabold">{fmtRp(tiket + vs)}</td>
                  <td><span className={`badge ${badge[0]}`}>{badge[1]}</span>{cairAt ? <span className="block text-[11px] font-bold text-slate-600 mt-0.5">{cairAt}</span> : null}{!allCair && !anyTahan ? <span className="block text-[10px] font-semibold text-sky-600 mt-0.5">Otomatis</span> : null}</td>
                </tr>
                {openLedger === g.sid ? (
                  <tr>
                    <td colSpan={7} className="bg-slate-50">
                      <div className="anim bg-white border-2 border-slate-100 rounded-2xl p-4 m-2">
                        <div className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="ticket" className="w-4 h-4 text-sky-600" />Rincian Tiket — {r ? `${r.from} → ${r.to}` : '-'} · {berangkat || '-'}</div>
                        {/* Rincian per tiket keberangkatan ini — desain dompet
                            pengemudi (komponen bersama); info berangkat
                            disembunyikan karena sudah ada di baris induk. */}
                        <DriverLedgerTable entries={g.items} showBerangkat={false} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody></table></div>
        {driverRows.length === 0 ? <Empty icon="hand-coins" msg="Belum ada pencairan tiket — baris muncul saat tiket lunas dan bus tiba." /> : null}
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="banknote" className="w-5 h-5 text-emerald-600" />Riwayat Pencairan Jasa — Agen</h3>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Jasa agen tercatat terkirim ke rekening agen (dari KYC) langsung begitu bus tiba — otomatis. Untuk tiket jualan langsung pengemudi, 50% jasa jadi komisi pengemudi — jasa bersih agen tampil di kolomnya sendiri.</p>
        {(servicePending.length > 0 && serviceAutoAt) ? (
          <div className="mt-2 bg-emerald-50 text-emerald-700 rounded-xl px-3 py-2 text-[12px] font-semibold">{servicePending.length} pos jasa akan otomatis tercatat terkirim paling cepat di {serviceAutoAt}</div>
        ) : null}
        <div className="table-wrap mt-3"><table className="data w-full min-w-[860px]"><thead><tr>
          <th>Manifest</th><th>Agen / Rekening</th><th>Rute</th><th>Nominal Jasa</th><th>Komisi Sopir</th><th>Jasa Bersih</th><th>Tgl Cair / Status</th>
        </tr></thead><tbody>
          {servGroups.map((g) => {
            const s = schedById(g.sid);
            const r = s ? routeById(s.routeId) : null;
            const first = g.items[0];
            const ag = agencyById(first.agencyId);
            const rek = (ag?.bank || '').trim();
            const berangkat = loc(s?.departedAt) || (s ? `${s.date || ''} ${s.time || ''}`.trim() : '');
            const tiba = loc(s?.arrivedAt);
            /* Nama pengemudi jadwal + pengemudi pengganti bila tercatat. */
            const drvNama = s?.driverName || (s?.driverId ? driverById(s.driverId)?.name : '') || '';
            const backNama = s?.backupName || (s?.backupDriverId ? driverById(s.backupDriverId)?.name : '') || '';
            const jasa = g.items.reduce((a, e) => a + (Number(e.service) || 0), 0);
            /* Komisi via sopir dijumlah per tiket — helper domain; baris
               lama dihitung ulang dari bookingnya. */
            const vs = g.items.reduce((a, e) => a + viaSopirOf(e, bookings), 0);
            const bersih = Math.max(0, jasa - vs);
            const cairAt = loc(g.items.map((e) => e.servicePaidOutAt).sort().pop());
            return (
              <tr key={g.sid || first.id}>
                <td><button onClick={() => openModal(<ManifestModal sid={g.sid} />)} title="Manifest" className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="users" className="w-4 h-4" /></button></td>
                <td className="text-[12.5px] font-semibold">{ag?.name || '-'}<br /><span className="text-slate-400">{rek || ''}</span>{rek ? null : <span className="badge bg-red-100 text-red-600 ml-1">Rekening kosong</span>}</td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}{berangkat ? <span className="block text-[11px] text-slate-400 font-semibold">Berangkat {berangkat}</span> : null}{tiba ? <span className="block text-[11px] text-slate-400 font-semibold">Tiba {tiba}</span> : null}{drvNama ? <span className="block text-[11px] text-slate-400 font-semibold">Pengemudi {drvNama}</span> : null}{backNama ? <span className="block text-[11px] text-slate-400 font-semibold">Pengganti {backNama}</span> : null}</td>
                <td className="font-extrabold text-green-700">+{fmtRp(jasa)}</td>
                <td className="font-extrabold text-red-600">{vs > 0 ? `-${fmtRp(vs)}` : <span className="text-slate-300">–</span>}</td>
                <td className="font-extrabold">{fmtRp(bersih)}</td>
                <td><span className="badge b-done">Dicairkan</span>{cairAt ? <span className="block text-[11px] font-bold text-slate-600 mt-0.5">{cairAt}</span> : null}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {serviceRows.length === 0 ? <Empty icon="banknote" msg="Belum ada jasa yang tercatat terkirim — muncul begitu tag tiba." /> : null}
      </div>
    </div>
  );
}
