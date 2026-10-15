/* DB layer (localStorage simulation) — kunci at_* sama seperti index.html agar data kompatibel */

export const DB = {
  load(k, f) { try { const v = localStorage.getItem('at_' + k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
  save(k, v) { localStorage.setItem('at_' + k, JSON.stringify(v)); },
};
