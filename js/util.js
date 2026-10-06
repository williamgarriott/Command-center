// Shared helpers. Dates are local calendar days stored as "YYYY-MM-DD" keys,
// times are "HH:MM" strings in 24-hour form.

export const pad2 = (n) => String(n).padStart(2, '0');

export function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => dateKey(new Date());

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// Adds calendar months, clamping to the last day of shorter months (Aug 31 + 6 = Feb 28).
export function addMonths(k, n) {
  const d = parseKey(k);
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return dateKey(t);
}

// Whole days from a to b (b - a). Rounding absorbs daylight-saving shifts.
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

export const dayOfWeek = (k) => parseKey(k).getDay();

// Weeks run Monday to Sunday so the Sunday review closes out the week.
export const weekStartOf = (k) => addDays(k, -((dayOfWeek(k) + 6) % 7));

export function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function nowMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return timeFormat.format(new Date(2000, 0, 1, h, m));
}

export function fmtDate(k, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseKey(k).toLocaleDateString(undefined, opts);
}

export const fmtLong = (k) => fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtFull = (k) => fmtDate(k, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtShort = (k) => fmtDate(k, { month: 'short', day: 'numeric' });

export function relDay(k, today = todayKey()) {
  const n = daysBetween(today, k);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return fmtDate(k);
}

// Same as relDay, but lowercase for use mid-sentence ("for tomorrow").
export function dayPhrase(k, today = todayKey()) {
  const label = relDay(k, today);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(label) ? label.toLowerCase() : label;
}

export function fmtDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export const fmtNum = (n) => String(Math.round(Number(n || 0) * 100) / 100);

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clone = (o) => JSON.parse(JSON.stringify(o));

export function debounce(fn, ms) {
  let timer = null;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  run.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return run;
}

// Letters are kept base64-encoded, so opening a backup file in a text editor
// doesn't reveal a sealed letter at a glance.
export function seal(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function unseal(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
