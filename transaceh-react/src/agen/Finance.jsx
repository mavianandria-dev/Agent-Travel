import { Fragment, useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, driverById, routeById, schedById, viaSopirOf } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { StatCard, Icon, Empty } from '@/components/ui.jsx';
import DriverLedgerTable from '@/components/DriverLedgerTable.jsx';
import { ManifestModal } from './Bookings.jsx';
import { TicketView } from '@/components/TicketView.jsx';

/* Rincian tiket jualan langsung pengemudi untuk satu keberangkatan —
   sumber angka "Komisi Sopir" di tabel Riwayat Jasa (baris lama tanpa
   field viaSopir dihitung ulang dari bookingnya, helper domain). */
function ViaSopirModal({ sid }) {
  const { closeModal, openModal } = useApp();
  const s = schedById(sid);
  const r = s ? routeById(s.routeId) : null;
  const bookings = DB.load('bookings', []);
  const items = DB.load('ledger', []).filter((e) => e.scheduleId === sid && e.status !== 'void' && viaSopirOf(e, bookings) > 0);
  const total = items.reduce((a, e) => a + viaSopirOf(e, bookings), 0);
  const codeOf = (e) => bookings.find((b) => b.id === e.bookingId);
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="car-front" className="w-5 h-5 text-red-500" />Rincian Tiket Via Pengemudi</h3>
        <button onClick={closeModal} className="text-slate-400"><Icon name="x" className="w-5 h-5" /></button>
      </div>
      <div className="text-[13px] font-bold mt-2">{r ? `${r.from} → ${r.to}` : '-'}{s ? <> • {s.date} {s.time}</> : null}</div>
      <table className="data w-full mt-3"><thead><tr><th>&nbsp;</th><th>Kode</th><th>Kursi</th><th>Nominal Tiket</th><th>Komisi Via Sopir</th></tr></thead><tbody>
        {items.map((e) => {
          const b = codeOf(e);
          return (
            <tr key={e.id}>
              <td>{b && ['paid', 'done'].includes(b.status) ? <button onClick={() => openModal(<TicketView bid={b.id} />)} title="Lihat Tiket" className="text-sky-600 hover:bg-sky-50 rounded-lg p-1 -ml-1"><Icon name="eye" className="w-4 h-4" /></button> : <span className="text-slate-200">-</span>}</td>
              <td className="font-mono font-extrabold">{b?.code || '-'}</td>
              <td className="text-[12.5px] font-semibold">{(e.seats || []).join(', ') || '-'}</td>
              <td className="font-extrabold text-green-700">+{fmtRp(e.ticket)}</td>
              <td className="font-extrabold text-red-600">-{fmtRp(viaSopirOf(e, bookings))}</td>
            </tr>
          );
        })}
        {items.length === 0 ? <tr><td colSpan={5} className="text-center text-slate-400 font-semibold py-4">Tidak ada tiket via pengemudi pada keberangkatan ini.</td></tr> : null}
      </tbody></table>
      <div className="flex justify-between items-center mt-3 bg-red-50 border-2 border-red-100 rounded-2xl px-3.5 py-2.5">
        <span className="font-extrabold text-[13px] text-red-800">Total Komisi Via Sopir</span>
        <span className="font-extrabold text-[14px] text-red-700">-{fmtRp(total)}</span>
      </div>
      <button onClick={closeModal} className="w-full mt-4 bg-slate-100 font-extrabold text-[13px] py-2.5 rounded-xl">Tutup</button>
    </div>
  );
}

export default function Finance({ ag, st }) {
  const { user, toast, tick, openModal } = useApp();
  void tick;
  void st;
  /* Menu export (Excel/PDF) terbuka-tutup — satu tombol ikon printer. */
  const [expMenu, setExpMenu] = useState(false);
  /* Kartu rincian tiket "terselip" — satu keberangkatan terbuka sekali. */
  const [openLedger, setOpenLedger] = useState(null);
  const agency = ag || agencyOf(user);
  if (!agency) return <div className="bg-white rounded-3xl shadow-card p-5 text-center font-bold text-slate-400">Data travel tidak ditemukan</div>;

  const ledger = DB.load('ledger', []).filter((e) => e.agencyId === agency.id && e.status !== 'void');
  const active = ledger.filter((e) => e.status === 'ditahan' || e.status === 'layak' || e.status === 'dicairkan');
  const bookings = DB.load('bookings', []);
  const byId = (id) => bookings.find((b) => b.id === id);
  /* Komisi via sopir per entri — helper domain (baris lama dihitung
     ulang dari bookingnya). Jasa bersih = jasa − komisi — uang yang
     benar-benar milik agen; dipakai card indikator dan tabel. */
  const bersihOf = (e) => Math.max(0, (Number(e.service) || 0) - viaSopirOf(e, bookings));
  /* Card indikator pola dompet pengemudi: tiga status, basis jasa bersih.
     "Sudah Dicairkan" tetap memakai cap sistem servicePaidOutAt (jasa cair
     langsung begitu tiba) — baris dicairkan lama tanpa cap jasa
     tidak dihitung terkirim, dan tidak dihitung ganda di Layak Cair. */
  const sumBersih = (fn) => active.filter(fn).reduce((a, e) => a + bersihOf(e), 0);
  const pending = sumBersih((e) => e.status === 'ditahan');
  const layak = sumBersih((e) => e.status === 'layak' && !e.servicePaidOutAt);
  const done = sumBersih((e) => !!e.servicePaidOutAt);
  /* Tanggal + jam:menit waktu perangkat (bukan UTC server) untuk tampilan. */
  const loc = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  /* Kelompokkan per keberangkatan (jadwal): satu baris = satu berangkat,
     semua nilai dijumlahkan; urut keberangkatan terbaru di atas. */
  const groups = [];
  const seen = {};
  active.forEach((e) => {
    const sid = String(e.scheduleId || '');
    if (!seen[sid]) { seen[sid] = { sid, items: [] }; groups.push(seen[sid]); }
    seen[sid].items.push(e);
  });
  const depKey = (g) => {
    const s = schedById(g.sid);
    return String(s?.departedAt || (s ? `${s.date || ''}T${s.time || ''}` : '') || '');
  };
  groups.sort((a, b) => depKey(b).localeCompare(depKey(a)));

  /* Riwayat pencairan TIKET pengemudi agensi ini — mirror tabel Settlement
     admin DITAMBAH status belum cair: ditahan + layak + dicairkan (void
     sudah tersaring di ledger), satu baris per keberangkatan, urut
     keberangkatan terbaru di atas (depKey di atas). */
  const driverRows = ledger.slice().sort((a, b) => (b.paidOutAt || b.releasedAt || b.createdAt || '').localeCompare(a.paidOutAt || a.releasedAt || a.createdAt || ''));
  const depGroups = [];
  const seenSched = {};
  driverRows.forEach((e) => {
    const sid = String(e.scheduleId || '');
    if (!seenSched[sid]) { seenSched[sid] = { sid, items: [] }; depGroups.push(seenSched[sid]); }
    seenSched[sid].items.push(e);
  });
  depGroups.sort((a, b) => depKey(b).localeCompare(depKey(a)));

  const exportCSV = () => {
    let csv = 'Kode,Kursi,Rute,Tanggal,Jam,Tiket,Jasa,Fee,Total,Status\n';
    active.forEach((e) => {
      const s = schedById(e.scheduleId);
      if (!s) return;
      const r = routeById(s.routeId);
      const b = byId(e.bookingId);
      const code = b?.code || e.bookingId;
      const seats = '"' + (e.seats || []).join(' ') + '"';
      const rute = '"' + (r ? r.from + '-' + r.to : '-') + '"';
      csv += `${code},${seats},${rute},${s.date},${s.time},${Number(e.ticket) || 0},${Number(e.service) || 0},${Number(e.fee) || 0},${Number(e.total) || 0},${e.status}\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'laporan-jasa.csv';
    a.click();
    toast('Laporan Excel (CSV) diunduh');
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <StatCard icon="timer" label="Saldo Menunggu" val={fmtRp(pending)} sub="ditahan" color="bg-gradient-to-br from-amber-400 to-orange-500" />
        <StatCard icon="hand-coins" label="Layak Cair" val={fmtRp(layak)} sub="layak" color="bg-gradient-to-br from-green-400 to-emerald-600" />
        <StatCard icon="banknote" label="Sudah Dicairkan" val={fmtRp(done)} sub="dicairkan" color="bg-gradient-to-br from-sky-400 to-blue-600" />
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5 mt-4"><div className="flex items-center gap-2"><h3 className="font-extrabold text-[15px]">Riwayat Jasa</h3>
        {/* Info rekening agen (dari KYC, format "BANK NoRek a.n. Nama") —
            sumber sama dengan tabel Settlement admin; kosong = badge peringatan.
            Teks panjang dipotong rapi agar tombol Export tak terdorong. */}
        {(agency.bank || '').trim() ? (
          <span title={agency.bank} className="flex items-center gap-1.5 min-w-0 text-[11.5px] font-bold text-slate-500 bg-slate-50 rounded-xl px-2.5 py-1.5"><Icon name="landmark" className="w-3.5 h-3.5 text-sky-600 shrink-0" /><span className="truncate">{agency.bank}</span></span>
        ) : (
          <span className="badge bg-red-100 text-red-600 shrink-0">Rekening kosong</span>
        )}
        <div className="flex-1"></div>
        {/* Satu tombol ikon printer — menu kecil berisi kedua export
            (Excel CSV unduh, PDF lewat dialog cetak). Klik di luar menutup. */}
        <div className="relative shrink-0">
          <button onClick={() => setExpMenu((v) => !v)} title="Export laporan" className="bg-slate-100 hover:bg-slate-200 p-2.5 rounded-xl flex items-center"><Icon name="printer" className="w-4 h-4 text-slate-600" /></button>
          {expMenu ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setExpMenu(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border-2 border-slate-100 rounded-2xl shadow-pop p-1.5 z-40">
                <button onClick={() => { setExpMenu(false); exportCSV(); }} className="w-full flex items-center gap-2 text-[12.5px] font-bold px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left"><Icon name="file-spreadsheet" className="w-4 h-4 text-green-600 shrink-0" />Excel (CSV)</button>
                <button onClick={() => { setExpMenu(false); window.print(); }} className="w-full flex items-center gap-2 text-[12.5px] font-bold px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left"><Icon name="file-text" className="w-4 h-4 text-sky-600 shrink-0" />PDF / Cetak</button>
              </div>
            </>
          ) : null}
        </div></div>
        <div className="overflow-x-auto mt-2"><table className="data w-full min-w-[780px]"><thead><tr><th>Manifest</th><th>Rute</th><th>Nominal Jasa</th><th>Komisi Sopir</th><th>Jasa Bersih</th><th>Tgl Cair / Status</th></tr></thead><tbody>
          {groups.map((g) => {
            const s = schedById(g.sid);
            const r = s ? routeById(s.routeId) : null;
            /* Komisi via sopir dijumlah per tiket — helper domain; baris
               lama dihitung ulang dari bookingnya. */
            const vs = g.items.reduce((a, e) => a + viaSopirOf(e, bookings), 0);
            const jasa = g.items.reduce((a, e) => a + (Number(e.service) || 0), 0);
            const bersih = Math.max(0, jasa - vs);
            const berangkat = loc(s?.departedAt) || (s ? `${s.date || ''} ${s.time || ''}`.trim() : '');
            const tiba = loc(s?.arrivedAt);
            /* Status kelompok: jasa cair langsung begitu tiba —
               semua terkirim (cap servicePaidOutAt) → Dicairkan + jam. */
            const allCair = g.items.every((e) => e.servicePaidOutAt);
            const anyTahan = g.items.some((e) => e.status === 'ditahan');
            const badge = allCair ? ['b-done', 'Dicairkan'] : anyTahan ? ['b-pending', 'Ditahan'] : ['b-paid', 'Layak Cair'];
            const cairAt = allCair ? loc(g.items.map((e) => e.servicePaidOutAt).sort().pop()) : '';
            return (
              <tr key={g.sid || g.items[0]?.id}>
                <td><button onClick={() => openModal(<ManifestModal sid={g.sid} />)} title="Manifest" className="bg-sky-100 text-sky-700 p-2 rounded-lg"><Icon name="users" className="w-4 h-4" /></button></td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}{berangkat ? <span className="block text-[11px] text-slate-400 font-semibold">Berangkat {berangkat}</span> : null}{tiba ? <span className="block text-[11px] text-slate-400 font-semibold">Tiba {tiba}</span> : null}</td>
                <td className="font-extrabold text-green-700">+{fmtRp(jasa)}</td>
                <td className="font-extrabold text-red-600">{vs > 0 ? <button onClick={() => openModal(<ViaSopirModal sid={g.sid} />)} title="Lihat rincian tiket via pengemudi" className="underline decoration-dotted underline-offset-2 rounded px-1 hover:bg-red-50 transition">-{fmtRp(vs)}</button> : <span className="text-slate-300">–</span>}</td>
                <td className="font-extrabold">{fmtRp(bersih)}</td>
                <td><span className={`badge ${badge[0]}`}>{badge[1]}</span>{cairAt ? <span className="block text-[11px] font-bold text-slate-600 mt-0.5">{cairAt}</span> : null}{!allCair && !anyTahan ? <span className="block text-[10px] font-semibold text-sky-600 mt-0.5">Otomatis</span> : null}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {groups.length === 0 ? <p className="text-[12.5px] text-slate-400 font-semibold mt-3">Belum ada transaksi jasa — baris muncul saat ada tiket lunas.</p> : null}</div>

      {/* Mirror tabel "Riwayat Pencairan Pengemudi (Tiket)" Settlement admin,
          difilter ke pengemudi agensi ini (ledger.agencyId). Baris per
          keberangkatan; klik baris → kartu rincian per tiket terselip. */}
      <div className="bg-white rounded-3xl shadow-card p-5 mt-4">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="hand-coins" className="w-5 h-5 text-sky-600" />Riwayat Pencairan Pengemudi (Tiket)</h3>
        <p className="text-[12px] text-slate-500 font-medium mt-1">Pencairan berjalan <b>otomatis</b>: begitu bus tiba, dana tiket langsung tercatat terkirim ke rekening pengemudi. Tidak ada tombol — laporan ini bukti siapa sudah berhak berapa. Komisi via sopir (50% jasa untuk tiket jualan langsung) tampil di kolomnya sendiri. Baris <b>Ditahan</b> = tiket sudah lunas tapi bus belum tiba.</p>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[860px]"><thead><tr>
          <th>Rute</th><th>Pengemudi / Bank</th><th>Total Nominal Tiket</th><th>Total Komisi Via Sopir</th><th>Total Bersih</th><th>Tgl Cair / Status</th>
        </tr></thead><tbody>
          {depGroups.map((g) => {
            const s = schedById(g.sid);
            const r = s ? routeById(s.routeId) : null;
            const first = g.items[0];
            const d = first.driverId ? driverById(first.driverId) : null;
            const bank = (d?.bank || '').trim();
            const berangkat = loc(s?.departedAt) || (s ? `${s.date || ''} ${s.time || ''}`.trim() : '');
            const tiba = loc(s?.arrivedAt || first.releasedAt);
            const tiket = g.items.reduce((a, e) => a + (Number(e.ticket) || 0), 0);
            /* Komisi via sopir dijumlah per tiket — helper domain; baris
               lama dihitung ulang dari bookingnya. */
            const vs = g.items.reduce((a, e) => a + viaSopirOf(e, bookings), 0);
            /* Status kelompok: semua dicairkan → Dicairkan + jam terakhir;
               ada ditahan → Ditahan; sisanya Layak Cair (pola Riwayat Jasa). */
            const allCair = g.items.every((e) => e.status === 'dicairkan');
            const anyTahan = g.items.some((e) => e.status === 'ditahan');
            const badge = allCair ? ['b-done', 'Dicairkan'] : anyTahan ? ['b-pending', 'Ditahan'] : ['b-paid', 'Layak Cair'];
            const cairAt = allCair ? loc(g.items.map((e) => e.paidOutAt).filter(Boolean).sort().pop()) : '';
            return (
              <Fragment key={g.sid || first.id}>
                <tr onClick={() => setOpenLedger(openLedger === g.sid ? null : g.sid)} className="cursor-pointer hover:bg-sky-50/60 transition">
                  <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}{berangkat ? <span className="block text-[11px] text-slate-400 font-semibold">Berangkat {berangkat}</span> : null}{tiba ? <span className="block text-[11px] text-slate-400 font-semibold">Tiba {tiba}</span> : null}</td>
                  <td className="text-[12.5px] font-semibold">{d?.name || '-'}<br /><span className="text-slate-400">{bank || ''}</span>{bank ? null : <span className="badge bg-red-100 text-red-600 ml-1">Rekening kosong</span>}</td>
                  <td className="font-extrabold text-green-700">+{fmtRp(tiket)}</td>
                  <td className="font-extrabold text-green-700">{vs > 0 ? `+${fmtRp(vs)}` : <span className="text-slate-300">–</span>}</td>
                  <td className="font-extrabold">{fmtRp(tiket + vs)}</td>
                  <td><span className={`badge ${badge[0]}`}>{badge[1]}</span>{cairAt ? <span className="block text-[11px] font-bold text-slate-600 mt-0.5">{cairAt}</span> : null}{!allCair && !anyTahan ? <span className="block text-[10px] font-semibold text-sky-600 mt-0.5">Otomatis</span> : null}</td>
                </tr>
                {openLedger === g.sid ? (
                  <tr>
                    <td colSpan={6} className="bg-slate-50">
                      <div className="anim bg-white border-2 border-slate-100 rounded-2xl p-4 m-2">
                        <div className="font-extrabold text-[14px] flex items-center gap-2"><Icon name="ticket" className="w-4 h-4 text-sky-600" />Rincian Tiket — {r ? `${r.from} → ${r.to}` : '-'} · {berangkat || '-'}</div>
                        {/* Rincian per tiket keberangkatan ini — komponen
                            bersama dompet pengemudi; kolom berangkat disembunyikan
                            karena sudah ada di baris induk. */}
                        <DriverLedgerTable entries={g.items} showBerangkat={false} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody></table></div>
        {depGroups.length === 0 ? <Empty icon="hand-coins" msg="Belum ada pencairan tiket — baris muncul saat tiket lunas dan bus tiba." /> : null}
      </div>
      <div className="hidden"><Icon name="wallet" className="w-4 h-4" /></div>
    </div>
  );
}
