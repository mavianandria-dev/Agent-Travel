/* Konten Pusat Bantuan TransAceh.
   Nomor/email CS contoh — ubah di sini jika sudah ada kontak resmi. */
export const SUPPORT_CONTACT = {
  waDisplay: '0812-6000-1234',
  waNumber: '6281260001234',
  phone: '0812-6000-1234',
  email: 'bantuan@transaceh.id',
  hours: 'Senin–Minggu, 08.00–21.00 WIB',
  response: 'Balasan maksimal 1×24 jam',
};

export const REPORT_CATEGORIES = ['Pembayaran', 'Tiket & Booking', 'Pembatalan & Refund', 'Akun & Profil', 'Perjalanan', 'Lainnya'];

export const FAQ_CATEGORIES = [
  {
    id: 'pesanan', label: 'Pemesanan & Kursi', icon: 'ticket',
    faqs: [
      {
        id: 'cara-pesan-tiket',
        q: 'Bagaimana cara memesan tiket?',
        a: '1. Buka menu Cari Travel, lalu pilih rute dan tanggal keberangkatan.\n2. Pilih jadwal yang tersedia dan tentukan kursi.\n3. Isi data penumpang serta titik jemput.\n4. Lanjutkan ke pembayaran. Kursi ditahan 5 menit sampai pembayaran selesai.\n5. E-tiket otomatis muncul di menu Tiket Saya setelah pembayaran berhasil.',
      },
      {
        id: 'pilih-kursi',
        q: 'Apakah saya bisa memilih kursi sendiri?',
        a: 'Bisa. Kursi dipilih langsung dari denah kendaraan saat memesan. Kursi hijau masih tersedia, abu-abu sudah terisi, dan kuning sedang ditahan penumpang lain. Kursi yang kamu pilih akan ditahan selama 5 menit untuk diselesaikan pembayarannya.',
      },
      {
        id: 'pesan-orang-lain',
        q: 'Bisakah memesan tiket untuk orang lain?',
        a: 'Bisa. Saat mengisi data penumpang, gunakan nama dan nomor HP penumpang yang akan berangkat. Kamu juga bisa menyimpan data penumpang favorit di halaman Profil agar tidak perlu mengetik ulang saat memesan berikutnya.',
      },
      {
        id: 'titik-jemput',
        q: 'Bagaimana cara menentukan titik jemput?',
        a: 'Titik jemput diisi saat proses pemesanan. Kamu dapat menuliskan alamat lengkap atau menandai lokasi pada peta. Pastikan nomor HP penumpang aktif karena agen atau pengemudi akan menghubungi untuk konfirmasi. Harap standby 15 menit sebelum jadwal keberangkatan.',
      },
      {
        id: 'ubah-jadwal',
        q: 'Apakah jadwal keberangkatan bisa diubah?',
        a: 'Perubahan jadwal belum bisa dilakukan otomatis dari aplikasi. Silakan hubungi agen travel yang tertera di e-tiket. Jika jadwal baru tidak tersedia, kamu dapat membatalkan booking lalu memesan ulang dengan mengikuti kebijakan refund agen.',
      },
    ],
  },
  {
    id: 'pembayaran', label: 'Pembayaran', icon: 'wallet',
    faqs: [
      {
        id: 'metode-bayar',
        q: 'Metode pembayaran apa saja yang tersedia?',
        a: 'TransAceh mendukung pembayaran QRIS, Virtual Account BCA, dan e-wallet (DANA, OVO, GoPay, ShopeePay). Pilih metode yang paling nyaman saat menyelesaikan pesanan. Status pembayaran akan diperbarui otomatis setelah transaksi berhasil.',
      },
      {
        id: 'batas-bayar',
        q: 'Berapa lama batas waktu pembayaran?',
        a: 'Kursi ditahan selama 5 menit sejak pesanan dibuat. Jika pembayaran belum selesai sampai batas waktu habis, kursi akan dilepas kembali dan booking berstatus dibatalkan otomatis. Kamu bisa memesan ulang selama kursi masih tersedia.',
      },
      {
        id: 'bayar-gagal',
        q: 'Bagaimana jika pembayaran gagal atau terputus?',
        a: 'Buka menu Tiket Saya, pilih pesanan yang masih berstatus Menunggu Bayar, lalu tekan Bayar untuk mencoba kembali. Sistem akan memberi waktu tambahan 5 menit. Jika saldo sudah terpotong tetapi status belum berubah, hubungi CS dengan menyertakan kode booking dan bukti pembayaran.',
      },
      {
        id: 'kode-promo',
        q: 'Di mana saya memasukkan kode promo?',
        a: 'Kode promo dimasukkan pada langkah pemesanan sebelum pembayaran. Contoh kode yang tersedia adalah HEMAT20 (diskon 20%) dan CALANG50 (potongan Rp15.000). Satu pesanan hanya dapat menggunakan satu kode promo yang masih aktif.',
      },
    ],
  },
  {
    id: 'etiket', label: 'E-Tiket & Perjalanan', icon: 'qr-code',
    faqs: [
      {
        id: 'dapat-etiket',
        q: 'Kapan e-tiket saya tersedia?',
        a: 'E-tiket tersedia setelah pembayaran berhasil. Buka menu Tiket Saya, lalu pilih Detail / E-Tiket untuk melihat kode booking, QR, jadwal, armada, pengemudi, dan titik jemput. Simpan e-tiket sebelum berangkat.',
      },
      {
        id: 'kirim-etiket',
        q: 'Bagaimana cara mengirim atau mencetak e-tiket?',
        a: 'Di halaman detail tiket, gunakan tombol Kirim WA untuk mengirim e-tiket ke nomor WhatsApp penumpang atau Cetak / PDF untuk menyimpan salinan. Pastikan nomor HP penumpang sudah benar saat pemesanan.',
      },
      {
        id: 'sebelum-berangkat',
        q: 'Apa yang harus dilakukan sebelum berangkat?',
        a: 'Datang atau standby di titik jemput paling lambat 15 menit sebelum jadwal. Tunjukkan e-tiket kepada pengemudi, aktifkan nomor HP, dan konfirmasi titik jemput kepada agen jika lokasimu sulit ditemukan.',
      },
      {
        id: 'bagasi',
        q: 'Bagaimana aturan bagasi dan barang bawaan?',
        a: 'Kapasitas bagasi bergantung pada jenis armada dan kebijakan agen. Informasi fasilitas kendaraan tampil saat memilih jadwal. Untuk barang berukuran besar, barang bernilai tinggi, atau barang khusus, konfirmasi terlebih dahulu kepada agen yang tertera di e-tiket.',
      },
      {
        id: 'tertinggal',
        q: 'Apa yang harus dilakukan jika tertinggal?',
        a: 'Segera hubungi agen atau pengemudi yang tertera di e-tiket. Penumpang yang tidak hadir sampai waktu keberangkatan dapat dianggap no-show. Kebijakan penggantian jadwal atau refund untuk kondisi ini mengikuti aturan agen travel.',
      },
    ],
  },
  {
    id: 'refund', label: 'Pembatalan & Refund', icon: 'calendar-x',
    faqs: [
      {
        id: 'cara-batal',
        q: 'Bagaimana cara membatalkan booking?',
        a: 'Buka Tiket Saya, pilih Detail / E-Tiket, lalu tekan Batalkan Booking. Aplikasi akan menampilkan estimasi refund sesuai kebijakan agen dan sisa waktu menuju keberangkatan sebelum kamu mengonfirmasi pembatalan.',
      },
      {
        id: 'persen-refund',
        q: 'Berapa persentase refund yang saya terima?',
        a: 'Refund mengikuti kebijakan masing-masing agen. Kebijakan umum di aplikasi: pembatalan H-3 atau lebih = 100%, H-1 = 50%, dan hari keberangkatan = 0%. Persentase pastinya selalu ditampilkan pada dialog pembatalan sebelum kamu menyetujui.',
      },
      {
        id: 'komponen-refund',
        q: 'Apa saja yang dikembalikan saat refund?',
        a: 'Hanya komponen harga tiket yang dikembalikan. Jasa agen dan fee platform tidak dikembalikan karena sudah menjadi bagian dari layanan yang dipesan. Nominal refund dihitung dari harga tiket, bukan dari total pembayaran.',
      },
      {
        id: 'lama-refund',
        q: 'Berapa lama dana refund masuk?',
        a: 'Refund diproses ke metode pembayaran awal dalam 1–3 hari kerja setelah pembatalan dikonfirmasi. Notifikasi akan dikirim setelah proses refund selesai. Jika lebih dari 3 hari kerja, hubungi CS dengan kode booking dan bukti pembatalan.',
      },
    ],
  },
  {
    id: 'akun', label: 'Akun & Profil', icon: 'user-round',
    faqs: [
      {
        id: 'daftar-masuk',
        q: 'Bagaimana cara mendaftar dan masuk?',
        a: 'Gunakan tombol Daftar di kanan atas untuk membuat akun pelanggan, lalu masuk dengan email dan kata sandi. Akun demo juga tersedia di halaman Beranda untuk mencoba fitur pelanggan tanpa mendaftar.',
      },
      {
        id: 'ubah-profil',
        q: 'Bagaimana cara mengubah nama atau nomor HP?',
        a: 'Buka halaman Profil melalui avatar di kanan atas. Ubah nama atau nomor HP, lalu tekan Simpan Profil. Email yang dipakai untuk masuk belum dapat diubah sendiri dari aplikasi; hubungi CS jika perlu mengganti email.',
      },
      {
        id: 'penumpang-favorit',
        q: 'Apa itu Penumpang Favorit?',
        a: 'Penumpang Favorit menyimpan nama dan nomor HP orang yang sering kamu pesankan tiket. Data ini bisa dipakai ulang saat mengisi data penumpang sehingga pemesanan berikutnya lebih cepat.',
      },
      {
        id: 'lupa-password',
        q: 'Saya lupa kata sandi. Bagaimana caranya?',
        a: 'Pemulihan kata sandi mandiri belum tersedia. Hubungi CS melalui WhatsApp atau email dengan menyertakan email akun dan data verifikasi yang diminta. Jangan pernah membagikan kata sandi atau kode OTP kepada siapa pun.',
      },
    ],
  },
  {
    id: 'bantuan', label: 'Laporan & Bantuan', icon: 'circle-help',
    faqs: [
      {
        id: 'cara-lapor',
        q: 'Bagaimana cara membuat laporan masalah?',
        a: 'Buka Pusat Bantuan, pilih Laporkan Masalah, lalu isi kategori, subjek, kronologi, dan kode booking jika ada. Setelah dikirim, kamu akan menerima kode laporan (ADU-...) yang bisa dipakai untuk memantau status.',
      },
      {
        id: 'lacak-laporan',
        q: 'Bagaimana cara memantau status laporan?',
        a: 'Pelanggan yang sudah masuk dapat membuka tab Status Laporan dan melihat semua laporan serta balasan CS. Pengunjung dapat melacak laporan dengan memasukkan kode laporan bersama email atau nomor HP yang dipakai saat membuat laporan.',
      },
      {
        id: 'live-chat',
        q: 'Kapan layanan live chat tersedia?',
        a: 'Chatbot tersedia 24 jam untuk pertanyaan umum. Live chat dengan CS tersedia setiap hari pukul 08.00–21.00 WIB. Di luar jam tersebut, pesan tetap bisa dikirim dan akan dibalas saat CS kembali bertugas.',
      },
      {
        id: 'kontak-cs',
        q: 'Bagaimana cara menghubungi layanan pelanggan?',
        a: 'Kamu bisa menghubungi CS melalui WhatsApp 0812-6000-1234, telepon di nomor yang sama, atau email bantuan@transaceh.id. Sertakan kode booking atau kode laporan agar penanganan lebih cepat.',
      },
    ],
  },
];

export const GUIDES = [
  {
    id: 'guide-pesan', title: 'Cara Pesan Tiket', icon: 'ticket', desc: 'Dari pilih rute sampai kursi terkunci untukmu.',
    steps: [
      'Buka menu Cari Travel dan pilih rute keberangkatan serta tanggal.',
      'Pilih jadwal yang sesuai, lalu tentukan kursi pada denah kendaraan.',
      'Isi data penumpang dan titik jemput. Kamu bisa memilih penumpang favorit.',
      'Periksa ringkasan harga, gunakan kode promo bila ada, lalu lanjut ke pembayaran.',
      'Selesaikan pembayaran dalam 5 menit dan temukan e-tiket di menu Tiket Saya.',
    ],
  },
  {
    id: 'guide-bayar', title: 'Bayar & Simpan E-Tiket', icon: 'qr-code', desc: 'QRIS, VA BCA, atau e-wallet — semuanya dalam satu layar.',
    steps: [
      'Pilih metode pembayaran: QRIS, Virtual Account BCA, atau e-wallet.',
      'Scan QR atau salin nomor VA, lalu selesaikan pembayaran sebelum waktu habis.',
      'Setelah berhasil, status booking berubah menjadi Lunas dan e-tiket otomatis aktif.',
      'Buka Tiket Saya → Detail / E-Tiket untuk mengirim WhatsApp atau mencetak PDF.',
    ],
  },
  {
    id: 'guide-refund', title: 'Batalkan & Ajukan Refund', icon: 'calendar-x', desc: 'Lihat estimasi refund sebelum memutuskan.',
    steps: [
      'Buka Tiket Saya dan pilih tiket yang ingin dibatalkan.',
      'Tekan Batalkan Booking untuk melihat estimasi refund sesuai kebijakan agen.',
      'Konfirmasi pembatalan. Kursi akan dilepas dan refund diproses ke metode pembayaran awal.',
      'Pantau status refund melalui notifikasi atau hubungi CS setelah 3 hari kerja.',
    ],
  },
  {
    id: 'guide-bantuan', title: 'Lapor & Lacak Masalah', icon: 'circle-help', desc: 'Buat laporan, chat CS, dan pantau penyelesaiannya.',
    steps: [
      'Pilih tab Laporkan Masalah dan isi kronologi kejadian selengkap mungkin.',
      'Sertakan kode booking jika masalah berkaitan dengan perjalanan tertentu.',
      'Simpan kode laporan ADU-... yang muncul setelah laporan terkirim.',
      'Pantau balasan CS di tab Status Laporan, atau gunakan live chat untuk respons cepat.',
    ],
  },
];

export const BOT_PROMPTS = ['Cara pesan tiket', 'Metode pembayaran', 'Cara refund', 'E-tiket saya', 'Ubah jadwal', 'Hubungi CS'];
export const BOT_FALLBACK_SUGGESTIONS = ['Cara pesan tiket', 'Pembayaran', 'Pembatalan & refund', 'Live chat CS'];

export function allFaqs() {
  return FAQ_CATEGORIES.flatMap((c) => c.faqs.map((f) => ({ ...f, categoryId: c.id, categoryLabel: c.label, icon: c.icon })));
}

export function faqById(id) {
  return allFaqs().find((f) => f.id === id) || null;
}

export function searchFaq(query, categoryId = 'all') {
  const q = String(query || '').toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((x) => x.length > 2);
  return allFaqs()
    .filter((f) => categoryId === 'all' || f.categoryId === categoryId)
    .filter((f) => {
      if (!q) return true;
      const hay = (f.q + ' ' + f.a + ' ' + f.categoryLabel).toLowerCase();
      return hay.includes(q) || (tokens.length > 0 && tokens.every((t) => hay.includes(t)));
    });
}
