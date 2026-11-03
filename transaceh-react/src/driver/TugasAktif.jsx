import Tasks from './Tasks.jsx';

/* Halaman "Tugas Saat Ini" — pengemudi. Sengaja MINIMAL: hanya SATU card,
   yaitu tugas yang paling mendekati jadwal (perjalanan berjalan, atau
   jadwal berikutnya). Card-nya dipinjam UTUH dari papan Tugas Saya
   (Tasks focusOnly) — satu sumber kebenaran, tidak ada duplikasi komponen,
   dan card yang sama ikut diberi highlight di papan Tugas Saya. */
export default function TugasAktif() {
  return <Tasks focusOnly />;
}
