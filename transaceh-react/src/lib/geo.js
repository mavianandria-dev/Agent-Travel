/* Estimasi jarak & durasi rute dari koordinat kota (perkiraan "±", bukan presisi).
   Jarak = garis lurus (haversine) × faktor jalan; durasi = jarak ÷ kecepatan efektif.
   Tambah koordinat kota baru di CITY_COORDS sesuai kebutuhan rute. */
export const CITY_COORDS = {
  'Banda Aceh': [5.5483, 95.3238],
  'Sabang': [5.8894, 95.3222],
  'Aceh Besar': [5.3858, 95.6142],
  'Aceh Jaya': [4.6333, 95.5667],
  'Aceh Barat': [4.1363, 96.1285],
  'Nagan Raya': [4.055, 96.41],
  'Aceh Barat Daya': [3.739, 96.835],
  'Aceh Selatan': [3.256, 97.179],
  'Simeulue': [2.48, 96.38],
  'Aceh Singkil': [2.285, 97.79],
  'Subulussalam': [2.646, 98.002],
  'Aceh Tengah': [4.626, 96.846],
  'Bener Meriah': [4.725, 96.86],
  'Gayo Lues': [3.997, 97.34],
  'Aceh Timur': [4.95, 97.758],
  'Aceh Tamiang': [4.31, 98.0],
  'Aceh Utara': [5.05, 97.32],
  'Lhokseumawe': [5.1801, 97.1507],
  'Bireuen': [5.205, 96.701],
  'Pidie': [5.384, 95.96],
  'Pidie Jaya': [5.245, 96.24],
  'Langsa': [4.4683, 97.9683],
  'Medan': [3.5952, 98.6722],
  'Binjai': [3.6001, 98.485],
  'Tebing Tinggi': [3.3285, 99.1625],
  'Pematangsiantar': [2.9595, 99.0687],
  'Tanjungbalai': [2.9667, 99.8],
  'Sibolga': [1.742, 98.779],
};

const EARTH_R = 6371;
const rad = (d) => (d * Math.PI) / 180;

/* Jarak & durasi NYATA koridor terverifikasi (UN Logcluster / DashDistance).
   Berlaku dua arah; menimpa hitungan estimasi. Tambah entri bila ada data baru. */
export const ROUTE_OVERRIDES = {
  'Banda Aceh|Aceh Jaya': { distance: '±149 km', duration: '±3 jam' },
  'Aceh Jaya|Aceh Barat': { distance: '±89 km', duration: '±2 jam' },
  'Banda Aceh|Aceh Barat': { distance: '±238 km', duration: '±5 jam' },
  'Banda Aceh|Medan': { distance: '±577 km', duration: '±10 jam' },
};

/* Jalur pantai barat/selatan: jalan berkelok → kecepatan efektif lebih rendah */
const SLOW_ROADS = ['Aceh Jaya', 'Aceh Barat', 'Nagan Raya', 'Aceh Barat Daya', 'Aceh Selatan', 'Simeulue', 'Aceh Singkil'];

export function haversineKm(a, b) {
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/* {distance:'±145 km', duration:'±3 jam'} — null bila salah satu kota belum ada koordinatnya */
export function estimateRoute(from, to) {
  const ov = ROUTE_OVERRIDES[from + '|' + to] || ROUTE_OVERRIDES[to + '|' + from];
  if (ov) return { ...ov };
  const A = CITY_COORDS[from], B = CITY_COORDS[to];
  if (!A || !B) return null;
  const km = Math.max(5, Math.round((haversineKm(A, B) * 1.4) / 5) * 5);
  const slow = SLOW_ROADS.includes(from) || SLOW_ROADS.includes(to);
  const speed = slow ? 40 : km > 250 ? 55 : 45;
  const hours = Math.max(0.5, Math.round((km / speed) * 2) / 2);
  return { distance: '±' + km + ' km', duration: '±' + String(hours).replace('.', ',') + ' jam' };
}

/* Teks meta rute untuk card: nilai tersimpan → fallback estimasi → teks netral */
export function routeMeta(r, durFirst) {
  if (!r) return '';
  const est = estimateRoute(r.from, r.to) || {};
  const d = r.distance && r.distance !== '-' ? r.distance : est.distance;
  const t = r.duration && r.duration !== '-' ? r.duration : est.duration;
  if (!d && !t) return 'Jarak & durasi belum diisi';
  return (durFirst ? [t, d] : [d, t]).filter(Boolean).join(' • ');
}
