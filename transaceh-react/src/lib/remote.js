/* Alur auth + bootstrap mode Sheets. Dipakai boot dan halaman Auth. */

import { DB } from './db.js';
import { setSession } from './domain.js';
import { sheetsApi, setToken, clearToken } from './sheetsApi.js';

export async function loadSnapshot(token) {
  const snap = await sheetsApi.bootstrap(token || null);
  DB.hydrate(snap.records);
  return snap;
}

export async function signInRemote(email, password) {
  const data = await sheetsApi.login(email, password);
  setToken(data.token, data.expiresAt);
  try {
    const snap = await loadSnapshot(data.token);
    const user = snap.user || data.user;
    setSession(user);
    return user;
  } catch (e) {
    clearToken();
    throw e;
  }
}

export async function registerRemote(payload) {
  const data = await sheetsApi.register(payload);
  if (data.token) {
    setToken(data.token, data.expiresAt);
    try {
      const snap = await loadSnapshot(data.token);
      setSession(snap.user || data.user);
    } catch (e) {
      clearToken();
      throw e;
    }
  }
  return data;
}

export async function signOutRemote() {
  clearToken();
  setSession(null);
  DB.clear();
  const snap = await sheetsApi.bootstrap(null);
  DB.hydrate(snap.records);
  return snap;
}
