/* Titik jemput per KOTA ASAL (aturan wilayah: saran & pilihan hanya fasilitas
   wilayah berangkat + jemput rumah). Bukan per koridor — titik transit wilayah
   lain tidak disarankan agar tak konflik dengan agen/pengemudi setempat.
   Sumber terminal resmi tipe A (Wikipedia/Dishub): Batoh, Langsa, Lhokseumawe,
   Meulaboh, Amplas. Bandara SIM/BTJ (Dishub Aceh), Ulee Lheue (Wikipedia),
   Kualanamu/Belawan (BPS/Kemenhub), Pelabuhan Calang Lhok Kubu (Wikipedia). */
export const PICKUP_ORIGIN = {
  'Aceh Jaya': ['Terminal Aceh Jaya', 'Pelabuhan Calang'],
  'Banda Aceh': ['Terminal Batoh', 'Bandara Sultan Iskandar Muda', 'Pelabuhan Ulee Lheue'],
  'Medan': ['Terminal Amplas Medan', 'Bandara Kualanamu', 'Pelabuhan Belawan'],
  'Aceh Barat': ['Terminal Aceh Barat'],
  'Langsa': ['Terminal Langsa'],
  'Lhokseumawe': ['Terminal Lhokseumawe'],
};
export const HOME_PICKUP = '__home__';
