// The whole app state is one JSON document kept on this device in IndexedDB
// (room for many years of history). If IndexedDB isn't available, it falls
// back to localStorage. Every change goes through commit() and is written
// right away, so nothing is lost if the phone closes the app after a tap.
import { todayKey } from './util.js';

export const SCHEMA = 1;

const DB_NAME = 'command-center';
const DB_STORE = 'kv';
const LS_KEY = 'commandCenter:data';
const LS_PREV = 'commandCenter:previous';

let state = null;
let undoEntry = null;
const listeners = new Set();
let errorHandler = () => {};

/* ---------- Storage backends ---------- */

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => {
        const db = req.result;
        // Safari can drop the connection while the app is in the background.
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function idbRequest(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode);
        const result = run(tx.objectStore(DB_STORE));
        tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

// One retry with a fresh connection covers a connection lost in the background.
async function withRetry(fn) {
  try {
    return await fn();
  } catch {
    dbPromise = null;
    return fn();
  }
}

const idb = {
  get: (key) => withRetry(() => idbRequest('readonly', (store) => store.get(key))),
  set: (entries) => withRetry(() => idbRequest('readwrite', (store) => entries.forEach(([k, v]) => store.put(v, k)))),
  clear: () => withRetry(() => idbRequest('readwrite', (store) => store.clear())),
};

const local = {
  get: async (key) => localStorage.getItem(key === 'state' ? LS_KEY : LS_PREV),
  set: async (entries) => entries.forEach(([k, v]) => localStorage.setItem(k === 'state' ? LS_KEY : LS_PREV, v)),
  clear: async () => {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_PREV);
  },
};

let backend = idb;

/* ---------- Shape ---------- */

export function defaults() {
  const t = todayKey();
  return {
    schema: SCHEMA,
    settings: {
      startDate: t,
      lastRollover: t,
      reminders: { tasks: false, lead: 0, nightly: true, nightlyTime: '21:00' },
      lastBackup: null,
    },
    routine: [],
    days: {},
    goals: [],
    reviews: {},
    letters: [],
    letterDraft: '',
    ui: { collapsed: {}, dismissed: {}, snapshotDay: null },
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : '');

// Fills in anything missing so partial or older data (including imported
// backups) always has the shape the rest of the app expects.
export function normalize(raw) {
  const base = defaults();
  const d = obj(raw);
  const rawSettings = obj(d.settings);
  const settings = { ...base.settings, ...rawSettings };
  settings.reminders = { ...base.settings.reminders, ...obj(rawSettings.reminders) };

  const days = {};
  for (const [k, value] of Object.entries(obj(d.days))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const day = obj(value);
    days[k] = {
      tasks: arr(day.tasks).filter((t) => t && t.id),
      done: obj(day.done),
      counts: obj(day.counts),
      notes: obj(day.notes),
      note: str(day.note),
    };
  }

  const rawUi = obj(d.ui);
  return {
    schema: SCHEMA,
    settings,
    routine: arr(d.routine).filter((r) => r && r.id),
    days,
    goals: arr(d.goals)
      .filter((g) => g && g.id)
      .map((g) => ({ ...g, steps: arr(g.steps) })),
    reviews: obj(d.reviews),
    letters: arr(d.letters).filter((l) => l && l.id),
    letterDraft: str(d.letterDraft),
    ui: { ...base.ui, ...rawUi, collapsed: obj(rawUi.collapsed), dismissed: obj(rawUi.dismissed) },
  };
}

function parse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------- Load and save ---------- */

let lastSaved = null;
let queued = false;
let writing = Promise.resolve();

export async function load() {
  let text = null;
  try {
    if (!('indexedDB' in window)) throw new Error('IndexedDB unavailable');
    text = await idb.get('state');
  } catch {
    backend = local;
  }
  if (text == null) {
    try {
      text = localStorage.getItem(LS_KEY);
    } catch {
      // No saved data.
    }
  }
  let raw = parse(text);
  if (!raw && text) {
    // The main copy is unreadable: fall back to the daily snapshot.
    try {
      raw = parse(await backend.get('previous'));
    } catch {
      raw = null;
    }
  }
  state = normalize(raw || defaults());
  lastSaved = raw ? text : null;
  return state;
}

export const S = () => state;

export function onStorageError(fn) {
  errorHandler = fn;
}

function write() {
  queued = false;
  const entries = [];
  const t = todayKey();
  if (state.ui.snapshotDay !== t) {
    // Once a day, keep the last save from before today as a fallback copy.
    if (lastSaved) entries.push(['previous', lastSaved]);
    state.ui.snapshotDay = t;
  }
  const json = JSON.stringify(state);
  entries.unshift(['state', json]);
  lastSaved = json;
  writing = writing
    .then(() => backend.set(entries))
    .catch(async (err) => {
      if (backend === local) throw err;
      // IndexedDB failed twice: keep a copy in localStorage instead.
      backend = local;
      await local.set(entries);
    })
    .catch((err) => errorHandler(err));
  return writing;
}

// Coalesces all changes made in the same tick into one write.
function persist() {
  if (queued) return;
  queued = true;
  Promise.resolve().then(write);
}

// Waits for pending writes, e.g. before the page is hidden.
export function flush() {
  if (queued) write();
  return writing;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of [...listeners]) fn();
}

// silent: save without re-rendering (used for drafts while typing).
export function commit(fn, { silent = false } = {}) {
  const result = fn(state);
  undoEntry = null;
  persist();
  if (!silent) emit();
  return result;
}

// Like commit(), but returns an undo() that restores the state from just
// before this change, as long as nothing else has changed since.
export function commitUndoable(fn) {
  const before = JSON.stringify(state);
  const result = fn(state);
  const entry = {};
  undoEntry = entry;
  persist();
  emit();
  const undo = () => {
    if (undoEntry !== entry) return false;
    state = JSON.parse(before);
    undoEntry = null;
    persist();
    emit();
    return true;
  };
  return { result, undo };
}

export function replaceAll(raw) {
  const before = lastSaved;
  state = normalize(raw);
  state.ui.snapshotDay = todayKey();
  undoEntry = null;
  // Keep what was there before the restore as the fallback copy.
  const json = JSON.stringify(state);
  lastSaved = json;
  writing = writing
    .then(() => backend.set(before ? [['state', json], ['previous', before]] : [['state', json]]))
    .catch((err) => errorHandler(err));
  emit();
  return writing;
}

export function eraseAll() {
  state = defaults();
  state.ui.snapshotDay = todayKey();
  undoEntry = null;
  lastSaved = JSON.stringify(state);
  const json = lastSaved;
  writing = writing
    .then(() => backend.clear())
    .then(() => backend.set([['state', json]]))
    .catch((err) => errorHandler(err));
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_PREV);
  } catch {
    // Nothing stored there.
  }
  emit();
  return writing;
}
