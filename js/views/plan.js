// Plan: set up tomorrow (or any future day) ahead of time.
import { h, icon, nav, openSheet, pageHeader } from '../ui.js';
import { getDay, monthMatrix } from '../logic.js';
import { checklistView, top3Card, dayNoteCard } from '../checklist.js';
import { todayKey, addDays, fmtDate, fmtLong, relDay, parseKey } from '../util.js';

let selected = null;

export function setPlanDate(k) {
  selected = k;
}

// Defaults to tomorrow, and moves forward on its own once a planned day arrives.
export function planDate() {
  const t = todayKey();
  if (!selected || selected <= t) selected = addDays(t, 1);
  return selected;
}

const plannedCount = (k) => getDay(k).tasks.length;

function dateStrip(k) {
  const t = todayKey();
  const days = [];
  for (let i = 1; i <= 14; i++) days.push(addDays(t, i));
  if (!days.includes(k)) days.push(k);
  const strip = h(
    'div',
    { class: 'date-strip', role: 'tablist', 'aria-label': 'Day to plan' },
    days.map((d) => {
      const n = plannedCount(d);
      return h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `date-chip${d === k ? ' on' : ''}`,
          'aria-selected': String(d === k),
          onclick: () => {
            selected = d;
            nav.refresh();
          },
        },
        h('span', { class: 'date-chip-dow' }, d === addDays(t, 1) ? 'Tmrw' : fmtDate(d, { weekday: 'short' })),
        h('span', { class: 'date-chip-num' }, String(parseKey(d).getDate())),
        h('span', { class: `date-chip-dot${n ? ' has' : ''}`, 'aria-label': n ? `${n} planned` : 'Nothing planned' })
      );
    })
  );
  requestAnimationFrame(() => strip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  return strip;
}

export function openCalendarPicker(current, onPick) {
  const t = todayKey();
  const start = parseKey(current);
  let y = start.getFullYear();
  let m = start.getMonth();
  const sheet = openSheet({ title: 'Plan a day', className: 'sheet-calendar' });
  const paint = () => {
    const cells = monthMatrix(y, m);
    const title = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const now = parseKey(t);
    const atCurrentMonth = y === now.getFullYear() && m === now.getMonth();
    sheet.setBody(
      h(
        'div',
        { class: 'cal' },
        h(
          'div',
          { class: 'cal-head' },
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': 'Previous month',
              disabled: atCurrentMonth,
              onclick: () => {
                m -= 1;
                if (m < 0) {
                  m = 11;
                  y -= 1;
                }
                paint();
              },
            },
            icon('chevron-left')
          ),
          h('strong', null, title),
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': 'Next month',
              onclick: () => {
                m += 1;
                if (m > 11) {
                  m = 0;
                  y += 1;
                }
                paint();
              },
            },
            icon('chevron-right')
          )
        ),
        h('div', { class: 'cal-dow' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('span', null, d))),
        h(
          'div',
          { class: 'cal-grid' },
          cells.map((k) => {
            if (!k) return h('span', { class: 'cal-cell is-blank' });
            const past = k <= t;
            const n = plannedCount(k);
            return h(
              'button',
              {
                type: 'button',
                class: `cal-cell${k === current ? ' on' : ''}${past ? ' is-past' : ''}${n ? ' has' : ''}`,
                disabled: past,
                'aria-label': `${fmtLong(k)}${n ? `, ${n} planned` : ''}`,
                onclick: () => {
                  sheet.close();
                  onPick(k);
                },
              },
              String(parseKey(k).getDate())
            );
          })
        ),
        h('p', { class: 'field-hint' }, 'Dots mark days that already have tasks planned.')
      )
    );
  };
  paint();
}

export function renderPlan() {
  const k = planDate();
  const n = plannedCount(k);
  return [
    pageHeader(
      'Plan',
      'Set up the day ahead. At midnight it becomes Today.',
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Pick a date from the calendar',
          onclick: () =>
            openCalendarPicker(k, (d) => {
              selected = d;
              nav.refresh();
            }),
        },
        icon('calendar')
      )
    ),
    dateStrip(k),
    h(
      'div',
      { class: 'plan-day' },
      h('h2', null, fmtLong(k)),
      h('span', { class: 'plan-day-meta' }, `${relDay(k)} · ${n ? `${n} planned` : 'nothing planned yet'}`)
    ),
    top3Card(k, 'plan'),
    ...checklistView(k, 'plan'),
    dayNoteCard(k, 'plan'),
  ];
}
