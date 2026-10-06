// Reminders for timed tasks and the nightly "plan tomorrow" nudge.
//
// A web app with no server can only fire notifications while it is open or
// still running in the background; phones don't let it schedule alarms while
// closed. The calendar export below is the reliable fallback for that.
import { S } from './store.js';
import { allItems, isComplete } from './logic.js';
import { toast } from './ui.js';
import { todayKey, nowMin, toMin, fmtTime } from './util.js';

const FIRED_KEY = 'commandCenter:fired';
const WINDOW_MIN = 10;

export const notificationsSupported = () => 'Notification' in window;

export function permissionState() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function askPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function notify(title, body, tag, { force = false } = {}) {
  const visible = document.visibilityState === 'visible';
  if (visible && !force) toast(`${title} · ${body}`, { duration: 7000 });
  if (permissionState() !== 'granted' || (visible && !force)) return false;
  const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // Fall through to the page-level API.
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

function loadFired(k) {
  try {
    const saved = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
    return new Set(saved.date === k ? saved.keys : []);
  } catch {
    return new Set();
  }
}

function saveFired(k, set) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ date: k, keys: [...set] }));
  } catch {
    // Worst case a reminder repeats.
  }
}

export function checkReminders() {
  const rem = S().settings.reminders;
  if (!rem.tasks && !rem.nightly) return;
  const k = todayKey();
  const m = nowMin();
  const fired = loadFired(k);
  let changed = false;
  const due = (at) => m >= at && m - at <= WINDOW_MIN;

  if (rem.tasks) {
    const lead = Number(rem.lead) || 0;
    for (const it of allItems(k)) {
      if (!it.time || !it.remind || it.carriedTo || isComplete(it)) continue;
      const key = `${it.kind}:${it.id}@${it.time}`;
      if (fired.has(key) || !due(toMin(it.time) - lead)) continue;
      fired.add(key);
      changed = true;
      notify(it.title, lead ? `Starts at ${fmtTime(it.time)}, in ${lead} min` : `Now · ${fmtTime(it.time)}`, key);
    }
  }

  if (rem.nightly && !fired.has('nightly') && due(toMin(rem.nightlyTime))) {
    fired.add('nightly');
    changed = true;
    notify('Plan tomorrow', 'Set up tomorrow’s tasks and Top 3 before bed.', 'nightly');
  }

  if (changed) saveFired(k, fired);
}

let timer = null;

export function startReminders() {
  clearInterval(timer);
  timer = setInterval(checkReminders, 20000);
  checkReminders();
}

/* ---------- Calendar export ---------- */

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Repeating daily events with alarms: the nightly planning reminder and every
// timed Morning and Night task. Re-exporting updates the same events.
export function buildCalendar() {
  const s = S();
  const rem = s.settings.reminders;
  const day = todayKey().replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Command Center//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const event = (id, time, title, lead) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${id}@command-center`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${time.replace(':', '')}00`,
      'DURATION:PT15M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${icsEscape(title)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(title)}`,
      `TRIGGER:-PT${lead}M`,
      'END:VALARM',
      'END:VEVENT'
    );
  };
  let count = 0;
  if (rem.nightly) {
    event('nightly-plan', rem.nightlyTime, 'Plan tomorrow (Command Center)', 0);
    count++;
  }
  for (const r of s.routine) {
    if (r.archivedOn || !r.time || r.remind === false) continue;
    event(`routine-${r.id}`, r.time, r.title, Number(rem.lead) || 0);
    count++;
  }
  lines.push('END:VCALENDAR');
  return { text: lines.join('\r\n'), count };
}
