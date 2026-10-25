/* Mode data runtime.
   Default tetap localStorage. Mode Sheets hanya aktif bila VITE_DATA_MODE=sheets
   dan VITE_SHEETS_URL diisi. Jangan mencampur data lokal dan remote. */

const raw = String(import.meta.env.VITE_DATA_MODE || 'local').trim().toLowerCase();

export const DATA_MODE = raw === 'sheets' ? 'sheets' : 'local';
export const IS_SHEETS = DATA_MODE === 'sheets';
export const SHEETS_URL = String(import.meta.env.VITE_SHEETS_URL || '').trim();

export function assertSheetsConfig() {
  if (IS_SHEETS && !SHEETS_URL) {
    throw new Error('VITE_SHEETS_URL belum diisi. Set URL Web App Apps Script sebelum memakai mode sheets.');
  }
}
