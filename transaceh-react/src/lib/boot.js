/* Boot aplikasi.
   - local: seed + lifecycle seperti sebelumnya
   - sheets: ambil snapshot publik atau snapshot token sebelum React dirender */

import { IS_SHEETS, assertSheetsConfig } from './runtime.js';
import { initDB } from './seed.js';
import { syncScheduleLifecycle, syncMaintenanceResolutions, setSession } from './domain.js';
import { getToken, clearToken } from './sheetsApi.js';
import { loadSnapshot } from './remote.js';

let bootPromise = null;

async function runBoot() {
  if (!IS_SHEETS) {
    initDB();
    syncScheduleLifecycle();
    syncMaintenanceResolutions();
    return { mode: 'local' };
  }

  assertSheetsConfig();
  const token = getToken();
  if (token) {
    try {
      const snap = await loadSnapshot(token);
      if (!snap.user) throw Object.assign(new Error('Sesi tidak valid.'), { code: 'UNAUTHORIZED' });
      setSession(snap.user);
      return { mode: 'sheets', user: snap.user, role: snap.role };
    } catch (e) {
      const code = e && e.code;
      if (code === 'UNAUTHORIZED' || code === 'ACCOUNT_BLOCKED' || code === 'FORBIDDEN') {
        clearToken();
        try { localStorage.removeItem('at_session'); } catch { /* abaikan */ }
      } else {
        throw e;
      }
    }
  }

  const snap = await loadSnapshot(null);
  return { mode: 'sheets', user: null, role: snap.role || 'publik' };
}

export function boot() {
  if (!bootPromise) bootPromise = runBoot();
  return bootPromise;
}
