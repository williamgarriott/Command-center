// Every change to the data goes through these functions.
import { commit, commitUndoable, S } from './store.js';
import {
  ensureDay,
  insertByTime,
  settleMoved,
  isActive,
  priorityCount,
  taskComplete,
  autoStep,
  goalById,
  MAX_PRIORITY,
  LETTER_LOCK_MONTHS,
} from './logic.js';
import { todayKey, addDays, addMonths, uid, seal, unseal, clone } from './util.js';

const clean = (s) => String(s || '').trim();

function counterFrom(c) {
  if (!c) return null;
  const target = Number(c.target);
  if (!(target > 0)) return null;
  const step = Number(c.step);
  return {
    target,
    unit: clean(c.unit).slice(0, 12),
    step: step > 0 ? step : autoStep(target),
  };
}

const roundValue = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);

/* ---------- One-off tasks ---------- */

export function addTask(k, data) {
  return commit(() => {
    const day = ensureDay(k);
    let type = data.type || 'normal';
    if (type === 'priority' && priorityCount(k) >= MAX_PRIORITY) type = 'required';
    const task = {
      id: uid(),
      title: clean(data.title),
      type,
      time: data.time || null,
      counter: counterFrom(data.counter),
      goalId: data.goalId || null,
      note: clean(data.note),
      remind: data.remind !== false,
      done: false,
      value: 0,
      createdAt: Date.now(),
    };
    insertByTime(day.tasks, task);
    return task;
  });
}

export function updateTask(k, id, patch) {
  return commit(() => {
    const day = ensureDay(k);
    const i = day.tasks.findIndex((t) => t.id === id);
    if (i < 0) return null;
    const task = day.tasks[i];
    const timeBefore = task.time || null;
    const next = { ...patch };
    if ('counter' in next) next.counter = counterFrom(next.counter);
    if ('title' in next) next.title = clean(next.title) || task.title;
    if ('note' in next) next.note = clean(next.note);
    if (next.type === 'priority' && task.type !== 'priority' && priorityCount(k, id) >= MAX_PRIORITY) {
      next.type = task.type;
    }
    Object.assign(task, next);
    if ((task.time || null) !== timeBefore && task.time) {
      day.tasks.splice(i, 1);
      insertByTime(day.tasks, task);
    }
    return task;
  });
}

export function deleteTask(k, id) {
  return commitUndoable(() => {
    const day = ensureDay(k);
    day.tasks = day.tasks.filter((t) => t.id !== id);
  }).undo;
}

// Returns true when the task was a priority and the target day already had 3.
export function moveTask(fromK, id, toK) {
  if (fromK === toK) return false;
  let demoted = false;
  commit(() => {
    const from = ensureDay(fromK);
    const i = from.tasks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const [task] = from.tasks.splice(i, 1);
    if (task.type === 'priority' && priorityCount(toK) >= MAX_PRIORITY) {
      task.type = 'required';
      demoted = true;
    }
    insertByTime(ensureDay(toK).tasks, task);
  });
  return demoted;
}

/* ---------- Permanent (daily) tasks ---------- */

const sectionOrder = (s, section) => s.routine.filter((r) => r.section === section && !r.archivedOn);

function setSectionOrder(s, ordered) {
  const ids = new Set(ordered.map((r) => r.id));
  s.routine = [...ordered, ...s.routine.filter((r) => !ids.has(r.id))];
}

export function addRoutine(data) {
  return commit((s) => {
    const r = {
      id: uid(),
      title: clean(data.title),
      section: data.section === 'night' ? 'night' : 'morning',
      time: data.time || null,
      counter: counterFrom(data.counter),
      goalId: data.goalId || null,
      streak: !!data.streak,
      remind: data.remind !== false,
      createdOn: todayKey(),
      archivedOn: null,
    };
    setSectionOrder(s, insertByTime(sectionOrder(s, r.section), r));
    return r;
  });
}

export function updateRoutine(id, patch) {
  return commit((s) => {
    const r = s.routine.find((x) => x.id === id);
    if (!r) return null;
    const timeBefore = r.time || null;
    const sectionBefore = r.section;
    const next = { ...patch };
    if ('counter' in next) next.counter = counterFrom(next.counter);
    if ('title' in next) next.title = clean(next.title) || r.title;
    Object.assign(r, next);
    const moved = r.section !== sectionBefore || ((r.time || null) !== timeBefore && r.time);
    if (moved) {
      const list = sectionOrder(s, r.section).filter((x) => x.id !== r.id);
      setSectionOrder(s, insertByTime(list, r));
    }
    return r;
  });
}

// Removing a permanent task keeps its past days in history; it just stops
// appearing from today on. One added today is removed outright.
export function deleteRoutine(id) {
  return commitUndoable((s) => {
    const r = s.routine.find((x) => x.id === id);
    if (!r) return;
    const t = todayKey();
    if (r.createdOn < t) {
      r.archivedOn = t;
      return;
    }
    s.routine = s.routine.filter((x) => x.id !== id);
    for (const day of Object.values(s.days)) {
      delete day.done[id];
      delete day.counts[id];
      delete day.notes[id];
    }
  }).undo;
}

export function setStreak(id, on) {
  commit((s) => {
    const r = s.routine.find((x) => x.id === id);
    if (r) r.streak = !!on;
  });
}

/* ---------- Checking off, counters, notes ---------- */

export function toggleItem(it) {
  commit(() => {
    const day = ensureDay(it.date);
    if (it.kind === 'routine') {
      if (day.done[it.id]) delete day.done[it.id];
      else day.done[it.id] = true;
      return;
    }
    const task = day.tasks.find((t) => t.id === it.id);
    if (task) task.done = !task.done;
  });
}

function writeCount(it, value) {
  const day = ensureDay(it.date);
  if (it.kind === 'routine') {
    if (value) day.counts[it.id] = value;
    else delete day.counts[it.id];
    return;
  }
  const task = day.tasks.find((t) => t.id === it.id);
  if (task) task.value = value;
}

export function setCount(it, value) {
  const v = roundValue(value);
  commit(() => writeCount(it, v));
  return v;
}

export function setCountUndoable(it, value) {
  const v = roundValue(value);
  return commitUndoable(() => writeCount(it, v)).undo;
}

export function setItemNote(it, text) {
  const note = clean(text);
  commit(() => {
    const day = ensureDay(it.date);
    if (it.kind === 'routine') {
      if (note) day.notes[it.id] = note;
      else delete day.notes[it.id];
      return;
    }
    const task = day.tasks.find((t) => t.id === it.id);
    if (task) task.note = note;
  });
}

export function setDayNote(k, text) {
  commit(() => {
    ensureDay(k).note = clean(text);
  });
}

/* ---------- Reordering ---------- */

// ids is the new visual order of the section. Returns true if the moved task
// had a time and snapped back into time order.
export function reorder(k, section, ids, movedId) {
  let snapped = false;
  commit((s) => {
    if (section === 'today') {
      const day = ensureDay(k);
      const byId = new Map(day.tasks.map((t) => [t.id, t]));
      const list = ids.map((id) => byId.get(id)).filter(Boolean);
      for (const t of day.tasks) if (!ids.includes(t.id)) list.push(t);
      const res = settleMoved(list, list.findIndex((t) => t.id === movedId));
      day.tasks = res.list;
      snapped = res.snapped;
      return;
    }
    const current = s.routine.filter((r) => r.section === section && isActive(r, k));
    const byId = new Map(current.map((r) => [r.id, r]));
    const list = ids.map((id) => byId.get(id)).filter(Boolean);
    for (const r of current) if (!ids.includes(r.id)) list.push(r);
    const res = settleMoved(list, list.findIndex((r) => r.id === movedId));
    setSectionOrder(s, res.list);
    snapped = res.snapped;
  });
  return snapped;
}

/* ---------- New day ---------- */

// Runs when the date changes. Unfinished one-off tasks from every day since
// the last run move to today. The originals stay in history marked as moved.
// Morning and Night need nothing: their check marks are stored per day.
export function rollover() {
  const s = S();
  const t = todayKey();
  const last = s.settings.lastRollover || t;
  if (last === t) return null;
  if (last > t) {
    // The clock went backwards (time zone change). Just resync.
    commit(() => {
      s.settings.lastRollover = t;
    });
    return null;
  }
  let carried = 0;
  let demoted = 0;
  commit(() => {
    const target = ensureDay(t);
    let slots = MAX_PRIORITY - priorityCount(t);
    const untimed = [];
    const timed = [];
    for (let k = last; k < t; k = addDays(k, 1)) {
      const day = s.days[k];
      if (!day) continue;
      for (const task of day.tasks) {
        if (task.carriedTo || taskComplete(task)) continue;
        const copy = {
          ...clone(task),
          id: uid(),
          done: false,
          carriedFrom: k,
          carryCount: (task.carryCount || 0) + 1,
          createdAt: Date.now(),
        };
        delete copy.carriedTo;
        if (copy.type === 'priority') {
          if (slots > 0) slots--;
          else {
            copy.type = 'required';
            demoted++;
          }
        }
        task.carriedTo = t;
        (copy.time ? timed : untimed).push(copy);
        carried++;
      }
    }
    target.tasks = [...untimed, ...target.tasks];
    for (const c of timed) insertByTime(target.tasks, c);
    s.settings.lastRollover = t;
  });
  return { carried, demoted };
}

/* ---------- Goals ---------- */

export function addGoal(data) {
  return commit((s) => {
    const goal = {
      id: uid(),
      title: clean(data.title),
      category: data.category || null,
      months: Number(data.months) || 12,
      createdOn: todayKey(),
      done: false,
      doneOn: null,
      steps: (data.steps || [])
        .map((text) => ({ id: uid(), text: clean(text), done: false }))
        .filter((st) => st.text),
    };
    s.goals.push(goal);
    return goal;
  });
}

export function updateGoal(id, patch) {
  return commit(() => {
    const g = goalById(id);
    if (!g) return null;
    const next = { ...patch };
    if ('title' in next) next.title = clean(next.title) || g.title;
    if ('done' in next) next.doneOn = next.done ? todayKey() : null;
    Object.assign(g, next);
    return g;
  });
}

export function deleteGoal(id) {
  return commitUndoable((s) => {
    s.goals = s.goals.filter((g) => g.id !== id);
    for (const r of s.routine) if (r.goalId === id) r.goalId = null;
  }).undo;
}

export function addStep(goalId, text) {
  const value = clean(text);
  if (!value) return;
  commit(() => {
    goalById(goalId)?.steps.push({ id: uid(), text: value, done: false });
  });
}

export function toggleStep(goalId, stepId) {
  commit(() => {
    const step = goalById(goalId)?.steps.find((x) => x.id === stepId);
    if (step) step.done = !step.done;
  });
}

export function renameStep(goalId, stepId, text) {
  const value = clean(text);
  if (!value) return;
  commit(() => {
    const step = goalById(goalId)?.steps.find((x) => x.id === stepId);
    if (step) step.text = value;
  });
}

export function deleteStep(goalId, stepId) {
  commit(() => {
    const g = goalById(goalId);
    if (g) g.steps = g.steps.filter((x) => x.id !== stepId);
  });
}

/* ---------- Weekly reviews ---------- */

export function saveReview(ws, fields, stats) {
  commit((s) => {
    s.reviews[ws] = {
      wentWell: clean(fields.wentWell),
      didnt: clean(fields.didnt),
      focus: clean(fields.focus),
      stats,
      savedAt: Date.now(),
    };
  });
}

/* ---------- Letters ---------- */

export function sealLetter(text) {
  return commit((s) => {
    const t = todayKey();
    const letter = {
      id: uid(),
      writtenOn: t,
      unlockOn: addMonths(t, LETTER_LOCK_MONTHS),
      sealed: seal(String(text).trim()),
      createdAt: Date.now(),
      openedAt: null,
    };
    s.letters.push(letter);
    s.letterDraft = '';
    return letter;
  });
}

export function deleteLetter(id) {
  commit((s) => {
    s.letters = s.letters.filter((l) => l.id !== id);
  });
}

// Returns the letter text only once it has unlocked.
export function openLetter(id) {
  const letter = S().letters.find((l) => l.id === id);
  if (!letter || letter.unlockOn > todayKey()) return null;
  if (!letter.openedAt) {
    commit(() => {
      letter.openedAt = Date.now();
    });
  }
  return unseal(letter.sealed);
}

export function saveLetterDraft(text) {
  commit(
    (s) => {
      s.letterDraft = String(text || '');
    },
    { silent: true }
  );
}

/* ---------- Settings ---------- */

export function setReminders(patch) {
  commit((s) => {
    Object.assign(s.settings.reminders, patch);
  });
}

export function markBackup() {
  commit((s) => {
    s.settings.lastBackup = new Date().toISOString();
  });
}

export function dismiss(key) {
  commit((s) => {
    s.ui.dismissed[key] = todayKey();
  });
}

export function toggleCollapsed(key, current) {
  commit((s) => {
    s.ui.collapsed[key] = !current;
  });
}
