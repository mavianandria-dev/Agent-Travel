/* Titik jemput per KOTA ASAL (aturan wilayah: saran & pilihan hanya fasilitas
   wilayah berangkat + jemput rumah). Bukan per koridor — titik transit wilayah
   lain tidak disarankan agar tak konflik dengan agen/pengemudi setempat.
   Sumber terminal resmi tipe A (Wikipedia/Dishub): Batoh, Langsa, Lhokseumawe,
   Meulaboh, Amplas. Bandara SIM/BTJ (Dishub Aceh), Ulee Lheue (Wikipedia),
   Kualanamu/Belawan (BPS/Kemenhub), Pelabuhan Calang Lhok Kubu (Wikipedia). */
import { REGIONS } from './utils.js';

export const PICKUP_ORIGIN = {
  'Aceh Jaya': ['Terminal Aceh Jaya', 'Pelabuhan Calang'],
  'Banda Aceh': ['Terminal Batoh', 'Bandara Sultan Iskandar Muda', 'Pelabuhan Ulee Lheue'],
  'Medan': ['Terminal Amplas Medan', 'Bandara Kualanamu', 'Pelabuhan Belawan'],
  'Aceh Barat': ['Terminal Aceh Barat'],
  'Langsa': ['Terminal Langsa'],
  'Lhokseumawe': ['Terminal Lhokseumawe'],
};
export const HOME_PICKUP = '__home__';

/* Nama kabupaten/kota yang dipakai di aplikasi (asal & tujuan rute). */
const REGION_NAMES = REGIONS.flatMap((r) => r.c.map((c) => c.toLowerCase()));

/* Rute lama masih memakai nama kecamatan sebagai kota asal. */
const AREA_PARENT = { calang: 'Aceh Jaya', meulaboh: 'Aceh Barat' };

/** Pilihan titik jemput untuk sebuah rute: fasilitas bawaan wilayah +
 *  titik yang ditetapkan agen (rute.pickups). */
export function pickupOptions(route) {
  const out = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  (PICKUP_ORIGIN[route && route.from] || []).forEach(push);
  ((route && route.pickups) || []).forEach(push);
  return out;
}

/** Kabupaten/kota dari asal rute (rute lama yang memakai kecamatan dipetakan). */
function regencyOf(origin) {
  const org = String(origin || '').trim();
  if (!org) return '';
  if (REGION_NAMES.includes(org.toLowerCase())) return org;
  return AREA_PARENT[org.toLowerCase()] || org;
}

function areaLabel(point, kab) {
  if (!point) return kab;
  if (!kab) return point;
  /* Jangan ulangi kabupaten yang sudah disebut di nama titik. */
  if (point.toLowerCase().includes(kab.toLowerCase())) return point;
  return point + ', ' + kab;
}

/** Titik jemput dari data manifest apa adanya + kabupaten/kota.
 *  "Pelabuhan Calang"  + asal "Aceh Jaya" → label 'Pelabuhan Calang, Aceh Jaya'
 *  "Krueng Sabee"      + asal "Aceh Jaya" → label 'Krueng Sabee, Aceh Jaya'
 *  "Terminal Aceh Jaya"                   → label 'Terminal Aceh Jaya'
 *  "Rumah: Jl. ..."                       → label 'Jemput rumah, Aceh Jaya' */
export function pickupArea(pickup, origin = '') {
  const raw = String(pickup || '').trim();
  const kab = regencyOf(origin);
  if (!raw) return { point: '', kab, label: '' };
  if (/^rumah\b/i.test(raw)) return { point: 'Jemput rumah', kab, label: areaLabel('Jemput rumah', kab) };
  return { point: raw, kab, label: areaLabel(raw, kab) };
}
