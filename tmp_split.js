const fs = require('fs');
const vm = require('vm');
const strip = (s) => s.replace(/^import.*$/gm, '').replace(/^export /gm, '');
const src = ['utils', 'domain', 'seed'].map((f) => strip(fs.readFileSync('transaceh-react/src/lib/' + f + '.js', 'utf8'))).join('\n');
try { new vm.Script(src); console.log('SYNTAX OK'); }
catch (e) { console.error('SYNTAX FAIL: ' + e.message); process.exit(1); }
const store = {};
let n = 0;
const sandbox = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: { save: (k, v) => { store[k] = v; }, load: (k) => store[k] || [] },
  uid: (p) => (p || 'X') + (++n),
  todayStr: () => '2026-10-15',
  console,
};
vm.runInNewContext(src + '\ninitDB();', sandbox, { timeout: 5000 });
// unit splitFare: AG1 percent 8, R1 price 150000, service 10000
const t = `
const s1 = DB.load('schedules',[]).find(x=>x.routeId==='R1');
const f1 = splitFare(s1, 1, 0);
const f2 = splitFare(s1, 2, 15000);
const s4 = DB.load('schedules',[]).find(x=>x.routeId==='R4' && x.agencyId==='AG2');
const f3 = splitFare(s4, 1, 0);
JSON.stringify({f1, f2, f3, svc: servicePerSeat(s1), led: DB.load('ledger',[]), banks: DB.load('drivers',[]).every(d=>d.bank)});
`;
const out = vm.runInNewContext(t, sandbox);
console.log(out);
const o = JSON.parse(out);
// f1: total 150000, base=138888.9→138889, service 10000, ticket 128889, fee 11111
const ok = o.f1.total === 150000 && o.f1.ticket + o.f1.service + o.f1.fee === 150000
  && o.f2.total === 285000 && o.f2.ticket + o.f2.service + o.f2.fee === 285000
  && o.f3.total === o.f3.ticket + o.f3.service + o.f3.fee
  && o.svc === 10000 && Array.isArray(o.led) && o.banks;
console.log(ok ? 'SPLIT PASS' : 'SPLIT FAIL');
process.exit(ok ? 0 : 1);
