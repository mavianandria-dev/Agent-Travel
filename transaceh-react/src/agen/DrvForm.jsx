import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { agencyOf, driverById, simParse, audit, uid } from '@/lib/domain.js';
import { SIM_TYPES, GENDERS, MARITALS, EDUCATIONS, inC } from '@/lib/utils.js';
import { Icon, Sec, PillRadios, UpBox } from '@/components/ui.jsx';

export default function DrvForm() {
  const { user, drvEdit, setDrvEdit, setAgenTab, go, tick } = useApp();
  void tick;
  const agId = (drvEdit && (drvEdit.agId || drvEdit.agencyId)) || user?.agencyId;
  const did = (drvEdit && (drvEdit.did || drvEdit.id)) || null;
  const raw = did ? driverById(did) : null;
  const ag = agencyOf(user);
  if (!ag || !agId || (did && (!raw || raw.agencyId !== ag.id))) {
    return (
      <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
        <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-7 text-center font-bold text-slate-500">Data tidak ditemukan</div>
        <button onClick={() => { setDrvEdit(null); setAgenTab('driver'); go('agen'); }} className="mt-3 w-full bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Kembali</button>
      </div>
    );
  }
  return <DrvFormInner key={did || 'new'} agId={agId} raw={raw} did={did} />;
}

function DrvFormInner({ agId, raw, did }) {
  const { setDrvEdit, setAgenTab, go, toast, refresh } = useApp();
  const d0 = Object.assign({ name: '', phone: '', status: 'aktif', userEmail: '', birthPlace: '', birthDate: '', gender: '', address: '', nik: '', marital: '', education: '', emName: '', emPhone: '', emRelation: '', simNumber: '' }, raw || {});
  const s0 = simParse(raw || {});
  const cur = new Date().getFullYear();

  const [name, setName] = useState(d0.name);
  const [bPlace, setBPlace] = useState(d0.birthPlace);
  const [bDate, setBDate] = useState(d0.birthDate || '');
  const [gender, setGender] = useState(d0.gender || '');
  const [addr, setAddr] = useState(d0.address);
  const [phone, setPhone] = useState(d0.phone);
  const [nik, setNik] = useState(d0.nik);
  const [marital, setMarital] = useState(d0.marital || '');
  const [edu, setEdu] = useState(d0.education || '');
  const [emN, setEmN] = useState(d0.emName);
  const [emP, setEmP] = useState(d0.emPhone);
  const [emR, setEmR] = useState(d0.emRelation);
  const [simTypeSel, setSimTypeSel] = useState(s0.type || '');
  const [simOther, setSimOther] = useState(!SIM_TYPES.includes(s0.type) && raw ? s0.type : '');
  const [simSame, setSimSame] = useState(!d0.simNumber || (d0.simNumber || '').replace(/\D/g, '') === (d0.nik || '').replace(/\D/g, ''));
  const [simNum, setSimNum] = useState(d0.simNumber || '');
  const [simExp, setSimExp] = useState(raw ? s0.exp : '');
  const [photo, setPhoto] = useState(d0.photo || '');
  const [simPhoto, setSimPhoto] = useState(raw?.simPhoto || '');
  const [mail, setMail] = useState(d0.userEmail || '');
  const [pass, setPass] = useState('');
  const [status, setStatus] = useState(d0.status || 'aktif');
  const [bank, setBank] = useState(d0.bank || '');

  const drvBack = () => { setDrvEdit(null); setAgenTab('driver'); go('agen'); };

  const syncDrvUser = (d, pw, oldMail) => {
    const us = DB.load('users', []);
    if (oldMail && oldMail !== (d.userEmail || '').toLowerCase()) {
      const stillUsed = DB.load('drivers', []).some((x) => x.id !== d.id && x.userEmail && x.userEmail.toLowerCase() === oldMail);
      const ou = us.find((x) => x.email === oldMail && x.role === 'pengemudi');
      if (ou && !stillUsed) { ou.status = 'suspended'; }
    }
    const want = d.status === 'aktif' ? 'active' : 'suspended';
    let u = us.find((x) => x.email === (d.userEmail || '').toLowerCase() && x.role === 'pengemudi');
    if (u) { u.name = d.name; u.agencyId = d.agencyId; u.status = want; if (pw) u.pass = pw; }
    else {
      if (!pw) { toast('Password wajib untuk akun baru', 'err'); return false; }
      us.push({ id: uid('U'), name: d.name, email: d.userEmail, phone: d.phone, wa: d.phone, pass: pw, status: 'suspended', role: 'pengemudi', agencyId: d.agencyId, profileStep: 'done', photo: '' });
      u = us[us.length - 1];
      u.status = want;
    }
    DB.save('users', us); refresh();
    return true;
  };

  const saveDrvPage = () => {
    const arr = DB.load('drivers', []);
    const m = mail.trim().toLowerCase();
    const nm = name.trim();
    const ph = phone.trim();
    const nk = (nik || '').replace(/\D/g, '');
    if (!nm) { toast('Nama lengkap wajib diisi', 'err'); return; }
    if (ph.replace(/\D/g, '').length < 9) { toast('No HP minimal 9 digit angka', 'err'); return; }
    if (nk.length !== 16) { toast('NIK harus 16 digit angka', 'err'); return; }
    if (!simTypeSel) { toast('Pilih jenis SIM', 'err'); return; }
    const simType = simTypeSel === 'Lainnya' ? simOther.trim() : simTypeSel;
    if (!simType) { toast('Isi jenis SIM lainnya', 'err'); return; }
    const simNumber = simSame ? nk : simNum.trim();
    const sExp = Number(simExp) || 0;
    if (!simSame && !simNumber) { toast('Isi nomor SIM (atau centang sesuai KTP)', 'err'); return; }
    if (!(sExp >= cur && sExp <= 2100)) { toast('Tahun expired SIM minimal ' + cur, 'err'); return; }
    if (!m || !/.+@.+\..+/.test(m)) { toast('Email akun login wajib diisi', 'err'); return; }
    const clashUser = DB.load('users', []).find((x) => x.email === m && !(x.role === 'pengemudi' && x.agencyId === agId));
    if (clashUser) { toast('Email dipakai akun lain', 'err'); return; }
    const clashDrv = arr.find((x) => x.userEmail && x.userEmail.toLowerCase() === m && x.agencyId === agId && x.id !== did);
    if (clashDrv) { toast('Email dipakai pengemudi lain (' + clashDrv.name + ')', 'err'); return; }
    const extra = { birthPlace: bPlace.trim(), birthDate: bDate || '', gender: gender || '', address: addr.trim(), nik: nk, marital: marital || '', education: (edu || '').trim(), emName: emN.trim(), emPhone: emP.trim(), emRelation: emR.trim(), simNumber, bank: (bank || '').trim() };
    if (!extra.birthPlace) { toast('Tempat lahir wajib diisi', 'err'); return; }
    if (!extra.birthDate) { toast('Tanggal lahir wajib diisi', 'err'); return; }
    if (!extra.gender) { toast('Pilih jenis kelamin', 'err'); return; }
    if (!extra.address) { toast('Alamat lengkap wajib diisi', 'err'); return; }
    if (!extra.marital) { toast('Pilih status pernikahan', 'err'); return; }
    if (!extra.education) { toast('Pilih pendidikan terakhir', 'err'); return; }
    if (!extra.emName) { toast('Nama kontak darurat wajib diisi', 'err'); return; }
    if (extra.emPhone.replace(/\D/g, '').length < 9) { toast('No HP darurat minimal 9 digit angka', 'err'); return; }
    if (!extra.emRelation) { toast('Hubungan kontak darurat wajib diisi', 'err'); return; }
    if (!photo) { toast('Upload foto profil dulu', 'err'); return; }
    if (!simPhoto) { toast('Upload dokumen SIM dulu', 'err'); return; }
    Object.assign(extra, { simPhoto, ktpPhoto: raw?.ktpPhoto || '', selfie: raw?.selfie || '', photo });
    let d;
    if (did) {
      d = arr.find((x) => x.id === did);
      const oldMail = (d.userEmail || '').toLowerCase();
      Object.assign(d, { name: nm, phone: ph, simType, simExp: sExp, status, userEmail: m }, extra);
      if (!syncDrvUser(d, pass, oldMail)) return;
    } else {
      if (!pass) { toast('Password wajib untuk pengemudi baru', 'err'); return; }
      d = Object.assign({ id: uid('D'), agencyId: agId, name: nm || 'Pengemudi Baru', phone: ph || '-', simType, simExp: sExp, status, rating: 5.0, trips: 0, userEmail: m }, extra);
      arr.push(d);
      if (!syncDrvUser(d, pass, '')) { DB.save('drivers', arr.filter((x) => x.id !== d.id)); refresh(); return; }
    }
    DB.save('drivers', arr); refresh();
    audit('driver_save', nm);
    setDrvEdit(null);
    toast('Data pengemudi + akun login disimpan');
    setAgenTab('driver'); go('agen');
    refresh();
  };

  return (
    <div className="anim max-w-2xl mx-auto bg-white rounded-3xl shadow-card p-5 sm:p-7">
      <div className="flex items-center gap-2"><button onClick={drvBack} className="bg-slate-100 hover:bg-slate-200 active:scale-95 transition p-2.5 rounded-xl cursor-pointer" aria-label="Kembali ke data pengemudi"><Icon name="arrow-left" className="w-4 h-4 pointer-events-none" /></button><h2 className="font-extrabold text-[18px]">{did ? 'Edit' : 'Tambah'} Pengemudi</h2></div>
      <Sec index="A" title="A. DATA DIRI CALON PENGEMUDI" />
      <div className="space-y-2.5">
        <div><label className="text-[12px] font-extrabold">NAMA LENGKAP <span className="text-red-500">*</span></label><input value={name} onChange={(e) => setName(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">TEMPAT LAHIR <span className="text-red-500">*</span></label><input value={bPlace} onChange={(e) => setBPlace(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">TANGGAL LAHIR <span className="text-red-500">*</span></label><input type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">JENIS KELAMIN <span className="text-red-500">*</span></label><PillRadios options={GENDERS} value={gender} onChange={setGender} /></div>
        <div><label className="text-[12px] font-extrabold">ALAMAT LENGKAP <span className="text-red-500">*</span></label><input value={addr} onChange={(e) => setAddr(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">NO HP / WHATSAPP <span className="text-red-500">*</span></label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">NOMOR KTP / NIK <span className="text-red-500">*</span></label><input value={nik} onChange={(e) => setNik(e.target.value)} inputMode="numeric" maxLength={16} placeholder="16 digit" className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">STATUS PERNIKAHAN <span className="text-red-500">*</span></label><PillRadios options={MARITALS} value={marital} onChange={setMarital} /></div>
        <div><label className="text-[12px] font-extrabold">PENDIDIKAN TERAKHIR <span className="text-red-500">*</span></label><select value={edu} onChange={(e) => setEdu(e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{EDUCATIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-2.5"><div><label className="text-[12px] font-extrabold">KONTAK DARURAT (NAMA) <span className="text-red-500">*</span></label><input value={emN} onChange={(e) => setEmN(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">NO HP DARURAT <span className="text-red-500">*</span></label><input value={emP} onChange={(e) => setEmP(e.target.value)} inputMode="tel" className={'w-full mt-1 ' + inC} /></div></div>
        <div><label className="text-[12px] font-extrabold">HUBUNGAN KONTAK DARURAT <span className="text-red-500">*</span></label><input value={emR} onChange={(e) => setEmR(e.target.value)} placeholder="cth: Istri / Saudara" className={'w-full mt-1 ' + inC} /></div>
      </div>
      <Sec index="B" title="B. DATA SIM" />
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5 items-end"><div><label className="text-[12px] font-extrabold">JENIS SIM <span className="text-red-500">*</span></label><select value={simTypeSel} onChange={(e) => setSimTypeSel(e.target.value)} className={'w-full mt-1 ' + inC}><option value="">— Pilih —</option>{SIM_TYPES.map((t) => <option key={t} value={t}>SIM {t}</option>)}<option value="Lainnya">SIM lainnya…</option></select></div>
          <div><label className="flex items-center gap-2.5 bg-sky-50 border-2 border-sky-200 rounded-2xl px-3.5 py-2.5 cursor-pointer text-[12.5px] font-bold text-sky-800 leading-snug"><input type="checkbox" checked={simSame} onChange={(e) => setSimSame(e.target.checked)} className="w-5 h-5 accent-sky-600 shrink-0" />Apakah nomor SIM sesuai dengan nomor KTP?</label></div></div>
        <div className={!SIM_TYPES.includes(simTypeSel) && simTypeSel ? '' : 'hidden'}><label className="text-[12px] font-extrabold">SIM LAINNYA <span className="text-red-500">*</span></label><input value={simOther} onChange={(e) => setSimOther(e.target.value)} placeholder="cth: B2 Umum" className={'w-full mt-1 ' + inC} /></div>
        <div className="grid grid-cols-2 gap-2.5"><div className={simSame ? 'hidden' : ''}><label className="text-[12px] font-extrabold">NOMOR SIM <span className="text-red-500">*</span></label><input value={simNum} onChange={(e) => setSimNum(e.target.value)} className={'w-full mt-1 ' + inC} /></div>
          <div><label className="text-[12px] font-extrabold">MASA BERLAKU (TAHUN) <span className="text-red-500">*</span></label><input type="number" min={cur} max={2100} value={simExp} onChange={(e) => setSimExp(e.target.value)} placeholder={'cth: ' + (cur + 5)} className={'w-full mt-1 ' + inC} /></div></div>
      </div>
      <Sec index="C" title="C. FOTO & DOKUMEN" />
      <div className="grid grid-cols-2 gap-2.5">
        <UpBox title="FOTO PROFIL" req src={photo} onPick={setPhoto} />
        <UpBox title="DOKUMEN SIM (FOTO)" req src={simPhoto} onPick={setSimPhoto} />
      </div>
      <Sec index="D" title="D. AKUN LOGIN & STATUS" />
      <div className="space-y-2.5">
        <input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Email akun login (wajib)" className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
        <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="new-password" placeholder={did ? 'Password baru (kosongkan bila tak diubah)' : 'Password login (wajib)'} className="w-full text-[13px] border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
        <div><label className="text-[12px] font-extrabold">STATUS</label><select value={status} onChange={(e) => setStatus(e.target.value)} className={'w-full mt-1 ' + inC}><option value="aktif">aktif</option><option value="nonaktif">nonaktif</option></select></div>
        <div><label className="text-[12px] font-extrabold">REKENING BANK (untuk pencairan dana tiket)</label><input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="cth: BCA 1234567890 a.n. Nama" className={'w-full mt-1 ' + inC} /></div>
        <p className="text-[11.5px] text-slate-400 font-medium">Nonaktif = suspend: pengemudi tidak bisa masuk & tak bisa dijadwalkan.</p></div>
      <div className="grid grid-cols-2 gap-2.5 mt-5"><button onClick={drvBack} className="bg-slate-100 font-extrabold text-[14px] py-3 rounded-2xl">Batal</button><button onClick={saveDrvPage} className="bg-sky-600 text-white font-extrabold text-[14px] py-3 rounded-2xl">Simpan</button></div></div>
  );
}
