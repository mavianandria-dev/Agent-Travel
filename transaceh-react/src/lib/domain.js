import { DB } from './db.js';
import { uid, todayStr, SIM_TYPES } from './utils.js';
import { estimateRoute } from './geo.js';
export { uid, todayStr };

/* Diekstrak dari index.html — pure domain logic, tanpa DOM. */

export function simParse(d){ const cur=new Date().getFullYear();
  if(d&&(d.simType||d.simExp)) return {type:(typeof d.simType==='string'&&d.simType.trim())?d.simType.trim():'A',exp:Number(d.simExp)||cur+5};
  const m=d&&d.sim?/SIM\s*([A-Z0-9]+)\s*•\s*(?:(\d{4})\s*-)?(\d{4})/.exec(d.sim):null;
  return {type:m&&SIM_TYPES.includes(m[1])?m[1]:'A',exp:m?Number(m[3]):cur+5};
}

export function simLabel(d){ const s=simParse(d); return 'SIM '+s.type+' • s.d. '+s.exp; }

export function simExpired(d){ return simParse(d).exp<new Date().getFullYear(); }

export function currentUser(){ const s=DB.load('session',null); if(!s) return null; return DB.load('users',[]).find(u=>u.id===s.uid)||null; }

export function setSession(u){ if(u) DB.save('session',{uid:u.id}); else localStorage.removeItem('at_session'); }

export function agencyOf(u){ if(!u) return null; return DB.load('agencies',[]).find(a=>a.id===u.agencyId); }

export function routeById(id){ return DB.load('routes',[]).find(r=>r.id===id); }

export function vehicleById(id){ return DB.load('vehicles',[]).find(v=>v.id===id); }

export function vehName(v){ return v?(((v.brand||'')+(v.model?' '+v.model:'')).trim()||'Armada'):''; }

export function driverById(id){ return DB.load('drivers',[]).find(d=>d.id===id); }

export function schedById(id){ return DB.load('schedules',[]).find(s=>s.id===id); }

export function agencyById(id){ return DB.load('agencies',[]).find(a=>a.id===id); }

export function bookingsOf(schedId){ return DB.load('bookings',[]).filter(b=>b.scheduleId===schedId && b.status!=='cancelled'); }

export function takenSeats(schedId){
  const sch=schedById(schedId); const out={paid:[],hold:[],inactive:[]};
  bookingsOf(schedId).forEach(b=>{ (b.seats||[]).forEach(s=>{ if(b.status==='paid'||b.status==='done') out.paid.push(s); else if(b.status==='pending') out.hold.push(s); }); });
  (sch?.blockedSeats||[]).forEach(s=>{ if(!out.paid.includes(s)) out.paid.push(s); });
  const veh=sch?vehicleById(sch.vehicleId):null;
  (veh?.inactiveSeats||[]).forEach(s=>{ if(!out.paid.includes(s)) out.paid.push(s); if(!out.inactive.includes(s)) out.inactive.push(s); });
  return out;
}

export function seatsLeft(schedId){ return schedSeatCap(schedId) - takenSeats(schedId).paid.length - takenSeats(schedId).hold.length; }

export function vehLayout(v){
  if(v&&Array.isArray(v.layout)&&v.layout.length===28) return v.layout.map(c=>({sid:c.sid||null,type:c.type||'empty'}));
  const L=Array.from({length:28},()=>({sid:null,type:'empty'}));
  const put=(i,type,sid)=>{L[i]={sid:sid||null,type};};
  put(2,'driver','DRV'); put(3,'driver','DRV2');
  ['A1','A2','A3','A4','A5','A6'].forEach((s,k)=>put([0,1,4,5,8,9][k],'seat',s));
  ((v&&v.inactiveSeats)||[]).forEach(s=>{const c=L.find(x=>x.sid===s); if(c) c.type='off';});
  [24,25,26,27].forEach(i=>put(i,'luggage',null));
  return L;
}

export function vehSeatCount(v){ return vehLayout(v).filter(c=>c.type==='seat').length; }

export function schedSeatCap(schedId){ const s=schedById(schedId); if(!s) return 6; return Math.max(1,vehSeatCount(vehicleById(s.vehicleId))); }

export function schedReady(s){ if(!s||s.status!=='open') return false; const v=s.vehicleId?vehicleById(s.vehicleId):null, d=s.driverId?driverById(s.driverId):null; return (!v||v.status==='aktif')&&(!d||d.status==='aktif'); }

export function drvBlocks(L){ let n=0; for(let r=0;r<7;r++){ const a=L[r*4+2],b=L[r*4+3]; if(a&&b&&a.type==='driver'&&b.type==='driver') n++; } return n; }

export function seatBookedFuture(vid,sid){
  return DB.load('schedules',[]).filter(s=>s.vehicleId===vid&&s.date>=todayStr(0)).some(s=>bookingsOf(s.id).some(b=>(b.seats||[]).includes(sid)));
}

export function cleanupHolds(){
  let arr=DB.load('bookings',[]); let changed=false;
  const now=Date.now();
  arr.forEach(b=>{ if(b.status==='pending'&&b.holdExpiry&&now>new Date(b.holdExpiry).getTime()){ b.status='cancelled'; b.cancelReason='Hold kedaluwarsa (15 mnt)'; changed=true; processWaiting(b.scheduleId);} });
  if(changed) DB.save('bookings',arr);
}

export function processWaiting(schedId){
  const w=DB.load('waiting',[]); const idx=w.findIndex(x=>x.scheduleId===schedId);
  if(idx>=0 && seatsLeft(schedId)>0){ const item=w.splice(idx,1)[0]; DB.save('waiting',w); notify(item.userEmail,'Kursi tersedia!','Kursi pada jadwal '+schedId+' kini tersedia ('+seatsLeft(schedId)+' sisa). Segera booking.','WA'); }
}

export function feeFor(agencyId, amount){ const a=agencyById(agencyId); if(!a) return Math.round(amount*0.08); return a.feeType==='flat'? a.feeValue : Math.round(amount*a.feeValue/100); }

export function audit(action, detail){ const l=DB.load('audit',[]); const u=currentUser(); l.unshift({id:uid('LOG'),time:new Date().toISOString(),actor:u?u.email+' ('+u.role+')':'guest',action,detail:detail||''}); DB.save('audit',l.slice(0,300)); }

export function notify(userEmail, title, msg, ch){
  const n=DB.load('notifications',[]);
  n.unshift({id:uid('NTF'),to:userEmail,title,msg,ch:ch||'app',time:new Date().toISOString(),read:false});
  DB.save('notifications',n.slice(0,200));
}

export const hm=t=>{const[a,b]=t.split(':').map(Number);return a*60+b;};

/* Split settlement: tiket (pengemudi) + jasa (agen) + fee (platform).
   schedule.price = TOTAL all-in per kursi yg dilihat pelanggan. */
export const DEFAULT_SERVICE=10000;
export function priceForAgency(route,agencyId){ return Number(route?.prices?.[agencyId]??route?.basePrice??0)||0; }
export function servicePerSeat(s){ const r=s?routeById(s.routeId):null; return Number(r?.serviceFee??DEFAULT_SERVICE)||0; }
export function splitFare(s,nSeats=1,discount=0){
  if(!s) return {ticket:0,service:0,fee:0,total:0};
  const n=Math.max(1,Number(nSeats)||1);
  const S=servicePerSeat(s);
  const paid=Math.max(0,(Number(s.price)||0)*n-(Number(discount)||0));
  const a=agencyById(s.agencyId);
  const base=a&&a.feeType==='flat'?Math.max(0,paid-(Number(a.feeValue)||0)):paid/(1+((a?Number(a.feeValue):8)||0)/100);
  const service=Math.min(S*n,Math.round(base));
  const ticket=Math.max(0,Math.round(base)-service);
  const fee=Math.max(0,paid-ticket-service);
  return {ticket,service,fee,total:paid};
}
/* Ledger: ditahan (bayar) → layak (trip tiba) → dicairkan (admin) ; void bila refund */
export function createLedger(booking){
  if(!booking||booking.status!=='paid') return null;
  if(DB.load('ledger',[]).some(x=>x.bookingId===booking.id)) return null;
  const s=schedById(booking.scheduleId); if(!s) return null;
  const f=splitFare(s,(booking.seats||[]).length,booking.discount||0);
  const e={id:uid('LG'),bookingId:booking.id,scheduleId:s.id,agencyId:s.agencyId,driverId:s.driverId||null,userEmail:booking.userEmail,seats:[...(booking.seats||[])],ticket:f.ticket,service:f.service,fee:f.fee,total:f.total,status:'ditahan',createdAt:new Date().toISOString(),releasedAt:null,paidOutAt:null};
  const arr=DB.load('ledger',[]); arr.unshift(e); DB.save('ledger',arr);
  audit('ledger_hold',booking.code+' • T'+f.ticket+' J'+f.service+' F'+f.fee);
  return e;
}
export function releaseLedger(scheduleId){
  const arr=DB.load('ledger',[]); let ch=false;
  arr.forEach(e=>{ if(e.scheduleId===scheduleId&&e.status==='ditahan'){ e.status='layak'; e.releasedAt=new Date().toISOString(); ch=true; } });
  if(ch){ DB.save('ledger',arr); audit('ledger_release',scheduleId); }
  return ch;
}
export function voidLedger(bookingId){
  const arr=DB.load('ledger',[]); let ch=false;
  arr.forEach(e=>{ if(e.bookingId===bookingId&&e.status!=='dicairkan'){ e.status='void'; ch=true; } });
  if(ch){ DB.save('ledger',arr); audit('ledger_void',bookingId); }
  return ch;
}
export function settleLedger(ids){
  const arr=DB.load('ledger',[]); let n=0;
  (ids||[]).forEach(id=>{ const e=arr.find(x=>x.id===id); if(e&&e.status==='layak'){ e.status='dicairkan'; e.paidOutAt=new Date().toISOString(); n++; } });
  if(n){ DB.save('ledger',arr); audit('ledger_settle',n+' pos'); }
  return n;
}
export function ledgerByDriver(driverId){ return DB.load('ledger',[]).filter(e=>e.driverId===driverId); }
/* Layak cair = trip tiba + kliring 24 jam */
export function ledgerEligible(e){
  if(!e||e.status!=='layak') return false;
  const s=schedById(e.scheduleId);
  const at=s?.arrivedAt||e.releasedAt;
  if(!at) return true;
  return Date.now()-new Date(at).getTime()>=24*3600*1000;
}

/* Normalisasi titik jemput: trim, buang kosong & duplikat (abaikan besar/kecil huruf) */
export function normalizePoints(list){
  const seen=new Set(); const out=[];
  (Array.isArray(list)?list:[]).forEach(p=>{ const v=String(p==null?'':p).trim(); if(!v) return; const k=v.toLowerCase(); if(seen.has(k)) return; seen.add(k); out.push(v); });
  return out;
}

/* Usulan rute agen → admin (model hibrida: agen usul, admin eksekusi) */
export function saveRouteRequest({ agencyId, type, routeId, from, to, pickup, pickups, note, price, homePickup, distance, duration }){
  const arr=DB.load('routeRequests',[]);
  const list=normalizePoints(pickups);
  if(!list.length&&(pickup||'').trim()) list.push((pickup||'').trim());
  const r={id:uid('RQ'),agencyId,type,routeId:routeId||null,from,to,pickup:list[0]||'',pickups:list,note:(note||'').trim(),price:Number(price)||0,homePickup:homePickup!==false,distance:(distance||'').trim(),duration:(duration||'').trim(),status:'pending',adminNote:'',createdAt:new Date().toISOString(),decidedAt:null};
  arr.unshift(r); DB.save('routeRequests',arr);
  audit('route_request',type+' '+from+' → '+to+' • '+agencyId);
  DB.load('users',[]).filter(u=>u.role==='superadmin').forEach(u=>notify(u.email,'Usulan rute baru',(agencyById(agencyId)?.name||agencyId)+' mengusulkan '+(type==='rute-baru'?'rute baru':'titik jemput')+': '+from+' → '+to,'app'));
  return r;
}
export function decideRouteRequest(id,approve,adminNote){
  const arr=DB.load('routeRequests',[]);
  const r=arr.find(x=>x.id===id);
  if(!r||r.status!=='pending') return null;
  r.status=approve?'approved':'rejected';
  r.adminNote=(adminNote||'').trim();
  r.decidedAt=new Date().toISOString();
  let createdRouteId=null;
  if(approve){
    if(r.type==='rute-baru'){
      const routes=DB.load('routes',[]);
      const pts=normalizePoints(Array.isArray(r.pickups)&&r.pickups.length?r.pickups:(r.pickup?[r.pickup]:[]));
      const allPts=normalizePoints(pts.length?['Terminal '+r.from,...pts]:['Terminal '+r.from,'Terminal '+r.to]);
      const est=estimateRoute(r.from,r.to)||{};
      const nr={id:uid('R'),from:r.from,to:r.to,distance:(r.distance||'').trim()||est.distance||'-',duration:(r.duration||'').trim()||est.duration||'-',basePrice:Number(r.price)>0?Number(r.price):0,prices:Number(r.price)>0?{[r.agencyId]:Number(r.price)}:{},serviceFee:DEFAULT_SERVICE,homePickup:r.homePickup!==false,pickups:allPts,active:true,agencyId:r.agencyId,agencyIds:[r.agencyId],driverId:null,driverIds:[]};
      routes.push(nr); DB.save('routes',routes);
      createdRouteId=nr.id;
    }else if(r.type==='ubah-harga'){
      const routes=DB.load('routes',[]);
      const tgt=routes.find(x=>x.id===r.routeId)||routes.find(x=>x.from===r.from&&x.to===r.to&&(x.agencyIds||[]).includes(r.agencyId));
      if(tgt&&Number(r.price)>0){ tgt.prices={...(tgt.prices||{}),[r.agencyId]:Number(r.price)}; DB.save('routes',routes); }
    }else{
      const routes=DB.load('routes',[]);
      const tgt=routes.find(x=>x.id===r.routeId)||routes.find(x=>x.from===r.from&&x.to===r.to&&(x.agencyIds||[]).includes(r.agencyId));
      const pts=normalizePoints(Array.isArray(r.pickups)&&r.pickups.length?r.pickups:(r.pickup?[r.pickup]:[]));
      if(tgt&&pts.length){
        const cur=normalizePoints(tgt.pickups); let ch=false;
        pts.forEach(p=>{ if(!cur.some(x=>x.toLowerCase()===p.toLowerCase())){ cur.push(p); ch=true; } });
        if(ch){ tgt.pickups=cur; DB.save('routes',routes); }
      }
    }
  }
  DB.save('routeRequests',arr);
  audit('route_request_'+r.status,r.type+' '+r.from+' → '+r.to+' • '+r.agencyId);
  DB.load('users',[]).filter(u=>u.agencyId===r.agencyId&&u.role==='agen').forEach(u=>notify(u.email,approve?'Usulan rute disetujui':'Usulan rute ditolak',r.from+' → '+r.to+(r.adminNote?' • '+r.adminNote:''),'app'));
  return {req:r,createdRouteId};
}
