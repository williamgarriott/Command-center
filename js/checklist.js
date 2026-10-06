// The checklist: Morning, Today and Night sections, rows with swipe and drag,
// the Top 3 card and the day note card. Used by Today, Plan and History.
import { S } from './store.js';
import {
  h,
  icon,
  toast,
  buzz,
  ringSvg,
  beginInteraction,
  endInteraction,
} from './ui.js';
import {
  itemsFor,
  isComplete,
  goalById,
  stepFor,
  getDay,
  SECTION_LABEL,
} from './logic.js';
import { toggleItem, setCountUndoable, reorder, toggleCollapsed } from './actions.js';
import { openTaskForm, openCounterSheet, openDayItemSheet, openDayNoteSheet, removeItem } from './sheets/task.js';
import { todayKey, relDay, dayPhrase, fmtTime, fmtNum } from './util.js';

const SECTION_ICON = { morning: 'sun', today: 'list', night: 'moon' };

// Briefly animates the check mark of the row that was just completed.
const flash = { id: null, at: 0 };

// mode: 'today' (live checklist), 'plan' (a future day), 'history' (a past day)
function canCheck(it, mode) {
  if (mode === 'history') return !it.carriedTo;
  if (mode === 'plan') return it.kind === 'task';
  return true;
}

export function checkControl(it, enabled) {
  const complete = isComplete(it);
  const onclick = (e) => {
    e.stopPropagation();
    if (it.counter) {
      openCounterSheet(it);
      return;
    }
    if (!it.done) {
      flash.id = it.id;
      flash.at = Date.now();
      buzz();
    }
    toggleItem(it);
  };
  if (it.counter) {
    return h(
      'button',
      {
        class: 'check ring',
        type: 'button',
        disabled: !enabled,
        'aria-label': `${it.title}: ${fmtNum(it.value)} of ${fmtNum(it.counter.target)}`,
        onclick,
      },
      ringSvg(it.value / it.counter.target, complete)
    );
  }
  return h(
    'button',
    {
      class: 'check',
      type: 'button',
      role: 'checkbox',
      'aria-checked': String(complete),
      'aria-label': it.title,
      disabled: !enabled,
      onclick,
    },
    h('span', { class: 'box' }, icon('check'))
  );
}

function metaView(it) {
  const parts = [];
  if (it.counter) {
    const unit = it.counter.unit ? ` ${it.counter.unit}` : '';
    parts.push(h('span', { class: 'meta-count' }, `${fmtNum(it.value)} / ${fmtNum(it.counter.target)}${unit}`));
  }
  if (it.carriedTo) {
    parts.push(h('span', { class: 'meta-moved' }, icon('arrow'), `Moved to ${relDay(it.carriedTo)}`));
  } else if (it.carriedFrom) {
    const label = it.carryCount > 1 ? `Carried over ${it.carryCount} days` : `Carried from ${dayPhrase(it.carriedFrom, it.date)}`;
    parts.push(h('span', { class: 'meta-carry' }, icon('repeat'), label));
  }
  const goal = it.goalId ? goalById(it.goalId) : null;
  if (goal) parts.push(h('span', { class: 'meta-goal' }, icon('target'), goal.title));
  if (it.note) parts.push(h('span', { class: 'meta-note' }, icon('note'), it.note));
  return parts.length ? h('span', { class: 'row-meta' }, parts) : null;
}

function openItem(it, mode) {
  if (mode === 'history') openDayItemSheet(it);
  else openTaskForm({ item: it });
}

export function rowView(it, mode) {
  const complete = isComplete(it);
  const checkable = canCheck(it, mode);
  const cls = [
    'row',
    `type-${it.type}`,
    complete ? 'is-done' : '',
    it.carriedTo ? 'is-moved' : '',
    flash.id === it.id && Date.now() - flash.at < 900 ? 'pop' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const typeLabel = it.type === 'priority' ? 'Priority: ' : it.type === 'required' ? 'Required: ' : '';
  const main = h(
    'div',
    { class: 'row-main' },
    checkControl(it, checkable),
    h(
      'button',
      { class: 'row-body', type: 'button', onclick: () => openItem(it, mode) },
      h(
        'span',
        { class: 'row-title' },
        it.type === 'priority' ? icon('flag', 'prio-flag') : null,
        it.type === 'required' ? h('span', { class: 'req-mark', 'aria-hidden': 'true' }) : null,
        typeLabel ? h('span', { class: 'sr-only' }, typeLabel) : null,
        h('span', { class: 'row-text' }, it.title)
      ),
      metaView(it)
    ),
    it.time ? h('span', { class: 'row-time' }, fmtTime(it.time)) : null,
    mode !== 'history' ? h('span', { class: 'grip', title: 'Drag to reorder' }, icon('grip')) : null
  );

  const rightLabel = it.counter
    ? `+${fmtNum(stepFor(it.counter))}${it.counter.unit ? ` ${it.counter.unit}` : ''}`
    : complete
      ? 'Undo'
      : 'Done';
  const row = h(
    'div',
    { class: cls, 'data-id': it.id },
    h('div', { class: 'row-bg bg-right', 'aria-hidden': 'true' }, icon(it.counter ? 'plus' : complete ? 'x' : 'check'), h('span', null, rightLabel)),
    h('div', { class: 'row-bg bg-left', 'aria-hidden': 'true' }, h('span', null, 'Delete'), icon('trash')),
    main
  );
  if (mode !== 'history') attachSwipe(row, main, it, checkable);
  return row;
}

/* ---------- Swipe: right to check off (or add to a counter), left to delete ---------- */

function swallowNextClick() {
  const stop = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
}

function onSwipeRight(it) {
  buzz();
  if (it.counter) {
    const step = stepFor(it.counter);
    const next = it.value + step;
    const undo = setCountUndoable(it, next);
    const unit = it.counter.unit ? ` ${it.counter.unit}` : '';
    toast(`${it.title}: ${fmtNum(next)} / ${fmtNum(it.counter.target)}${unit}`, { action: 'Undo', onAction: undo });
    return;
  }
  if (!it.done) {
    flash.id = it.id;
    flash.at = Date.now();
  }
  toggleItem(it);
}

function attachSwipe(row, main, it, checkable) {
  let pid = null;
  let phase = 'idle';
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let width = 0;

  main.addEventListener('pointerdown', (e) => {
    if (phase !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.grip')) return;
    pid = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    dx = 0;
    width = main.offsetWidth;
    phase = 'pending';
  });

  main.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || phase === 'idle') return;
    const mx = e.clientX - sx;
    const my = e.clientY - sy;
    if (phase === 'pending') {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2) {
        phase = 'swiping';
        beginInteraction();
        try {
          main.setPointerCapture(pid);
        } catch {
          // Pointer already released.
        }
        row.classList.add('swiping');
      } else if (Math.abs(my) > 12) {
        phase = 'idle';
        pid = null;
        return;
      } else {
        return;
      }
    }
    let x = mx;
    if (x > 0 && !checkable) x = Math.min(x, 24);
    const limit = width * 0.6;
    if (Math.abs(x) > limit) x = Math.sign(x) * (limit + (Math.abs(x) - limit) * 0.2);
    dx = x;
    main.style.transform = `translateX(${x}px)`;
    const armed = Math.abs(x) >= Math.min(110, width * 0.3) && (x < 0 || checkable);
    row.classList.toggle('dir-right', x > 0);
    row.classList.toggle('dir-left', x < 0);
    row.classList.toggle('armed', armed);
  });

  const finish = (e, cancelled) => {
    if (e.pointerId !== pid) return;
    const wasSwiping = phase === 'swiping';
    phase = 'idle';
    pid = null;
    if (!wasSwiping) return;
    swallowNextClick();
    const armed = !cancelled && row.classList.contains('armed');
    main.style.transition = 'transform 180ms ease';
    if (armed && dx < 0) {
      main.style.transform = `translateX(${-width - 20}px)`;
      setTimeout(() => {
        endInteraction();
        removeItem(it);
      }, 170);
      return;
    }
    main.style.transform = '';
    setTimeout(() => {
      main.style.transition = '';
      row.classList.remove('swiping', 'dir-right', 'dir-left', 'armed');
      endInteraction();
      if (armed) onSwipeRight(it);
    }, 180);
  };
  main.addEventListener('pointerup', (e) => finish(e, false));
  main.addEventListener('pointercancel', (e) => finish(e, true));
}

/* ---------- Drag to reorder (by the grip) ---------- */

function attachDrag(list, k, section) {
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rows = [...list.children].filter((el) => el.classList.contains('row'));
    const row = grip.closest('.row');
    const from = rows.indexOf(row);
    if (from < 0 || rows.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    beginInteraction();

    const pointerId = e.pointerId;
    const rects = rows.map((r) => r.getBoundingClientRect());
    const gap = rects[1].top - rects[0].bottom;
    const slot = rects[from].height + gap;
    const startY = e.clientY;
    const startScroll = window.scrollY;
    let lastY = e.clientY;
    let to = from;
    let raf = 0;
    try {
      grip.setPointerCapture(pointerId);
    } catch {
      // Ignore: moves still arrive while the finger stays on the grip.
    }
    row.classList.add('dragging');
    document.body.classList.add('drag-active');
    buzz();

    const layout = () => {
      const dy = lastY - startY + (window.scrollY - startScroll);
      row.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      let idx = from;
      for (let i = 0; i < rows.length; i++) {
        if (i === from) continue;
        const mid = rects[i].top + rects[i].height / 2;
        if (i < from && center < mid) idx = Math.min(idx, i);
        if (i > from && center > mid) idx = Math.max(idx, i);
      }
      to = idx;
      rows.forEach((r, i) => {
        if (i === from) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -slot;
        else if (from > to && i >= to && i < from) shift = slot;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    const autoScroll = () => {
      const top = 90;
      const bottom = window.innerHeight - 160;
      let v = 0;
      if (lastY < top) v = -Math.ceil((top - lastY) / 5);
      else if (lastY > bottom) v = Math.ceil((lastY - bottom) / 5);
      if (v) {
        window.scrollBy(0, v);
        layout();
      }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      lastY = ev.clientY;
      layout();
    };
    const done = (ev) => {
      if (ev.pointerId !== pointerId) return;
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', done);
      grip.removeEventListener('pointercancel', done);
      rows.forEach((r) => {
        r.style.transform = '';
      });
      row.classList.remove('dragging');
      document.body.classList.remove('drag-active');
      const ids = rows.map((r) => r.dataset.id);
      const moved = ids[from];
      endInteraction();
      if (to === from) return;
      ids.splice(from, 1);
      ids.splice(to, 0, moved);
      if (reorder(k, section, ids, moved)) {
        toast('Timed tasks stay in time order. Change the time to move it there.');
      }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', done);
    grip.addEventListener('pointercancel', done);
  });
}

/* ---------- Sections ---------- */

function sectionLabel(k, section, mode) {
  if (section !== 'today') return SECTION_LABEL[section];
  if (mode === 'today') return 'Today';
  return relDay(k);
}

function emptyText(section, k, mode) {
  if (mode === 'history') return section === 'today' ? 'No one-off tasks this day.' : 'Nothing here this day.';
  if (section === 'morning') return 'Add the things you do every morning. They reset at midnight.';
  if (section === 'night') return 'Add your night routine. It resets at midnight.';
  if (mode === 'plan') return `Nothing planned for ${dayPhrase(k)} yet.`;
  return 'Add one-off tasks for today, with or without a time.';
}

export function sectionView(k, section, mode) {
  const items = itemsFor(k, section);
  const collapseKey = `${mode}:${section}`;
  const stored = S().ui.collapsed[collapseKey];
  const collapsed = mode !== 'history' && (stored ?? (mode === 'plan' && section !== 'today'));
  const doneCount = items.filter(isComplete).length;
  const label = sectionLabel(k, section, mode);
  const allDone = items.length > 0 && doneCount === items.length;

  const head = h(
    'div',
    { class: 'section-head' },
    h(
      'button',
      {
        class: 'section-toggle',
        type: 'button',
        'aria-expanded': String(!collapsed),
        disabled: mode === 'history',
        onclick: () => toggleCollapsed(collapseKey, collapsed),
      },
      icon(SECTION_ICON[section], 'section-ico'),
      h('span', { class: 'section-name', role: 'heading', 'aria-level': '2' }, label),
      items.length ? h('span', { class: `section-count${allDone ? ' all-done' : ''}` }, `${doneCount}/${items.length}`) : null,
      section !== 'today' ? h('span', { class: 'section-tag' }, icon('repeat'), 'Daily') : null,
      mode !== 'history' ? icon('chevron-down', 'chev') : null
    ),
    mode !== 'history'
      ? h(
          'button',
          {
            class: 'icon-btn section-add',
            type: 'button',
            'aria-label': `Add to ${label}`,
            onclick: () => openTaskForm({ date: k, dest: section === 'today' ? 'day' : section }),
          },
          icon('plus')
        )
      : null
  );

  const list = h('div', { class: 'list', 'data-section': section });
  if (!collapsed) {
    for (const it of items) list.append(rowView(it, mode));
    if (!items.length) list.append(h('p', { class: 'list-empty' }, emptyText(section, k, mode)));
    if (mode !== 'history') attachDrag(list, k, section);
  }
  return h('section', { class: `section sec-${section}${collapsed ? ' collapsed' : ''}` }, head, list);
}

export function checklistView(k, mode) {
  return [sectionView(k, 'morning', mode), sectionView(k, 'today', mode), sectionView(k, 'night', mode)];
}

/* ---------- Top 3 ---------- */

export function top3Card(k, mode) {
  const items = itemsFor(k, 'today').filter((it) => it.type === 'priority' && !it.carriedTo);
  const done = items.filter(isComplete).length;
  return h(
    'section',
    { class: 'card top3' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', null, icon('flag'), 'Top 3'),
      h('span', { class: 'card-meta' }, items.length ? `${done} of ${items.length} done` : mode === 'plan' ? relDay(k) : 'Today')
    ),
    items.length
      ? h(
          'ol',
          { class: 'top3-list' },
          items.map((it) =>
            h(
              'li',
              { class: `top3-item${isComplete(it) ? ' is-done' : ''}` },
              checkControl(it, canCheck(it, mode)),
              h(
                'button',
                { class: 'top3-title', type: 'button', onclick: () => openTaskForm({ item: it }) },
                h('span', { class: 'top3-text' }, it.title),
                it.time ? h('span', { class: 'top3-time' }, fmtTime(it.time)) : null
              )
            )
          )
        )
      : null,
    items.length < 3
      ? h(
          'button',
          {
            class: 'top3-add',
            type: 'button',
            onclick: () => openTaskForm({ date: k, dest: 'day', type: 'priority' }),
          },
          icon('plus'),
          items.length ? `Add a priority (${3 - items.length} left)` : `Pick up to 3 priorities for ${dayPhrase(k)}`
        )
      : null
  );
}

/* ---------- Day note ---------- */

export function dayNoteCard(k, mode) {
  const note = getDay(k).note;
  const t = todayKey();
  const label = mode === 'plan' ? 'Plan note' : k === t ? "Today's note" : 'Day note';
  return h(
    'button',
    { class: 'card note-card', type: 'button', onclick: () => openDayNoteSheet(k) },
    h('span', { class: 'note-head' }, icon('note'), label),
    note
      ? h('span', { class: 'note-text' }, note)
      : h('span', { class: 'note-empty' }, mode === 'plan' ? 'Add a note for this day' : 'Add a quick note about the day')
  );
}
