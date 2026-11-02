import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { routeById, vehicleById, vehName, takenSeats, schedSeatCap, scheduleInHistory, scheduleNeedsReview, scheduleMaintenance, tripProgress, geoTagOf } from '@/lib/domain.js';
import { fmtClock } from '@/lib/utils.js';
import { Icon, BadgeStatus, fmtDate } from '@/components/ui.jsx';
import { drvOfUser, StartTripModal } from './Tasks.jsx';
import { ArriveGeoModal } from './GeoTag.jsx';

/* Halaman "Tugas Saat Ini": satu fokus untuk perjalanan yang berjalan hari ini.
   Tagging lokasi wajib — klik "Berangkat" membuka peta tagging daerah DARI
   (StartTripModal), klik "Tiba di Tujuan" membuka peta daerah KE
   (ArriveGeoModal). Tag tersimpan di jadwal sebagai bukti: daerah, alamat,
   koordinat, jam. */

function StepPill({ n, label, done, active }) {
  return (
    <div className={'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold border transition ' + (done ? 'bg-green-50 border-green-200 text-green-700' : active ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-slate-50 border-slate-100 text-slate-400')}>
      <span className={'inline-flex w-4 h-4 rounded-full items-center justify-center text-[9px] shrink-0 ' + (done ? 'bg-green-500 text-white' : active ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-500')}>{done ? '✓' : n}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function SectionLabel({ icon, children }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <Icon name={icon} className="w-3.5 h-3.5 text-slate-400" />
      <span className="text-[11px] font-extrabold tracking-widest text-slate-400 uppercase">{children}</span>
      <div className="flex-1 h-px bg-slate-200"></div>
    </div>
  );
}

/* Baris kartu tugas: info rute, langkah 1-2-3, chip bukti tag, tombol aksi. */
function TaskCard({ s, openModal }) {
  const r = routeById(s.routeId);
  const v = vehicleById(s.vehicleId);
  const depTag = geoTagOf(s, 'depart');
  const arrTag = geoTagOf(s, 'arrive');
  const onTrip = s.tripStatus === 'ontrip';
  const arrived = !!arrTag || s.tripStatus === 'arrived';
  const prog = onTrip ? tripProgress(s, r) : null;
  return (
    <div data-sid={s.id} className="bg-white rounded-3xl shadow-card p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="bg-[#0b2447] text-white rounded-2xl px-3.5 py-2 text-center"><div className="text-[11px] font-bold opacity-70">{fmtDate(s.date)}</div><div className="font-extrabold text-[16px]">{s.time}</div></div>
        <div className="flex-1 min-w-[150px]">
          <div className="font-extrabold text-[15px]">{r?.from} → {r?.to}</div>
          <div className="text-[12px] text-slate-500 font-medium">{vehName(v)} {v?.plate} • {takenSeats(s.id).booked.length}/{schedSeatCap(s.id)} penumpang</div>
        </div>
        <BadgeStatus st={s.tripStatus || 'scheduled'} />
      </div>
      {prog ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 flex-wrap gap-1">
            <span>Berangkat {fmtClock(new Date(prog.start))}</span>
            <span>{prog.pct}% • ETA {fmtClock(new Date(prog.end))}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct}>
            <div className="h-full bg-gradient-to-r from-green-400 via-emerald-400 to-sky-500 transition-[width] duration-700 ease-out" style={{ width: prog.pct + '%' }} />
          </div>
        </div>
      ) : null}
      <div className="flex gap-1.5 mt-2.5">
        <StepPill n={1} label="Tag Berangkat" done={!!depTag} active={!depTag && (s.tripStatus || 'scheduled') === 'scheduled'} />
        <StepPill n={2} label="Berangkat" done={onTrip || arrived} active={!!depTag && !onTrip} />
        <StepPill n={3} label="Tag Tiba" done={arrived} active={onTrip && !arrived} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {depTag ? (
          <span className="inline-flex items-center gap-1.5 badge bg-green-50 text-green-700 border border-green-200 !text-[11px] px-2.5 py-1"><Icon name="map-pin" className="w-3.5 h-3.5" />{depTag.area || 'tertag'} • {fmtClock(new Date(depTag.at))}</span>
        ) : null}
      </div>
      <div className="flex gap-2 mt-3">
        {(s.tripStatus || 'scheduled') === 'scheduled' ? (
          <button onClick={() => openModal(<StartTripModal sid={s.id} />)} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-extrabold text-[13px] py-2.5 rounded-xl active:scale-[.98] transition"><Icon name="car-front" className="w-4 h-4 mr-1" />Berangkat →</button>
        ) : null}
        {onTrip ? (
          <button onClick={() => openModal(<ArriveGeoModal sid={s.id} />)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13px] py-2.5 rounded-xl active:scale-[.98] transition"><Icon name="map-pin" className="w-4 h-4 mr-1" />Tiba di Tujuan</button>
        ) : null}
      </div>
    </div>
  );
}

export default function TugasAktif() {
  const { user, openModal } = useApp();
  const me = drvOfUser(user);
  const all = me ? DB.load('schedules', []).filter((s) => String(s.driverId) === String(me.id) || String(s.backupDriverId) === String(me.id)) : [];
  /* Perjalanan yang sedang jalan selalu di atas; setelahnya jadwal siap. */
  const jalan = all.filter((s) => s.tripStatus === 'ontrip');
  const siap = all
    .filter((s) => (s.tripStatus || 'scheduled') === 'scheduled' && s.status !== 'cancelled'
      && !scheduleInHistory(s) && !scheduleNeedsReview(s) && !scheduleMaintenance(s))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));
  const siapCut = siap.slice(0, 5);

  return (
    <div className="anim space-y-4">
      <div className="bg-gradient-to-r from-[#0b2447] to-sky-600 text-white rounded-3xl p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><Icon name="navigation" className="w-6 h-6" /></div>
          <div className="flex-1 min-w-[140px]">
            <div className="font-extrabold text-[17px]">Tugas Saat Ini</div>
            <div className="text-[12px] opacity-85 font-medium">Berangkat wajib tag daerah DARI • tiba wajib tag daerah KE</div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <span className="badge bg-white/15 text-white !text-[11px] px-2.5 py-1">{jalan.length} sedang berjalan</span>
          <span className="badge bg-white/15 text-white !text-[11px] px-2.5 py-1">{siap.length} siap berangkat</span>
        </div>
      </div>
      {jalan.length || siapCut.length ? (
        <div className="space-y-3">
          {jalan.length ? (
            <>
              <SectionLabel icon="car-front">Sedang Berjalan</SectionLabel>
              <div className="space-y-3">{jalan.slice(0, 6).map((s) => <TaskCard key={s.id} s={s} openModal={openModal} />)}</div>
            </>
          ) : null}
          {siapCut.length ? (
            <>
              <SectionLabel icon="clock">Segera Berangkat</SectionLabel>
              <div className="space-y-3">{siapCut.map((s) => <TaskCard key={s.id} s={s} openModal={openModal} />)}</div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-card p-8 text-center">
          <Icon name="car-front" className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="font-extrabold text-[14px] text-slate-500 mt-2">Tidak ada perjalanan berjalan</div>
          <div className="text-[12px] text-slate-400 font-medium mt-1">Jadwal berikutnya tampil di tab Tugas Saya — istirahat dulu, Pengemudi hebat.</div>
        </div>
      )}
    </div>
  );
}
