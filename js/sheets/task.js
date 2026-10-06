// Add and edit tasks, update counters, write notes.
import { S } from '../store.js';
import {
  h,
  icon,
  openSheet,
  toast,
  field,
  segmented,
  toggleSwitch,
  chip,
  progressBar,
  openPicker,
} from '../ui.js';
import {
  priorityCount,
  MAX_PRIORITY,
  SECTION_LABEL,
  autoStep,
  stepFor,
  isComplete,
  getDay,
  routineItem,
  taskItem,
} from '../logic.js';
import {
  addTask,
  addRoutine,
  updateTask,
  updateRoutine,
  moveTask,
  deleteTask,
  deleteRoutine,
  setCount,
  setItemNote,
  setDayNote,
} from '../actions.js';
import { todayKey, addDays, relDay, dayPhrase, fmtDate, fmtLong, fmtTime, fmtNum } from '../util.js';

/* ---------- Day picker chips: Today / Tomorrow / Pick a day ---------- */

function dayPicker(initial, onChange) {
  const t = todayKey();
  const tm = addDays(t, 1);
  let value = initial;
  const wrap = h('div', { class: 'chips' });
  const input = h('input', {
    type: 'date',
    class: 'chip-date-input',
    min: t,
    value: initial,
    'aria-label': 'Pick a day',
    onclick: (e) => openPicker(e.target),
    onchange: (e) => {
      if (!e.target.value) return;
      set(e.target.value < t ? t : e.target.value);
    },
  });
  const set = (k) => {
    value = k;
    input.value = k;
    paint();
    onChange(k);
  };
  const paint = () => {
    const custom = value !== t && value !== tm;
    wrap.replaceChildren(
      chip('Today', value === t, () => set(t)),
      chip('Tomorrow', value === tm, () => set(tm)),
      h('span', { class: `chip chip-date${custom ? ' on' : ''}` }, icon('calendar'), custom ? fmtDate(value) : 'Pick a day', input)
    );
  };
  paint();
  return wrap;
}

function typeOptions(k, excludeId, current) {
  const used = priorityCount(k, excludeId);
  const full = used >= MAX_PRIORITY && current !== 'priority';
  return [
    { value: 'priority', label: 'Priority', className: 'seg-prio', disabled: full },
    { value: 'required', label: 'Required', className: 'seg-req' },
    { value: 'normal', label: 'Normal' },
  ];
}

function priorityHint(k, excludeId) {
  const used = priorityCount(k, excludeId);
  const day = dayPhrase(k);
  if (used >= MAX_PRIORITY) return `All ${MAX_PRIORITY} priorities are set for ${day}.`;
  return `${used} of ${MAX_PRIORITY} priorities set for ${day}.`;
}

/* ---------- Add / edit form ---------- */

// item: an existing item to edit. Otherwise a new task for `date`, where dest
// is 'day' (one-off), 'morning' or 'night' (permanent).
export function openTaskForm({ item = null, date = todayKey(), dest = 'day', type = 'normal' } = {}) {
  const editing = !!item;
  const t = todayKey();
  const f = {
    title: item ? item.title : '',
    dest: item ? (item.kind === 'routine' ? item.section : 'day') : dest,
    date: item ? item.date : date < t ? t : date,
    type: item ? item.type : type,
    time: item?.time || '',
    counterOn: !!item?.counter,
    target: item?.counter ? String(item.counter.target) : '',
    unit: item?.counter?.unit || '',
    step: item?.counter ? String(item.counter.step) : '',
    goalId: item?.goalId || '',
    remind: item ? item.remind : true,
    note: item?.note || '',
    streak: item ? !!item.streak : false,
  };
  const excludeId = item?.kind === 'task' ? item.id : null;

  const sheet = openSheet({ title: editing ? 'Edit task' : 'New task', className: 'sheet-form' });

  const titleInput = h('input', {
    class: 'input input-lg',
    type: 'text',
    placeholder: 'What needs doing?',
    value: f.title,
    maxlength: '140',
    enterkeyhint: 'done',
    autocomplete: 'off',
    'aria-label': 'Task',
    oninput: (e) => {
      f.title = e.target.value;
      titleInput.classList.remove('invalid');
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    },
  });

  // Where the task lives.
  const repeatSeg = segmented(
    [
      { value: 'day', label: 'Once' },
      { value: 'morning', label: 'Every morning' },
      { value: 'night', label: 'Every night' },
    ],
    f.dest,
    (v) => {
      f.dest = v;
      paintDest();
    },
    'Repeat'
  );
  const routineSeg = segmented(
    [
      { value: 'morning', label: 'Every morning' },
      { value: 'night', label: 'Every night' },
    ],
    f.dest,
    (v) => {
      f.dest = v;
    },
    'Section'
  );

  const dayRow = h('div', { class: 'form-block' });
  const typeHint = h('span', { class: 'field-hint' });
  const typeSeg = segmented(typeOptions(f.date, excludeId, f.type), f.type, (v) => {
    f.type = v;
  }, 'Task type');
  const typeBlock = h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Type'), typeSeg, typeHint);

  const paintType = () => {
    if (f.type === 'priority' && priorityCount(f.date, excludeId) >= MAX_PRIORITY) f.type = 'normal';
    typeSeg.setOptions(typeOptions(f.date, excludeId, f.type), f.type);
    typeHint.textContent = priorityHint(f.date, excludeId);
  };

  dayRow.append(
    h('span', { class: 'field-label' }, editing ? 'Day' : 'Which day'),
    dayPicker(f.date, (k) => {
      f.date = k;
      paintType();
    })
  );

  const isRoutineForm = () => f.dest !== 'day';
  const paintDest = () => {
    dayRow.hidden = isRoutineForm();
    typeBlock.hidden = isRoutineForm();
    streakRow.hidden = !isRoutineForm();
    noteBlock.hidden = !editing && isRoutineForm();
    paintType();
  };

  // Time.
  const timeInput = h('input', {
    type: 'time',
    class: 'input input-time',
    value: f.time,
    'aria-label': 'Time',
    oninput: (e) => {
      f.time = e.target.value;
      paintTime();
    },
    onchange: (e) => {
      f.time = e.target.value;
      paintTime();
    },
  });
  const clearTime = h(
    'button',
    {
      type: 'button',
      class: 'btn-text',
      onclick: () => {
        f.time = '';
        timeInput.value = '';
        paintTime();
      },
    },
    'No time'
  );
  const reminders = S().settings.reminders;
  const remindRow = toggleSwitch(
    f.remind,
    (v) => {
      f.remind = v;
    },
    'Remind me',
    reminders.tasks ? 'Sends a reminder at this time' : 'Task reminders are off in Settings'
  );
  const paintTime = () => {
    clearTime.hidden = !f.time;
    remindRow.hidden = !f.time;
  };
  const timeBlock = h(
    'div',
    { class: 'form-block' },
    h('span', { class: 'field-label' }, 'Time'),
    h('div', { class: 'time-row' }, timeInput, clearTime),
    h('span', { class: 'field-hint' }, 'Optional. Timed tasks sort into place by time.')
  );

  // Counter.
  const counterFields = h(
    'div',
    { class: 'counter-fields', hidden: !f.counterOn },
    field(
      'Target',
      h('input', {
        type: 'number',
        inputmode: 'decimal',
        min: '0',
        step: 'any',
        class: 'input',
        placeholder: '200',
        value: f.target,
        oninput: (e) => {
          f.target = e.target.value;
          stepInput.placeholder = `Auto (${autoStep(f.target)})`;
        },
      })
    ),
    field(
      'Unit',
      h('input', {
        type: 'text',
        class: 'input',
        placeholder: 'g, min, cards',
        maxlength: '12',
        value: f.unit,
        oninput: (e) => {
          f.unit = e.target.value;
        },
      })
    ),
    field(
      'Per tap',
      h('input', {
        type: 'number',
        inputmode: 'decimal',
        min: '0',
        step: 'any',
        class: 'input',
        placeholder: f.target ? `Auto (${autoStep(f.target)})` : 'Auto',
        value: f.step,
        oninput: (e) => {
          f.step = e.target.value;
        },
      })
    )
  );
  const stepInput = counterFields.querySelectorAll('input')[2];
  const counterRow = toggleSwitch(
    f.counterOn,
    (on) => {
      f.counterOn = on;
      counterFields.hidden = !on;
    },
    'Track a number',
    'Like 200 g protein or 30 min of practice'
  );

  // Goal link.
  const goals = S().goals.filter((g) => !g.done || g.id === f.goalId);
  const goalSelect = h(
    'select',
    {
      class: 'input select',
      'aria-label': 'Linked goal',
      onchange: (e) => {
        f.goalId = e.target.value;
      },
    },
    h('option', { value: '' }, 'No goal'),
    goals.map((g) => h('option', { value: g.id, selected: g.id === f.goalId }, g.category ? `${g.title} · ${g.category}` : g.title))
  );
  const goalBlock = h(
    'div',
    { class: 'form-block' },
    h('span', { class: 'field-label' }, 'Builds toward'),
    goals.length ? goalSelect : h('p', { class: 'field-hint' }, 'Add goals in the Goals tab, then link tasks to them here.')
  );

  const streakRow = toggleSwitch(
    f.streak,
    (v) => {
      f.streak = v;
    },
    'Track as a streak',
    'Shows a mini calendar and streak in Progress'
  );

  const noteLabel = item?.kind === 'routine' ? `Note for ${item.date === t ? 'today' : fmtDate(item.date)}` : 'Note';
  const noteInput = h('textarea', {
    class: 'input textarea',
    rows: '3',
    placeholder: 'What you lifted, practiced, or how it went',
    oninput: (e) => {
      f.note = e.target.value;
    },
  });
  noteInput.value = f.note;
  const noteBlock = h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, noteLabel), noteInput);

  const more = h(
    'details',
    { class: 'more', open: editing },
    h('summary', null, 'More options'),
    h('div', { class: 'more-body' }, counterRow, counterFields, remindRow, goalBlock, streakRow, noteBlock)
  );

  const blocks = [h('div', { class: 'form-block' }, titleInput)];
  if (!editing) blocks.push(h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Repeat'), repeatSeg));
  else if (item.kind === 'routine') blocks.push(h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Section'), routineSeg));
  blocks.push(dayRow, typeBlock, timeBlock, more);
  sheet.setBody(h('div', { class: 'form' }, blocks));

  paintDest();
  paintTime();

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save() }, editing ? 'Save' : 'Add task');
  sheet.setFooter(
    editing
      ? h(
          'button',
          {
            class: 'btn btn-ghost-danger',
            type: 'button',
            onclick: () => {
              sheet.close();
              removeItem(item);
            },
          },
          icon('trash'),
          'Delete'
        )
      : null,
    saveBtn
  );

  if (!editing) titleInput.focus();

  function save() {
    const title = f.title.trim();
    if (!title) {
      titleInput.classList.add('invalid');
      titleInput.focus();
      return;
    }
    if (f.counterOn && !(Number(f.target) > 0)) {
      toast('Set a target number above 0, or turn off "Track a number".');
      return;
    }
    const counter = f.counterOn ? { target: f.target, unit: f.unit, step: f.step } : null;
    const data = { title, time: f.time || null, counter, goalId: f.goalId || null, remind: f.remind };

    if (!editing) {
      if (f.dest === 'day') {
        const task = addTask(f.date, { ...data, type: f.type, note: f.note });
        if (f.type === 'priority' && task.type !== 'priority') toast('That day already has 3 priorities. Added as Required.');
        else if (f.date !== date) toast(`Added to ${relDay(f.date)}`);
      } else {
        addRoutine({ ...data, section: f.dest, streak: f.streak });
        toast(`Added to your ${SECTION_LABEL[f.dest]} routine`);
      }
    } else if (item.kind === 'task') {
      updateTask(item.date, item.id, { ...data, type: f.type, note: f.note });
      if (f.date !== item.date) {
        const demoted = moveTask(item.date, item.id, f.date);
        toast(demoted ? `Moved to ${relDay(f.date)} as Required (3 priorities already set)` : `Moved to ${relDay(f.date)}`);
      }
    } else {
      updateRoutine(item.id, { ...data, section: f.dest, streak: f.streak });
      if (f.note.trim() !== (item.note || '')) setItemNote(item, f.note);
    }
    sheet.close();
  }
}

export function removeItem(it) {
  const undo = it.kind === 'routine' ? deleteRoutine(it.id) : deleteTask(it.date, it.id);
  const msg = it.kind === 'routine' ? `Removed from your ${SECTION_LABEL[it.section]} routine` : 'Task deleted';
  toast(msg, {
    action: 'Undo',
    duration: 6000,
    onAction: () => {
      if (!undo()) toast('Too late to undo that.');
    },
  });
}

/* ---------- Counter ---------- */

// Re-reads the item so the sheet always shows the saved value.
function freshItem(it) {
  if (it.kind === 'routine') {
    const r = S().routine.find((x) => x.id === it.id);
    return r ? routineItem(r, it.date) : it;
  }
  const task = getDay(it.date).tasks.find((x) => x.id === it.id);
  return task ? taskItem(task, it.date) : it;
}

export function openCounterSheet(item) {
  const it = freshItem(item);
  if (!it.counter) return;
  const { target, unit } = it.counter;
  const step = stepFor(it.counter);
  const u = unit ? ` ${unit}` : '';
  let value = it.value;

  const sheet = openSheet({ title: it.title, className: 'sheet-counter' });
  const big = h('div', { class: 'counter-big' });
  const bar = h('div', { class: 'counter-bar' });
  const status = h('p', { class: 'counter-status' });
  const input = h('input', {
    type: 'number',
    inputmode: 'decimal',
    min: '0',
    step: 'any',
    class: 'input',
    'aria-label': 'Set exact value',
    placeholder: 'Exact number',
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyInput();
      }
    },
  });

  const apply = (v) => {
    value = setCount(it, v);
    paint();
  };
  const applyInput = () => {
    if (input.value === '') return;
    apply(Number(input.value));
    input.value = '';
    input.blur();
  };

  const paint = () => {
    big.replaceChildren(
      h('span', { class: 'counter-value' }, fmtNum(value)),
      h('span', { class: 'counter-target' }, ` / ${fmtNum(target)}${u}`)
    );
    bar.replaceChildren(progressBar(value / target, 'bar-lg'));
    status.textContent =
      value >= target ? 'Target hit. This counts as done.' : `${fmtNum(target - value)}${u} to go`;
    status.classList.toggle('done', value >= target);
  };

  const stepBtn = (mult) =>
    h(
      'button',
      { class: 'btn counter-btn', type: 'button', onclick: () => apply(value + step * mult) },
      `${mult > 0 ? '+' : '−'}${fmtNum(Math.abs(step * mult))}`
    );

  sheet.setBody(
    h(
      'div',
      { class: 'counter' },
      it.date !== todayKey() ? h('p', { class: 'field-hint' }, fmtLong(it.date)) : null,
      big,
      bar,
      status,
      h('div', { class: 'counter-grid' }, stepBtn(-1), stepBtn(1), stepBtn(2), stepBtn(4)),
      h('div', { class: 'counter-set' }, input, h('button', { class: 'btn', type: 'button', onclick: applyInput }, 'Set')),
      h(
        'div',
        { class: 'counter-quick' },
        h('button', { class: 'btn-text', type: 'button', onclick: () => apply(0) }, 'Reset to 0'),
        h('button', { class: 'btn-text', type: 'button', onclick: () => apply(Math.max(value, target)) }, 'Mark target hit')
      )
    )
  );
  sheet.setFooter(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Done'));
  paint();
}

/* ---------- Notes ---------- */

// Used from History: change a past day's note (and counter) without touching the task itself.
export function openDayItemSheet(item) {
  const it = freshItem(item);
  const sheet = openSheet({ title: it.title, className: 'sheet-form' });
  const noteInput = h('textarea', { class: 'input textarea', rows: '4', placeholder: 'Add a note' });
  noteInput.value = it.note;
  const status = isComplete(it) ? 'Done' : it.carriedTo ? `Moved to ${relDay(it.carriedTo)}` : 'Not done';
  sheet.setBody(
    h(
      'div',
      { class: 'form' },
      h('p', { class: 'field-hint' }, `${fmtLong(it.date)} · ${status}${it.time ? ` · ${fmtTime(it.time)}` : ''}`),
      it.counter
        ? h(
            'button',
            { class: 'btn', type: 'button', onclick: () => openCounterSheet(it) },
            `${fmtNum(it.value)} / ${fmtNum(it.counter.target)}${it.counter.unit ? ` ${it.counter.unit}` : ''} · Change`
          )
        : null,
      h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Note'), noteInput)
    )
  );
  sheet.setFooter(
    h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          setItemNote(it, noteInput.value);
          sheet.close();
        },
      },
      'Save note'
    )
  );
}

export function openDayNoteSheet(k) {
  const t = todayKey();
  const title = k === t ? "Today's note" : k > t ? `Plan note · ${fmtDate(k)}` : `Note · ${fmtDate(k)}`;
  const sheet = openSheet({ title, className: 'sheet-form' });
  const input = h('textarea', {
    class: 'input textarea',
    rows: '7',
    placeholder: k > t ? 'Anything to remember for this day' : 'How did the day go? Training, practice, trades, wins.',
  });
  input.value = getDay(k).note;
  sheet.setBody(h('div', { class: 'form' }, input));
  sheet.setFooter(
    h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          setDayNote(k, input.value);
          sheet.close();
        },
      },
      'Save note'
    )
  );
  input.focus();
}
