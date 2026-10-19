/* Halaman Kelengkapan Data Agen Travel (KYC).
   Agen yang baru mendaftar boleh login, tapi hanya sampai halaman ini.
   Setelah super admin menyetujui, akses penuh ke panel agen terbuka. */

import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import {
  agencyOf, agencyPending, validateKycStep1, kycAge, kycSummary, kycDocList,
  KYC_MIN_AGE, KYC_JENIS, KYC_BENTUK, KYC_AGAMA, KYC_HUBUNGAN, KYC_BANKS,
} from '@/lib/domain.js';
import { inC } from '@/lib/utils.js';
import { Icon, Sec, PillRadios } from '@/components/ui.jsx';
import { PROVINSI, KABKOTA, KECAMATAN, KELURAHAN, PILIHAN_LAIN as LAIN } from '@/lib/daerah.js';

const STEPS = [['Kelengkapan Data', 'clipboard-list'], ['Lampiran Dokumen', 'scan-line'], ['Syarat & Ketentuan', 'scroll-text']];

const TERMS = [
  'Semua data yang diisi harus sama dan sesuai dengan dokumen resmi (KTP, akta, NPWP, NIB).',
  'Super admin berhak meminta dokumen asli untuk verifikasi jika dibutuhkan.',
  'Dokumen hanya dipakai untuk proses verifikasi dan tidak dibagikan kepada pihak ketiga.',
  'Pendaftaran yang memalsukan dokumen atau data akan ditolak dan akun dinonaktifkan.',
  'Biaya verifikasi tidak dapat dikembalikan meskipun Anda sudah terdaftar.',
];

function Stepper({ step, done }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const act = step === n;
        const ok = done.has(n);
        return (
          <div key={s[0]} className="flex items-center gap-1.5 shrink-0">
            <div className={'flex items-center gap-2 px-3 py-2 rounded-2xl text-[12.5px] font-extrabold transition ' + (act ? 'bg-[#0b2447] text-white shadow' : ok ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400')}>
              <Icon name={ok && !act ? 'check' : s[1]} className="w-4 h-4 pointer-events-none" />
              <span className="whitespace-nowrap">{n}. {s[0]}</span>
            </div>
            {n < 3 ? <Icon name="arrow-right" className="w-4 h-4 text-slate-300 pointer-events-none" /> : null}
          </div>
        );
      })}
    </div>
  );
}

/* Blok alamat berjenjang — dipakai untuk Alamat Domisili (A) dan Alamat Lokasi Usaha (B).
   val: objek alamat, onPatch: gabung patch, manual: { kota, kecamatan }, onManual: ubah mode manual. */
function AlamatFields({ val, onPatch, manual, onManual, listId }) {
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
        {!manual.kecamatan && !opsiKec.length && val.kota ? <p className="text-[10.5px] font-bold text-slate-400 mt-1">Daftar kecamatan tersedia untuk Aceh & Sumatera Utara — untuk wilayah lain pilih "Tulis sendiri…".</p> : null}
      </div>
      <div><label className="text-[11.5px] font-extrabold">KELURAHAN <span className="text-red-500">*</span></label>
        <input list={listId} value={val.kelurahan} onChange={(e) => onPatch({ kelurahan: e.target.value })} placeholder={opsiKel.length ? 'Pilih atau ketik kelurahan' : 'cth: Calang Pasar Baru'} className={'w-full mt-1 ' + inC} />
        <datalist id={listId}>{opsiKel.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      <div><label className="text-[11.5px] font-extrabold">RT / RW <span className="text-red-500">*</span></label><input value={val.rtRw} onChange={(e) => onPatch({ rtRw: e.target.value })} placeholder="cth: 01 / 02" className={inC} /></div>
      <div><label className="text-[11.5px] font-extrabold">KODE POS <span className="text-red-500">*</span></label><input value={val.kodePos} onChange={(e) => onPatch({ kodePos: e.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" maxLength={5} placeholder="5 digit" className={inC} /></div>
      <div className="col-span-2"><label className="text-[11.5px] font-extrabold">NAMA JALAN / DUSUN <span className="text-red-500">*</span></label><input value={val.jalan} onChange={(e) => onPatch({ jalan: e.target.value })} placeholder="cth: Jl. Merdeka No.12, Pasar Baru" className={inC} /></div>
    </div>
  );
}

export default function KycWizard() {
  const { user, go, toast, refresh, logout } = useApp();
  const ag = agencyOf(user);

  const k0 = (ag && ag.kyc) || {};
  const [form, setForm] = useState(() => ({
    status: k0.status || 'draft',
    step: k0.step || 1,
    terms: !!k0.terms,
    manualAlamat: k0.manualAlamat || { kota: false, kecamatan: false },
    manualAlamatUsaha: k0.manualAlamatUsaha || { kota: false, kecamatan: false },
    jenis: k0.jenis || 'Perorangan / Freelance',
    nama: k0.nama || (user && user.name) || '',
    nik: k0.nik || '', tmpLahir: k0.tmpLahir || '', tglLahir: k0.tglLahir || '',
    gender: k0.gender || '', agama: k0.agama || '',
    alamat: Object.assign({ jalan: '', rtRw: '', kelurahan: '', kecamatan: '', kota: '', provinsi: '', kodePos: '' }, k0.alamat || {}),
    hp: k0.hp || (user && user.phone) || '', email: k0.email || (user && user.email) || '',
    darurat: Object.assign({ nama: '', hubungan: '', hp: '' }, k0.darurat || {}),
    badanNama: k0.badanNama || '', badanBentuk: k0.badanBentuk || '', aktaNo: k0.aktaNo || '',
    npwpUsaha: k0.npwpUsaha || '', nib: k0.nib || '', direktur: k0.direktur || '',
    /* data lama: alamat usaha pernah berupa teks bebas → dipindah ke kolom NAMA JALAN */
    alamatUsaha: Object.assign({ jalan: '', rtRw: '', kelurahan: '', kecamatan: '', kota: '', provinsi: '', kodePos: '' }, k0.alamatUsaha && typeof k0.alamatUsaha === 'object' ? k0.alamatUsaha : k0.alamatUsaha ? { jalan: k0.alamatUsaha } : {}),
    bank: k0.bank || '', rekeningNo: k0.rekeningNo || '', rekeningNama: k0.rekeningNama || '',
    npwpSamaKtp: k0.npwpSamaKtp !== false, npwp: k0.npwp || '',
  }));

  if (!ag) return <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-7 text-center font-bold text-slate-500">Data travel tidak ditemukan</div>;

  const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));
  const setAlPatch = (patch) => setForm((p) => ({ ...p, alamat: { ...p.alamat, ...patch } }));
  const setAuPatch = (patch) => setForm((p) => ({ ...p, alamatUsaha: { ...p.alamatUsaha, ...patch } }));
  const setMan = (patch) => setForm((p) => ({ ...p, manualAlamat: { ...p.manualAlamat, ...patch } }));
  const setManUsaha = (patch) => setForm((p) => ({ ...p, manualAlamatUsaha: { ...p.manualAlamatUsaha, ...patch } }));
  const setDg = (f, v) => setForm((p) => ({ ...p, darurat: { ...p.darurat, [f]: v } }));

  const saveKyc = (patch, msg) => {
    const arr = DB.load('agencies', []);
    const cur = arr.find((x) => x.id === ag.id);
    if (!cur) return false;
    cur.kyc = Object.assign({}, cur.kyc || {}, patch, { updatedAt: new Date().toISOString() });
    try {
      DB.save('agencies', arr);
    } catch (e) {
      toast('Penyimpanan browser penuh — kurangi ukuran foto atau data', 'err');
      return false;
    }
    refresh();
    if (msg) toast(msg, 'ok');
    return true;
  };

  const submitStep1 = () => {
    const err = validateKycStep1(form);
    if (err) { toast(err, 'err'); return; }
    const { status, step, terms, manualAlamat, manualAlamatUsaha, ...rest } = form;
    /* No WhatsApp disatukan dengan No HP utama: tetap disimpan agar kode lama tidak kosong */
    if (saveKyc(Object.assign({}, rest, { wa: form.hp, step: 2 }), 'Data tersimpan — lanjut ke lampiran dokumen')) set('step', 2);
  };

  const submitAll = () => {
    const err = validateKycStep1(form);
    if (err) { toast(err, 'err'); set('step', 1); return; }
    if (!form.terms) { toast('Centang persetujuan Syarat & Ketentuan dulu', 'err'); return; }
    const { status, step, terms, manualAlamat, manualAlamatUsaha, ...rest } = form;
    saveKyc(Object.assign({}, rest, { wa: form.hp, step: 3, status: 'diajukan', terms: true, submittedAt: new Date().toISOString() }), 'Pengajuan terkirim — menunggu persetujuan super admin');
    set('status', 'diajukan');
    set('step', 3);
  };

  const pending = agencyPending(user);
  const sum = kycSummary({ kyc: Object.assign({}, form, { docs: k0.docs }) });
  const age = kycAge(form.tglLahir);
  const isBadan = form.jenis === 'Badan Usaha (PT/CV)';

  /* Huruf section ikut jenis agen: Perorangan tidak punya Legalitas Usaha,
     jadi Rekab-rekening jadi B, Dokumen C, S&K D (tidak ada lompatan huruf). */
  const SEC = isBadan
    ? { diri: 'A', usaha: 'B', rekening: 'C', dokumen: 'D', snk: 'E' }
    : { diri: 'A', rekening: 'B', dokumen: 'C', snk: 'D' };

  /* ---------- Setelah disetujui ---------- */
  if (!pending) {
    return (
      <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 flex gap-3">
          <Icon name="circle-check-big" className="w-6 h-6 text-green-600 shrink-0" />
          <div><div className="font-extrabold text-[15px] text-green-800">Kelengkapan data sudah disetujui</div>
            <div className="text-[12.5px] font-semibold text-green-700">Semua fitur travel Anda sudah terbuka.</div></div>
        </div>
        <button onClick={() => { go('agen'); }} className="mt-4 w-full bg-sky-600 text-white font-extrabold py-3.5 rounded-2xl">Masuk ke Panel Agen</button>
      </div>
    );
  }

  /* ---------- Status: sudah diajukan, menunggu persetujuan ---------- */
  if (form.status === 'diajukan') {
    const row = (ok, label) => (
      <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-0 text-[13px]">
        <Icon name={ok ? 'circle-check-big' : 'clock'} className={'w-4 h-4 shrink-0 ' + (ok ? 'text-green-500' : 'text-amber-500')} />
        <span className={'font-semibold flex-1 ' + (ok ? 'text-slate-700' : 'text-slate-500')}>{label}</span>
        <b className={'text-[11.5px] ' + (ok ? 'text-green-600' : 'text-amber-600')}>{ok ? 'Lengkap' : 'Menunggu'}</b>
      </div>
    );
    return (
      <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
        <div className="flex items-center gap-2"><div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0b2447] to-sky-600 text-white flex items-center justify-center"><Icon name="clock" className="w-5 h-5" /></div>
          <div><h2 className="font-extrabold text-[18px]">Status Pengajuan Mitra Travel</h2><p className="text-[12.5px] text-slate-500 font-medium">{ag.name} · dikirim {new Date(k0.submittedAt || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div></div>
        <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl px-3.5">
          {row(sum.dataOk, 'Data diri & legalitas')}
          {row(sum.docsOk, 'Lampiran dokumen')}
          {row(sum.termsOk, 'Syarat & Ketentuan')}
        </div>
        <p className="text-[12px] text-slate-500 font-medium mt-3">Super admin sedang meninjau data Anda. Fitur Armada, Rute, Jadwal, dan Pemesanan otomatis terbuka setelah disetujui — tidak perlu daftar ulang.</p>
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button onClick={() => { refresh(); toast('Status diperbarui', 'info'); }} className="bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">Perbarui Status</button>
          <button onClick={logout} className="bg-slate-100 font-extrabold text-[14px] py-3 rounded-2xl">Keluar</button>
        </div>
      </div>
    );
  }

  /* ---------- Wizard ---------- */
  return (
    <div className="anim max-w-3xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
      <div className="flex items-start gap-2">
        <button onClick={() => go('home')} className="bg-slate-100 hover:bg-slate-200 active:scale-95 transition p-2.5 rounded-xl cursor-pointer shrink-0" aria-label="Kembali ke beranda"><Icon name="arrow-left" className="w-4 h-4 pointer-events-none" /></button>
        <div className="flex-1"><h2 className="font-extrabold text-[18px]">Kelengkapan Data Agen Travel</h2>
          <p className="text-[12.5px] text-slate-500 font-medium mt-0.5">Lengkapi data berikut agar travel Anda bisa beroperasi penuh.</p></div>
      </div>
      <div className="mt-4"><Stepper step={form.step} done={new Set(sum.dataOk ? [1] : [])} /></div>

      {form.step === 1 ? (
        <>
          <div className="mt-4 bg-sky-50 border-2 border-sky-200 rounded-2xl p-3.5 flex gap-2.5">
            <Icon name="info" className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <p className="text-[12px] font-semibold text-sky-900">Data sudah terisi otomatis dari pendaftaran. Lengkapi sisanya agar proposal Anda bisa disetujui.</p>
          </div>
          <Sec index={SEC.diri} title="DATA DIRI & IDENTITAS DIRI" />
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2"><label className="text-[12px] font-extrabold">JENIS AGEN <span className="text-red-500">*</span></label><div className="mt-1"><PillRadios options={KYC_JENIS} value={form.jenis} onChange={(v) => set('jenis', v)} /></div></div>
              <div><label className="text-[12px] font-extrabold">NAMA LENGKAP (SESUAI KTP) <span className="text-red-500">*</span></label><input value={form.nama} onChange={(e) => set('nama', e.target.value)} placeholder="cth: Cut Meutia" className={'w-full mt-1 ' + inC} /></div>
              <div><label className="text-[12px] font-extrabold">NIK <span className="text-red-500">*</span></label><input value={form.nik} onChange={(e) => set('nik', e.target.value.replace(/\D/g, '').slice(0, 16))} inputMode="numeric" maxLength={16} placeholder="16 digit" className={'w-full mt-1 ' + inC} /></div>
              <div><label className="text-[12px] font-extrabold">TEMPAT LAHIR <span className="text-red-500">*</span></label><input value={form.tmpLahir} onChange={(e) => set('tmpLahir', e.target.value)} placeholder="cth: Calang" className={'w-full mt-1 ' + inC} /></div>
              <div><label className="text-[12px] font-extrabold">TANGGAL LAHIR <span className="text-red-500">*</span></label><input type="date" value={form.tglLahir} onChange={(e) => set('tglLahir', e.target.value)} className={'w-full mt-1 ' + inC} />{age !== null ? <p className={'text-[11px] font-bold mt-1 ' + (age >= KYC_MIN_AGE ? 'text-green-600' : 'text-red-500')}>Usia {age} tahun{age < KYC_MIN_AGE ? ' — minimal ' + KYC_MIN_AGE + ' tahun' : ''}</p> : <p className="text-[11px] font-bold text-slate-400 mt-1">Minimal usia {KYC_MIN_AGE} tahun</p>}</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className="text-[12px] font-extrabold">AGAMA <span className="text-red-500">*</span></label><select value={form.agama} onChange={(e) => set('agama', e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{KYC_AGAMA.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              <div><label className="text-[12px] font-extrabold">JENIS KELAMIN <span className="text-red-500">*</span></label><PillRadios options={['Laki-laki', 'Perempuan']} value={form.gender} onChange={(v) => set('gender', v)} /></div>
            </div>
            <div><label className="text-[12px] font-extrabold">ALAMAT DOMISILI <span className="text-red-500">*</span></label>
              <AlamatFields val={form.alamat} onPatch={setAlPatch} manual={form.manualAlamat} onManual={setMan} listId="kyc-kelurahan-diri" />
            </div>
            <div><label className="text-[12px] font-extrabold">KONTAK AKTIF <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-2.5 mt-1">
                <input value={form.hp} onChange={(e) => set('hp', e.target.value)} inputMode="tel" placeholder="No HP utama / WhatsApp" className={inC} />
                <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Email aktif" className={inC} />
              </div>
              <p className="text-[11.5px] text-slate-400 font-medium mt-2">Nomor ini sekaligus dipakai untuk WhatsApp.</p>
            </div>
            <div><label className="text-[12px] font-extrabold">KONTAK DARURAT <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2.5 mt-1">
                <input value={form.darurat.nama} onChange={(e) => setDg('nama', e.target.value)} placeholder="Nama" className={inC} />
                <select value={form.darurat.hubungan} onChange={(e) => setDg('hubungan', e.target.value)} className={inC}><option value="">— Hubungan —</option>{KYC_HUBUNGAN.map((h) => <option key={h} value={h}>{h}</option>)}</select>
                <input value={form.darurat.hp} onChange={(e) => setDg('hp', e.target.value)} inputMode="tel" placeholder="No HP / WhatsApp" className={inC} />
              </div>
            </div>
          </div>

          {isBadan ? (
            <>
              <Sec index={SEC.usaha} title="DATA LEGALITAS USAHA" />
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className="text-[12px] font-extrabold">NAMA BADAN USAHA (SESUAI AKTA) <span className="text-red-500">*</span></label><input value={form.badanNama} onChange={(e) => set('badanNama', e.target.value)} className={'w-full mt-1 ' + inC} /></div>
                <div><label className="text-[12px] font-extrabold">NAMA DIREKTUR / PENANGGUNG JAWAB <span className="text-red-500">*</span></label><input value={form.direktur} onChange={(e) => set('direktur', e.target.value)} className={'w-full mt-1 ' + inC} /></div>
                <div><label className="text-[12px] font-extrabold">BENTUK USAHA <span className="text-red-500">*</span></label><select value={form.badanBentuk} onChange={(e) => set('badanBentuk', e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{KYC_BENTUK.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
                <div><label className="text-[12px] font-extrabold">NPWP BADAN USAHA <span className="text-red-500">*</span></label><input value={form.npwpUsaha} onChange={(e) => set('npwpUsaha', e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" maxLength={15} placeholder="15 digit" className={'w-full mt-1 ' + inC} /></div>
                <div><label className="text-[12px] font-extrabold">NOMOR AKTA PENDIRIAN <span className="text-red-500">*</span></label><input value={form.aktaNo} onChange={(e) => set('aktaNo', e.target.value)} className={'w-full mt-1 ' + inC} /></div>
                <div><label className="text-[12px] font-extrabold">NIB <span className="text-red-500">*</span></label><input value={form.nib} onChange={(e) => set('nib', e.target.value.replace(/\D/g, '').slice(0, 13))} inputMode="numeric" maxLength={13} placeholder="13 digit" className={'w-full mt-1 ' + inC} /></div>
                <div className="col-span-2"><label className="text-[12px] font-extrabold">ALAMAT LOKASI USAHA / KANTOR <span className="text-red-500">*</span></label>
                  <AlamatFields val={form.alamatUsaha} onPatch={setAuPatch} manual={form.manualAlamatUsaha} onManual={setManUsaha} listId="kyc-kelurahan-usaha" />
                </div>
              </div>
            </>
          ) : null}

          <Sec index={SEC.rekening} title="PROFIL REKENING BANK & INFORMASI NPWP" />
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="text-[12px] font-extrabold">NAMA BANK <span className="text-red-500">*</span></label><select value={form.bank} onChange={(e) => set('bank', e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{KYC_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
            <div><label className="text-[12px] font-extrabold">NOMOR REKENING <span className="text-red-500">*</span></label><input value={form.rekeningNo} onChange={(e) => set('rekeningNo', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="cth: 1234567890" className={'w-full mt-1 ' + inC} /></div>
            <div><label className="text-[12px] font-extrabold">NAMA PEMILIK REKENING <span className="text-red-500">*</span></label><input value={form.rekeningNama} onChange={(e) => set('rekeningNama', e.target.value)} placeholder="Harus sama dengan nama pemohon" className={'w-full mt-1 ' + inC} /></div>
            <div>
              <label className="text-[12px] font-extrabold">NPWP</label>
              <div className="mt-1 bg-sky-50 border-2 border-sky-200 rounded-2xl px-3 py-2.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.npwpSamaKtp} onChange={(e) => set('npwpSamaKtp', e.target.checked)} className="w-4 h-4 accent-sky-600 shrink-0 mt-0.5" />
                  <span className="text-[12px] font-extrabold text-sky-900 leading-snug">Apakah nomor NPWP sama dengan nomor KTP?</span>
                </label>
                {form.npwpSamaKtp ? (
                  <p className="text-[10.5px] font-semibold text-sky-700 ml-6 mt-1">NPWP memakai NIK di Data Diri{form.nik ? ': ' + form.nik : ''}.</p>
                ) : (
                  <div className="mt-2 ml-6">
                    <label className="text-[10.5px] font-extrabold">NOMOR NPWP <span className="text-red-500">*</span></label>
                    <input value={form.npwp} onChange={(e) => set('npwp', e.target.value.replace(/\D/g, '').slice(0, 16))} inputMode="numeric" maxLength={16} placeholder="15 atau 16 digit" className={'w-full mt-1 ' + inC} />
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-[11.5px] text-slate-400 font-medium mt-2">Nama pemilik rekening wajib sama dengan nama pemohon / badan usaha untuk mencegah penipuan.</p>
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <button onClick={() => go('home')} className="bg-slate-100 font-extrabold text-[14px] py-3 rounded-2xl">Keluar Sementara</button>
            <button onClick={submitStep1} className="bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">Simpan &amp; Lanjut</button>
          </div>
        </>
      ) : null}

      {form.step === 2 ? (
        <>
          <Sec index={SEC.dokumen} title="LAMPIRAN DOKUMEN" />
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center">
            <Icon name="scan-line" className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-extrabold text-[14px] mt-2">Unggah dokumen</p>
            <p className="text-[12px] text-slate-500 font-medium mt-1">Fitur unggah foto KTP, pasfoto, NPWP, NIB, akta, dan foto kantor sedang disiapkan.</p>
            <div className="mt-3 text-left max-w-sm mx-auto bg-white rounded-2xl border border-slate-200 p-3">
              <p className="text-[11px] font-extrabold text-slate-400 mb-1.5">DOKUMEN YANG AKAN DIBUTUHKAN ({form.jenis})</p>
              {kycDocList(form.jenis).map(([key, label]) => <div key={key} className="flex items-center gap-2 py-1 text-[12px] font-semibold text-slate-500"><Icon name="clock" className="w-3.5 h-3.5" />{label}</div>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <button onClick={() => set('step', 1)} className="bg-slate-100 font-extrabold text-[14px] py-3 rounded-2xl">Kembali</button>
            <button onClick={() => set('step', 3)} className="bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">Lanjut</button>
          </div>
        </>
      ) : null}

      {form.step === 3 ? (
        <>
          <Sec index={SEC.snk} title="SYARAT & KETENTUAN" />
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-[12.5px] font-semibold text-slate-600">
            {TERMS.map((t, i) => <div key={i} className="flex gap-2"><span className="font-extrabold text-sky-600 shrink-0">{i + 1}.</span><span>{t}</span></div>)}
          </div>
          <label className="mt-4 flex items-start gap-2.5 cursor-pointer bg-sky-50 border-2 border-sky-200 rounded-2xl px-3.5 py-3">
            <input type="checkbox" checked={form.terms} onChange={(e) => set('terms', e.target.checked)} className="w-5 h-5 accent-sky-600 shrink-0 mt-0.5" />
            <span className="text-[12.5px] font-extrabold text-sky-900 leading-snug">Saya sudah membaca & menyetujui Syarat & Ketentuan TransAceh</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <button onClick={() => set('step', 2)} className="bg-slate-100 font-extrabold text-[14px] py-3 rounded-2xl">Kembali</button>
            <button onClick={submitAll} disabled={!form.terms} className={'font-extrabold text-[14px] py-3 rounded-2xl transition ' + (form.terms ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed')}>Kirim Pengajuan</button>
          </div>
        </>
      ) : null}
    </div>
  );
}