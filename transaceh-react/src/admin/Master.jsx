import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import { audit, DEFAULT_SERVICE, platformFeeOf, savePlatformFee } from '@/lib/domain.js';
import { cityImageFromFile, cityImageId, CITY_IMAGE_MAX_CHARS } from '@/lib/imageTool.js';
import { fmtRp, inC } from '@/lib/utils.js';
import { PROVINSI, KABKOTA, PILIHAN_LAIN } from '@/lib/daerah.js';
import { Icon } from '@/components/ui.jsx';

function PlatformFeeCard() {
  const { refresh, toast } = useApp();
  const [cfg, setCfg] = useState(platformFeeOf());
  const [type, setType] = useState(cfg.type);
  const [value, setValue] = useState(cfg.value);
  const save = () => {
    const v = Math.max(0, Number(value) || 0);
    const next = { type: type === 'flat' ? 'flat' : 'percent', value: v };
    savePlatformFee(next);
    setCfg(next);
    refresh();
    toast('Fee platform global diperbarui • ' + (next.type === 'flat' ? fmtRp(next.value) : next.value + '%'));
  };
  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="percent" className="w-5 h-5 text-violet-600" />FEE PLATFORM GLOBAL</h3>
      <div className="text-[11.5px] text-slate-400 font-medium mt-1">Berlaku untuk semua agen dan semua transaksi baru. Transaksi yang sudah diproses tidak berubah. Persen = % × subtotal; Flat Rp = per kursi (nilai × jumlah kursi). Booking yang dibuat pengemudi tetap kena fee ini (jasa agen Rp0).</div>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className="text-[13px] font-bold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring">
          <option value="percent">Persen %</option>
          <option value="flat">Flat Rp</option>
        </select>
        <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} className="text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring" />
      </div>
      <div className="text-[11.5px] text-slate-500 font-semibold mt-2">Fee platform sekarang: <b className="text-violet-700">{cfg.type === 'flat' ? fmtRp(cfg.value) : cfg.value + '%'}</b></div>
      <button onClick={save} className="mt-3 w-full bg-violet-600 text-white font-extrabold text-[13px] py-2.5 rounded-2xl">Simpan Fee Platform</button>
    </div>
  );
}

function CityImagesCard() {
  const { user, refresh, toast } = useApp();
  const routes = DB.load('routes', []);
  const imgs = DB.load('cityImages', []);
  const imgByCity = {};
  imgs.forEach((c) => { imgByCity[String(c.city || '').trim().toLowerCase()] = c; });

  /* Garis kemajuan: kota yang namanya ada pada rute aktif. Form unggah
     sendiri TIDAK terikat rute — dropdown wilayah (daerah.js) memasang
     kota mana pun; hitungan ini hanya informasi kenyamanan admin. */
  const routeCities = new Set();
  routes.forEach((r) => {
    const fk = String(r.from || '').trim().toLowerCase();
    const tk = String(r.to || '').trim().toLowerCase();
    if (fk) routeCities.add(fk);
    if (tk) routeCities.add(tk);
  });
  const terisi = [...routeCities].filter((k) => imgByCity[k] && imgByCity[k].image).length;

  const [prov, setProv] = useState('');
  const [kotaSel, setKotaSel] = useState('');
  const [kotaBebas, setKotaBebas] = useState('');
  const [pend, setPend] = useState({}); /* { cityKey: {city, provisi, dataUrl, bytes} } — pratinjau sebelum simpan */

  const opsiKota = KABKOTA[prov] || [];
  /* Dropdown memakai nama resmi berawalan ("Kota Medan", "Kabupaten Aceh
     Barat") — kartu "Pilih Rute Perjalanan" memakai nama polos ("Medan",
     "Aceh Barat"). Simpan TANPA awalan supaya pencocokan nama kota tetap
     pas; kota tulis-sendiri disimpan apa adanya. */
  const namaRaw = kotaSel === PILIHAN_LAIN ? String(kotaBebas || '').trim() : String(kotaSel || '').trim();
  const namaCity = kotaSel === PILIHAN_LAIN ? namaRaw : namaRaw.replace(/^(Kabupaten|Kota)\s+/i, '').trim();
  const cityKey = namaCity.toLowerCase();
  const cur = imgByCity[cityKey];
  const p = pend[cityKey];

  /* Pilih file → pipihkan → pratinjau. Provinsi ikut dari pemanggil:
     editor atas memakai dropdown, baris terpasang memakai provinsi
     rekornya sendiri. */
  const pilihFile = (key, city, provisi) => (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('Foto maksimal 8 MB — kecilkan dulu', 'err'); return; }
    cityImageFromFile(f).then((out) => {
      if (out.dataUrl.length > CITY_IMAGE_MAX_CHARS) {
        toast('Gambar masih terlalu besar — pilih foto lebih kecil', 'err');
        return;
      }
      setPend((m) => ({ ...m, [key]: { city, provisi, dataUrl: out.dataUrl, bytes: out.bytes } }));
    }).catch((err) => toast(err.message || 'Gambar tidak bisa dibaca', 'err'));
  };

  const simpan = (key) => {
    const pr = pend[key] || {};
    const city = String(pr.city || '').trim();
    const provisi = String(pr.provisi || '').trim();
    if (city.length < 2) { toast('Pilih provinsi lalu kota dulu', 'err'); return; }
    if (!provisi) { toast('Provinsi wajib dipilih — pilih dari dropdown provinsi', 'err'); return; }
    const arr = DB.load('cityImages', []);
    const id = cityImageId(city);
    let rec = arr.find((x) => x.id === id);
    const wasBaru = !rec;
    if (!rec) { rec = { id }; arr.push(rec); }
    rec.city = city;
    rec.province = provisi;
    rec.mime = 'image/jpeg';
    rec.image = pr.dataUrl;
    rec.bytes = pr.bytes;
    rec.updatedAt = new Date().toISOString();
    rec.updatedBy = (user && user.email) || '';
    DB.save('cityImages', arr);
    audit('city_image', city + ' • ' + (wasBaru ? 'unggah gambar' : 'gambar diperbarui'));
    setPend((m) => { const n = { ...m }; delete n[key]; return n; });
    refresh();
    toast('Gambar kota ' + city + ' tersimpan');
  };

  const hapus = (city) => {
    const key = city.toLowerCase();
    DB.save('cityImages', DB.load('cityImages', []).filter((x) => String(x.city || '').trim().toLowerCase() !== key));
    audit('city_image', city + ' • gambar dihapus');
    refresh();
    toast('Gambar kota ' + city + ' dihapus');
  };

  const terpasang = imgs.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  return (
    <div className="bg-white rounded-3xl shadow-card p-5">
      <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="image" className="w-5 h-5 text-rose-600" />GAMBAR KOTA</h3>
      <div className="text-[11.5px] text-slate-400 font-medium mt-1">Tampil di kartu "Pilih Rute Perjalanan" pencarian (belahan asal & tujuan). Dipipihkan otomatis 512 px — target ±30 KB, mutu JPEG minimal 0,60. Satu rekord per kota: unggah ulang menggantikan, tidak mendobel.</div>
      <div className="text-[11.5px] font-bold mt-2"><span className="text-sky-700">{terisi}/{routeCities.size} kota rute sudah bergambar</span></div>

      {/* Dropdown provinsi → kota/kabupaten (data wilayah resmi, pola AlamatFields). */}
      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        <div>
          <label className="text-[11px] font-extrabold text-slate-500">PROVINSI <span className="text-red-500">*</span></label>
          <select value={prov} onChange={(e) => { setProv(e.target.value); setKotaSel(''); setKotaBebas(''); }} className={'w-full mt-1 ' + inC}>
            <option value="">— Pilih —</option>
            {PROVINSI.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-extrabold text-slate-500">KOTA / KABUPATEN <span className="text-red-500">*</span></label>
          {kotaSel === PILIHAN_LAIN
            ? <div className="relative mt-1"><input value={kotaBebas} onChange={(e) => setKotaBebas(e.target.value)} placeholder="Nama kota di luar daftar" className={inC + ' pr-9'} /><button type="button" onClick={() => setKotaSel('')} aria-label="Kembali ke daftar" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-600"><Icon name="x" className="w-4 h-4 pointer-events-none" /></button></div>
            : <select value={kotaSel} disabled={!prov} onChange={(e) => setKotaSel(e.target.value)} className={'w-full mt-1 ' + (inC + (!prov ? ' opacity-50' : ''))}>
              <option value="">— Pilih —</option>
              {opsiKota.map((o) => <option key={o} value={o}>{o}</option>)}
              <option value={PILIHAN_LAIN}>✏️ Tulis sendiri…</option>
            </select>}
          {prov && !opsiKota.length && kotaSel !== PILIHAN_LAIN ? <p className="text-[10.5px] font-bold text-slate-400 mt-1">Kabupaten/kota belum terdaftar — pilih "Tulis sendiri…".</p> : null}
        </div>
      </div>

      {/* Editor kota terpilih — muncul begitu kota dipilih dari dropdown. */}
      {kotaSel ? (
        <div className="mt-2.5 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
          {p
            ? <img src={p.dataUrl} alt={'Pratinjau ' + namaCity} className="w-10 h-10 rounded-lg object-cover border-2 border-emerald-300 shrink-0" />
            : cur
              ? <img src={cur.image} alt={namaCity} className="w-10 h-10 rounded-lg object-cover border-2 border-slate-200 shrink-0" />
              : <span className="w-10 h-10 rounded-lg bg-slate-200 shrink-0 flex items-center justify-center text-slate-400"><Icon name="image" className="w-4 h-4" /></span>}
          <span className="flex-1 min-w-0 text-[12.5px] font-bold truncate">
            {namaCity || '—'}
            {prov ? <span className="text-slate-400 font-medium"> • {prov}</span> : null}
            {p ? <span className="text-[11px] font-extrabold text-emerald-600 ml-1">PRATINJAU</span> : null}
            {!p && cur ? <span className="text-[11px] font-medium text-slate-400 ml-1">• {Math.round((Number(cur.bytes) || 0) / 1024)} KB</span> : null}
            {!p && !cur ? <span className="text-[11px] font-medium text-slate-400 ml-1">• belum bergambar</span> : null}
          </span>
          <label className="cursor-pointer text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-sky-100 text-sky-700 hover:bg-sky-200 transition shrink-0">
            {cur ? 'Ganti' : 'Pilih Gambar'}<input type="file" accept="image/*" className="hidden" onChange={pilihFile(cityKey, namaCity, prov)} />
          </label>
          {p
            ? <>
              <button onClick={() => simpan(cityKey)} className="text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shrink-0">Simpan</button>
              <button onClick={() => setPend((m) => { const n = { ...m }; delete n[cityKey]; return n; })} className="text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 transition shrink-0">Batal</button>
            </>
            : null}
          {cur
            ? <button onClick={() => hapus(namaCity)} className="text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 transition shrink-0">Hapus</button>
            : null}
        </div>
      ) : null}

      {/* Daftar gambar terpasang — terbaru dulu. */}
      <div className="text-[11px] font-extrabold text-slate-400 mt-3.5 mb-1.5 tracking-wide">TERPASANG ({terpasang.length})</div>
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {terpasang.map((c) => {
          const city = String(c.city || '').trim();
          const key = city.toLowerCase();
          const rp = pend[key];
          return (
            <div key={key} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
              {rp
                ? <img src={rp.dataUrl} alt={'Pratinjau ' + city} className="w-10 h-10 rounded-lg object-cover border-2 border-emerald-300 shrink-0" />
                : <img src={c.image} alt={city} className="w-10 h-10 rounded-lg object-cover border-2 border-slate-200 shrink-0" />}
              <span className="flex-1 min-w-0 text-[12.5px] font-bold truncate">
                {city}
                {c.province ? <span className="text-slate-400 font-medium"> • {c.province}</span> : null}
                {rp ? <span className="text-[11px] font-extrabold text-emerald-600 ml-1">PRATINJAU</span> : null}
                {!rp ? <span className="text-[11px] font-medium text-slate-400 ml-1">• {Math.round((Number(c.bytes) || 0) / 1024)} KB</span> : null}
              </span>
              <label className="cursor-pointer text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-sky-100 text-sky-700 hover:bg-sky-200 transition shrink-0">
                Ganti<input type="file" accept="image/*" className="hidden" onChange={pilihFile(key, city, c.province)} />
              </label>
              {rp
                ? <>
                  <button onClick={() => simpan(key)} className="text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shrink-0">Simpan</button>
                  <button onClick={() => setPend((m) => { const n = { ...m }; delete n[key]; return n; })} className="text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 transition">Batal</button>
                </>
                : null}
              <button onClick={() => hapus(city)} className="text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 transition shrink-0">Hapus</button>
            </div>
          );
        })}
        {!terpasang.length ? <div className="text-[12.5px] text-slate-400 font-medium mt-1">Belum ada gambar — pilih provinsi lalu kota di atas.</div> : null}
      </div>
    </div>
  );
}

export function Master() {
  const { refresh, toast } = useApp();
  const banners = DB.load('banners', []);
  const routes = DB.load('routes', []);
  const ags = DB.load('agencies', []);
  const logs = DB.load('audit', []).slice(0, 20);
  const toggleBanner = (id) => { const arr = DB.load('banners', []); const b = arr.find((x) => x.id === id); if (b) { b.active = !b.active; DB.save('banners', arr); refresh(); } };
  const saveFee = (agencyId, raw) => {
    const arr = DB.load('agencies', []); const a = arr.find((x) => x.id === agencyId);
    const fee = Math.max(0, Math.round(Number(raw) || 0));
    if (!a) return fee;
    const old = Number(a.serviceFee ?? DEFAULT_SERVICE) || 0;
    if (fee === old) return old;
    a.serviceFee = fee; DB.save('agencies', arr);
    audit('service_fee', a.name + ' • ' + old + ' → ' + fee);
    refresh(); toast('Jasa agen diperbarui • ' + fmtRp(fee) + '/kursi');
    return fee;
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <PlatformFeeCard />
      <CityImagesCard />
      <div className="bg-white rounded-3xl shadow-card p-5">
        <h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="banknote" className="w-5 h-5 text-sky-600" />JASA AGEN / KURSI</h3>
        <div className="text-[11.5px] text-slate-400 font-medium mt-1">Ditentukan admin per agen — berlaku untuk semua rute agen tersebut. Transaksi yang sudah terproses tidak berubah.</div>
        {ags.map((a) => {
          const nRoutes = routes.filter((r) => (r.agencyIds || (r.agencyId ? [r.agencyId] : [])).includes(a.id)).length;
          return (
            <div key={a.id} className="flex items-center gap-2 mt-1.5 bg-slate-50 rounded-xl px-3 py-2 text-[12.5px] font-bold">
              <span className="flex-1">{a.name}<span className="text-slate-400 font-medium"> • {nRoutes} rute</span></span>
              <input type="number" min="0" defaultValue={a.serviceFee ?? DEFAULT_SERVICE} onBlur={(e) => { e.target.value = saveFee(a.id, e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-28 text-right font-semibold border-2 border-slate-200 rounded-xl px-2 py-1.5 focus-ring" />
              <span className="text-slate-400 font-medium">/kursi</span>
            </div>
          );
        })}
        {!ags.length ? <div className="text-[12.5px] text-slate-400 font-medium mt-2">Belum ada agen.</div> : null}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5">
        <div className="font-extrabold text-[15px]">BANNER PROMO</div>
        {banners.map((b) => (<div key={b.id} className="flex items-center gap-2 mt-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12.5px] font-bold">{b.title}<div className="flex-1"></div><button onClick={() => toggleBanner(b.id)} className={`badge ${b.active ? 'bg-green-500 text-white' : 'bg-slate-200'} cursor-pointer`}>{b.active ? 'on' : 'off'}</button></div>))}
      </div>
      <div className="bg-white rounded-3xl shadow-card p-5"><h3 className="font-extrabold text-[15px] flex items-center gap-2"><Icon name="scroll-text" className="w-5 h-5 text-sky-600" />Audit Log (aksi penting)</h3>
        <div className="mt-2 space-y-1.5 max-h-[420px] overflow-y-auto">{logs.map((l) => (<div key={l.id} className="bg-slate-50 rounded-xl px-3 py-2 text-[12px]"><span className="font-mono text-slate-400">{new Date(l.time).toLocaleString('id-ID')}</span><br /><b>{l.actor}</b> • <span className="font-bold text-sky-700">{l.action}</span> <span className="text-slate-500">{l.detail}</span></div>))}</div></div>
    </div>
  );
}

export default Master;
