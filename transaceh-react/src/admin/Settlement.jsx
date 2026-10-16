import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { settleLedger, ledgerEligible, driverById, schedById, routeById, agencyById } from '@/lib/domain.js';
import { fmtRp } from '@/lib/utils.js';
import { Icon, Empty } from '@/components/ui.jsx';

export default function Settlement() {
  const { toast, refresh } = useApp();
  const [agFilter, setAgFilter] = useState('');
  const [sel, setSel] = useState([]);
  const agencies = DB.load('agencies', []);
  const ledger = DB.load('ledger', []);
  const bookings = DB.load('bookings', []);
  const codeOf = (e) => bookings.find((b) => b.id === e.bookingId)?.code || '-';

  const layakList = ledger
    .filter((e) => e.status === 'layak' && (!agFilter || e.agencyId === agFilter))
    .sort((a, b) => (a.releasedAt || a.createdAt || '').localeCompare(b.releasedAt || b.createdAt || ''));
  const readyIds = layakList.filter((e) => ledgerEligible(e)).map((e) => e.id);
  const allReady = readyIds.length > 0 && readyIds.every((id) => sel.includes(id));

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAllReady = () => {
    if (allReady) setSel((s) => s.filter((id) => !readyIds.includes(id)));
    else setSel((s) => [...new Set([...s, ...readyIds])]);
  };

  const doSettle = () => {
    const ids = sel.filter((id) => layakList.some((e) => e.id === id));
    if (ids.length === 0) { toast('Pilih minimal 1 entri layak cair', 'warn'); return; }
    const n = settleLedger(ids);
    setSel([]);
    refresh();
    toast(n + ' pos dana ditandai dicairkan');
    refresh();
  };

  const history = ledger
    .filter((e) => e.status === 'dicairkan' && (!agFilter || e.agencyId === agFilter))
    .sort((a, b) => (b.paidOutAt || '').localeCompare(a.paidOutAt || ''))
    .slice(0, 10);

  const rowInfo = (e) => {
    const s = schedById(e.scheduleId);
    const r = s ? routeById(s.routeId) : null;
    const d = e.driverId ? driverById(e.driverId) : null;
    const ag = agencyById(e.agencyId);
    const tiba = (s?.arrivedAt || e.releasedAt || '').slice(0, 10);
    const ok = ledgerEligible(e);
    return { s, r, d, ag, tiba, ok };
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="hand-coins" className="w-5 h-5 text-sky-600" />Settlement Pencairan ({layakList.length})</h3>
          <div className="flex-1"></div>
          <select value={agFilter} onChange={(e) => { setAgFilter(e.target.value); setSel([]); }} className="text-[13px] font-bold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
            <option value="">Semua agen</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={doSettle} className="bg-green-500 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl">Tandai Dicairkan{sel.length ? ` (${sel.length})` : ''}</button>
        </div>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[820px]"><thead><tr>
          <th><input type="checkbox" checked={allReady} onChange={toggleAllReady} className="w-4 h-4 accent-sky-600" title="Pilih semua yg siap" /></th>
          <th>Kode</th><th>Rute</th><th>Pengemudi / Bank</th><th>Nominal Tiket</th><th>Tgl Tiba</th><th>Kliring</th>
        </tr></thead><tbody>
          {layakList.map((e) => {
            const { r, d, ag, tiba, ok } = rowInfo(e);
            const bank = (d?.bank || '').trim();
            return (
              <tr key={e.id}>
                <td><input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} className="w-4 h-4 accent-sky-600" /></td>
                <td className="font-mono font-extrabold">{codeOf(e)}<br /><span className="text-[11px] text-slate-400 font-semibold">{ag?.name || ''}</span></td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}<br /><span className="text-slate-400">{(e.seats || []).join(', ') || '-'}</span></td>
                <td className="text-[12.5px] font-semibold">{d?.name || '-'}<br /><span className="text-slate-400">{bank || ''}</span>{bank ? null : <span className="badge bg-red-100 text-red-600 ml-1">Rekening kosong</span>}</td>
                <td className="font-extrabold">{fmtRp(e.ticket)}</td>
                <td className="text-[12px] font-semibold">{tiba || '-'}</td>
                <td>{ok ? <span className="badge bg-green-100 text-green-700">Siap</span> : <span className="badge bg-amber-100 text-amber-700">Kliring &lt;24 jam</span>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {layakList.length === 0 ? <Empty icon="hand-coins" msg="Tidak ada entri layak cair." /> : null}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[16px] flex items-center gap-2"><Icon name="history" className="w-5 h-5 text-sky-600" />Riwayat Dicairkan (10 terakhir)</h3>
        <div className="table-wrap mt-3"><table className="data w-full min-w-[720px]"><thead><tr><th>Kode</th><th>Rute</th><th>Pengemudi</th><th>Nominal Tiket</th><th>Tgl Cair</th></tr></thead><tbody>
          {history.map((e) => {
            const { r, d } = rowInfo(e);
            return (
              <tr key={e.id}>
                <td className="font-mono font-extrabold">{codeOf(e)}</td>
                <td className="text-[12.5px] font-semibold">{r ? `${r.from} → ${r.to}` : '-'}</td>
                <td className="text-[12.5px] font-semibold">{d?.name || '-'}</td>
                <td className="font-extrabold">{fmtRp(e.ticket)}</td>
                <td className="text-[12px] font-semibold">{(e.paidOutAt || '').slice(0, 10)}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {history.length === 0 ? <Empty icon="history" msg="Belum ada pencairan." /> : null}
      </div>
    </div>
  );
}
