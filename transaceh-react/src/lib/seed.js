import { DB } from './db.js';
import { uid, todayStr } from './utils.js';
import { simParse, vehLayout, bookingsOf, normalizePoints, agencyProfileFromKyc } from './domain.js';
import { estimateRoute } from './geo.js';

/* Diekstrak dari index.html (seed v11 + migrasi). Dijalankan sekali via initDB(). */
export function initDB(){
  const seedDoc=(label, note='Dokumen contoh seed')=>({
    name:label.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.svg',
    type:'image/svg+xml',
    size:1800,
    dataUrl:'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='640' height='400' rx='20' fill='#0b2447'/><rect x='24' y='24' width='592' height='352' rx='14' fill='none' stroke='#38bdf8' stroke-width='3'/><text x='44' y='88' font-family='Arial,sans-serif' font-size='24' font-weight='bold' fill='#7dd3fc'>DOKUMEN DEMO</text><text x='44' y='146' font-family='Arial,sans-serif' font-size='24' font-weight='bold' fill='#fff'>${label}</text><text x='44' y='182' font-family='Arial,sans-serif' font-size='16' fill='#cbd5e1'>${note}</text><text x='44' y='348' font-family='Arial,sans-serif' font-size='13' fill='#64748b'>Data contoh seed TransAceh</text></svg>`),
    at:'2026-01-01T00:00:00.000Z',
  });
  const seedKyc={
    AG1:{
      jenis:'Perorangan / Freelance', nama:'Cut Meutia',
      nik:'1173010101850001', tmpLahir:'Calang', tglLahir:'1985-03-12',
      gender:'Perempuan', agama:'Islam',
      alamat:{ jalan:'Jl. Merdeka No.12', rtRw:'01/02', kelurahan:'Calang Pasar Baru', kecamatan:'Calang', kota:'Aceh Jaya', provinsi:'Aceh', kodePos:'23681' },
      hp:'0812000001', email:'agen@barakah.com',
      darurat:{ nama:'Muhammad Nur', hubungan:'Istri / Suami', hp:'0813000011' },
      bank:'BCA', rekeningNo:'8210099211', rekeningNama:'Cut Meutia',
      npwpSamaKtp:true, npwp:'',
      docs:{
        ktp:seedDoc('KTP Cut Meutia'), pasfoto:seedDoc('Pasfoto Cut Meutia'),
        bukuTabungan:seedDoc('Buku Tabungan Cut Meutia'), npwpPribadi:seedDoc('NPWP Cut Meutia'),
      },
      status:'lengkap', step:3, terms:true,
      submittedAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z',
    },
    AG2:{
      jenis:'Perorangan / Freelance', nama:'Faisal',
      nik:'1171010101880002', tmpLahir:'Banda Aceh', tglLahir:'1988-04-22',
      gender:'Laki-laki', agama:'Islam',
      alamat:{ jalan:'Jl. T. Umar No.88', rtRw:'02/03', kelurahan:'Peuniti', kecamatan:'Baiturrahman', kota:'Banda Aceh', provinsi:'Aceh', kodePos:'23242' },
      hp:'0812000010', email:'agen@putrajaya.com',
      darurat:{ nama:'Nur Aini', hubungan:'Istri / Suami', hp:'0813000012' },
      bank:'Mandiri', rekeningNo:'8900112233', rekeningNama:'Faisal',
      npwpSamaKtp:true, npwp:'',
      docs:{
        ktp:seedDoc('KTP Faisal'), pasfoto:seedDoc('Pasfoto Faisal'),
        bukuTabungan:seedDoc('Buku Tabungan Faisal'), npwpPribadi:seedDoc('NPWP Faisal'),
      },
      status:'lengkap', step:3, terms:true,
      submittedAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z',
    },
    AG3:{
      jenis:'Badan Usaha (PT/CV)', nama:'Rizky',
      nik:'1271010101900003', tmpLahir:'Medan', tglLahir:'1990-01-01',
      gender:'Laki-laki', agama:'Islam',
      alamat:{ jalan:'Jl. Gatot Subroto No.45', rtRw:'05/06', kelurahan:'Suka Maju', kecamatan:'Medan Baru', kota:'Medan', provinsi:'Sumatera Utara', kodePos:'20153' },
      hp:'0812000020', email:'agen@lintasutara.com',
      darurat:{ nama:'Siti Aminah', hubungan:'Orang Tua', hp:'0813000022' },
      badanNama:'Lintas Utara', badanBentuk:'PT', aktaNo:'01/2020',
      npwpUsaha:'1271010101900003', nib:'1271010101900', direktur:'Rizky',
      alamatUsaha:{ jalan:'Jl. Gatot Subroto No.45', rtRw:'05/06', kelurahan:'Suka Maju', kecamatan:'Medan Baru', kota:'Medan', provinsi:'Sumatera Utara', kodePos:'20153' },
      bank:'BRI', rekeningNo:'0022334455', rekeningNama:'Lintas Utara',
      npwpSamaKtp:false, npwp:'',
      docs:{
        ktp:seedDoc('KTP Rizky'), npwpUsaha:seedDoc('NPWP Lintas Utara'),
        nib:seedDoc('NIB Lintas Utara'), akta:seedDoc('Akta Pendirian Lintas Utara'),
        bukuTabungan:seedDoc('Buku Tabungan Lintas Utara'),
        kantorDepan:seedDoc('Kantor Depan Lintas Utara'), kantorDalam:seedDoc('Kantor Dalam Lintas Utara'),
      },
      status:'lengkap', step:3, terms:true,
      submittedAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z',
    },
  };
  if(!localStorage.getItem('at_seeded_v16')){
  const svgURI=s=>'data:image/svg+xml;utf8,'+encodeURIComponent(s);
  const seedAvatar=(ini,c1,c2)=>svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='160' height='160' fill='url(#g)'/><text x='80' y='94' font-family='Arial,sans-serif' font-size='58' font-weight='bold' fill='#fff' text-anchor='middle'>${ini}</text></svg>`);
  const seedSim=(t,nm,num,exp)=>svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' rx='16' fill='#0b2447'/><rect x='16' y='16' width='288' height='168' rx='12' fill='none' stroke='#38bdf8' stroke-width='2'/><text x='28' y='52' font-family='Arial,sans-serif' font-size='22' font-weight='bold' fill='#7dd3fc'>SIM ${t} • DEMO</text><text x='28' y='92' font-family='Arial,sans-serif' font-size='17' font-weight='bold' fill='#fff'>${nm}</text><text x='28' y='118' font-family='Arial,sans-serif' font-size='14' fill='#cbd5e1'>${num}</text><text x='28' y='144' font-family='Arial,sans-serif' font-size='14' fill='#cbd5e1'>Berlaku s.d. ${exp}</text><text x='28' y='168' font-family='Arial,sans-serif' font-size='11' fill='#64748b'>Contoh seed — ganti dengan foto asli</text></svg>`);
  const users=[
    {id:'U-SA',name:'Super Admin',email:'admin@transaceh.id',phone:'0811000001',pass:'admin123',role:'superadmin',agencyId:null,status:'active',photo:''},
    {id:'U-AG1',name:'Cut Meutia (Barakah)',email:'agen@barakah.com',phone:'0812000001',pass:'agen123',role:'agen',agencyId:'AG1',status:'active',photo:''},
    {id:'U-DR1',name:'Bang Jamil',email:'pengemudi@barakah.com',phone:'0812000002',pass:'pengemudi123',role:'pengemudi',agencyId:'AG1',status:'active',profileStep:'done',photo:''},
    {id:'U-AG2',name:'Faisal (Putra Jaya)',email:'agen@putrajaya.com',phone:'0812000010',pass:'agen123',role:'agen',agencyId:'AG2',status:'active',photo:''},
    {id:'U-AG3',name:'Rizky (Lintas Utara)',email:'agen@lintasutara.com',phone:'0812000020',pass:'agen123',role:'agen',agencyId:'AG3',status:'active',photo:''},
    {id:'U-DR4',name:'Bang Hendra',email:'pengemudi@putrajaya.com',phone:'0812000011',pass:'pengemudi123',role:'pengemudi',agencyId:'AG2',status:'active',profileStep:'done',photo:''},
    {id:'U-DR7',name:'Ilham Saputra',email:'pengemudibaru@mail.com',phone:'0812000099',pass:'pengemudi123',role:'pengemudi',agencyId:'AG1',status:'active',profileStep:'done',photo:''},
    {id:'U-DR2',name:'Teuku Rizal',email:'teuku.rizal@barakah.com',phone:'0812000003',pass:'pengemudi123',role:'pengemudi',agencyId:'AG1',status:'active',profileStep:'done',photo:''},
    {id:'U-DR3',name:'Pak Umar',email:'pak.umar@barakah.com',phone:'0812000004',pass:'pengemudi123',role:'pengemudi',agencyId:'AG1',status:'nonaktif',profileStep:'done',photo:''},
    {id:'U-DR5',name:'Dedi Saputra',email:'dedi@putrajaya.com',phone:'0812000012',pass:'pengemudi123',role:'pengemudi',agencyId:'AG2',status:'active',profileStep:'done',photo:''},
    {id:'U-DR6',name:'Agus Medan',email:'agus@lintasutara.com',phone:'0812000021',pass:'pengemudi123',role:'pengemudi',agencyId:'AG3',status:'active',profileStep:'done',photo:''},
    {id:'U-DR12',name:'Fajar Ramadhan',email:'fajar@lintasutara.com',phone:'0812000051',pass:'pengemudi123',role:'pengemudi',agencyId:'AG3',status:'active',profileStep:'done',photo:''},
    {id:'U-DR13',name:'Zulkifli',email:'zulkifli@cahaya.com',phone:'0812000052',pass:'pengemudi123',role:'pengemudi',agencyId:'AG4',status:'active',profileStep:'done',photo:''},
    {id:'U-DR14',name:'Samsul Bahri',email:'samsul@barakah.com',phone:'0812000053',pass:'pengemudi123',role:'pengemudi',agencyId:'AG1',status:'active',profileStep:'done',photo:''},
    {id:'U-AG4',name:'Nasir (Cahaya)',email:'agen@cahaya.com',phone:'0812000030',pass:'agen123',role:'agen',agencyId:'AG4',status:'pending',photo:''},
    {id:'U-CS1',name:'Pelanggan Demo',email:'user@demo.com',phone:'0813000001',pass:'user123',role:'pelanggan',agencyId:null,status:'active',photo:'',favorites:[{name:'Ayah',phone:'0813000002'}]},
  ];
  const agencies=[
    {id:'AG1',name:'Barakah Travel',logo:'',...agencyProfileFromKyc(seedKyc.AG1),status:'active',serviceFee:10000,feeType:'percent',feeValue:8,refundPolicy:[{minH:72,pct:100,scope:'minusFee'},{minH:24,pct:50},{minH:0,pct:0}],rating:4.8,trips:1240,kyc:seedKyc.AG1},
    {id:'AG2',name:'Putra Jaya Trans',logo:'',...agencyProfileFromKyc(seedKyc.AG2),status:'active',serviceFee:10000,feeType:'flat',feeValue:5000,refundPolicy:[{minH:48,pct:100},{minH:0,pct:0}],rating:4.6,trips:860,kyc:seedKyc.AG2},
    {id:'AG3',name:'Lintas Utara',logo:'',...agencyProfileFromKyc(seedKyc.AG3),status:'active',serviceFee:10000,feeType:'percent',feeValue:10,refundPolicy:[{minH:72,pct:100,scope:'minusFee'},{minH:24,pct:50},{minH:0,pct:0}],rating:4.7,trips:310,kyc:seedKyc.AG3},
    {id:'AG4',name:'Cahaya Perkasa',logo:'',address:'Jl. Diponegoro No.7, Aceh Barat',phone:'0655-31212',bank:'-',status:'pending',serviceFee:10000,feeType:'percent',feeValue:8,refundPolicy:[{minH:72,pct:100,scope:'minusFee'},{minH:24,pct:50},{minH:0,pct:0}],rating:5.0,trips:0},
  ];
  const routes=[];  /* Rute dibuat melalui usulan agen (simulasi dari nol). */
  const vehicles=[
    {id:'V1',agencyId:'AG1',brand:'Toyota',model:'Innova Reborn',year:2022,color:'Hitam',plate:'BL 1234 AA',chassis:'MHFXW41G2N2001001',engine:'2GD2001001',vtype:'MPV',vtypeOther:'',baggage:'Besar',tax:'Aktif',stnkExp:'2027-03-10',kir:'Berlaku s.d. 2027',condition:'Sangat baik',capacity:6,photo:'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=80',facilities:['AC','USB Charger','Air Mineral','Bantal'],status:'aktif',ownerName:'H. Muhammad Nur',ownerBiz:'Barakah Travel',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',ownership:'Milik perusahaan',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Calang — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Paket barang'],opSchedule:'07:00 & 14:00 setiap hari',coopTariff:150000,coopSys:'Bagi hasil',coopOther:'',fleetCount:3,hasDriver:'Ya',drvName:'Bang Jamil',drvPhone:'0812000002',drvSim:'A - 1173011203850001',drvSimExp:'2030-05-01',drvExp:'12 tahun lintas Aceh',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
    {id:'V2',agencyId:'AG1',brand:'Daihatsu',model:'Xenia',year:2021,color:'Silver',plate:'BL 5678 BB',chassis:'MHKV1AA2JK2001002',engine:'1NR2001002',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2026-11-20',kir:'-',condition:'Baik',capacity:6,photo:'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80',facilities:['AC','Musik','Air Mineral'],status:'aktif',ownerName:'H. Muhammad Nur',ownerBiz:'',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',ownership:'Milik pribadi',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Calang — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat'],opSchedule:'14:00 setiap hari',coopTariff:140000,coopSys:'Tarif tetap',coopOther:'',fleetCount:3,hasDriver:'Ya',drvName:'Teuku Rizal',drvPhone:'0812000003',drvSim:'A - 1173021507900002',drvSimExp:'2027-06-01',drvExp:'6 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
    {id:'V3',agencyId:'AG1',brand:'Toyota',model:'Hiace',year:2020,color:'Putih',plate:'BL 9012 CC',chassis:'JTFHX02P2L001003',engine:'1GD001003',vtype:'Minibus',vtypeOther:'',baggage:'Besar',tax:'Belum aktif',stnkExp:'2026-02-15',kir:'Perlu perpanjangan',condition:'Perlu perbaikan',capacity:6,photo:'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600&q=80',facilities:['AC','Reclining Seat','Snack'],status:'maintenance',ownerName:'H. Muhammad Nur',ownerBiz:'Barakah Travel',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',ownership:'Sewa / leasing',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'Leasing Mandiri',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Calang — Meulaboh',origin:'Aceh Jaya',dest:'Aceh Barat',freq:'Beberapa kali seminggu',freqOther:'',services:['Carter / sewa'],opSchedule:'Sesuai permintaan',coopTariff:400000,coopSys:'Sewa armada',coopOther:'',fleetCount:3,hasDriver:'Ya',drvName:'Samsul Bahri',drvPhone:'0812000053',drvSim:'B1 - 1173021807930014',drvSimExp:'2029-01-01',drvExp:'5 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
    {id:'V4',agencyId:'AG2',brand:'Suzuki',model:'Ertiga',year:2021,color:'Merah',plate:'BL 3344 DD',chassis:'MHYNC22S1MJ100004',engine:'K15B100004',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2027-01-05',kir:'-',condition:'Baik',capacity:6,photo:'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&q=80',facilities:['AC','Air Mineral'],status:'aktif',ownerName:'',ownerBiz:'',ownerNik:'1171010101850002',ownerAddr:'Jl. T. Umar No.88, Banda Aceh',ownerPhone:'0812000010',ownerEmail:'agen@putrajaya.com',ownership:'Milik Pengemudi',coopDriverId:'D4',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Banda Aceh — Medan',origin:'Banda Aceh',dest:'Medan',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Antar jemput terminal'],opSchedule:'10:00 & 20:00',coopTariff:320000,coopSys:'Bagi hasil',coopOther:'',fleetCount:2,hasDriver:'Ya',drvName:'Bang Hendra',drvPhone:'0812000011',drvSim:'A - 1171012204880004',drvSimExp:'2026-08-01',drvExp:'9 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
    {id:'V5',agencyId:'AG3',brand:'Toyota',model:'Hiace Premio',year:2023,color:'Hitam',plate:'BK 7788 EE',chassis:'JTFHX02P5P001005',engine:'1GD001005',vtype:'Van',vtypeOther:'',baggage:'Besar',tax:'Aktif',stnkExp:'2028-05-12',kir:'Berlaku s.d. 2028',condition:'Sangat baik',capacity:6,photo:'https://images.unsplash.com/photo-1464219789935-c2d9d9aba644?w=600&q=80',facilities:['AC','Reclining Seat','Snack','WiFi'],status:'aktif',ownerName:'Rizky',ownerBiz:'Lintas Utara',ownerNik:'1271010101900003',ownerAddr:'Jl. Gatot Subroto No.45, Medan',ownerPhone:'0812000020',ownerEmail:'agen@lintasutara.com',ownership:'Milik perusahaan',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Banda Aceh — Medan',origin:'Banda Aceh',dest:'Medan',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Antar jemput terminal','Paket barang'],opSchedule:'19:00 setiap hari',coopTariff:350000,coopSys:'Tarif tetap',coopOther:'',fleetCount:2,hasDriver:'Ya',drvName:'Agus Medan',drvPhone:'0812000021',drvSim:'B1 - 1271010505920006',drvSimExp:'2027-04-01',drvExp:'7 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
  ];
  const drivers=[
    {id:'D1',agencyId:'AG1',name:'Bang Jamil',phone:'0812000002',simType:'A',simExp:2030,simPhoto:seedSim('A','Bang Jamil','1173011203850001','2030'),ktpPhoto:'',photo:seedAvatar('BJ','#0ea5e9','#1e3a8a'),status:'aktif',rating:4.9,trips:320,userEmail:'pengemudi@barakah.com',birthPlace:'Calang',birthDate:'1985-03-12',gender:'Laki-laki',address:'Jl. Merdeka No.12, Calang',nik:'1173011203850001',marital:'Menikah',education:'SMA',emName:'Cut Aminah',emPhone:'0813000011',emRelation:'Istri',simNumber:'1173011203850001',bank:'BCA 8210099001 a.n. Bang Jamil'},
    {id:'D2',agencyId:'AG1',name:'Teuku Rizal',phone:'0812000003',simType:'A',simExp:2027,simPhoto:seedSim('A','Teuku Rizal','1173021507900002','2027'),ktpPhoto:'',photo:seedAvatar('TR','#10b981','#065f46'),status:'aktif',rating:4.7,trips:180,userEmail:'teuku.rizal@barakah.com',birthPlace:'Banda Aceh',birthDate:'1990-07-15',gender:'Laki-laki',address:'Jl. T. Umar No.10, Banda Aceh',nik:'1173021507900002',marital:'Belum menikah',education:'SMK',emName:'Teuku Ahmad',emPhone:'0813000022',emRelation:'Saudara',simNumber:'1173021507900002',bank:'BRI 0022010190002 a.n. Teuku Rizal'},
    {id:'D3',agencyId:'AG1',name:'Pak Umar',phone:'0812000004',simType:'B1',simExp:2026,simPhoto:seedSim('B1','Pak Umar','1173031011750003','2026'),ktpPhoto:'',photo:seedAvatar('PU','#f59e0b','#92400e'),status:'nonaktif',rating:4.5,trips:410,userEmail:'pak.umar@barakah.com',birthPlace:'Meulaboh',birthDate:'1975-11-10',gender:'Laki-laki',address:'Jl. Nasional No.5, Meulaboh',nik:'1173031011750003',marital:'Menikah',education:'SMP',emName:'Roslina',emPhone:'0813000033',emRelation:'Istri',simNumber:'1173031011750003',bank:'Mandiri 8900010175003 a.n. Pak Umar'},
    {id:'D4',agencyId:'AG2',name:'Bang Hendra',phone:'0812000011',simType:'A',simExp:2026,simPhoto:seedSim('A','Bang Hendra','1171012204880004','2026'),ktpPhoto:'',photo:seedAvatar('BH','#8b5cf6','#4c1d95'),status:'aktif',rating:4.8,trips:210,userEmail:'pengemudi@putrajaya.com',birthPlace:'Banda Aceh',birthDate:'1988-04-22',gender:'Laki-laki',address:'Jl. T. Umar No.88, Banda Aceh',nik:'1171012204880004',marital:'Menikah',education:'SMA',emName:'Dewi',emPhone:'0813000044',emRelation:'Istri',simNumber:'1171012204880004',bank:'BCA 8210099004 a.n. Bang Hendra'},
    {id:'D5',agencyId:'AG2',name:'Dedi Saputra',phone:'0812000012',simType:'B1',simExp:2028,simPhoto:seedSim('B1','Dedi Saputra','1171021701950005','2028'),ktpPhoto:'',photo:seedAvatar('DS','#ef4444','#7f1d1d'),status:'aktif',rating:4.6,trips:95,userEmail:'dedi@putrajaya.com',birthPlace:'Lhokseumawe',birthDate:'1995-01-17',gender:'Laki-laki',address:'Jl. Merdeka No.20, Lhokseumawe',nik:'1171021701950005',marital:'Belum menikah',education:'SMA',emName:'Jamal',emPhone:'0813000055',emRelation:'Ayah',simNumber:'1171021701950005',bank:'BRI 0022010195005 a.n. Dedi Saputra'},
    {id:'D6',agencyId:'AG3',name:'Agus Medan',phone:'0812000021',simType:'B1',simExp:2027,simPhoto:seedSim('B1','Agus Medan','1271010505920006','2027'),ktpPhoto:'',photo:seedAvatar('AM','#06b6d4','#155e75'),status:'aktif',rating:4.7,trips:140,userEmail:'agus@lintasutara.com',birthPlace:'Medan',birthDate:'1992-05-05',gender:'Laki-laki',address:'Jl. Gatot Subroto No.45, Medan',nik:'1271010505920006',marital:'Belum menikah',education:'SMK',emName:'Siti',emPhone:'0813000066',emRelation:'Ibu',simNumber:'1271010505920006',bank:'Mandiri 8900010159006 a.n. Agus Medan'},
    {id:'D7',agencyId:'AG1',name:'Ilham Saputra',phone:'0812000099',simType:'B1',simExp:2029,simPhoto:seedSim('B1','Ilham Saputra','1171031201970007','2029'),ktpPhoto:'',photo:seedAvatar('IS','#14b8a6','#134e4a'),status:'aktif',rating:5.0,trips:0,userEmail:'pengemudibaru@mail.com',birthPlace:'Calang',birthDate:'1997-01-12',gender:'Laki-laki',address:'Jl. Merdeka No.30, Calang',nik:'1171031201970007',marital:'Belum menikah',education:'SMA',emName:'Hasan',emPhone:'0813000077',emRelation:'Saudara',simNumber:'1171031201970007',bank:'BCA 8210099007 a.n. Ilham Saputra'},
    {id:'D12',agencyId:'AG3',name:'Fajar Ramadhan',phone:'0812000051',simType:'B1',simExp:2028,simPhoto:seedSim('B1','Fajar Ramadhan','1271011208940012','2028'),ktpPhoto:'',photo:seedAvatar('FR','#0ea5e9','#0c4a6e'),status:'aktif',rating:4.6,trips:0,userEmail:'fajar@lintasutara.com',birthPlace:'Medan',birthDate:'1994-08-12',gender:'Laki-laki',address:'Jl. Gatot Subroto No.45, Medan',nik:'1271011208940012',marital:'Belum menikah',education:'SMA',emName:'Siti',emPhone:'0813000062',emRelation:'Ibu',simNumber:'1271011208940012',bank:'BRI 0022010194012 a.n. Fajar Ramadhan'},
    {id:'D13',agencyId:'AG4',name:'Zulkifli',phone:'0812000052',simType:'A',simExp:2029,simPhoto:seedSim('A','Zulkifli','1173010709910013','2029'),ktpPhoto:'',photo:seedAvatar('ZK','#8b5cf6','#4c1d95'),status:'aktif',rating:4.7,trips:0,userEmail:'zulkifli@cahaya.com',birthPlace:'Meulaboh',birthDate:'1991-09-07',gender:'Laki-laki',address:'Jl. Diponegoro No.7, Meulaboh',nik:'1173010709910013',marital:'Menikah',education:'SMA',emName:'Nur Aini',emPhone:'0813000063',emRelation:'Istri',simNumber:'1173010709910013',bank:'BRI 0022010199013 a.n. Zulkifli'},
    {id:'D14',agencyId:'AG1',name:'Samsul Bahri',phone:'0812000053',simType:'B1',simExp:2029,simPhoto:seedSim('B1','Samsul Bahri','1173021807930014','2029'),ktpPhoto:'',photo:seedAvatar('SB','#f59e0b','#92400e'),status:'aktif',rating:4.6,trips:0,userEmail:'samsul@barakah.com',birthPlace:'Calang',birthDate:'1993-07-18',gender:'Laki-laki',address:'Jl. Merdeka No.30, Calang',nik:'1173021807930014',marital:'Belum menikah',education:'SMA',emName:'Hasan',emPhone:'0813000064',emRelation:'Saudara',simNumber:'1173021807930014',bank:'BCA 8210099014 a.n. Samsul Bahri'},
  ];
  /* Penjadwalan sengaja kosong: jadwal dibuat sendiri oleh agen (simulasi dari nol). */
  const schedules=[];
  const bookings=[];
  DB.save('users',users); DB.save('agencies',agencies); DB.save('routes',routes);
  DB.save('vehicles',vehicles); DB.save('drivers',drivers); DB.save('schedules',schedules);
  DB.save('bookings',bookings); DB.save('payments',[]);
  DB.save('ledger',[]);
  DB.save('vouchers',[{code:'HEMAT20',type:'percent',value:20,maxDisc:30000,quota:100,used:12,active:true,desc:'Diskon 20% maks Rp30rb'},{code:'CALANG50',type:'flat',value:15000,quota:50,used:5,active:true,desc:'Potongan Rp15rb rute Aceh Jaya'}]);
  DB.save('reviews',[{id:uid('RV'),agencyId:'AG1',user:'Rina Amelia',rating:5,text:'Pengemudi ramah, armada bersih dan tepat waktu. Recommended!',date:todayStr(-2),trip:'Aceh Jaya → Banda Aceh'}]);
  DB.save('notifications',[{id:uid('NTF'),to:'user@demo.com',title:'Selamat datang di TransAceh',msg:'Gunakan kode HEMAT20 untuk diskon 20% perjalanan pertama.',ch:'app',time:new Date().toISOString(),read:false}]);
  DB.save('fees',{defaultType:'percent',defaultValue:8});
  DB.save('audit',[{id:uid('LOG'),time:new Date().toISOString(),actor:'system',action:'seed',detail:'Database awal dibuat'}]);
  DB.save('banners',[{id:'B1',title:'Diskon 20% Rute Aceh Jaya – Banda Aceh',sub:'Kode: HEMAT20 • s.d. akhir bulan',active:true}]);
  DB.save('routeRequests',[]);
  localStorage.setItem('at_seeded_v16','1');
  }
  /* Lengkapi KYC agen demo aktif tanpa mereset data pengguna yang sudah ada. */
  (function migrateSeedKycV1(){
    try{
      if(localStorage.getItem('at_kyc_npwp_seed_v1')) return;
      const ags=DB.load('agencies',[]); let ch=false;
      ags.forEach(a=>{
        const demo=seedKyc[a.id];
        if(demo && (!a.kyc || !a.kyc.nama)){ a.kyc=demo; ch=true; }
      });
      if(ch) DB.save('agencies',ags);
      localStorage.setItem('at_kyc_npwp_seed_v1','1');
    }catch{}
  })();
  /* Sinkronkan field profil lama (phone/address/bank) dari KYC satu kali.
     Nilai yang sudah diubah manual agen tidak ditimpa. */
  (function migrateAgencyProfileFromKycV1(){
    try{
      if(localStorage.getItem('at_profile_kyc_sync_v1')) return;
      const legacy={
        AG1:{phone:'0654-20112',address:'Jl. Merdeka No.12, Calang, Aceh Jaya',bank:'BCA 8210-9921-11 a.n. Barakah Travel'},
        AG2:{phone:'0651-77821',address:'Jl. T. Umar No.88, Banda Aceh',bank:'Mandiri 8900-1122-33 a.n. Putra Jaya'},
        AG3:{phone:'061-778899',address:'Jl. Gatot Subroto No.45, Medan',bank:'BRI 0022-3344-55 a.n. Lintas Utara'},
      };
      const ags=DB.load('agencies',[]); let ch=false;
      ags.forEach(a=>{
        if(!a.kyc) return;
        const old=legacy[a.id];
        const patch=agencyProfileFromKyc(a.kyc);
        Object.entries(patch).forEach(([key,val])=>{
          if(val && (!a[key] || (old && a[key]===old[key]))){
            a[key]=val; ch=true;
          }
        });
      });
      if(ch) DB.save('agencies',ags);
      localStorage.setItem('at_profile_kyc_sync_v1','1');
    }catch{ /* abaikan */ }
  })();
  /* Seed modul Pusat Bantuan sekali saja. Tidak menimpa laporan yang sudah ada. */
  (function seedSupportV1(){
    try{
      if(localStorage.getItem('at_support_seeded_v1')) return;
      const cur=DB.load('supportTickets',null);
      if(!Array.isArray(cur)){
        const ago=h=>new Date(Date.now()-h*3600000).toISOString();
        const report={
          id:'ST-DEMO-1',code:'ADU-DEMO-0001',channel:'report',
          userId:'U-CS1',userEmail:'user@demo.com',userName:'Pelanggan Demo',userPhone:'0813000001',isGuest:false,
          category:'Pembatalan & Refund',subject:'Refund tiket belum masuk',bookingCode:'TRX-DEMO',
          description:'Saya membatalkan tiket 3 hari lalu dan sudah menerima notifikasi refund, tetapi dana belum masuk ke rekening.',
          status:'resolved',
          messages:[
            {id:'MSG-DEMO-1',from:'user',author:'Pelanggan Demo',text:'Saya membatalkan tiket 3 hari lalu dan sudah menerima notifikasi refund, tetapi dana belum masuk ke rekening.',at:ago(74)},
            {id:'MSG-DEMO-2',from:'cs',author:'CS TransAceh',text:'Mohon maaf atas keterlambatannya. Refund sudah kami proses ulang dan akan masuk maksimal 1×24 jam ke metode pembayaran awal.',at:ago(72)},
            {id:'MSG-DEMO-3',from:'system',author:'Sistem',text:'Laporan ditandai selesai oleh CS TransAceh.',at:ago(70)},
          ],
          statusHistory:[
            {status:'new',at:ago(74),by:'Pelanggan Demo',note:'Laporan dibuat'},
            {status:'process',at:ago(73),by:'CS TransAceh',note:'Laporan sedang ditinjau'},
            {status:'resolved',at:ago(70),by:'CS TransAceh',note:'Refund telah diproses ulang'},
          ],
          createdAt:ago(74),updatedAt:ago(70),
        };
        const chat={
          id:'ST-DEMO-2',code:'CHT-DEMO-0001',channel:'chat',
          userId:'U-CS1',userEmail:'user@demo.com',userName:'Pelanggan Demo',userPhone:'0813000001',isGuest:false,
          category:'Live Chat',subject:'Live Chat',bookingCode:'',
          description:'',
          status:'new',
          messages:[
            {id:'MSG-DEMO-4',from:'system',author:'Tim TransAceh',text:'Halo Pelanggan Demo! Tim CS TransAceh akan membalas pesan Anda. Jam layanan 08.00–21.00 WIB.',at:ago(4)},
            {id:'MSG-DEMO-5',from:'user',author:'Pelanggan Demo',text:'Halo, apakah titik jemput saya bisa diubah ke Terminal Calang?',at:ago(4)},
          ],
          statusHistory:[
            {status:'new',at:ago(4),by:'Pelanggan Demo',note:'Live chat dimulai'},
          ],
          createdAt:ago(4),updatedAt:ago(4),
        };
        DB.save('supportTickets',[chat,report]);
      }
      localStorage.setItem('at_support_seeded_v1','1');
    }catch{ /* abaikan */ }
  })();
  DB.save('ledger',DB.load('ledger',[]));
/* Migrasi DB lama (v1) ke format form terbaru: rute pakai nama kabupaten/kota + agencyIds/driverIds */
(function migrateRoutesV2(){
  try{
    if(!localStorage.getItem('at_seeded_v1')||localStorage.getItem('at_seeded_v2')) return;
    const fix={Calang:'Aceh Jaya',Meulaboh:'Aceh Barat'};
    const rs=DB.load('routes',[]); let ch=false;
    rs.forEach(r=>{
      if(fix[r.from]){ r.from=fix[r.from]; ch=true; }
      if(fix[r.to]){ r.to=fix[r.to]; ch=true; }
      if(!Array.isArray(r.agencyIds)){ r.agencyIds=r.agencyId?[r.agencyId]:['AG1']; ch=true; }
      if(!Array.isArray(r.driverIds)){ r.driverIds=r.driverId?[r.driverId]:[]; ch=true; }
      if(!r.agencyId&&r.agencyIds.length){ r.agencyId=r.agencyIds[0]; ch=true; }
      if(!r.driverId&&r.driverIds.length){ r.driverId=r.driverIds[0]; ch=true; }
      if(Array.isArray(r.pickups)) r.pickups=r.pickups.map(p=>p.replace('Terminal Calang','Terminal Aceh Jaya').replace('Terminal Meulaboh','Terminal Aceh Barat'));
    });
    if(ch) DB.save('routes',rs);
    localStorage.setItem('at_seeded_v2','1');
  }catch(e){}
})();
/* Migrasi SIM string lama → simType + simExp terstruktur + field dokumen & status user */
(function migrateSimV3(){
  try{
    const ds=DB.load('drivers',[]); let ch=false;
    ds.forEach(d=>{
      if(!d.simType||!d.simExp){ const s=simParse(d); d.simType=s.type; d.simExp=s.exp; delete d.sim; ch=true; }
      if(!('simPhoto' in d)){ d.simPhoto=''; ch=true; }
      if(!('ktpPhoto' in d)){ d.ktpPhoto=''; ch=true; }
      ['birthPlace','birthDate','gender','address','nik','marital','education','emName','emPhone','emRelation','simNumber'].forEach(k=>{ if(!(k in d)){ d[k]=k==='gender'?'Laki-laki':k==='marital'?'Belum menikah':''; ch=true; } });
    });
    if(ch) DB.save('drivers',ds);
    const us=DB.load('users',[]); let uh=false;
    us.forEach(x=>{
      if(!('status' in x)){ x.status='active'; uh=true; }
      if(!('wa' in x)){ x.wa=x.phone||'-'; uh=true; }
      if(x.role==='pengemudi'&&x.status==='pending'){
        if(x.agencyId){ x.status='active'; x.profileStep='done'; uh=true; }
      }
    });
    if(uh) DB.save('users',us);
    const stranded=us.filter(x=>x.role==='pengemudi'&&x.status==='pending'&&!x.agencyId).map(x=>x.id);
    if(stranded.length){
      DB.save('users',DB.load('users',[]).filter(x=>!stranded.includes(x.id)));
      DB.save('drivers',DB.load('drivers',[]).filter(d=>{ const em=(d.userEmail||'').toLowerCase();
        const ou=DB.load('users',[]).find(x=>x.email===em&&x.role==='pengemudi');
        return !(!d.agencyId&&(d.trips||0)===0&&!ou&&!DB.load('schedules',[]).some(s=>s.driverId===d.id)); }));
      uh=true;
    }
    const ds2=DB.load('drivers',[]); let dh=false;
    ds2.forEach(d=>{ if(d.userEmail){ const own=DB.load('users',[]).find(x=>x.email===d.userEmail.toLowerCase()&&x.role==='pengemudi'&&x.status==='active');
      if(own&&d.status!=='aktif'){ d.status='aktif'; dh=true; } } });
    if(dh) DB.save('drivers',ds2);
  }catch(e){}
})();
/* Migrasi: pastikan semua armada punya inactiveSeats (untuk form edit bangku) */
(function migrateVehicles(){
  try{
    const vs=DB.load('vehicles',[]); let ch=false;
    vs.forEach(v=>{
      if(!Array.isArray(v.inactiveSeats)){ v.inactiveSeats=[]; ch=true; }
      if(!Array.isArray(v.layout)||v.layout.length!==28){ v.layout=vehLayout(v); ch=true; }
      v.layout.forEach(c=>{ if(c.type==='door'||c.type==='aisle'){ c.type='empty'; c.sid=null; ch=true; } });
      const di=v.layout.map((c,i)=>c.type==='driver'?i:-1).filter(i=>i>=0);
      const okPair=di.length===2&&di[1]===di[0]+1&&(di[0]%4)===2;
      if(!okPair&&di.length){
        const r=Math.floor(di[0]/4), a=r*4+2, b=r*4+3;
        const clashSids=[v.layout[a],v.layout[b]].filter(c=>c&&(c.type==='seat'||c.type==='off')&&c.sid).map(c=>c.sid);
        const booked=clashSids.length&&DB.load('schedules',[]).filter(s=>s.vehicleId===v.id&&s.date>=todayStr(0)).some(s=>bookingsOf(s.id).some(x=>(x.seats||[]).some(st=>clashSids.includes(st))));
        if(!booked){
          di.forEach(i=>{ v.layout[i]={sid:null,type:'empty'}; });
          v.layout[a]={sid:'DRV',type:'driver'}; v.layout[b]={sid:'DRV2',type:'driver'};
          ch=true;
        }
      }
      const n=v.layout.filter(c=>c.type==='seat').length;
      if(v.capacity!==n){ v.capacity=n; ch=true; }
      if(typeof v.seatSeq!=='number'){ v.seatSeq=v.layout.reduce((a,c)=>{const m=c.sid&&/^A(\d+)$/.exec(c.sid);return m?Math.max(a,+m[1]):a;},6); ch=true; }
      const off=v.layout.filter(c=>c.type==='off').map(c=>c.sid).filter(Boolean);
      if(JSON.stringify(off)!==JSON.stringify(v.inactiveSeats)){ v.inactiveSeats=off; ch=true; }
      const defV={model:'',color:'',chassis:'',engine:'',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'',kir:'',condition:'Baik',ownerName:'',ownerBiz:'',ownerNik:'',ownerAddr:'',ownerPhone:'',ownerEmail:'',ownership:'Milik pribadi',coopDriverId:'',hasEmail:'',docs:[],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'',origin:'',dest:'',freq:'Setiap hari',freqOther:'',services:[],opSchedule:'',coopTariff:0,coopSys:'Bagi hasil',coopOther:'',fleetCount:1,hasDriver:'Ya',driverId:'',backDriverId:'',driverConflict:false,drvName:'',drvPhone:'',drvSim:'',drvSimExp:'',drvExp:'',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''};
      Object.keys(defV).forEach(k=>{ if(v[k]===undefined||v[k]===null){ v[k]=defV[k]; ch=true; } });
      if(!v.hasEmail){ v.hasEmail=v.ownerEmail?'Ya':'Tidak'; ch=true; }
      if(v.ownership==='Kerja sama'){ v.ownership='Milik Pengemudi'; ch=true; }
      if(!Array.isArray(v.docs)){ v.docs=[]; ch=true; }
      if(!Array.isArray(v.services)){ v.services=[]; ch=true; }
      if(v.services.includes('Pool ke pool')){ v.services=v.services.map(s=>s==='Pool ke pool'?'Antar jemput terminal':s); ch=true; }
      if(!Array.isArray(v.facilities)){ v.facilities=['AC']; ch=true; }
    });
    if(ch) DB.save('vehicles',vs);
  }catch(e){}
})();
/* Migrasi: bersihkan titik jemput rute (trim + buang duplikat, abaikan besar/kecil huruf) */
(function migratePickupsV3(){
  try{
    const rs=DB.load('routes',[]); let ch=false;
    rs.forEach(r=>{
      const pts=normalizePoints(r.pickups);
      if(JSON.stringify(pts)!==JSON.stringify(Array.isArray(r.pickups)?r.pickups:[])){ r.pickups=pts; ch=true; }
    });
    if(ch) DB.save('routes',rs);
  }catch(e){}
})();
/* Migrasi: rapikan jarak/durasi rute — isi "-" + koreksi nilai seed lama yang tidak akurat (pakai override koridor bila ada) */
(function migrateRouteMetaV3(){
  try{
    const SEED_FIX={ 'Banda Aceh|Aceh Jaya':['±185 km','±5 jam'], 'Aceh Jaya|Aceh Barat':['±75 km','±2 jam'], 'Banda Aceh|Medan':['±600 km','±12 jam'] };
    const rs=DB.load('routes',[]); let ch=false;
    rs.forEach(r=>{
      const est=estimateRoute(r.from,r.to); if(!est) return;
      const lg=SEED_FIX[r.from+'|'+r.to]||SEED_FIX[r.to+'|'+r.from];
      const sd=!r.distance||r.distance==='-'||(lg&&r.distance===lg[0]);
      const st=!r.duration||r.duration==='-'||(lg&&r.duration===lg[1]);
      if(sd&&r.distance!==est.distance){ r.distance=est.distance; ch=true; }
      if(st&&r.duration!==est.duration){ r.duration=est.duration; ch=true; }
    });
    if(ch) DB.save('routes',rs);
  }catch(e){}
})();
/* Pembersih sekali-jalan (browser yang sudah terlanjur ter-seed): buang HANYA jejak dummy —
   jadwal ber-id pola seed S1xx, booking BK-DEMO1, dan transaksi yang menempel padanya.
   Jadwal/transaksi buatan user (id S-XXXXX dsb.) tidak disentuh. */
(function purgeSeedSchedules(){
  try{
    if(localStorage.getItem('at_purge_seed_sched_v1')) return;
    const seedSet=new Set(DB.load('schedules',[]).filter(s=>/^S1\d\d$/.test(s.id||'')).map(s=>s.id));
    if(seedSet.size) DB.save('schedules',DB.load('schedules',[]).filter(s=>!seedSet.has(s.id)));
    const books=DB.load('bookings',[]);
    const rmBook=b=>b.id==='BK-DEMO1'||seedSet.has(b.scheduleId);
    const rmIds=new Set(books.filter(rmBook).map(b=>b.id));
    if(rmIds.size) DB.save('bookings',books.filter(b=>!rmBook(b)));
    DB.save('payments',DB.load('payments',[]).filter(p=>!rmIds.has(p.bookingId)));
    DB.save('ledger',DB.load('ledger',[]).filter(l=>!rmIds.has(l.bookingId)&&!seedSet.has(l.scheduleId)));
    localStorage.setItem('at_purge_seed_sched_v1','1');
  }catch{}
})();
/* Pembersih sekali-jalan rute (browser yang sudah terlanjur ter-seed): buang HANYA jejak dummy —
   rute ber-id R1–R4, usulan dummy RQ-DEMO1/2/3, usulan yang menempel pada rute dummy, dan
   jadwal/transaksi yang dibangun di atas rute dummy (agar tidak yatim). Rute/usulan buatan user
   (id R-XXXXX / RQ-XXXXX) tidak disentuh. */
(function purgeSeedRoutes(){
  try{
    if(localStorage.getItem('at_purge_seed_routes_v1')) return;
    const seedRouteIds=new Set(['R1','R2','R3','R4']);
    const seedReqIds=new Set(['RQ-DEMO1','RQ-DEMO2','RQ-DEMO3']);
    const rs=DB.load('routes',[]);
    if(rs.some(r=>seedRouteIds.has(r.id))) DB.save('routes',rs.filter(r=>!seedRouteIds.has(r.id)));
    const rqs=DB.load('routeRequests',[]);
    DB.save('routeRequests',rqs.filter(q=>!seedReqIds.has(q.id)&&!seedRouteIds.has(q.routeId)));
    const scheds=DB.load('schedules',[]);
    const removedSchedIds=new Set(scheds.filter(s=>seedRouteIds.has(s.routeId)).map(s=>s.id));
    if(removedSchedIds.size){
      DB.save('schedules',scheds.filter(s=>!removedSchedIds.has(s.id)));
      const books=DB.load('bookings',[]);
      const rmBookIds=new Set(books.filter(b=>removedSchedIds.has(b.scheduleId)).map(b=>b.id));
      DB.save('bookings',books.filter(b=>!removedSchedIds.has(b.scheduleId)));
      DB.save('payments',DB.load('payments',[]).filter(p=>!rmBookIds.has(p.bookingId)));
      DB.save('ledger',DB.load('ledger',[]).filter(l=>!rmBookIds.has(l.bookingId)&&!removedSchedIds.has(l.scheduleId)));
    }
    localStorage.setItem('at_purge_seed_routes_v1','1');
  }catch{}
})();
/* Seed data perbandingan: rute dan jadwal 30 hari untuk agen demo.
   Flag at_seed_compare_v1 juga dipakai pengujian untuk melewati seed ini.
   Data pengguna yang sudah ada tidak dihapus; seed hanya menambah yang belum ada. */
(function seedCompareRoutesV1(){
  try{
    if(localStorage.getItem('at_seed_compare_v1')==='1') return;
    const svgURI=s=>'data:image/svg+xml;utf8,'+encodeURIComponent(s);
    const demoAvatar=(ini,c1,c2)=>svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='160' height='160' fill='url(#g)'/><text x='80' y='94' font-family='Arial,sans-serif' font-size='58' font-weight='bold' fill='#fff' text-anchor='middle'>${ini}</text></svg>`);
    const demoSim=(t,nm,num,exp)=>svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' rx='16' fill='#0b2447'/><rect x='16' y='16' width='288' height='168' rx='12' fill='none' stroke='#38bdf8' stroke-width='2'/><text x='28' y='52' font-family='Arial,sans-serif' font-size='22' font-weight='bold' fill='#7dd3fc'>SIM ${t} • DEMO</text><text x='28' y='92' font-family='Arial,sans-serif' font-size='17' font-weight='bold' fill='#fff'>${nm}</text><text x='28' y='118' font-family='Arial,sans-serif' font-size='14' fill='#cbd5e1'>${num}</text><text x='28' y='144' font-family='Arial,sans-serif' font-size='14' fill='#cbd5e1'>Berlaku s.d. ${exp}</text><text x='28' y='168' font-family='Arial,sans-serif' font-size='11' fill='#64748b'>Contoh seed — ganti dengan foto asli</text></svg>`);
    const nowIso=new Date().toISOString();
    const ag4Kyc={
      jenis:'Perorangan / Freelance', nama:'Nasir',
      nik:'1173010101900004', tmpLahir:'Meulaboh', tglLahir:'1990-01-01',
      gender:'Laki-laki', agama:'Islam',
      alamat:{ jalan:'Jl. Diponegoro No.7', rtRw:'02/03', kelurahan:'Meulaboh', kecamatan:'Johan Pahlawan', kota:'Aceh Barat', provinsi:'Aceh', kodePos:'23611' },
      hp:'0812000030', email:'agen@cahaya.com',
      darurat:{ nama:'Siti Rahmah', hubungan:'Istri / Suami', hp:'0813000030' },
      bank:'BRI', rekeningNo:'0022010190008', rekeningNama:'Nasir',
      npwpSamaKtp:true, npwp:'',
      docs:{
        ktp:seedDoc('KTP Nasir'), pasfoto:seedDoc('Pasfoto Nasir'),
        bukuTabungan:seedDoc('Buku Tabungan Nasir'), npwpPribadi:seedDoc('NPWP Nasir'),
      },
      status:'lengkap', step:3, terms:true,
      submittedAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z',
    };

    /* AG4 Cahaya Perkasa ikut aktif dan lengkap agar bisa dipakai membandingkan. */
    const ags=DB.load('agencies',[]);
    const ag4=ags.find(a=>a.id==='AG4');
    if(ag4){
      let ch=false;
      if(!ag4.kyc||!ag4.kyc.nama){ ag4.kyc=ag4Kyc; ch=true; }
      if(ag4.status!=='active'){ ag4.status='active'; ch=true; }
      const patch=agencyProfileFromKyc(ag4.kyc);
      Object.entries(patch).forEach(([k,v])=>{ if(v&&(!ag4[k]||ag4[k]==='-')){ ag4[k]=v; ch=true; } });
      if(ch) DB.save('agencies',ags);
    }

    const users=DB.load('users',[]); let uch=false;
    const uag4=users.find(u=>u.id==='U-AG4');
    if(uag4&&uag4.status!=='active'){ uag4.status='active'; uch=true; }
    if(!users.some(u=>u.id==='U-DR8'||String(u.email||'').toLowerCase()==='pengemudi@cahaya.com')){
      users.push({id:'U-DR8',name:'Muhammad Iqbal',email:'pengemudi@cahaya.com',phone:'0812000031',pass:'pengemudi123',role:'pengemudi',agencyId:'AG4',status:'active',profileStep:'done',photo:''});
      uch=true;
    }
    if(uch) DB.save('users',users);

    const drivers=DB.load('drivers',[]);
    if(!drivers.some(d=>d.id==='D8')){
      drivers.push({id:'D8',agencyId:'AG4',name:'Muhammad Iqbal',phone:'0812000031',simType:'A',simExp:2029,simPhoto:demoSim('A','Muhammad Iqbal','1173010101900008','2029'),ktpPhoto:'',photo:demoAvatar('MI','#0ea5e9','#0c4a6e'),status:'aktif',rating:4.8,trips:0,userEmail:'pengemudi@cahaya.com',birthPlace:'Meulaboh',birthDate:'1990-01-01',gender:'Laki-laki',address:'Jl. Diponegoro No.7, Meulaboh',nik:'1173010101900008',marital:'Menikah',education:'SMA',emName:'Siti Rahmah',emPhone:'0813000030',emRelation:'Istri',simNumber:'1173010101900008',bank:'BRI 0022010190008 a.n. Muhammad Iqbal'});
      DB.save('drivers',drivers);
    }

    const vehicles=DB.load('vehicles',[]);
    if(!vehicles.some(v=>v.id==='V6')){
      vehicles.push({id:'V6',agencyId:'AG4',brand:'Toyota',model:'Avanza',year:2022,color:'Putih',plate:'BL 3456 GH',chassis:'MHFXW42G2N2006001',engine:'2NR2006001',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2027-08-10',kir:'Berlaku s.d. 2027',condition:'Baik',capacity:6,photo:'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=80',facilities:['AC','USB Charger','Air Mineral'],status:'aktif',ownerName:'Nasir',ownerBiz:'Cahaya Perkasa',ownerNik:'1173010101900004',ownerAddr:'Jl. Diponegoro No.7, Meulaboh',ownerPhone:'0812000030',ownerEmail:'agen@cahaya.com',ownership:'Milik perusahaan',coopDriverId:'D8',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Meulaboh — Banda Aceh',origin:'Aceh Barat',dest:'Banda Aceh',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Paket barang'],opSchedule:'07:00 setiap hari',coopTariff:155000,coopSys:'Bagi hasil',coopOther:'',fleetCount:1,hasDriver:'Ya',drvName:'Muhammad Iqbal',drvPhone:'0812000031',drvSim:'A - 1173010101900008',drvSimExp:'2029-01-01',drvExp:'5 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:'',inactiveSeats:[],layout:vehLayout({}),seatSeq:6});
      DB.save('vehicles',vehicles);
    }

    const routeDefs=[
      {key:'AG1BNDA',id:'R-SEED-AG1-BNDA',agencyId:'AG1',from:'Aceh Jaya',to:'Banda Aceh',price:150000,vehicleIds:['V1','V2'],driverIds:['D1','D2','D7'],pickups:['Terminal Aceh Jaya','Pelabuhan Calang']},
      {key:'AG1ABR',id:'R-SEED-AG1-ABR',agencyId:'AG1',from:'Aceh Jaya',to:'Aceh Barat',price:120000,vehicleIds:['V2'],driverIds:['D2'],pickups:['Terminal Aceh Jaya','Pelabuhan Calang']},
      {key:'AG2MDN',id:'R-SEED-AG2-MDN',agencyId:'AG2',from:'Banda Aceh',to:'Medan',price:320000,vehicleIds:['V4'],driverIds:['D4','D5'],pickups:['Terminal Batoh','Bandara Sultan Iskandar Muda','Pelabuhan Ulee Lheue']},
      {key:'AG2LSW',id:'R-SEED-AG2-LSW',agencyId:'AG2',from:'Banda Aceh',to:'Lhokseumawe',price:180000,vehicleIds:['V4'],driverIds:['D4'],pickups:['Terminal Batoh','Bandara Sultan Iskandar Muda','Pelabuhan Ulee Lheue']},
      {key:'AG3MDN',id:'R-SEED-AG3-MDN',agencyId:'AG3',from:'Banda Aceh',to:'Medan',price:350000,vehicleIds:['V5'],driverIds:['D6','D12'],pickups:['Terminal Batoh','Bandara Sultan Iskandar Muda','Pelabuhan Ulee Lheue']},
      {key:'AG4BNDA',id:'R-SEED-AG4-BNDA',agencyId:'AG4',from:'Aceh Barat',to:'Banda Aceh',price:155000,vehicleIds:['V6'],driverIds:['D8','D13'],pickups:['Terminal Aceh Barat']},
      {key:'AG4ABR',id:'R-SEED-AG4-ABR',agencyId:'AG4',from:'Banda Aceh',to:'Aceh Barat',price:155000,vehicleIds:['V6'],driverIds:['D8','D13'],pickups:['Terminal Batoh','Bandara Sultan Iskandar Muda','Pelabuhan Ulee Lheue']},
    ];
    const routes=DB.load('routes',[]); let rch=false;
    routeDefs.forEach(def=>{
      if(routes.some(r=>r.id===def.id)) return;
      const est=estimateRoute(def.from,def.to)||{};
      routes.push({id:def.id,from:def.from,to:def.to,distance:est.distance||'-',duration:est.duration||'-',basePrice:def.price,prices:{[def.agencyId]:def.price},homePickup:true,pickups:def.pickups,vehicleIds:def.vehicleIds,active:true,agencyId:def.agencyId,agencyIds:[def.agencyId],driverId:def.driverIds[0]||null,driverIds:def.driverIds,suspensions:{}});
      rch=true;
    });
    if(rch) DB.save('routes',routes);

    const byId=new Map(routes.map(r=>[r.id,r]));
    const validDefs=routeDefs.filter(def=>{
      const r=byId.get(def.id);
      return !!r&&(r.agencyIds||(r.agencyId?[r.agencyId]:[])).includes(def.agencyId);
    });
    const schedules=DB.load('schedules',[]);
    const seen=new Set(schedules.map(s=>s.id));
    let sch=false;
    const add=(def,date,time,vehicleId,driverId,driverName)=>{
      const id='S-SEED-'+def.key+'-'+date.replace(/-/g,'')+'-'+time.replace(':','');
      if(seen.has(id)) return;
      if(schedules.some(s=>s.agencyId===def.agencyId&&s.routeId===def.id&&s.date===date&&s.time===time)) return;
      schedules.push({id,agencyId:def.agencyId,routeId:def.id,date,time,vehicleId,driverId,driverName,price:def.price,status:'open',tripStatus:'scheduled',blockedSeats:[],createdAt:nowIso});
      seen.add(id); sch=true;
    };
    const def=Object.fromEntries(validDefs.map(d=>[d.key,d]));
    for(let day=1;day<=30;day++){
      const date=todayStr(day);
      if(def.AG1BNDA){ add(def.AG1BNDA,date,'07:00','V1','D1','Bang Jamil'); add(def.AG1BNDA,date,'14:00','V2','D2','Teuku Rizal'); }
      if(def.AG2MDN) add(def.AG2MDN,date,'08:00','V4','D4','Bang Hendra');
      if(def.AG3MDN) add(def.AG3MDN,date,'21:00','V5','D6','Agus Medan');
      if(def.AG4BNDA) add(def.AG4BNDA,date,'07:00','V6','D8','Muhammad Iqbal');
      if(day%2===1){
        if(def.AG1ABR) add(def.AG1ABR,date,'08:00','V2','D2','Teuku Rizal');
        if(def.AG2LSW) add(def.AG2LSW,date,'22:00','V4','D4','Bang Hendra');
        if(def.AG4ABR) add(def.AG4ABR,date,'16:00','V6','D8','Muhammad Iqbal');
      }
    }
    if(sch){
      DB.save('schedules',schedules);
      const logs=DB.load('audit',[]);
      logs.unshift({id:uid('LOG'),time:nowIso,actor:'system',action:'seed_compare',detail:'Seed rute dan jadwal perbandingan 30 hari'});
      DB.save('audit',logs);
    }
    localStorage.setItem('at_seed_compare_v1','1');
  }catch(e){ console.warn('seed perbandingan gagal',e); }
})();
/* Variasi armada tambahan per agen. Migrasi terpisah agar browser yang sudah
   menjalankan seed perbandingan sebelumnya tetap mendapat armada baru. */
(function seedFleetVariationV1(){
  try{
    if(localStorage.getItem('at_seed_fleet_variation_v1')==='1') return;
    const demoRoutes=DB.load('routes',[]).filter(r=>String(r.id).startsWith('R-SEED-'));
    if(!demoRoutes.length){ localStorage.setItem('at_seed_fleet_variation_v1','1'); return; }
    const nowIso=new Date().toISOString();
    const mkVehicle=(o)=>({
      id:'',agencyId:'',brand:'',model:'',year:2023,color:'',plate:'',chassis:'',engine:'',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2028-01-01',kir:'-',condition:'Baik',capacity:6,photo:'',facilities:['AC'],status:'aktif',ownerName:'',ownerBiz:'',ownerNik:'',ownerAddr:'',ownerPhone:'',ownerEmail:'',ownership:'Milik perusahaan',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'',origin:'',dest:'',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat'],opSchedule:'',coopTariff:0,coopSys:'Bagi hasil',coopOther:'',fleetCount:1,hasDriver:'Ya',driverId:'',backDriverId:'',driverConflict:false,drvName:'',drvPhone:'',drvSim:'',drvSimExp:'',drvExp:'',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:'',inactiveSeats:[],layout:vehLayout({}),seatSeq:6,...o
    });
    const fleet=[
      mkVehicle({id:'V7',agencyId:'AG1',brand:'Toyota',model:'Fortuner',year:2023,color:'Hitam',plate:'BL 9900 MN',chassis:'MHFXW42G2P2007001',engine:'2GD2007001',vtype:'SUV',baggage:'Besar',stnkExp:'2028-02-10',kir:'Berlaku s.d. 2028',condition:'Sangat baik',photo:'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&q=80',facilities:['AC','USB Charger','Air Mineral','Reclining Seat'],ownerName:'H. Muhammad Nur',ownerBiz:'Barakah Travel',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',coopDriverId:'D7',mainRoute:'Calang — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',services:['Antar jemput alamat','Paket barang'],opSchedule:'16:00 setiap hari',coopTariff:150000,fleetCount:4,drvName:'Ilham Saputra',drvPhone:'0812000099',drvSim:'B1 - 1171031201970007',drvSimExp:'2029-01-01',drvExp:'5 tahun'}),
      mkVehicle({id:'V8',agencyId:'AG2',brand:'Toyota',model:'Hiace Commuter',year:2022,color:'Putih',plate:'BK 1122 XY',chassis:'JTFHX02P2N001008',engine:'1GD001008',vtype:'Van',baggage:'Besar',stnkExp:'2028-06-15',kir:'Berlaku s.d. 2028',condition:'Baik',photo:'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600&q=80',facilities:['AC','USB Charger','Reclining Seat','Snack'],ownerName:'Faisal',ownerBiz:'Putra Jaya Trans',ownerNik:'1171010101880002',ownerAddr:'Jl. T. Umar No.88, Banda Aceh',ownerPhone:'0812000010',ownerEmail:'agen@putrajaya.com',coopDriverId:'D5',mainRoute:'Banda Aceh — Medan',origin:'Banda Aceh',dest:'Medan',services:['Antar jemput alamat','Antar jemput terminal','Paket barang'],opSchedule:'05:00 setiap hari',coopTariff:320000,fleetCount:2,drvName:'Dedi Saputra',drvPhone:'0812000012',drvSim:'B1 - 1171021701950005',drvSimExp:'2028-01-01',drvExp:'6 tahun'}),
      mkVehicle({id:'V9',agencyId:'AG3',brand:'Mitsubishi',model:'Xpander',year:2023,color:'Silver',plate:'BK 4455 ZZ',chassis:'MKYXPN1S1PJ001009',engine:'4A91T001009',vtype:'MPV',baggage:'Sedang',stnkExp:'2028-09-20',kir:'Berlaku s.d. 2028',condition:'Sangat baik',photo:'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',facilities:['AC','USB Charger','Air Mineral','Reclining Seat'],ownerName:'Rizky',ownerBiz:'Lintas Utara',ownerNik:'1271010101900003',ownerAddr:'Jl. Gatot Subroto No.45, Medan',ownerPhone:'0812000020',ownerEmail:'agen@lintasutara.com',coopDriverId:'',mainRoute:'Banda Aceh — Medan',origin:'Banda Aceh',dest:'Medan',services:['Antar jemput alamat','Antar jemput terminal'],opSchedule:'07:00 setiap hari',coopTariff:350000,fleetCount:2,drvName:'Fajar Ramadhan',drvPhone:'0812000051',drvSim:'B1 - 1271011208940012',drvSimExp:'2028-01-01',drvExp:'4 tahun'}),
      mkVehicle({id:'V10',agencyId:'AG4',brand:'Daihatsu',model:'Terios',year:2022,color:'Merah',plate:'BL 7788 KL',chassis:'MHKA1BA1JN001010',engine:'2NR001010',vtype:'SUV',baggage:'Sedang',stnkExp:'2027-12-05',kir:'Berlaku s.d. 2027',condition:'Baik',photo:'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80',facilities:['AC','USB Charger','Air Mineral'],ownerName:'Nasir',ownerBiz:'Cahaya Perkasa',ownerNik:'1173010101900004',ownerAddr:'Jl. Diponegoro No.7, Meulaboh',ownerPhone:'0812000030',ownerEmail:'agen@cahaya.com',coopDriverId:'',mainRoute:'Meulaboh — Banda Aceh',origin:'Aceh Barat',dest:'Banda Aceh',services:['Antar jemput alamat','Paket barang'],opSchedule:'14:00 dua hari sekali',coopTariff:155000,fleetCount:2,drvName:'Zulkifli',drvPhone:'0812000052',drvSim:'A - 1173010709910013',drvSimExp:'2029-01-01',drvExp:'4 tahun'}),
    ];
    const vehicles=DB.load('vehicles',[]); let vch=false;
    fleet.forEach(v=>{ if(!vehicles.some(x=>x.id===v.id)){ vehicles.push(v); vch=true; } });
    if(vch) DB.save('vehicles',vehicles);

    const routes=DB.load('routes',[]); let rch=false;
    const routeFleet={
      'R-SEED-AG1-BNDA':['V7'],
      'R-SEED-AG2-MDN':['V8'],
      'R-SEED-AG3-MDN':['V9'],
      'R-SEED-AG4-BNDA':['V10'],
    };
    Object.entries(routeFleet).forEach(([rid,ids])=>{
      const r=routes.find(x=>x.id===rid); if(!r) return;
      const cur=Array.isArray(r.vehicleIds)?r.vehicleIds:[];
      const next=[...new Set([...cur,...ids])];
      if(next.length!==cur.length){ r.vehicleIds=next; rch=true; }
    });
    if(rch) DB.save('routes',routes);

    const schedules=DB.load('schedules',[]);
    const seen=new Set(schedules.map(s=>s.id));
    const routeMap=new Map(routes.map(r=>[r.id,r]));
    let sch=false;
    const add=(routeId,date,time,vehicleId,driverId,driverName)=>{
      const r=routeMap.get(routeId); if(!r) return;
      const agencyId=r.agencyId||(r.agencyIds||[])[0]; if(!agencyId) return;
      const price=Number((r.prices||{})[agencyId]??r.basePrice??0)||0;
      const id='S-SEED-FLEET-'+routeId.replace('R-SEED-','')+'-'+date.replace(/-/g,'')+'-'+time.replace(':','');
      if(seen.has(id)) return;
      if(schedules.some(s=>s.agencyId===agencyId&&s.routeId===routeId&&s.date===date&&s.time===time)) return;
      schedules.push({id,agencyId,routeId,date,time,vehicleId,driverId,driverName,price,status:'open',tripStatus:'scheduled',blockedSeats:[],createdAt:nowIso});
      seen.add(id); sch=true;
    };
    for(let day=1;day<=30;day++){
      const date=todayStr(day);
      add('R-SEED-AG1-BNDA',date,'16:00','V7','D7','Ilham Saputra');
      add('R-SEED-AG2-MDN',date,'05:00','V8','D5','Dedi Saputra');
      add('R-SEED-AG3-MDN',date,'07:00','V9','D12','Fajar Ramadhan');
      if(day%2===0) add('R-SEED-AG4-BNDA',date,'14:00','V10','D13','Zulkifli');
    }
    if(sch){
      DB.save('schedules',schedules);
      const logs=DB.load('audit',[]);
      logs.unshift({id:uid('LOG'),time:nowIso,actor:'system',action:'seed_fleet_variation',detail:'Seed variasi armada tambahan untuk 4 agen'});
      DB.save('audit',logs);
    }
    localStorage.setItem('at_seed_fleet_variation_v1','1');
  }catch(e){ console.warn('seed variasi armada gagal',e); }
})();
/* Pesaing di rute Aceh Jaya -> Banda Aceh. Migrasi terpisah agar data seed
   yang sudah ada tetap aman dan tidak digandakan saat halaman dimuat ulang. */
(function seedAcehJayaCompetitionV1(){
  try{
    if(localStorage.getItem('at_seed_ajy_competition_v1')==='1') return;
    const demoRoutes=DB.load('routes',[]).filter(r=>String(r.id).startsWith('R-SEED-'));
    if(!demoRoutes.length){ localStorage.setItem('at_seed_ajy_competition_v1','1'); return; }
    const nowIso=new Date().toISOString();
    const svgURI=s=>'data:image/svg+xml;utf8,'+encodeURIComponent(s);
    const avatar=(ini,c1,c2)=>svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='160' height='160' fill='url(#g)'/><text x='80' y='94' font-family='Arial,sans-serif' font-size='58' font-weight='bold' fill='#fff' text-anchor='middle'>${ini}</text></svg>`);
    const sim=(t,nm,num,exp)=>svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' rx='16' fill='#0b2447'/><rect x='16' y='16' width='288' height='168' rx='12' fill='none' stroke='#38bdf8' stroke-width='2'/><text x='28' y='52' font-family='Arial,sans-serif' font-size='22' font-weight='bold' fill='#7dd3fc'>SIM ${t} • DEMO</text><text x='28' y='92' font-family='Arial,sans-serif' font-size='17' font-weight='bold' fill='#fff'>${nm}</text><text x='28' y='118' font-family='Arial,sans-serif' font-size='14' fill='#cbd5e1'>${num}</text><text x='28' y='144' font-family='Arial,sans-serif' font-size='14' fill='#cbd5e1'>Berlaku s.d. ${exp}</text><text x='28' y='168' font-family='Arial,sans-serif' font-size='11' fill='#64748b'>Contoh seed — ganti dengan foto asli</text></svg>`);

    const users=DB.load('users',[]); let uch=false;
    const newUsers=[
      {id:'U-DR9',name:'Rizal Effendi',email:'rizal@putrajaya.com',phone:'0812000042',pass:'pengemudi123',role:'pengemudi',agencyId:'AG2',status:'active',profileStep:'done',photo:''},
      {id:'U-DR10',name:'Surya Batubara',email:'surya@lintasutara.com',phone:'0812000043',pass:'pengemudi123',role:'pengemudi',agencyId:'AG3',status:'active',profileStep:'done',photo:''},
      {id:'U-DR11',name:'Ahmad Fauzi',email:'ahmad@cahaya.com',phone:'0812000044',pass:'pengemudi123',role:'pengemudi',agencyId:'AG4',status:'active',profileStep:'done',photo:''},
    ];
    newUsers.forEach(u=>{
      if(!users.some(x=>x.id===u.id||String(x.email||'').toLowerCase()===u.email)){ users.push(u); uch=true; }
    });
    if(uch) DB.save('users',users);

    const drivers=DB.load('drivers',[]); let dch=false;
    const newDrivers=[
      {id:'D9',agencyId:'AG2',name:'Rizal Effendi',phone:'0812000042',simType:'B1',simExp:2029,simPhoto:sim('B1','Rizal Effendi','1171010502940009','2029'),ktpPhoto:'',photo:avatar('RE','#2563eb','#1e3a8a'),status:'aktif',rating:4.7,trips:0,userEmail:'rizal@putrajaya.com',birthPlace:'Banda Aceh',birthDate:'1994-02-05',gender:'Laki-laki',address:'Jl. T. Umar No.88, Banda Aceh',nik:'1171010502940009',marital:'Belum menikah',education:'SMA',emName:'Jamal',emPhone:'0813000042',emRelation:'Ayah',simNumber:'1171010502940009',bank:'BCA 8210099009 a.n. Rizal Effendi'},
      {id:'D10',agencyId:'AG3',name:'Surya Batubara',phone:'0812000043',simType:'B1',simExp:2028,simPhoto:sim('B1','Surya Batubara','1271011203930010','2028'),ktpPhoto:'',photo:avatar('SB','#0891b2','#164e63'),status:'aktif',rating:4.8,trips:0,userEmail:'surya@lintasutara.com',birthPlace:'Medan',birthDate:'1993-03-12',gender:'Laki-laki',address:'Jl. Gatot Subroto No.45, Medan',nik:'1271011203930010',marital:'Belum menikah',education:'SMA',emName:'Rosmaida',emPhone:'0813000043',emRelation:'Ibu',simNumber:'1271011203930010',bank:'Mandiri 8900010193010 a.n. Surya Batubara'},
      {id:'D11',agencyId:'AG4',name:'Ahmad Fauzi',phone:'0812000044',simType:'A',simExp:2029,simPhoto:sim('A','Ahmad Fauzi','1173011104950011','2029'),ktpPhoto:'',photo:avatar('AF','#f97316','#7c2d12'),status:'aktif',rating:4.6,trips:0,userEmail:'ahmad@cahaya.com',birthPlace:'Meulaboh',birthDate:'1995-04-11',gender:'Laki-laki',address:'Jl. Diponegoro No.7, Meulaboh',nik:'1173011104950011',marital:'Belum menikah',education:'SMA',emName:'Cut Nyak',emPhone:'0813000044',emRelation:'Ibu',simNumber:'1173011104950011',bank:'BRI 0022010195011 a.n. Ahmad Fauzi'},
    ];
    newDrivers.forEach(d=>{
      if(!drivers.some(x=>x.id===d.id)){ drivers.push(d); dch=true; }
    });
    if(dch) DB.save('drivers',drivers);

    const mkVehicle=(o)=>({
      id:'',agencyId:'',brand:'',model:'',year:2023,color:'',plate:'',chassis:'',engine:'',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2028-01-01',kir:'-',condition:'Baik',capacity:6,photo:'',facilities:['AC'],status:'aktif',ownerName:'',ownerBiz:'',ownerNik:'',ownerAddr:'',ownerPhone:'',ownerEmail:'',ownership:'Milik perusahaan',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'',origin:'',dest:'',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat'],opSchedule:'',coopTariff:0,coopSys:'Bagi hasil',coopOther:'',fleetCount:1,hasDriver:'Ya',driverId:'',backDriverId:'',driverConflict:false,drvName:'',drvPhone:'',drvSim:'',drvSimExp:'',drvExp:'',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:'',inactiveSeats:[],layout:vehLayout({}),seatSeq:6,...o
    });
    const newFleet=[
      mkVehicle({id:'V11',agencyId:'AG2',brand:'Toyota',model:'Innova Zenix',year:2023,color:'Hitam',plate:'BL 2468 QA',chassis:'MHFXW42G2P2011001',engine:'2GD2011001',vtype:'MPV',baggage:'Besar',stnkExp:'2028-04-12',kir:'Berlaku s.d. 2028',condition:'Sangat baik',photo:'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=80',facilities:['AC','USB Charger','Air Mineral','Reclining Seat','Snack'],ownerName:'Faisal',ownerBiz:'Putra Jaya Trans',ownerNik:'1171010101880002',ownerAddr:'Jl. T. Umar No.88, Banda Aceh',ownerPhone:'0812000010',ownerEmail:'agen@putrajaya.com',coopDriverId:'D9',mainRoute:'Aceh Jaya — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',services:['Antar jemput alamat','Antar jemput terminal','Paket barang'],opSchedule:'08:00 setiap hari',coopTariff:160000,fleetCount:3,drvName:'Rizal Effendi',drvPhone:'0812000042',drvSim:'B1 - 1171010502940009',drvSimExp:'2029-01-01',drvExp:'6 tahun'}),
      mkVehicle({id:'V12',agencyId:'AG3',brand:'Mitsubishi',model:'Pajero Sport',year:2023,color:'Putih',plate:'BK 3377 PS',chassis:'MKYXPN1S1PJ001012',engine:'4D56T001012',vtype:'SUV',baggage:'Besar',stnkExp:'2028-07-18',kir:'Berlaku s.d. 2028',condition:'Sangat baik',photo:'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&q=80',facilities:['AC','USB Charger','Air Mineral','Reclining Seat','WiFi'],ownerName:'Rizky',ownerBiz:'Lintas Utara',ownerNik:'1271010101900003',ownerAddr:'Jl. Gatot Subroto No.45, Medan',ownerPhone:'0812000020',ownerEmail:'agen@lintasutara.com',coopDriverId:'D10',mainRoute:'Aceh Jaya — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',services:['Antar jemput alamat','Antar jemput terminal'],opSchedule:'09:00 setiap hari',coopTariff:170000,fleetCount:3,drvName:'Surya Batubara',drvPhone:'0812000043',drvSim:'B1 - 1271011203930010',drvSimExp:'2028-01-01',drvExp:'7 tahun'}),
      mkVehicle({id:'V13',agencyId:'AG4',brand:'Honda',model:'BR-V',year:2022,color:'Silver',plate:'BL 5566 BR',chassis:'MHKA1BA1JN001013',engine:'2NR001013',vtype:'SUV',baggage:'Sedang',stnkExp:'2027-11-22',kir:'Berlaku s.d. 2027',condition:'Baik',photo:'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80',facilities:['AC','USB Charger','Air Mineral'],ownerName:'Nasir',ownerBiz:'Cahaya Perkasa',ownerNik:'1173010101900004',ownerAddr:'Jl. Diponegoro No.7, Meulaboh',ownerPhone:'0812000030',ownerEmail:'agen@cahaya.com',coopDriverId:'D11',mainRoute:'Aceh Jaya — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',services:['Antar jemput alamat','Paket barang'],opSchedule:'10:00 setiap hari',coopTariff:155000,fleetCount:3,drvName:'Ahmad Fauzi',drvPhone:'0812000044',drvSim:'A - 1173011104950011',drvSimExp:'2029-01-01',drvExp:'5 tahun'}),
    ];
    const vehicles=DB.load('vehicles',[]); let vch=false;
    newFleet.forEach(v=>{
      if(!vehicles.some(x=>x.id===v.id)){ vehicles.push(v); vch=true; }
    });
    if(vch) DB.save('vehicles',vehicles);

    const routes=DB.load('routes',[]); let rch=false;
    const routeDefs=[
      {id:'R-SEED-AG2-AJY-BNDA',agencyId:'AG2',price:160000,vehicleIds:['V11'],driverIds:['D9'],driverName:'Rizal Effendi'},
      {id:'R-SEED-AG3-AJY-BNDA',agencyId:'AG3',price:170000,vehicleIds:['V12'],driverIds:['D10'],driverName:'Surya Batubara'},
      {id:'R-SEED-AG4-AJY-BNDA',agencyId:'AG4',price:155000,vehicleIds:['V13'],driverIds:['D11'],driverName:'Ahmad Fauzi'},
    ];
    const routeByAgency={};
    const est=estimateRoute('Aceh Jaya','Banda Aceh')||{};
    routeDefs.forEach(def=>{
      let r=routes.find(x=>x.id===def.id);
      if(!r){
        r=routes.find(x=>x.from==='Aceh Jaya'&&x.to==='Banda Aceh'&&(x.agencyIds||(x.agencyId?[x.agencyId]:[])).includes(def.agencyId));
      }
      if(!r){
        r={id:def.id,from:'Aceh Jaya',to:'Banda Aceh',distance:est.distance||'-',duration:est.duration||'-',basePrice:def.price,prices:{[def.agencyId]:def.price},homePickup:true,pickups:['Terminal Aceh Jaya','Pelabuhan Calang'],vehicleIds:def.vehicleIds,active:true,agencyId:def.agencyId,agencyIds:[def.agencyId],driverId:def.driverIds[0]||null,driverIds:def.driverIds,suspensions:{}};
        routes.push(r); rch=true;
      } else {
        const curVehicles=Array.isArray(r.vehicleIds)?r.vehicleIds:[];
        const nextVehicles=[...new Set([...curVehicles,...def.vehicleIds])];
        const curDrivers=Array.isArray(r.driverIds)?r.driverIds:[];
        const nextDrivers=[...new Set([...curDrivers,...def.driverIds])];
        if(nextVehicles.length!==curVehicles.length){ r.vehicleIds=nextVehicles; rch=true; }
        if(nextDrivers.length!==curDrivers.length){ r.driverIds=nextDrivers; rch=true; }
        if(!r.driverId&&def.driverIds[0]){ r.driverId=def.driverIds[0]; rch=true; }
      }
      routeByAgency[def.agencyId]=r;
    });
    if(rch) DB.save('routes',routes);

    const schedules=DB.load('schedules',[]);
    const seen=new Set(schedules.map(s=>s.id));
    let sch=false;
    const add=(def,date,time)=>{
      const r=routeByAgency[def.agencyId]; if(!r) return;
      const price=Number((r.prices||{})[def.agencyId]??r.basePrice??def.price)||def.price;
      const id='S-SEED-AJY-'+def.agencyId+'-'+date.replace(/-/g,'')+'-'+time.replace(':','');
      if(seen.has(id)) return;
      if(schedules.some(s=>s.agencyId===def.agencyId&&s.routeId===r.id&&s.date===date&&s.time===time)) return;
      schedules.push({id,agencyId:def.agencyId,routeId:r.id,date,time,vehicleId:def.vehicleIds[0],driverId:def.driverIds[0],driverName:def.driverName,price,status:'open',tripStatus:'scheduled',blockedSeats:[],createdAt:nowIso});
      seen.add(id); sch=true;
    };
    const defByAgency=Object.fromEntries(routeDefs.map(d=>[d.agencyId,d]));
    for(let day=1;day<=30;day++){
      const date=todayStr(day);
      if(defByAgency.AG2) add(defByAgency.AG2,date,'08:00');
      if(defByAgency.AG3) add(defByAgency.AG3,date,'09:00');
      if(defByAgency.AG4) add(defByAgency.AG4,date,'10:00');
    }
    if(sch){
      DB.save('schedules',schedules);
      const logs=DB.load('audit',[]);
      logs.unshift({id:uid('LOG'),time:nowIso,actor:'system',action:'seed_aceh_jaya_competition',detail:'Seed 3 agen pesaing di rute Aceh Jaya - Banda Aceh'});
      DB.save('audit',logs);
    }
    localStorage.setItem('at_seed_ajy_competition_v1','1');
  }catch(e){ console.warn('seed pesaing Aceh Jaya gagal',e); }
})();
/* Migrasi identitas pengemudi: satu orang hanya boleh terpasang di satu armada.
   Data seed yang bentrok diperbaiki; data lain yang masih bentrok ditandai
   driverConflict agar tidak bisa dipakai membuat jadwal sampai diperbaiki. */
(function migrateDriverIdentityV1(){
  try{
    if(localStorage.getItem('at_driver_identity_v1')==='1') return;
    const norm=(v)=>String(v==null?'':v).replace(/\D/g,'');
    const nowIso=new Date().toISOString();

    const driverAdditions=[
      {id:'D12',agencyId:'AG3',name:'Fajar Ramadhan',phone:'0812000051',simType:'B1',simExp:2028,simPhoto:'',ktpPhoto:'',photo:'',status:'aktif',rating:4.6,trips:0,userEmail:'fajar@lintasutara.com',birthPlace:'Medan',birthDate:'1994-08-12',gender:'Laki-laki',address:'Jl. Gatot Subroto No.45, Medan',nik:'1271011208940012',marital:'Belum menikah',education:'SMA',emName:'Siti',emPhone:'0813000062',emRelation:'Ibu',simNumber:'1271011208940012',bank:'BRI 0022010194012 a.n. Fajar Ramadhan'},
      {id:'D13',agencyId:'AG4',name:'Zulkifli',phone:'0812000052',simType:'A',simExp:2029,simPhoto:'',ktpPhoto:'',photo:'',status:'aktif',rating:4.7,trips:0,userEmail:'zulkifli@cahaya.com',birthPlace:'Meulaboh',birthDate:'1991-09-07',gender:'Laki-laki',address:'Jl. Diponegoro No.7, Meulaboh',nik:'1173010709910013',marital:'Menikah',education:'SMA',emName:'Nur Aini',emPhone:'0813000063',emRelation:'Istri',simNumber:'1173010709910013',bank:'BRI 0022010199013 a.n. Zulkifli'},
      {id:'D14',agencyId:'AG1',name:'Samsul Bahri',phone:'0812000053',simType:'B1',simExp:2029,simPhoto:'',ktpPhoto:'',photo:'',status:'aktif',rating:4.6,trips:0,userEmail:'samsul@barakah.com',birthPlace:'Calang',birthDate:'1993-07-18',gender:'Laki-laki',address:'Jl. Merdeka No.30, Calang',nik:'1173021807930014',marital:'Belum menikah',education:'SMA',emName:'Hasan',emPhone:'0813000064',emRelation:'Saudara',simNumber:'1173021807930014',bank:'BCA 8210099014 a.n. Samsul Bahri'},
    ];
    const drivers=DB.load('drivers',[]);
    let dch=false;
    driverAdditions.forEach(d=>{ if(!drivers.some(x=>x.id===d.id)){ drivers.push(d); dch=true; } });
    if(dch) DB.save('drivers',drivers);

    const users=DB.load('users',[]);
    let uch=false;
    [
      {id:'U-DR12',name:'Fajar Ramadhan',email:'fajar@lintasutara.com',phone:'0812000051',pass:'pengemudi123',role:'pengemudi',agencyId:'AG3',status:'active',profileStep:'done',photo:''},
      {id:'U-DR13',name:'Zulkifli',email:'zulkifli@cahaya.com',phone:'0812000052',pass:'pengemudi123',role:'pengemudi',agencyId:'AG4',status:'active',profileStep:'done',photo:''},
      {id:'U-DR14',name:'Samsul Bahri',email:'samsul@barakah.com',phone:'0812000053',pass:'pengemudi123',role:'pengemudi',agencyId:'AG1',status:'active',profileStep:'done',photo:''},
    ].forEach(u=>{
      if(!users.some(x=>x.id===u.id||String(x.email||'').toLowerCase()===u.email)){ users.push(u); uch=true; }
    });
    if(uch) DB.save('users',users);

    const byId=new Map(drivers.map(d=>[d.id,d]));
    const driverKey=(d)=>{
      if(!d) return '';
      const nik=norm(d.nik); if(nik.length===16) return 'nik:'+nik;
      const sim=norm(d.simNumber); if(sim.length>=6) return 'sim:'+sim;
      const phone=norm(d.phone); if(phone.length>=9) return 'phone:'+phone;
      return 'id:'+d.id;
    };
    const simText=(d)=>[d.simType,d.simNumber].filter(Boolean).join(' - ');
    const simExpText=(d)=>d.simExp?String(d.simExp).slice(0,4)+'-01-01':'';
    const applyMain=(v,d)=>{
      v.driverId=d.id; v.drvName=d.name; v.drvPhone=d.phone||''; v.drvSim=simText(d); v.drvSimExp=simExpText(d);
      v.hasDriver='Ya'; v.driverConflict=false;
    };
    const applyBack=(v,d)=>{
      v.backDriverId=d.id; v.backName=d.name; v.backPhone=d.phone||''; v.backSim=simText(d); v.backSimExp=simExpText(d);
      v.hasBackup='Ya';
    };
    const clearBack=(v)=>{
      v.hasBackup='Tidak'; v.backDriverId=''; v.backName=''; v.backPhone=''; v.backSim=''; v.backSimExp='';
    };
    const snapshotDriver=(agencyId,snap={})=>{
      const list=drivers.filter(d=>d.agencyId===agencyId);
      const phone=norm(snap.phone), sim=norm(snap.sim);
      if(phone.length>=9){ const hit=list.find(d=>norm(d.phone)===phone); if(hit) return hit; }
      if(sim.length>=6){ const hit=list.find(d=>norm(d.simNumber)===sim); if(hit) return hit; }
      return null;
    };

    const known={
      V1:{agencyId:'AG1',driverId:'D1',clearBackup:true},
      V2:{agencyId:'AG1',driverId:'D2'},
      V3:{agencyId:'AG1',driverId:'D14'},
      V4:{agencyId:'AG2',driverId:'D4',clearBackup:true},
      V5:{agencyId:'AG3',driverId:'D6'},
      V6:{agencyId:'AG4',driverId:'D8'},
      V7:{agencyId:'AG1',driverId:'D7'},
      V8:{agencyId:'AG2',driverId:'D5'},
      V9:{agencyId:'AG3',driverId:'D12'},
      V10:{agencyId:'AG4',driverId:'D13'},
      V11:{agencyId:'AG2',driverId:'D9'},
      V12:{agencyId:'AG3',driverId:'D10'},
      V13:{agencyId:'AG4',driverId:'D11'},
    };
    const vehicles=DB.load('vehicles',[]);
    let vch=false;
    vehicles.forEach(v=>{
      const rule=known[v.id];
      if(rule && (!v.agencyId || v.agencyId===rule.agencyId)){
        const d=byId.get(rule.driverId);
        if(d && (v.driverId!==d.id||v.drvName!==d.name||norm(v.drvPhone)!==norm(d.phone))){ applyMain(v,d); vch=true; }
        if(rule.clearBackup && (v.hasBackup!=='Tidak'||v.backDriverId||v.backName)){ clearBack(v); vch=true; }
      } else {
        let d=v.driverId?byId.get(v.driverId):null;
        if(!d) d=snapshotDriver(v.agencyId,{name:v.drvName,phone:v.drvPhone,sim:v.drvSim});
        if(d && v.driverId!==d.id){ applyMain(v,d); vch=true; }
        if(v.hasBackup==='Ya'||v.backDriverId||v.backName){
          let b=v.backDriverId?byId.get(v.backDriverId):null;
          if(!b) b=snapshotDriver(v.agencyId,{name:v.backName,phone:v.backPhone,sim:v.backSim});
          if(b && v.backDriverId!==b.id){ applyBack(v,b); vch=true; }
          else if(!b){ clearBack(v); vch=true; }
        }
      }
      if(v.ownership!=='Milik Pengemudi' && v.coopDriverId){ v.coopDriverId=''; vch=true; }
      if(v.driverConflict){ v.driverConflict=false; vch=true; }
    });

    const mainByKey=new Map();
    vehicles.forEach(v=>{
      const d=v.driverId?byId.get(v.driverId):null;
      if(!d) return;
      const key=driverKey(d);
      const arr=mainByKey.get(key)||[]; arr.push(v); mainByKey.set(key,arr);
    });
    mainByKey.forEach(arr=>{
      if(arr.length<2) return;
      arr.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      arr.slice(1).forEach(v=>{ v.driverConflict=true; vch=true; });
    });
    const backupSeen=new Map();
    vehicles.forEach(v=>{
      if(!v.backDriverId) return;
      const b=byId.get(v.backDriverId);
      if(!b){ clearBack(v); vch=true; return; }
      const key=driverKey(b);
      const main=mainByKey.get(key)||[];
      if(main.some(x=>x.id!==v.id) || (v.driverId&&driverKey(byId.get(v.driverId))===key)){ clearBack(v); vch=true; return; }
      const arr=backupSeen.get(key)||[]; arr.push(v); backupSeen.set(key,arr);
    });
    backupSeen.forEach(arr=>{
      if(arr.length<2) return;
      arr.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      arr.slice(1).forEach(v=>{ clearBack(v); vch=true; });
    });

    const schedules=DB.load('schedules',[]);
    const vById=new Map(vehicles.map(v=>[v.id,v]));
    const today=todayStr(0);
    let sch=false;
    schedules.forEach(s=>{
      if(!s.vehicleId||String(s.date||'')<today) return;
      const v=vById.get(s.vehicleId); if(!v||v.driverConflict) return;
      const d=v.driverId?byId.get(v.driverId):null; if(!d) return;
      if(s.driverId!==d.id){ s.driverId=d.id; sch=true; }
      if(s.driverName!==d.name){ s.driverName=d.name; sch=true; }
      const b=v.backDriverId?byId.get(v.backDriverId):null;
      const bid=b?b.id:null, bname=b?b.name:'';
      if((s.backupDriverId||null)!==bid){ s.backupDriverId=bid; sch=true; }
      if((s.backupName||'')!==bname){ s.backupName=bname; sch=true; }
    });

    if(vch) DB.save('vehicles',vehicles);
    if(sch) DB.save('schedules',schedules);
    localStorage.setItem('at_driver_identity_v1','1');
    if(vch||sch){
      const logs=DB.load('audit',[]);
      logs.unshift({id:uid('LOG'),time:nowIso,actor:'system',action:'migrate_driver_identity_v1',detail:'Satu pengemudi satu armada; data seed bentrok diperbaiki'});
      DB.save('audit',logs);
    }
  }catch(e){ console.warn('migrasi identitas pengemudi gagal',e); }
})();
}
