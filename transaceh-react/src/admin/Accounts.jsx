import { useState } from 'react';
import { useApp } from '@/store/AppContext.jsx';
import { DB } from '@/lib/db.js';
import {
  accountRoleLabel,
  accountStatusKind,
  agencyById,
  agentAccountForAgency,
  agentDeleteBlockReason,
  createManagedAccount,
  deleteManagedAgent,
  driverParentIssue,
  setManagedAccountStatus,
  updateManagedAccount,
} from '@/lib/domain.js';
import { inC } from '@/lib/utils.js';
import { Empty, Icon } from '@/components/ui.jsx';

const ROLE_META = {
  superadmin: { label: 'Admin', cls: 'bg-violet-100 text-violet-700', icon: 'shield-check' },
  agen: { label: 'Agen', cls: 'bg-sky-100 text-sky-700', icon: 'building-2' },
  pengemudi: { label: 'Pengemudi', cls: 'bg-amber-100 text-amber-700', icon: 'car-front' },
  pelanggan: { label: 'Pelanggan', cls: 'bg-green-100 text-green-700', icon: 'user-round' },
};
const STATUS_META = {
  active: { label: 'Aktif', cls: 'bg-green-100 text-green-700' },
  pending: { label: 'Menunggu', cls: 'bg-amber-100 text-amber-700' },
  suspended: { label: 'Nonaktif', cls: 'bg-red-100 text-red-600' },
};
const ROLE_ORDER = { superadmin: 0, agen: 1, pengemudi: 2, pelanggan: 3 };

function roleMeta(role) { return ROLE_META[role] || { label: role || 'Akun', cls: 'bg-slate-100 text-slate-500', icon: 'user' }; }
function statusMeta(u) { return STATUS_META[accountStatusKind(u)] || STATUS_META.active; }
function childrenOf(agencyId, users) {
  return (users || DB.load('users', [])).filter((u) => u.role === 'pengemudi' && u.agencyId === agencyId);
}
function driverOf(user) {
  const em = String((user && user.email) || '').toLowerCase();
  if (!em) return null;
  return DB.load('drivers', []).find((d) => String(d.userEmail || '').toLowerCase() === em) || null;
}
function linkedLabel(u) {
  if (u.role === 'agen') {
    const a = agencyById(u.agencyId);
    const n = childrenOf(u.agencyId).length;
    return (a ? 'Travel: ' + a.name : 'Travel tidak ditemukan') + (n ? ' • ' + n + ' sub-akun' : '');
  }
  if (u.role === 'pengemudi') {
    const d = driverOf(u);
    const a = d ? agencyById(d.agencyId) : agencyById(u.agencyId);
    const parent = agentAccountForAgency(u.agencyId);
    return (a ? 'Travel: ' + a.name : 'Travel tidak ditemukan') + ' • induk: ' + (parent ? parent.name : 'tidak ada');
  }
  if (u.role === 'pelanggan') {
    const n = DB.load('bookings', []).filter((b) => String(b.userEmail || '').toLowerCase() === String(u.email || '').toLowerCase()).length;
    return n + ' booking';
  }
  return 'Akses penuh admin';
}
function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-[11px] font-extrabold text-slate-500">{label}</label>
      {children}
      {hint ? <p className="text-[10.5px] text-slate-400 font-medium mt-1">{hint}</p> : null}
    </div>
  );
}
function Avatar({ name, small }) {
  return <div className={(small ? 'w-8 h-8 rounded-xl text-[12px]' : 'w-11 h-11 rounded-2xl text-[15px]') + ' bg-gradient-to-br from-[#0b2447] to-sky-600 text-white font-extrabold flex items-center justify-center shrink-0 overflow-hidden'}>{(name || '?')[0].toUpperCase()}</div>;
}
function StatusBadge({ u }) {
  const sm = statusMeta(u);
  return <span className={'badge ' + sm.cls}>{sm.label}</span>;
}
function RoleBadge({ role }) {
  const rm = roleMeta(role);
  return <span className={'badge ' + rm.cls}><Icon name={rm.icon} className="w-3 h-3" />{rm.label}</span>;
}

function AccountCreateModal({ defaultRole = 'pelanggan', defaultAgencyId = '' }) {
  const { closeModal, toast, refresh } = useApp();
  const users = DB.load('users', []);
  const agencies = DB.load('agencies', []).filter((a) => !users.some((u) => u.role === 'agen' && u.agencyId === a.id));
  const drivers = DB.load('drivers', []).filter((d) => {
    if (defaultAgencyId && d.agencyId !== defaultAgencyId) return false;
    return !users.some((u) => String(u.email || '').toLowerCase() === String(d.userEmail || '').toLowerCase());
  });
  const [role, setRole] = useState(defaultRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [agencyId, setAgencyId] = useState(defaultRole === 'agen' ? defaultAgencyId : '');
  const [driverId, setDriverId] = useState('');
  const [status, setStatus] = useState('active');
  const selectedDriver = drivers.find((d) => d.id === driverId) || null;
  const emailLocked = role === 'pengemudi' && selectedDriver && !!selectedDriver.userEmail;
  const scopedAgency = defaultAgencyId ? agencyById(defaultAgencyId) : null;

  const changeRole = (r) => {
    setRole(r);
    setAgencyId(r === 'agen' ? defaultAgencyId : '');
    setDriverId('');
  };
  const pickDriver = (id) => {
    setDriverId(id);
    const d = drivers.find((x) => x.id === id);
    if (d) {
      setName(d.name || '');
      setPhone(d.phone || '');
      setEmail(d.userEmail || '');
    }
  };
  const submit = () => {
    if (password !== password2) { toast('Ulangi password tidak sama', 'err'); return; }
    if (role === 'superadmin' && !window.confirm('Buat akun admin baru dengan akses penuh ke seluruh panel admin?')) return;
    const res = createManagedAccount({ name, email, phone, password, role, agencyId, driverId, status });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast('Akun ' + accountRoleLabel(role) + ' berhasil dibuat');
  };

  return (
    <div className="p-5 sm:p-6 max-h-[88vh] overflow-y-auto">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h3 className="font-extrabold text-[18px] flex items-center gap-2"><Icon name="users" className="w-5 h-5 text-sky-600" />Tambah Akun</h3>
          <p className="text-[12px] text-slate-500 font-medium mt-0.5">Akun agen dan pengemudi harus ditautkan ke data travel/pengemudi yang sudah ada.</p>
        </div>
        <button onClick={closeModal} className="text-slate-400 p-1" aria-label="Tutup"><Icon name="x" className="w-5 h-5" /></button>
      </div>

      {scopedAgency && role === 'pengemudi' ? <div className="mt-3 bg-sky-50 border border-sky-200 rounded-xl p-3 text-[11.5px] font-semibold text-sky-900 flex gap-2"><Icon name="building-2" className="w-4 h-4 shrink-0 mt-0.5" />Akun ini menjadi sub-akun dari travel <b>{scopedAgency.name}</b>.</div> : null}

      <div className="space-y-2.5 mt-4">
        <Field label="ROLE AKUN">
          <select value={role} onChange={(e) => changeRole(e.target.value)} className={inC + ' mt-1'}>
            <option value="pelanggan">Pelanggan</option>
            <option value="agen">Agen travel</option>
            <option value="pengemudi">Pengemudi</option>
            <option value="superadmin">Admin / Super Admin</option>
          </select>
        </Field>

        {role === 'agen' ? (
          <Field label="TRAVEL AGEN" hint={agencies.length ? 'Satu travel hanya memiliki satu akun agen di halaman ini.' : 'Semua travel sudah punya akun agen.'}>
            <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className={inC + ' mt-1'} disabled={!agencies.length}>
              <option value="">Pilih travel…</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.status})</option>)}
            </select>
          </Field>
        ) : null}

        {role === 'pengemudi' ? (
          <Field label="DATA PENGEMUDI" hint={drivers.length ? (defaultAgencyId ? 'Hanya pengemudi travel ini yang ditampilkan.' : 'Akun akan menjadi sub-akun agen travel pengemudi.') : 'Tidak ada pengemudi tanpa akun pada cakupan ini.'}>
            <select value={driverId} onChange={(e) => pickDriver(e.target.value)} className={inC + ' mt-1'} disabled={!drivers.length}>
              <option value="">Pilih pengemudi…</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} • {(agencyById(d.agencyId) || {}).name || d.agencyId} • {d.userEmail || 'belum ada email'}</option>)}
            </select>
          </Field>
        ) : null}

        <Field label="NAMA LENGKAP">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inC + ' mt-1'} placeholder="Nama pemilik akun" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Field label="EMAIL LOGIN">
            <input value={email} onChange={(e) => setEmail(e.target.value)} readOnly={emailLocked} className={inC + ' mt-1 ' + (emailLocked ? 'bg-slate-100 text-slate-500' : '')} placeholder="nama@email.com" inputMode="email" />
          </Field>
          <Field label="NO HP / WHATSAPP">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inC + ' mt-1'} placeholder="08xxxxxxxxxx" inputMode="tel" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Field label="PASSWORD">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className={inC + ' mt-1'} placeholder="Minimal 8 karakter" autoComplete="new-password" />
          </Field>
          <Field label="ULANGI PASSWORD">
            <input value={password2} onChange={(e) => setPassword2(e.target.value)} type="password" className={inC + ' mt-1'} placeholder="Ketik ulang password" autoComplete="new-password" />
          </Field>
        </div>
        <Field label="STATUS AWAL" hint={role === 'agen' ? 'Jika travel masih menunggu persetujuan, akun otomatis berstatus Menunggu.' : role === 'pengemudi' ? 'Sub-akun mengikuti status akun agen induk.' : undefined}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inC + ' mt-1'}>
            <option value="active">Aktif</option>
            <option value="suspended">Nonaktif</option>
          </select>
        </Field>
      </div>

      {role === 'superadmin' ? <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11.5px] font-semibold text-amber-900 flex gap-2"><Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5" />Akun ini memiliki akses penuh untuk mengelola seluruh data dan akun lain.</div> : null}

      <div className="grid grid-cols-2 gap-2.5 mt-5">
        <button onClick={closeModal} className="bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Batal</button>
        <button onClick={submit} className="bg-sky-600 text-white font-extrabold text-[13px] py-3 rounded-2xl">Buat Akun</button>
      </div>
    </div>
  );
}

function AccountManageModal({ id }) {
  const { user, closeModal, toast, refresh, openModal } = useApp();
  const u = DB.load('users', []).find((x) => x.id === id) || null;
  const [name, setName] = useState(u ? u.name : '');
  const [phone, setPhone] = useState(u ? (u.phone || '') : '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  if (!u) return <div className="p-6"><Empty icon="users" msg="Akun tidak ditemukan." /><button onClick={closeModal} className="mt-2 w-full bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Tutup</button></div>;
  const rm = roleMeta(u.role);
  const sm = statusMeta(u);
  const st = accountStatusKind(u);
  const isSelf = !!(user && user.id === u.id);
  const nextStatus = st === 'active' ? 'suspended' : 'active';
  const parentIssue = u.role === 'pengemudi' ? driverParentIssue(u) : null;
  const parentAgent = u.role === 'pengemudi' ? agentAccountForAgency(u.agencyId) : null;
  const childUsers = u.role === 'agen' ? childrenOf(u.agencyId).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))) : [];
  const deleteBlock = u.role === 'agen' ? agentDeleteBlockReason(u.agencyId) : null;
  const parentLocked = u.role === 'pengemudi' && nextStatus === 'active' && !!parentIssue;
  const canToggle = (!isSelf || st !== 'active') && !parentLocked;

  const save = () => {
    const changePassword = !!(pw || pw2);
    if (changePassword && (!pw || !pw2)) { toast('Isi password baru dan ulanginya', 'err'); return; }
    if (changePassword && pw !== pw2) { toast('Ulangi password tidak sama', 'err'); return; }
    if (changePassword && pw.length < 8) { toast('Password minimal 8 karakter', 'err'); return; }
    const res = updateManagedAccount(u.id, { name, phone, password: changePassword ? pw : '' });
    if (!res.ok) { toast(res.msg, 'err'); return; }
    setPw('');
    setPw2('');
    refresh();
    toast(changePassword ? 'Data akun dan password disimpan' : 'Data akun disimpan');
  };
  const toggleStatus = () => {
    if (nextStatus === 'suspended' && !window.confirm('Nonaktifkan akun ' + u.email + '? Pengguna tidak bisa masuk sampai akun diaktifkan kembali.')) return;
    const res = setManagedAccountStatus(u.id, nextStatus);
    if (!res.ok) { toast(res.msg, 'err'); return; }
    refresh();
    toast(nextStatus === 'active' ? 'Akun diaktifkan' : 'Akun dinonaktifkan');
  };
  const deleteAgent = () => {
    if (deleteBlock) { toast(deleteBlock, 'err'); return; }
    const extra = Math.max(0, childUsers.length);
    const msg = 'Hapus akun agen ' + u.email + '?' + (extra ? ' ' + extra + ' akun login pengemudi di bawahnya juga akan dihapus.' : '') + ' Data travel dan data pengemudi tetap disimpan.';
    if (!window.confirm(msg)) return;
    const res = deleteManagedAgent(u.id);
    if (!res.ok) { toast(res.msg, 'err'); return; }
    closeModal();
    refresh();
    toast(res.removed > 1 ? 'Akun agen dan ' + (res.removed - 1) + ' sub-akun dihapus' : 'Akun agen dihapus');
  };

  return (
    <div className="p-5 sm:p-6 max-h-[88vh] overflow-y-auto">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap"><h3 className="font-extrabold text-[18px] truncate">{u.name}</h3><span className={'badge ' + rm.cls}><Icon name={rm.icon} className="w-3 h-3" />{rm.label}</span><span className={'badge ' + sm.cls}>{sm.label}</span></div>
          <p className="text-[12px] text-slate-500 font-medium mt-0.5 truncate">{u.email}</p>
        </div>
        <button onClick={closeModal} className="text-slate-400 p-1" aria-label="Tutup"><Icon name="x" className="w-5 h-5" /></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-4">
        <div className="bg-slate-50 rounded-xl px-3 py-2"><div className="text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400">Email login</div><div className="text-[12px] font-bold truncate">{u.email}</div></div>
        <div className="bg-slate-50 rounded-xl px-3 py-2"><div className="text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400">Tautan</div><div className="text-[12px] font-bold truncate">{linkedLabel(u)}</div></div>
      </div>

      {u.role === 'pengemudi' ? (
        <div className={'mt-3 rounded-2xl p-3 border ' + (parentIssue ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}>
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Akun agen induk</div>
          <div className="text-[12px] font-bold">{parentAgent ? parentAgent.name + ' • ' + parentAgent.email : 'Tidak ditemukan'}</div>
          {parentIssue ? <div className="text-[11px] font-semibold text-amber-800 mt-1">{parentIssue}</div> : <div className="text-[11px] font-medium text-slate-500 mt-1">Status pengemudi mengikuti akun agen dan travel induk.</div>}
        </div>
      ) : null}

      <h4 className="font-extrabold text-[13px] mt-5">Data Akun</h4>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-1.5">
        <Field label="NAMA LENGKAP"><input value={name} onChange={(e) => setName(e.target.value)} className={inC + ' mt-1'} /></Field>
        <Field label="NO HP / WHATSAPP"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inC + ' mt-1'} inputMode="tel" /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-2.5">
        <Field label="PASSWORD BARU" hint="Kosongkan jika tidak ingin mengganti password."><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" className={inC + ' mt-1'} placeholder="Minimal 6 karakter" autoComplete="new-password" /></Field>
        <Field label="ULANGI PASSWORD BARU"><input value={pw2} onChange={(e) => setPw2(e.target.value)} type="password" className={inC + ' mt-1'} placeholder="Ketik ulang password baru" autoComplete="new-password" /></Field>
      </div>
      <div className="text-[10.5px] text-slate-400 font-medium mt-2">Email dan role tidak dapat diubah karena dipakai sebagai identitas login dan tautan data. Password baru berlaku saat pengguna login berikutnya.</div>
      <button onClick={save} className="mt-3 w-full bg-[#0b2447] text-white font-extrabold text-[13px] py-2.5 rounded-xl">Simpan Perubahan</button>

      {u.role === 'agen' ? (
        <>
          <div className="flex items-center gap-2 mt-5">
            <h4 className="font-extrabold text-[13px]">Sub-akun Pengemudi</h4>
            <span className="badge bg-amber-100 text-amber-700">{childUsers.length}</span>
          </div>
          <div className="mt-1.5 border-2 border-slate-100 rounded-2xl overflow-hidden">
            {childUsers.length ? (
              <div className="divide-y divide-slate-100">
                {childUsers.map((c) => (
                  <button key={c.id} onClick={() => openModal(<AccountManageModal id={c.id} />)} className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50">
                    <Avatar name={c.name} small />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap"><span className="font-extrabold text-[12px] truncate">{c.name}</span><span className="badge bg-slate-100 text-slate-500">Sub-akun</span><StatusBadge u={c} /></div>
                      <div className="text-[11px] text-slate-500 font-medium truncate">{c.email}</div>
                    </div>
                    <Icon name="arrow-right" className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : <div className="px-3 py-3 text-[11.5px] text-slate-400 font-medium">Belum ada akun pengemudi di travel ini.</div>}
            <button onClick={() => openModal(<AccountCreateModal defaultRole="pengemudi" defaultAgencyId={u.agencyId} />)} className="w-full border-t border-slate-100 px-3 py-2.5 text-[11.5px] font-extrabold text-sky-600 flex items-center justify-center gap-1.5 hover:bg-sky-50"><Icon name="plus" className="w-3.5 h-3.5" />Tambah Akun Pengemudi</button>
          </div>
          <div className="text-[10.5px] text-slate-400 font-medium mt-1.5">Saat akun agen ini dinonaktifkan, semua sub-akun pengemudi ikut nonaktif dan tidak bisa login.</div>
        </>
      ) : null}

      <h4 className="font-extrabold text-[13px] mt-5">Status Akun</h4>
      <div className={'mt-1.5 rounded-2xl p-3 border ' + (st === 'active' ? 'bg-green-50 border-green-200' : st === 'pending' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200')}>
        <div className="flex items-center gap-2"><Icon name={st === 'active' ? 'circle-check-big' : st === 'pending' ? 'clock' : 'ban'} className={'w-4 h-4 ' + (st === 'active' ? 'text-green-600' : st === 'pending' ? 'text-amber-600' : 'text-red-500')} /><div className="text-[12px] font-bold flex-1">{st === 'active' ? 'Akun aktif dan bisa masuk.' : st === 'pending' ? 'Akun menunggu aktivasi.' : 'Akun nonaktif dan tidak bisa masuk.'}</div></div>
        {u.role === 'agen' ? <div className="text-[10.5px] text-slate-500 font-medium mt-1">Status travel tetap diatur di menu Agen. Menonaktifkan akun ini juga menonaktifkan sub-akun pengemudi di travel ini.</div> : null}
        {u.role === 'pengemudi' ? <div className="text-[10.5px] text-slate-500 font-medium mt-1">Status pengemudi mengikuti akun agen induk. Pengemudi dengan jadwal aktif tidak bisa dinonaktifkan.</div> : null}
        {isSelf ? <div className="text-[10.5px] text-slate-500 font-medium mt-1">Akun sendiri tidak dapat dinonaktifkan.</div> : null}
        {parentLocked ? <div className="text-[10.5px] font-semibold text-amber-700 mt-1">Aktifkan akun agen travel terlebih dahulu.</div> : null}
        <button onClick={toggleStatus} disabled={!canToggle} className={'mt-2 w-full font-extrabold text-[12.5px] py-2.5 rounded-xl ' + (!canToggle ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : nextStatus === 'active' ? 'bg-green-600 text-white' : 'bg-red-100 text-red-600')}>{nextStatus === 'active' ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}</button>
      </div>

      {u.role === 'agen' ? (
        <div className="mt-5 rounded-2xl border-2 border-red-100 bg-red-50/40 p-3">
          <div className="flex items-center gap-2"><Icon name="trash-2" className="w-4 h-4 text-red-500" /><h4 className="font-extrabold text-[13px] text-red-700">Hapus Akun Agen</h4></div>
          <p className="text-[10.5px] text-slate-500 font-medium mt-1">Semua akun login pengemudi di bawah agen ini ikut dihapus. Data travel, kendaraan, dan data pengemudi tetap disimpan. Hapus hanya jika travel belum punya riwayat jadwal/transaksi.</p>
          {childUsers.length ? <div className="text-[10.5px] font-semibold text-red-700 mt-1">{childUsers.length} akun login pengemudi akan ikut dihapus.</div> : null}
          {deleteBlock ? <div className="text-[10.5px] font-semibold text-amber-700 mt-1">{deleteBlock}</div> : null}
          <button onClick={deleteAgent} disabled={!!deleteBlock} className={'mt-2 w-full font-extrabold text-[12px] py-2.5 rounded-xl ' + (deleteBlock ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-red-600 text-white')}>Hapus Akun Agen</button>
        </div>
      ) : null}

      <button onClick={closeModal} className="mt-4 w-full bg-slate-100 font-extrabold text-[13px] py-3 rounded-2xl">Tutup</button>
    </div>
  );
}

function AgentChildRow({ u, onOpen }) {
  return (
    <button onClick={() => onOpen(u)} className="w-full text-left flex items-center gap-2.5 rounded-xl px-3 py-2 border border-transparent hover:border-slate-200 hover:bg-white transition">
      <Avatar name={u.name} small />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap"><span className="font-extrabold text-[12.5px] truncate">{u.name || '(tanpa nama)'}</span><span className="badge bg-slate-100 text-slate-500">Sub-akun</span><StatusBadge u={u} /></div>
        <div className="text-[11px] text-slate-500 font-medium truncate">{u.email}</div>
      </div>
      <Icon name="arrow-right" className="w-3.5 h-3.5 text-slate-300 shrink-0" />
    </button>
  );
}

function AgentGroup({ group, onOpen, onToggle }) {
  const { agent, children, expanded, canExpand } = group;
  return (
    <div className="border-2 border-slate-100 rounded-2xl overflow-hidden">
      <div className="p-3 flex items-center gap-2">
        <button onClick={() => onOpen(agent)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <Avatar name={agent.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap"><span className="font-extrabold text-[13.5px] truncate">{agent.name || '(tanpa nama)'}</span><RoleBadge role={agent.role} /><StatusBadge u={agent} /></div>
            <div className="text-[12px] text-slate-500 font-medium truncate">{agent.email}</div>
            <div className="text-[11.5px] text-slate-400 font-semibold truncate">{agent.phone || '-'} • {linkedLabel(agent)}</div>
          </div>
          <Icon name="arrow-right" className="w-4 h-4 text-slate-300 shrink-0" />
        </button>
        {canExpand ? (
          <button onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? 'Tutup sub-akun' : 'Buka sub-akun'} className="shrink-0 bg-sky-50 text-sky-700 rounded-xl px-2.5 py-2 flex items-center gap-1.5">
            <span className="text-[11px] font-extrabold">{children.length}</span>
            <Icon name="chevron-down" className={'w-3.5 h-3.5 transition ' + (expanded ? 'rotate-180' : '')} />
          </button>
        ) : children.length ? <span className="badge bg-slate-100 text-slate-500 shrink-0">{children.length} sub-akun</span> : null}
      </div>
      {expanded ? (
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/60">
          <div className="text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">Akun pengemudi di bawah agen ini</div>
          {children.length ? <div className="space-y-1">{children.map((c) => <AgentChildRow key={c.id} u={c} onOpen={onOpen} />)}</div> : <div className="text-[11.5px] text-slate-400 font-medium py-1">Belum ada sub-akun pengemudi.</div>}
        </div>
      ) : null}
    </div>
  );
}

export default function Accounts() {
  const { user, openModal, tick } = useApp();
  void tick;
  const [q, setQ] = useState('');
  const [roleF, setRoleF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [openAgents, setOpenAgents] = useState(() => new Set());
  if (!user || user.role !== 'superadmin') return null;

  const all = DB.load('users', []).slice().sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || String(a.name || '').localeCompare(String(b.name || '')));
  const stats = {
    total: all.length,
    active: all.filter((u) => accountStatusKind(u) === 'active').length,
    pending: all.filter((u) => accountStatusKind(u) === 'pending').length,
    suspended: all.filter((u) => accountStatusKind(u) === 'suspended').length,
  };
  const key = q.trim().toLowerCase();
  const searchOk = (u) => !key || [u.name, u.email, u.phone, linkedLabel(u)].join(' ').toLowerCase().includes(key);
  const statusOk = (u) => statusF === 'all' || accountStatusKind(u) === statusF;
  const rootEligible = (u) => (roleF === 'all' || roleF === u.role) && statusOk(u) && searchOk(u);
  const childRoleOk = roleF === 'all' || roleF === 'pengemudi';
  const roots = all.filter((u) => u.role !== 'pengemudi');
  const agentAgencies = new Set(all.filter((u) => u.role === 'agen' && u.agencyId).map((u) => u.agencyId));
  const orphanDrivers = all.filter((u) => u.role === 'pengemudi' && !agentAgencies.has(u.agencyId));
  const orphanVisible = childRoleOk ? orphanDrivers.filter((u) => statusOk(u) && (!key || searchOk(u))) : [];

  const groups = roots.filter((u) => u.role === 'agen').map((agent) => {
    const allChildren = childrenOf(agent.agencyId, all).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const agentHit = searchOk(agent);
    const visibleChildren = childRoleOk ? allChildren.filter((c) => statusOk(c) && (!key || searchOk(c) || agentHit)) : [];
    const selfOk = (roleF === 'all' || roleF === 'agen') && statusOk(agent) && searchOk(agent);
    const visible = selfOk || (childRoleOk && visibleChildren.length > 0);
    const canExpand = childRoleOk && visibleChildren.length > 0;
    const expanded = canExpand && (openAgents.has(agent.id) || !!key || roleF === 'pengemudi');
    return { agent, children: visibleChildren, allChildren, expanded, canExpand, visible, selfOk };
  }).filter((g) => g.visible);
  const groupMap = new Map(groups.map((g) => [g.agent.id, g]));
  const items = roots.map((u) => {
    if (u.role === 'agen') return groupMap.get(u.id) || null;
    return rootEligible(u) ? { type: 'account', u } : null;
  }).filter(Boolean);
  const visibleCount = groups.reduce((n, g) => n + 1 + (g.canExpand && g.expanded ? g.children.length : 0), 0)
    + items.filter((x) => x.type === 'account').length + orphanVisible.length;

  const openCreate = () => openModal(<AccountCreateModal />);
  const openManage = (u) => openModal(<AccountManageModal id={u.id} />);
  const toggleAgent = (id) => setOpenAgents((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="bg-white rounded-3xl shadow-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-[18px] flex items-center gap-2"><Icon name="users" className="w-5 h-5 text-sky-600" />Manajemen Akun</h2>
          <p className="text-[12px] text-slate-500 font-medium mt-0.5">Kelola akun pelanggan, agen, pengemudi, dan admin. Pengemudi adalah sub-akun dari agen travel.</p>
        </div>
        <button onClick={openCreate} className="bg-sky-600 text-white text-[12.5px] font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="plus" className="w-4 h-4" />Tambah Akun</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <div className="bg-sky-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-600">Total</div><div className="font-extrabold text-[20px]">{stats.total}</div></div>
        <div className="bg-green-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-green-600">Aktif</div><div className="font-extrabold text-[20px]">{stats.active}</div></div>
        <div className="bg-amber-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Menunggu</div><div className="font-extrabold text-[20px]">{stats.pending}</div></div>
        <div className="bg-red-50 rounded-2xl p-3"><div className="text-[10px] font-extrabold uppercase tracking-wider text-red-500">Nonaktif</div><div className="font-extrabold text-[20px]">{stats.suspended}</div></div>
      </div>

      <div className="grid sm:grid-cols-[1fr_150px_150px] gap-2 mt-4">
        <div className="relative">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, email, HP, atau travel…" className={inC + ' pl-9'} />
        </div>
        <select value={roleF} onChange={(e) => setRoleF(e.target.value)} className={inC}>
          <option value="all">Semua role</option>
          <option value="pelanggan">Pelanggan</option>
          <option value="agen">Agen</option>
          <option value="pengemudi">Pengemudi</option>
          <option value="superadmin">Admin</option>
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inC}>
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="pending">Menunggu</option>
          <option value="suspended">Nonaktif</option>
        </select>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <div className="text-[11px] text-slate-400 font-bold">{visibleCount} akun ditampilkan</div>
        <div className="flex-1"></div>
        {roleF !== 'all' || statusF !== 'all' || q ? <button onClick={() => { setQ(''); setRoleF('all'); setStatusF('all'); setOpenAgents(new Set()); }} className="text-[11px] font-extrabold text-sky-600">Reset filter</button> : null}
      </div>

      <div className="space-y-2 mt-2">
        {items.map((item) => {
          if (item.type === 'account') {
            const u = item.u;
            return (
              <button key={u.id} onClick={() => openManage(u)} className="w-full text-left border-2 border-slate-100 hover:border-sky-200 rounded-2xl p-3 flex items-center gap-3 transition">
                <Avatar name={u.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap"><span className="font-extrabold text-[13.5px] truncate">{u.name || '(tanpa nama)'}</span><RoleBadge role={u.role} /><StatusBadge u={u} /></div>
                  <div className="text-[12px] text-slate-500 font-medium truncate">{u.email}</div>
                  <div className="text-[11.5px] text-slate-400 font-semibold truncate">{u.phone || '-'} • {linkedLabel(u)}</div>
                </div>
                <Icon name="arrow-right" className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            );
          }
          return <AgentGroup key={item.agent.id} group={item} onOpen={openManage} onToggle={() => toggleAgent(item.agent.id)} />;
        })}
        {orphanVisible.length ? (
          <div className="border-2 border-amber-200 bg-amber-50/50 rounded-2xl p-3">
            <div className="flex items-center gap-2"><Icon name="triangle-alert" className="w-4 h-4 text-amber-600" /><span className="font-extrabold text-[12.5px] text-amber-900">Tanpa agen</span><span className="badge bg-amber-100 text-amber-700">{orphanVisible.length}</span></div>
            <p className="text-[10.5px] font-medium text-amber-800 mt-0.5">Akun pengemudi ini tidak memiliki akun agen induk dan tidak bisa login.</p>
            <div className="space-y-1 mt-2">{orphanVisible.map((c) => <AgentChildRow key={c.id} u={c} onOpen={openManage} />)}</div>
          </div>
        ) : null}
        {!items.length && !orphanVisible.length ? <Empty icon="users" msg="Tidak ada akun pada filter ini." /> : null}
      </div>
    </div>
  );
}
