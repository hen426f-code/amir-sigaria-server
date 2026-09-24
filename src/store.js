/*
  שכבת נתונים מקומית.
  מחליפה את בסיס הנתונים החיצוני. הנתונים נטענים מקובץ שמגיע עם האתר,
  וכל עריכה נשמרת בדפדפן של העורך בלבד. לפרסום קבוע יש לייצא את קובץ
  הנתונים ולהעלות אותו למאגר. אין שרת, ולכן אין מה לפרוץ.
*/
import seed from './data.json';

/* ===== שכבת נתונים =====
   על שרת: הנתונים נקראים ונשמרים בשרת, כך שהם משותפים לכל המכשירים.
   בלי שרת: נפילה חזרה לאחסון מקומי, כך שהאתר ממשיך לעבוד גם כקובץ יחיד. */
const KEY = 'hameashenet_data_v1';
const API = '/api/data';
let db = null;
let serverMode = false;
let adminPass = '';

export function isServerMode() { return serverMode; }
let persistent = true;
export function isPersistent() { return persistent; }
export function setAdminPass(p) { adminPass = p || ''; }

export async function initStore() {
  try {
    const r = await fetch(API, { headers: { 'accept': 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.products)) {
        db = j; serverMode = true;
        try {
          const st = await (await fetch('/api/status')).json();
          persistent = st.persistent !== false;
        } catch (e) { persistent = true; }
        return true;
      }
    }
  } catch (e) { /* אין שרת, ממשיכים מקומית */ }
  serverMode = false;
  return false;
}

export async function verifyAdmin(pass) {
  if (!serverMode) return null;               // null = אין שרת, נבדק מקומית
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'x-admin-pass': pass } });
    if (!r.ok) return false;
    const j = await r.json();
    if (j.ok) adminPass = pass;
    return !!j.ok;
  } catch (e) { return false; }
}

export async function pushToServer() {
  if (!serverMode) return { ok: false, reason: 'local' };
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-pass': adminPass },
      body: JSON.stringify(db),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, error: j.error };
  } catch (e) { return { ok: false, error: 'אין חיבור לשרת' }; }
}

function fresh() { return JSON.parse(JSON.stringify(seed)); }
let pushTimer = null;
function persist() {
  if (serverMode) {
    /* כתיבה לשרת מתוזמנת, כדי ששינויים רצופים לא יפציצו אותו */
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushToServer().then(r => {
      if (!r.ok && typeof window.onSaveError === 'function') window.onSaveError(r);
    }); }, 700);
    return;
  }
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* אחסון מלא */ }
}

function init() {
  if (db) return db;
  if (serverMode) return db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? JSON.parse(raw) : fresh();
  } catch (e) { db = fresh(); }
  for (const t of ['site_settings', 'categories', 'products', 'product_flavors', 'deals'])
    if (!Array.isArray(db[t])) db[t] = fresh()[t];
  return db;
}
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

class Query {
  constructor(table) { init(); this.t = table; this.op = 'select'; this.f = []; this.ord = null; this.one = false; this.embed = false; this.payload = null; this.wantRows = false; }
  select(cols = '*') { if (this.op === 'select') { this.embed = String(cols).includes('product_flavors'); } else { this.wantRows = true; } return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(obj) { this.op = 'update'; this.payload = obj; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push(r => String(r[c]) === String(v)); return this; }
  neq(c, v) { this.f.push(r => String(r[c]) !== String(v)); return this; }
  order(c) { this.ord = c; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  match(rows) { return rows.filter(r => this.f.every(fn => fn(r))); }

  run() {
    const rows = db[this.t];
    if (this.op === 'insert') {
      const added = this.payload.map(r => ({ id: r.id || uid(), ...r }));
      db[this.t].push(...added); persist();
      return { data: this.one ? added[0] : added, error: null };
    }
    if (this.op === 'update') {
      this.match(rows).forEach(r => Object.assign(r, this.payload)); persist();
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      const kill = new Set(this.match(rows));
      db[this.t] = rows.filter(r => !kill.has(r)); persist();
      return { data: null, error: null };
    }
    let out = this.match(rows).map(r => ({ ...r }));
    if (this.ord) out.sort((a, b) => (a[this.ord] ?? 0) - (b[this.ord] ?? 0));
    if (this.embed) out = out.map(p => ({ ...p, product_flavors: db.product_flavors.filter(f => f.product_id === p.id).map(f => ({ ...f })) }));
    return { data: this.one ? (out[0] || null) : out, error: null };
  }
  then(res, rej) { try { res(this.run()); } catch (e) { rej ? rej(e) : res({ data: null, error: e }); } }
}

export const supabase = { from: (t) => new Query(t) };

/* ייצוא קובץ הנתונים לפרסום, ושחזור לנתוני המקור */
export function exportDataFile() {
  init();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'data.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function importDataFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { db = JSON.parse(r.result); persist(); resolve(); } catch (e) { reject(e); } };
    r.onerror = reject; r.readAsText(file);
  });
}
export function resetToSeed() { db = fresh(); persist(); }
export function hasLocalEdits() { return !!localStorage.getItem(KEY); }
