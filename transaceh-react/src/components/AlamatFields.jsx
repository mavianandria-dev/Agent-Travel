/* Blok alamat berjenjang dengan dropdown wilayah (daerah.js).
   Sekali definisi, dipakai bersama oleh KYC (Alamat Domisili & Alamat Usaha)
   dan Tambah/Edit Pengemudi. val: objek alamat, onPatch: gabung patch,
   manual: { kota, kecamatan }, onManual: ubah mode manual. kelurahanPhFb:
   placeholder fallback kelurahan di luar daftar (khusus pemakai yang mau
   teks singkat, mis. Tambah Pengemudi). */

import { Icon } from '@/components/ui.jsx';
import { inC } from '@/lib/utils.js';
import { PROVINSI, KABKOTA, KECAMATAN, KELURAHAN, PILIHAN_LAIN as LAIN } from '@/lib/daerah.js';

export function AlamatFields({ val, onPatch, manual, onManual, listId, kelurahanPhFb }) {
  const opsiKota = KABKOTA[val.provinsi] || [];
  const opsiKec = KECAMATAN[val.kota] || [];
  const opsiKel = KELURAHAN[val.kecamatan] || [];
  const setProvinsi = (v) => { onManual({ kota: false, kecamatan: false }); onPatch({ provinsi: v, kota: '', kecamatan: '', kelurahan: '' }); };
  const setKota = (v) => { onManual({ kecamatan: false }); onPatch({ kota: v, kecamatan: '', kelurahan: '' }); };
  const setKecamatan = (v) => onPatch({ kecamatan: v, kelurahan: '' });
  const keDaftar = (f) => { onManual({ [f]: false }); onPatch({ [f]: '' }); };
  return (
    <div className="grid grid-cols-2 gap-2.5 mt-1">
      <div><label className="text-[11.5px] font-extrabold">PROVINSI <span className="text-red-500">*</span></label><select value={val.provinsi} onChange={(e) => setProvinsi(e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{PROVINSI.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
      <div><label className="text-[11.5px] font-extrabold">KOTA / KABUPATEN <span className="text-red-500">*</span></label>
        {manual.kota
          ? <div className="relative mt-1"><input value={val.kota} onChange={(e) => onPatch({ kota: e.target.value })} placeholder="cth: Kabupaten/Kota lain" className={inC + ' pr-10'} /><button type="button" onClick={() => keDaftar('kota')} aria-label="Kembali ke daftar" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600"><Icon name="x" className="w-4 h-4 pointer-events-none" /></button></div>
          : <select value={val.kota} onChange={(e) => (e.target.value === LAIN ? onManual({ kota: true }) : setKota(e.target.value))} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{opsiKota.map((o) => <option key={o} value={o}>{o}</option>)}<option value={LAIN}>✏️ Tulis sendiri…</option></select>}
        {!manual.kota && !opsiKota.length && val.provinsi ? <p className="text-[10.5px] font-bold text-slate-400 mt-1">Kabupaten/kota belum terdaftar — pilih "Tulis sendiri…".</p> : null}
      </div>
      <div><label className="text-[11.5px] font-extrabold">KECAMATAN <span className="text-red-500">*</span></label>
        {manual.kecamatan
          ? <div className="relative mt-1"><input value={val.kecamatan} onChange={(e) => onPatch({ kecamatan: e.target.value })} placeholder="cth: Kecamatan" className={inC + ' pr-10'} /><button type="button" onClick={() => keDaftar('kecamatan')} aria-label="Kembali ke daftar" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600"><Icon name="x" className="w-4 h-4 pointer-events-none" /></button></div>
          : <select value={val.kecamatan} onChange={(e) => (e.target.value === LAIN ? onManual({ kecamatan: true }) : setKecamatan(e.target.value))} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{opsiKec.map((o) => <option key={o} value={o}>{o}</option>)}<option value={LAIN}>✏️ Tulis sendiri…</option></select>}
        {!manual.kecamatan && !opsiKec.length && val.kota ? <p className="text-[10.5px] font-bold text-slate-400 mt-1">Daftar kecamatan tersedia untuk Aceh &amp; Sumatera Utara — untuk wilayah lain pilih "Tulis sendiri…".</p> : null}
      </div>
      <div><label className="text-[11.5px] font-extrabold">KELURAHAN<span className="text-red-500">*</span></label>
        <input list={listId} value={val.kelurahan} onChange={(e) => onPatch({ kelurahan: e.target.value })} placeholder={opsiKel.length ? 'Pilih atau ketik kelurahan' : (kelurahanPhFb || 'Silahkan masukkan kelurahan domisili anda')} className={'w-full mt-1 ' + inC} />
        <datalist id={listId}>{opsiKel.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      <div><label className="text-[11.5px] font-extrabold">RT / RW <span className="text-red-500">*</span></label><input value={val.rtRw} onChange={(e) => onPatch({ rtRw: e.target.value })} placeholder="cth: 001 / 002" className={inC} /></div>
      <div><label className="text-[11.5px] font-extrabold">KODE POS <span className="text-red-500">*</span></label><input value={val.kodePos} onChange={(e) => onPatch({ kodePos: e.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" maxLength={5} placeholder="5 digit" className={inC} /></div>
      <div className="col-span-2"><label className="text-[11.5px] font-extrabold">NAMA JALAN / DUSUN <span className="text-red-500">*</span></label><input value={val.jalan} onChange={(e) => onPatch({ jalan: e.target.value })} placeholder="Silahkan masukkan nama jalan atau dusun" className={inC} /></div>
    </div>
  );
}
