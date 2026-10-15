/* Util + konstanta — diport dari index.html */

export const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export const todayStr = (off = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
};

export const uid = (p) => (p || 'ID') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();

export const SEAT_LABELS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

/* Daftar kabupaten/kota Aceh (23) & Sumatera Utara (33) */
export const REGIONS = [
  { p: 'Aceh', c: ['Banda Aceh', 'Sabang', 'Langsa', 'Lhokseumawe', 'Subulussalam', 'Aceh Besar', 'Aceh Barat', 'Aceh Barat Daya', 'Aceh Jaya', 'Aceh Selatan', 'Aceh Singkil', 'Aceh Tamiang', 'Aceh Tengah', 'Aceh Tenggara', 'Aceh Timur', 'Aceh Utara', 'Bener Meriah', 'Bireuen', 'Gayo Lues', 'Nagan Raya', 'Pidie', 'Pidie Jaya', 'Simeulue'] },
  { p: 'Sumatera Utara', c: ['Medan', 'Binjai', 'Tebing Tinggi', 'Pematangsiantar', 'Tanjungbalai', 'Sibolga', 'Padangsidimpuan', 'Gunungsitoli', 'Asahan', 'Batubara', 'Dairi', 'Deli Serdang', 'Humbang Hasundutan', 'Karo', 'Labuhanbatu', 'Labuhanbatu Selatan', 'Labuhanbatu Utara', 'Langkat', 'Mandailing Natal', 'Nias', 'Nias Barat', 'Nias Selatan', 'Nias Utara', 'Padang Lawas', 'Padang Lawas Utara', 'Pakpak Bharat', 'Samosir', 'Serdang Bedagai', 'Simalungun', 'Tapanuli Selatan', 'Tapanuli Tengah', 'Tapanuli Utara', 'Toba'] },
];

/* SIM terstruktur */
export const SIM_TYPES = ['A', 'B1', 'B2'];
export const GENDERS = ['Laki-laki', 'Perempuan'];
export const MARITALS = ['Belum menikah', 'Menikah', 'Lainnya'];
export const EDUCATIONS = ['SD', 'SMP', 'SMA', 'SMK', 'Diploma', 'Sarjana', 'Pascasarjana'];

export const V_OWN = ['Milik pribadi', 'Milik perusahaan', 'Sewa / leasing', 'Milik Pengemudi'];
export const V_TYPES = ['MPV', 'Minibus', 'Van', 'SUV', 'Microbus', 'Lainnya'];
export const V_BAG = ['Kecil', 'Sedang', 'Besar'];
export const V_TAX = ['Aktif', 'Belum aktif'];
export const V_COND = ['Sangat baik', 'Baik', 'Perlu perbaikan'];
export const V_FREQ = ['Setiap hari', 'Beberapa kali seminggu', 'Sesuai permintaan', 'Lainnya'];
export const V_SERVICES = ['Antar jemput alamat', 'Antar jemput terminal', 'Carter / sewa', 'Paket barang'];
export const V_COOP = ['Bagi hasil', 'Tarif tetap', 'Sewa armada', 'Lainnya'];
export const V_FAC = ['AC', 'USB Charger', 'Air Mineral', 'Bantal', 'Musik', 'Reclining Seat', 'Snack', 'WiFi'];
export const V_DOCS = ['STNK', 'KTP pemilik'];
export const V_YESNO = ['Ya', 'Tidak'];

export const VTOOLS = [['seat', 'armchair', 'Kursi'], ['driver', 'circle-gauge', 'Pengemudi'], ['luggage', 'luggage', 'Bagasi'], ['off', 'ban', 'Nonaktif'], ['empty', 'eraser', 'Hapus']];
export const VCELLCLS = { seat: 'border-green-500 bg-green-50 text-green-800', off: 'border-slate-300 bg-slate-200 text-slate-400', driver: 'border-[#0b2447] bg-[#0b2447] text-white', door: 'border-amber-400 bg-amber-50 text-amber-700', aisle: 'border-dashed border-slate-200 bg-transparent text-slate-200', luggage: 'border-slate-300 bg-slate-100 text-slate-500', empty: 'border-dashed border-slate-200 bg-white text-slate-200' };
export const VCELLICON = { seat: 'armchair', off: 'ban', driver: 'circle-gauge', door: 'door-open', aisle: 'move-vertical', luggage: 'luggage', empty: 'plus' };

export const HEADERLESS = ['agen', 'pengemudi', 'superadmin'];

export const inC = 'w-full text-[13px] font-semibold border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-ring';
