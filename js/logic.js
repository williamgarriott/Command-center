// Read-only views of the state: what is on a given day, scores, streaks,
// what is happening now, goal targets.
import { S } from './store.js';
import { todayKey, addDays, addMonths, toMin, nowMin, dateKey } from './util.js';

export const MAX_PRIORITY = 3;
export const LETTER_LOCK_MONTHS = 6;
export const SECTION_LABEL = { morning: 'Morning', today: 'Today', night: 'Night' };
export const CATEGORIES = ['Fitness', 'Money', 'Music', 'Chinese', 'Business', 'Personal'];
export const TIMEFRAMES = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60];

export function timeframeLabel(months) {
  if (months < 12) return `${months} months`;
  const years = months / 12;
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

/* ---------- Days and items ---------- */

const EMPTY_DAY = Object.freeze({ tasks: [], done: {}, counts: {}, notes: {}, note: '' });

// Read-only: never mutate the returned object. Use ensureDay() to write.
export const getDay = (k) => S().days[k] || EMPTY_DAY;

export function ensureDay(k) {
  const days = S().days;
  if (!days[k]) days[k] = { tasks: [], done: {}, counts: {}, notes: {}, note: '' };
  return days[k];
}

// A permanent task applies from the day it was added until the day it was removed.
export const isActive = (r, k) => r.createdOn <= k && (!r.archivedOn || k < r.archivedOn);

export const routineList = (section, k = todayKey()) =>
  S().routine.filter((r) => r.section === section && isActive(r, k));

// Items are a common shape for permanent and one-off tasks on a specific day.
export function routineItem(r, k) {
  const d = getDay(k);
  return {
    kind: 'routine',
    id: r.id,
    date: k,
    section: r.section,
    title: r.title,
    time: r.time || null,
    counter: r.counter || null,
    goalId: r.goalId || null,
    type: 'normal',
    remind: r.remind !== false,
    streak: !!r.streak,
    done: !!d.done[r.id],
    value: d.counts[r.id] || 0,
    note: d.notes[r.id] || '',
  };
}

export function taskItem(t, k) {
  return {
    kind: 'task',
    id: t.id,
    date: k,
    section: 'today',
    title: t.title,
    time: t.time || null,
    counter: t.counter || null,
    goalId: t.goalId || null,
    type: t.type || 'normal',
    remind: t.remind !== false,
    done: !!t.done,
    value: t.value || 0,
    note: t.note || '',
    carriedFrom: t.carriedFrom || null,
    carriedTo: t.carriedTo || null,
    carryCount: t.carryCount || 0,
  };
}

export function itemsFor(k, section) {
  if (section === 'today') return getDay(k).tasks.map((t) => taskItem(t, k));
  return routineList(section, k).map((r) => routineItem(r, k));
}

export const allItems = (k) => [
  ...itemsFor(k, 'morning'),
  ...itemsFor(k, 'today'),
  ...itemsFor(k, 'night'),
];

export const isComplete = (it) => (it.counter ? it.value >= it.counter.target : it.done);

export const taskComplete = (t) => (t.counter ? (t.value || 0) >= t.counter.target : !!t.done);

export function routineDone(r, k) {
  const d = S().days[k];
  if (!d) return false;
  return r.counter ? (d.counts[r.id] || 0) >= r.counter.target : !!d.done[r.id];
}

export const priorityCount = (k, excludeId = null) =>
  getDay(k).tasks.filter((t) => t.type === 'priority' && !t.carriedTo && t.id !== excludeId).length;

export function stepFor(counter) {
  if (counter.step > 0) return counter.step;
  return autoStep(counter.target);
}

export function autoStep(target) {
  const t = Number(target) || 0;
  if (t <= 10) return 1;
  if (t <= 60) return 5;
  if (t <= 250) return 10;
  if (t <= 1000) return 25;
  return 100;
}

/* ---------- Ordering ---------- */

// Timed entries go in time order. Untimed entries keep the spot they were put in.
export function insertByTime(list, entry) {
  if (!entry.time) {
    list.push(entry);
    return list;
  }
  const m = toMin(entry.time);
  const i = list.findIndex((x) => x.time && toMin(x.time) > m);
  if (i === -1) list.push(entry);
  else list.splice(i, 0, entry);
  return list;
}

// After a drag, a timed entry may sit among untimed neighbours freely, but if
// it lands on the wrong side of another timed entry it snaps back into time order.
export function settleMoved(list, index) {
  const moved = list[index];
  if (!moved || !moved.time) return { list, snapped: false };
  const m = toMin(moved.time);
  const inOrder = list.every((x, i) => {
    if (i === index || !x.time) return true;
    return i < index ? toMin(x.time) <= m : toMin(x.time) >= m;
  });
  if (inOrder) return { list, snapped: false };
  const rest = list.filter((_, i) => i !== index);
  return { list: insertByTime(rest, moved), snapped: true };
}

/* ---------- Scores ---------- */

export function dayScore(k) {
  if (k > todayKey() || k < S().settings.startDate) return null;
  const items = allItems(k);
  if (!items.length) return null;
  const done = items.filter(isComplete).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

export function weekStats(ws) {
  const t = todayKey();
  const end = addDays(ws, 6);
  const days = [];
  let sum = 0;
  let counted = 0;
  let done = 0;
  let total = 0;
  let perfect = 0;
  let pDone = 0;
  let pTotal = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i);
    const score = dayScore(k);
    days.push({ k, score });
    if (score) {
      sum += score.pct;
      counted++;
      done += score.done;
      total += score.total;
      if (score.pct === 100) perfect++;
    }
    if (k > t) continue;
    for (const task of getDay(k).tasks) {
      // A priority carried to another day this week is counted once, on the day it ended up.
      if (task.type !== 'priority' || (task.carriedTo && task.carriedTo <= end)) continue;
      pTotal++;
      if (taskComplete(task)) pDone++;
    }
  }
  return {
    ws,
    end,
    days,
    avg: counted ? Math.round(sum / counted) : null,
    done,
    total,
    perfect,
    pDone,
    pTotal,
  };
}

/* ---------- Streaks ---------- */

// Today counts once it is done. Until then the streak runs through yesterday,
// and a missed day before that means the current streak is 0.
export function streakInfo(r) {
  const t = todayKey();
  const last = r.archivedOn ? addDays(r.archivedOn, -1) : t;
  let current = 0;
  let k = routineDone(r, last) ? last : addDays(last, -1);
  while (k >= r.createdOn && routineDone(r, k)) {
    current++;
    k = addDays(k, -1);
  }
  let best = 0;
  let run = 0;
  let total = 0;
  for (let d = r.createdOn; d <= last; d = addDays(d, 1)) {
    if (routineDone(r, d)) {
      run++;
      total++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return { current, best, total, doneToday: routineDone(r, t) };
}

// Monday-first month grid: date keys, with null padding before and after.
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = new Array(lead).fill(null);
  for (let d = 1; d <= count; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/* ---------- Now and next ---------- */

export function nowNext(k = todayKey()) {
  const m = nowMin();
  const items = allItems(k).filter((it) => !it.carriedTo);
  const timed = items.filter((it) => it.time).sort((a, b) => toMin(a.time) - toMin(b.time));
  const started = timed.filter((it) => toMin(it.time) <= m);
  const open = started.filter((it) => !isComplete(it));
  const latest = started[started.length - 1] || null;

  let now = null;
  let state = 'free';
  if (latest && !isComplete(latest)) {
    now = latest;
    state = 'current';
  } else if (open.length) {
    now = open[open.length - 1];
    state = 'overdue';
  }
  const next = timed.find((it) => toMin(it.time) > m && !isComplete(it)) || null;
  const focus = now ? null : items.find((it) => it.type === 'priority' && !isComplete(it)) || null;
  return {
    now,
    state,
    next,
    focus,
    behind: Math.max(0, open.length - (now ? 1 : 0)),
    minute: m,
    hasTimed: timed.length > 0,
    remaining: items.filter((it) => !isComplete(it)).length,
  };
}

/* ---------- Goals ---------- */

export const goalById = (id) => S().goals.find((g) => g.id === id) || null;

export const goalTarget = (g) => addMonths(g.createdOn, g.months);

export function goalProgress(g) {
  if (g.done) return 1;
  if (!g.steps.length) return 0;
  return g.steps.filter((s) => s.done).length / g.steps.length;
}

export function goalLinks(goalId) {
  const habits = S().routine.filter((r) => r.goalId === goalId && !r.archivedOn);
  let tasksDone = 0;
  let tasksTotal = 0;
  for (const day of Object.values(S().days)) {
    for (const t of day.tasks) {
      if (t.goalId !== goalId || t.carriedTo) continue;
      tasksTotal++;
      if (taskComplete(t)) tasksDone++;
    }
  }
  return { habits, tasksDone, tasksTotal };
}

/* ---------- Letters ---------- */

export const letterUnlocked = (l, t = todayKey()) => l.unlockOn <= t;

export const lettersSorted = () =>
  [...S().letters].sort(
    (a, b) => b.writtenOn.localeCompare(a.writtenOn) || (b.createdAt || 0) - (a.createdAt || 0)
  );

export const wroteThisMonth = (t = todayKey()) =>
  S().letters.some((l) => l.writtenOn.slice(0, 7) === t.slice(0, 7));

export const readyLetters = (t = todayKey()) =>
  lettersSorted().filter((l) => letterUnlocked(l, t) && !l.openedAt);
