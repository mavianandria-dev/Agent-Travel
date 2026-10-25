/* Transport langsung ke Web App Google Apps Script.
   Apps Script tidak membaca header dan tidak menangani OPTIONS, jadi:
   - POST dengan Content-Type text/plain;charset=utf-8 (tanpa preflight)
   - token selalu di body, bukan header
   - jangan pernah menaruh secret server di file ini */

import { SHEETS_URL, assertSheetsConfig } from './runtime.js';

const TOKEN_KEY = 'at_sheets_token';
const TOKEN_EXP_KEY = 'at_sheets_token_exp';
const TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message || 'Permintaan ke server gagal.');
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN';
    this.status = status;
  }
}

export function getToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return '';
    const rawExp = localStorage.getItem(TOKEN_EXP_KEY);
    if (rawExp) {
      const n = Number(rawExp);
      const expMs = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(rawExp);
      if (Number.isFinite(expMs) && expMs <= Date.now()) {
        clearToken();
        return '';
      }
    }
    return token;
  } catch {
    return '';
  }
}

export function setToken(token, expiresAt) {
  if (!token) { clearToken(); return; }
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(TOKEN_EXP_KEY, String(expiresAt));
    else localStorage.removeItem(TOKEN_EXP_KEY);
  } catch { /* storage penuh / mode privat */ }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
  } catch { /* abaikan */ }
}

export async function call(action, payload = {}) {
  assertSheetsConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Server tidak merespons. Periksa koneksi lalu coba lagi.');
    }
    throw new ApiError('NETWORK', 'Tidak bisa menghubungi server. Periksa koneksi atau URL Web App.');
  } finally {
    clearTimeout(timer);
  }

  let text = '';
  try {
    text = await res.text();
  } catch {
    throw new ApiError('CORS', 'Respons server tidak bisa dibaca browser (CORS).');
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError('BAD_RESPONSE', 'Respons server bukan JSON. Pastikan Web App di-deploy sebagai Anyone dan URL /exec benar.', res.status);
  }

  if (!body || body.ok !== true) {
    const err = body && body.error ? body.error : {};
    throw new ApiError(err.code || 'UNKNOWN', err.message || 'Permintaan gagal.', res.status);
  }
  return body.data;
}

export const sheetsApi = {
  health: () => call('health'),
  login: (email, password) => call('login', { email, password }),
  register: (payload) => call('register', payload),
  session: (token) => call('session', { token }),
  bootstrap: (token) => call('bootstrap', token ? { token } : {}),
  changePassword: (token, currentPassword, newPassword) => call('changePassword', { token, currentPassword, newPassword }),
};
