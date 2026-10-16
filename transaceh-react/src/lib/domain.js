import { DB } from './db.js';
import { uid, todayStr, SIM_TYPES } from './utils.js';
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
