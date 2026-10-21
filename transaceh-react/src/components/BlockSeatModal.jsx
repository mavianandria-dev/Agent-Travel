import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { schedById, vehicleById, vehLayout, takenSeats, toggleScheduleSeatBlock } from '@/lib/domain.js';
import { CabinGrid, Icon } from '@/components/ui.jsx';

/** Tutup / buka kursi manual untuk satu jadwal. Dipakai Agen (Jadwal) dan Pengemudi (Tugas).
 *  Interaksinya sama seperti konfigurasi bangku: pilih alat, lalu klik petak kursi. */
export default function BlockSeatModal({ sid, by = 'agen' }) {
  const { closeModal, toast, refresh, tick } = useApp();
  void tick;
  const s = schedById(sid);
  const [reason, setReason] = useState('');
  const [tool, setTool] = useState('block');
  if (!s) return <div className="p-6 font-bold text-slate-500">Jadwal tidak ditemukan</div>;

  const v = vehicleById(s.vehicleId);
  const layout = vehLayout(v);
  const blockedList = Array.isArray(s.blockedSeats) ? s.blockedSeats : [];
  const tk = takenSeats(sid);
  const isDriver = by === 'pengemudi';

  const toggle = (st) => {
    const opening = blockedList.includes(st);
    if (tool === 'open' && !opening) { toast('Kursi ' + st + ' sedang tidak diblokir', 'warn'); return; }
    if (tool === 'block' && opening) { toast('Kursi ' + st + ' sudah diblokir — pilih alat "Buka Kursi"', 'warn'); return; }
    const res = toggleScheduleSeatBlock(sid, st, { reason: opening ? '' : reason, by });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    refresh();
    if (opening) {
      setReason('');
      toast('Kursi ' + st + ' dibuka kembali');
    } else {
      toast('Kursi ' + st + ' diblokir');
    }
  };

  return (
    <div className="p-6">
      <h3 className="font-extrabold text-[16px]">Tutup / Buka Kursi Manual</h3>
      <p className="text-[12px] text-slate-500 font-medium">Pilih alat lalu klik kursi pada denah. {isDriver ? 'Alasan wajib saat menutup kursi.' : ''}</p>

      <div className="flex gap-2 mt-3">
        <button onClick={() => setTool('block')} className={'flex-1 rounded-xl border-2 py-2 font-extrabold text-[12.5px] ' + (tool === 'block' ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-500')}>
          <Icon name="ban" className="w-4 h-4 inline" /> Tutup Kursi
        </button>
        <button onClick={() => setTool('open')} className={'flex-1 rounded-xl border-2 py-2 font-extrabold text-[12.5px] ' + (tool === 'open' ? 'border-green-400 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-500')}>
          <Icon name="circle-check-big" className="w-4 h-4 inline" /> Buka Kursi
        </button>
      </div>

      <div className="mt-3">
        <CabinGrid
          layout={layout}
          paid={tk.paid.filter((x) => !blockedList.includes(x))}
          hold={tk.hold}
          inactive={tk.inactive}
          blocked={blockedList}
          onPick={toggle}
          interactive
          plate={v?.plate}
          vehName={v ? ((v.brand || '') + (v.model ? ' ' + v.model : '')).trim() : ''}
          legend={false}
        />
      </div>

      <div className="flex gap-3 mt-2 text-[11px] font-bold flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: '#dcfce7', borderColor: '#22c55e' }}></span>Bisa ditutup</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md border-2" style={{ background: '#fee2e2', borderColor: '#dc2626' }}></span>Sudah ditutup</span>
        <span className="flex items-center gap-1.5 text-slate-500"><Icon name="x" className="w-3.5 h-3.5" />Terisi</span>
        <span className="flex items-center gap-1.5 text-slate-500"><Icon name="timer" className="w-3.5 h-3.5" />Ditahan</span>
        <span className="flex items-center gap-1.5 text-slate-500"><Icon name="ban" className="w-3.5 h-3.5" />Nonaktif</span>
      </div>

      <label className="block mt-3 text-[11px] font-extrabold text-slate-500">ALASAN MENUTUP KURSI (wajib saat menutup)</label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cth: kursi patah / sabuk rusak" className="mt-1 w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />

      <button onClick={() => { closeModal(); refresh(); }} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Selesai</button>
    </div>
  );
}
