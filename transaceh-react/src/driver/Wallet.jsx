import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { ledgerByDriver, totalBersihOf } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, StatCard } from '@/components/ui.jsx';
import DriverLedgerTable from '@/components/DriverLedgerTable.jsx';
import { drvOfUser } from './Tasks.jsx';

export default function Wallet() {
  const { user } = useApp();
  const me = drvOfUser(user);
  const entries = me ? ledgerByDriver(me.id) : [];
  const bookings = DB.load('bookings', []);
  /* Card indikator memakai total bersih (tiket + komisi via sopir) —
     satu basis dengan tabel (helper di DriverLedgerTable). */
  const sum = (st) => entries.filter((e) => e.status === st).reduce((a, e) => a + totalBersihOf(e, bookings), 0);
  const pending = sum('ditahan');
  const layak = sum('layak');
  const done = sum('dicairkan');
  return (
    <>
      <div className="anim bg-white rounded-3xl shadow-card p-5">
        <h2 className="font-extrabold text-[17px] flex items-center gap-2"><Icon name="wallet" className="w-5 h-5 text-sky-600" />Dompet - {me?.name || user?.name}</h2>
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          <StatCard icon="timer" label="Saldo Menunggu" val={fmtRp(pending)} sub="ditahan" color="bg-gradient-to-br from-amber-400 to-orange-500" />
          <StatCard icon="hand-coins" label="Layak Cair" val={fmtRp(layak)} sub="layak" color="bg-gradient-to-br from-green-400 to-emerald-600" />
          <StatCard icon="banknote" label="Sudah Dicairkan" val={fmtRp(done)} sub="dicairkan" color="bg-gradient-to-br from-sky-400 to-blue-600" />
        </div>
        {/* Info rekening pengemudi di ATAS tabel — desain sama dengan kartu
            "Riwayat Jasa" agen: judul seksi + pill rekening KYC ("BANK NoRek
            a.n. Nama"); kosong = badge peringatan. Teks panjang dipotong
            rapi, tooltip memuat penuh. */}
        <div className="flex items-center gap-2 mt-4">
          <h3 className="font-extrabold text-[15px] shrink-0">Riwayat Pencairan</h3>
          {(me?.bank || '').trim() ? (
            <span title={me.bank} className="flex items-center gap-1.5 min-w-0 text-[11.5px] font-bold text-slate-500 bg-slate-50 rounded-xl px-2.5 py-1.5"><Icon name="landmark" className="w-3.5 h-3.5 text-sky-600 shrink-0" /><span className="truncate">{me.bank}</span></span>
          ) : (
            <span className="badge bg-red-100 text-red-600 shrink-0">Rekening kosong</span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 font-medium mt-1">Rekening tujuan pencairan — hubungi travel untuk ubah rekening.</p>
        <DriverLedgerTable entries={entries} />
      </div>
    </>
  );
}
