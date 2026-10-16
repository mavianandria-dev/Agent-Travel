import { DB } from './db.js';
import { uid, todayStr } from './utils.js';
import { simParse, vehLayout, bookingsOf } from './domain.js';

/* Diekstrak dari index.html (seed v11 + migrasi). Dijalankan sekali via initDB(). */
export function initDB(){
  if(!localStorage.getItem('at_seeded_v14')){
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
    {id:'U-AG4',name:'Nasir (Cahaya)',email:'agen@cahaya.com',phone:'0812000030',pass:'agen123',role:'agen',agencyId:'AG4',status:'pending',photo:''},
    {id:'U-CS1',name:'Pelanggan Demo',email:'user@demo.com',phone:'0813000001',pass:'user123',role:'pelanggan',agencyId:null,status:'active',photo:'',favorites:[{name:'Ayah',phone:'0813000002'}]},
  ];
  const agencies=[
    {id:'AG1',name:'Barakah Travel',logo:'',address:'Jl. Merdeka No.12, Calang, Aceh Jaya',phone:'0654-20112',bank:'BCA 8210-9921-11 a.n. Barakah Travel',status:'active',feeType:'percent',feeValue:8,refundPolicy:[{minH:72,pct:100},{minH:24,pct:50},{minH:0,pct:0}],rating:4.8,trips:1240},
    {id:'AG2',name:'Putra Jaya Trans',logo:'',address:'Jl. T. Umar No.88, Banda Aceh',phone:'0651-77821',bank:'Mandiri 8900-1122-33 a.n. Putra Jaya',status:'active',feeType:'flat',feeValue:5000,refundPolicy:[{minH:48,pct:100},{minH:0,pct:0}],rating:4.6,trips:860},
    {id:'AG3',name:'Lintas Utara',logo:'',address:'Jl. Gatot Subroto No.45, Medan',phone:'061-778899',bank:'BRI 0022-3344-55 a.n. Lintas Utara',status:'active',feeType:'percent',feeValue:10,refundPolicy:[{minH:72,pct:100},{minH:24,pct:50},{minH:0,pct:0}],rating:4.7,trips:310},
    {id:'AG4',name:'Cahaya Perkasa',logo:'',address:'Jl. Diponegoro No.7, Aceh Barat',phone:'0655-31212',bank:'-',status:'pending',feeType:'percent',feeValue:8,refundPolicy:[{minH:72,pct:100},{minH:24,pct:50},{minH:0,pct:0}],rating:5.0,trips:0},
  ];
  const routes=[
    {id:'R1',from:'Aceh Jaya',to:'Banda Aceh',distance:'±185 km',duration:'±5 jam',basePrice:150000,prices:{AG1:150000,AG2:170000},serviceFee:10000,pickups:['Terminal Aceh Jaya','Simpang Calang','Lamno','Lhok Kruet','Lhoknga','Terminal Batoh B. Aceh'],active:true,agencyId:'AG1',agencyIds:['AG1','AG2'],driverId:'D1',driverIds:['D1','D2','D4']},
    {id:'R2',from:'Banda Aceh',to:'Aceh Jaya',distance:'±185 km',duration:'±5 jam',basePrice:150000,prices:{AG1:150000,AG2:165000},serviceFee:10000,pickups:['Terminal Batoh','Lhoknga','Lhok Kruet','Lamno','Simpang Calang','Terminal Aceh Jaya'],active:true,agencyId:'AG1',agencyIds:['AG1','AG2'],driverId:'D2',driverIds:['D1','D2','D5']},
    {id:'R3',from:'Aceh Jaya',to:'Aceh Barat',distance:'±75 km',duration:'±2 jam',basePrice:80000,prices:{AG1:80000},serviceFee:5000,pickups:['Terminal Aceh Jaya','Krueng Sabee','Teunom','Terminal Aceh Barat'],active:true,agencyId:'AG1',agencyIds:['AG1'],driverId:'D1',driverIds:['D1','D2']},
    {id:'R4',from:'Banda Aceh',to:'Medan',distance:'±600 km',duration:'±12 jam',basePrice:320000,prices:{AG1:320000,AG2:335000,AG3:310000},serviceFee:15000,pickups:['Terminal Batoh','Sigli','Bireuen','Lhokseumawe','Terminal Amplas Medan'],active:true,agencyId:'AG1',agencyIds:['AG1','AG2','AG3'],driverId:'D1',driverIds:['D1','D4','D6']},
  ];
  const vehicles=[
    {id:'V1',agencyId:'AG1',brand:'Toyota',model:'Innova Reborn',year:2022,color:'Hitam',plate:'BL 1234 AA',chassis:'MHFXW41G2N2001001',engine:'2GD2001001',vtype:'MPV',vtypeOther:'',baggage:'Besar',tax:'Aktif',stnkExp:'2027-03-10',kir:'Berlaku s.d. 2027',condition:'Sangat baik',capacity:6,photo:'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=80',facilities:['AC','USB Charger','Air Mineral','Bantal'],status:'aktif',ownerName:'H. Muhammad Nur',ownerBiz:'Barakah Travel',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',ownership:'Milik perusahaan',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Calang — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Paket barang'],opSchedule:'07:00 & 14:00 setiap hari',coopTariff:150000,coopSys:'Bagi hasil',coopOther:'',fleetCount:3,hasDriver:'Ya',drvName:'Bang Jamil',drvPhone:'0812000002',drvSim:'A - 1173011203850001',drvSimExp:'2030-05-01',drvExp:'12 tahun lintas Aceh',hasBackup:'Ya',backName:'Ilham Saputra',backPhone:'0812000099',backSim:'B1 - 1171031201970007',backSimExp:'2029-01-01'},
    {id:'V2',agencyId:'AG1',brand:'Daihatsu',model:'Xenia',year:2021,color:'Silver',plate:'BL 5678 BB',chassis:'MHKV1AA2JK2001002',engine:'1NR2001002',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2026-11-20',kir:'-',condition:'Baik',capacity:6,photo:'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80',facilities:['AC','Musik','Air Mineral'],status:'aktif',ownerName:'H. Muhammad Nur',ownerBiz:'',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',ownership:'Milik pribadi',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Calang — Banda Aceh',origin:'Aceh Jaya',dest:'Banda Aceh',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat'],opSchedule:'14:00 setiap hari',coopTariff:140000,coopSys:'Tarif tetap',coopOther:'',fleetCount:3,hasDriver:'Ya',drvName:'Teuku Rizal',drvPhone:'0812000003',drvSim:'A - 1173021507900002',drvSimExp:'2027-06-01',drvExp:'6 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
    {id:'V3',agencyId:'AG1',brand:'Toyota',model:'Hiace',year:2020,color:'Putih',plate:'BL 9012 CC',chassis:'JTFHX02P2L001003',engine:'1GD001003',vtype:'Minibus',vtypeOther:'',baggage:'Besar',tax:'Belum aktif',stnkExp:'2026-02-15',kir:'Perlu perpanjangan',condition:'Perlu perbaikan',capacity:6,photo:'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600&q=80',facilities:['AC','Reclining Seat','Snack'],status:'maintenance',ownerName:'H. Muhammad Nur',ownerBiz:'Barakah Travel',ownerNik:'1173010101800001',ownerAddr:'Jl. Merdeka No.12, Calang',ownerPhone:'0812000001',ownerEmail:'agen@barakah.com',ownership:'Sewa / leasing',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'Leasing Mandiri',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Calang — Meulaboh',origin:'Aceh Jaya',dest:'Aceh Barat',freq:'Beberapa kali seminggu',freqOther:'',services:['Carter / sewa'],opSchedule:'Sesuai permintaan',coopTariff:400000,coopSys:'Sewa armada',coopOther:'',fleetCount:3,hasDriver:'Ya',drvName:'Teuku Rizal',drvPhone:'0812000003',drvSim:'A - 1173021507900002',drvSimExp:'2027-06-01',drvExp:'6 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
    {id:'V4',agencyId:'AG2',brand:'Suzuki',model:'Ertiga',year:2021,color:'Merah',plate:'BL 3344 DD',chassis:'MHYNC22S1MJ100004',engine:'K15B100004',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'2027-01-05',kir:'-',condition:'Baik',capacity:6,photo:'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&q=80',facilities:['AC','Air Mineral'],status:'aktif',ownerName:'',ownerBiz:'',ownerNik:'1171010101850002',ownerAddr:'Jl. T. Umar No.88, Banda Aceh',ownerPhone:'0812000010',ownerEmail:'agen@putrajaya.com',ownership:'Milik Pengemudi',coopDriverId:'D4',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Banda Aceh — Medan',origin:'Banda Aceh',dest:'Medan',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Antar jemput terminal'],opSchedule:'10:00 & 20:00',coopTariff:320000,coopSys:'Bagi hasil',coopOther:'',fleetCount:2,hasDriver:'Ya',drvName:'Bang Hendra',drvPhone:'0812000011',drvSim:'A - 1171012204880004',drvSimExp:'2026-08-01',drvExp:'9 tahun',hasBackup:'Ya',backName:'Dedi Saputra',backPhone:'0812000012',backSim:'B1 - 1171021701950005',backSimExp:'2028-01-01'},
    {id:'V5',agencyId:'AG3',brand:'Toyota',model:'Hiace Premio',year:2023,color:'Hitam',plate:'BK 7788 EE',chassis:'JTFHX02P5P001005',engine:'1GD001005',vtype:'Van',vtypeOther:'',baggage:'Besar',tax:'Aktif',stnkExp:'2028-05-12',kir:'Berlaku s.d. 2028',condition:'Sangat baik',capacity:6,photo:'https://images.unsplash.com/photo-1464219789935-c2d9d9aba644?w=600&q=80',facilities:['AC','Reclining Seat','Snack','WiFi'],status:'aktif',ownerName:'Rizky',ownerBiz:'Lintas Utara',ownerNik:'1271010101900003',ownerAddr:'Jl. Gatot Subroto No.45, Medan',ownerPhone:'0812000020',ownerEmail:'agen@lintasutara.com',ownership:'Milik perusahaan',coopDriverId:'',hasEmail:'Ya',docs:['STNK','KTP pemilik'],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'Banda Aceh — Medan',origin:'Banda Aceh',dest:'Medan',freq:'Setiap hari',freqOther:'',services:['Antar jemput alamat','Antar jemput terminal','Paket barang'],opSchedule:'19:00 setiap hari',coopTariff:350000,coopSys:'Tarif tetap',coopOther:'',fleetCount:2,hasDriver:'Ya',drvName:'Agus Medan',drvPhone:'0812000021',drvSim:'B1 - 1271010505920006',drvSimExp:'2027-04-01',drvExp:'7 tahun',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''},
  ];
  const drivers=[
    {id:'D1',agencyId:'AG1',name:'Bang Jamil',phone:'0812000002',simType:'A',simExp:2030,simPhoto:seedSim('A','Bang Jamil','1173011203850001','2030'),ktpPhoto:'',selfie:'',photo:seedAvatar('BJ','#0ea5e9','#1e3a8a'),status:'aktif',rating:4.9,trips:320,userEmail:'pengemudi@barakah.com',birthPlace:'Calang',birthDate:'1985-03-12',gender:'Laki-laki',address:'Jl. Merdeka No.12, Calang',nik:'1173011203850001',marital:'Menikah',education:'SMA',emName:'Cut Aminah',emPhone:'0813000011',emRelation:'Istri',simNumber:'1173011203850001',bank:'BCA 8210099001 a.n. Bang Jamil'},
    {id:'D2',agencyId:'AG1',name:'Teuku Rizal',phone:'0812000003',simType:'A',simExp:2027,simPhoto:seedSim('A','Teuku Rizal','1173021507900002','2027'),ktpPhoto:'',selfie:'',photo:seedAvatar('TR','#10b981','#065f46'),status:'aktif',rating:4.7,trips:180,userEmail:'teuku.rizal@barakah.com',birthPlace:'Banda Aceh',birthDate:'1990-07-15',gender:'Laki-laki',address:'Jl. T. Umar No.10, Banda Aceh',nik:'1173021507900002',marital:'Belum menikah',education:'SMK',emName:'Teuku Ahmad',emPhone:'0813000022',emRelation:'Saudara',simNumber:'1173021507900002',bank:'BRI 0022010190002 a.n. Teuku Rizal'},
    {id:'D3',agencyId:'AG1',name:'Pak Umar',phone:'0812000004',simType:'B1',simExp:2026,simPhoto:seedSim('B1','Pak Umar','1173031011750003','2026'),ktpPhoto:'',selfie:'',photo:seedAvatar('PU','#f59e0b','#92400e'),status:'nonaktif',rating:4.5,trips:410,userEmail:'pak.umar@barakah.com',birthPlace:'Meulaboh',birthDate:'1975-11-10',gender:'Laki-laki',address:'Jl. Nasional No.5, Meulaboh',nik:'1173031011750003',marital:'Menikah',education:'SMP',emName:'Roslina',emPhone:'0813000033',emRelation:'Istri',simNumber:'1173031011750003',bank:'Mandiri 8900010175003 a.n. Pak Umar'},
    {id:'D4',agencyId:'AG2',name:'Bang Hendra',phone:'0812000011',simType:'A',simExp:2026,simPhoto:seedSim('A','Bang Hendra','1171012204880004','2026'),ktpPhoto:'',selfie:'',photo:seedAvatar('BH','#8b5cf6','#4c1d95'),status:'aktif',rating:4.8,trips:210,userEmail:'pengemudi@putrajaya.com',birthPlace:'Banda Aceh',birthDate:'1988-04-22',gender:'Laki-laki',address:'Jl. T. Umar No.88, Banda Aceh',nik:'1171012204880004',marital:'Menikah',education:'SMA',emName:'Dewi',emPhone:'0813000044',emRelation:'Istri',simNumber:'1171012204880004',bank:'BCA 8210099004 a.n. Bang Hendra'},
    {id:'D5',agencyId:'AG2',name:'Dedi Saputra',phone:'0812000012',simType:'B1',simExp:2028,simPhoto:seedSim('B1','Dedi Saputra','1171021701950005','2028'),ktpPhoto:'',selfie:'',photo:seedAvatar('DS','#ef4444','#7f1d1d'),status:'aktif',rating:4.6,trips:95,userEmail:'dedi@putrajaya.com',birthPlace:'Lhokseumawe',birthDate:'1995-01-17',gender:'Laki-laki',address:'Jl. Merdeka No.20, Lhokseumawe',nik:'1171021701950005',marital:'Belum menikah',education:'SMA',emName:'Jamal',emPhone:'0813000055',emRelation:'Ayah',simNumber:'1171021701950005',bank:'BRI 0022010195005 a.n. Dedi Saputra'},
    {id:'D6',agencyId:'AG3',name:'Agus Medan',phone:'0812000021',simType:'B1',simExp:2027,simPhoto:seedSim('B1','Agus Medan','1271010505920006','2027'),ktpPhoto:'',selfie:'',photo:seedAvatar('AM','#06b6d4','#155e75'),status:'aktif',rating:4.7,trips:140,userEmail:'agus@lintasutara.com',birthPlace:'Medan',birthDate:'1992-05-05',gender:'Laki-laki',address:'Jl. Gatot Subroto No.45, Medan',nik:'1271010505920006',marital:'Belum menikah',education:'SMK',emName:'Siti',emPhone:'0813000066',emRelation:'Ibu',simNumber:'1271010505920006',bank:'Mandiri 8900010159006 a.n. Agus Medan'},
    {id:'D7',agencyId:'AG1',name:'Ilham Saputra',phone:'0812000099',simType:'B1',simExp:2029,simPhoto:seedSim('B1','Ilham Saputra','1171031201970007','2029'),ktpPhoto:'',selfie:'',photo:seedAvatar('IS','#14b8a6','#134e4a'),status:'aktif',rating:5.0,trips:0,userEmail:'pengemudibaru@mail.com',birthPlace:'Calang',birthDate:'1997-01-12',gender:'Laki-laki',address:'Jl. Merdeka No.30, Calang',nik:'1171031201970007',marital:'Belum menikah',education:'SMA',emName:'Hasan',emPhone:'0813000077',emRelation:'Saudara',simNumber:'1171031201970007',bank:'BCA 8210099007 a.n. Ilham Saputra'},
  ];
  const schedules=[];
  let n=0;
  for(let d=0; d<7; d++){
    const date=todayStr(d);
    const isWknd=[0,6].includes(new Date(date).getDay());
    [['R1','07:00','V1','D1','AG1'],['R1','14:00','V2','D2','AG1'],['R2','08:00','V1','D1','AG1'],['R2','16:00','V2','D2','AG1'],['R3','09:00','V2','D2','AG1'],['R1','10:00','V4','D4','AG2'],['R4','20:00','V4','D5','AG2'],['R4','19:00','V5','D6','AG3']].forEach((s,i)=>{
      const r=routes.find(x=>x.id===s[0]);
      let price=r.basePrice+(isWknd?25000:0);
      n++;
      schedules.push({id:'S'+(100+n),agencyId:s[4],routeId:s[0],date,time:s[1],vehicleId:s[2],driverId:s[3],price,status:'open',tripStatus:'scheduled',blockedSeats:[],createdAt:new Date().toISOString()});
    });
  }
  // pre-book some seats so layout looks alive
  const bookings=[
    {id:'BK-DEMO1',code:'TA-8X2KQA',scheduleId:schedules[0].id,userEmail:'budi@mail.com',passengers:[{name:'Budi Santoso',phone:'0821000111',seat:'A2',pickup:'Terminal Aceh Jaya'}],seats:['A2'],total:150000,discount:0,status:'paid',payMethod:'QRIS',createdAt:new Date(Date.now()-36e5).toISOString(),paidAt:new Date(Date.now()-35e5).toISOString(),refundPct:0,holdExpiry:null,rating:null},
  ];
  DB.save('users',users); DB.save('agencies',agencies); DB.save('routes',routes);
  DB.save('vehicles',vehicles); DB.save('drivers',drivers); DB.save('schedules',schedules);
  DB.save('bookings',bookings); DB.save('payments',[{id:uid('PAY'),bookingId:'BK-DEMO1',amount:150000,method:'QRIS',status:'paid',time:new Date().toISOString(),fee:12000}]);
  DB.save('vouchers',[{code:'HEMAT20',type:'percent',value:20,maxDisc:30000,quota:100,used:12,active:true,desc:'Diskon 20% maks Rp30rb'},{code:'CALANG50',type:'flat',value:15000,quota:50,used:5,active:true,desc:'Potongan Rp15rb rute Aceh Jaya'}]);
  DB.save('reviews',[{id:uid('RV'),agencyId:'AG1',user:'Rina Amelia',rating:5,text:'Pengemudi ramah, armada bersih dan tepat waktu. Recommended!',date:todayStr(-2),trip:'Aceh Jaya → Banda Aceh'}]);
  DB.save('notifications',[{id:uid('NTF'),to:'user@demo.com',title:'Selamat datang di TransAceh',msg:'Gunakan kode HEMAT20 untuk diskon 20% perjalanan pertama.',ch:'app',time:new Date().toISOString(),read:false}]);
  DB.save('fees',{defaultType:'percent',defaultValue:8});
  DB.save('audit',[{id:uid('LOG'),time:new Date().toISOString(),actor:'system',action:'seed',detail:'Database awal dibuat'}]);
  DB.save('banners',[{id:'B1',title:'Diskon 20% Rute Aceh Jaya – Banda Aceh',sub:'Kode: HEMAT20 • s.d. akhir bulan',active:true}]);
  DB.save('waiting',[]);
  DB.save('routeRequests',[{id:'RQ-DEMO1',agencyId:'AG2',type:'rute-baru',from:'Medan',to:'Banda Aceh',pickup:'',note:'Permintaan rutin penumpang carter',price:300000,status:'pending',adminNote:'',createdAt:new Date().toISOString(),decidedAt:null}]);
  localStorage.setItem('at_seeded_v14','1');
  }
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
      if(!('selfie' in d)){ d.selfie=''; ch=true; }
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
      const defV={model:'',color:'',chassis:'',engine:'',vtype:'MPV',vtypeOther:'',baggage:'Sedang',tax:'Aktif',stnkExp:'',kir:'',condition:'Baik',ownerName:'',ownerBiz:'',ownerNik:'',ownerAddr:'',ownerPhone:'',ownerEmail:'',ownership:'Milik pribadi',coopDriverId:'',hasEmail:'',docs:[],docOther:'',stnkPhoto:'',ktpOwnerPhoto:'',mainRoute:'',origin:'',dest:'',freq:'Setiap hari',freqOther:'',services:[],opSchedule:'',coopTariff:0,coopSys:'Bagi hasil',coopOther:'',fleetCount:1,hasDriver:'Ya',drvName:'',drvPhone:'',drvSim:'',drvSimExp:'',drvExp:'',hasBackup:'Tidak',backName:'',backPhone:'',backSim:'',backSimExp:''};
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
}
