// Progress: daily score and weekly average, streak trackers, and history.
import { S } from '../store.js';
import { h, icon, nav, openSheet, pageHeader, toggleSwitch, emptyState } from '../ui.js';
import { dayScore, weekStats, streakInfo, routineDone, monthMatrix, itemsFor, isComplete, SECTION_LABEL } from '../logic.js';
import { setStreak } from '../actions.js';
import { openDaySheet } from '../sheets/day.js';
import { todayKey, addDays, weekStartOf, fmtDate, fmtShort, parseKey, plural } from '../util.js';

const monthView = new Map();
let historyCount = 14;

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function openDay(k) {
  if (k === todayKey()) nav.go('today');
  else openDaySheet(k);
}

/* ---------- Score ---------- */

function scoreCard(t) {
  const today = dayScore(t);
  const ws = weekStartOf(t);
  const week = weekStats(ws);
  const last = weekStats(addDays(ws, -7));
  const stat = (label, value, sub) =>
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null);
  return h(
    'section',
    { class: 'card score-card' },
    h(
      'div',
      { class: 'stats' },
      stat('Today', today ? `${today.pct}%` : '–', today ? `${today.done} of ${today.total}` : 'No tasks'),
      stat('This week', week.avg != null ? `${week.avg}%` : '–', 'average'),
      stat('Last week', last.avg != null ? `${last.avg}%` : '–', 'average')
    ),
    weekBars(week, t),
    week.pTotal ? h('p', { class: 'score-foot' }, `Priorities this week: ${week.pDone} of ${week.pTotal} done`) : null
  );
}

export function weekBars(week, t = todayKey()) {
  return h(
    'div',
    { class: 'wbars', role: 'list', 'aria-label': 'Daily score this week' },
    week.days.map(({ k, score }, i) => {
      const future = k > t;
      const pct = score ? score.pct : 0;
      return h(
        'button',
        {
          type: 'button',
          role: 'listitem',
          class: `wbar${k === t ? ' is-today' : ''}${future ? ' is-future' : ''}${pct === 100 ? ' is-perfect' : ''}`,
          disabled: future || !score,
          'aria-label': `${fmtDate(k)}: ${score ? `${pct}%` : 'no score'}`,
          onclick: () => openDay(k),
        },
        h('span', { class: 'wbar-val' }, score ? `${pct}%` : ''),
        h('span', { class: 'wbar-track' }, h('span', { class: 'wbar-fill', style: { height: `${pct}%` } })),
        h('span', { class: 'wbar-dow' }, DOW[i])
      );
    })
  );
}

/* ---------- Streaks ---------- */

function openStreakManager() {
  const sheet = openSheet({ title: 'Streak trackers', className: 'sheet-form' });
  const active = S().routine.filter((r) => !r.archivedOn);
  const group = (section) => {
    const list = active.filter((r) => r.section === section);
    if (!list.length) return null;
    return h(
      'div',
      { class: 'form-block' },
      h('span', { class: 'field-label' }, SECTION_LABEL[section]),
      list.map((r) => toggleSwitch(r.streak, (on) => setStreak(r.id, on), r.title))
    );
  };
  sheet.setBody(
    h(
      'div',
      { class: 'form' },
      h('p', { class: 'field-hint' }, 'Pick the daily tasks you want to track. Each one gets a streak and a mini calendar.'),
      group('morning'),
      group('night')
    )
  );
  sheet.setFooter(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Done'));
}

function miniCalendar(r, t) {
  const now = parseKey(t);
  const view = monthView.get(r.id) || { y: now.getFullYear(), m: now.getMonth() };
  const cells = monthMatrix(view.y, view.m);
  const atCurrent = view.y === now.getFullYear() && view.m === now.getMonth();
  const created = parseKey(r.createdOn);
  const atStart = view.y < created.getFullYear() || (view.y === created.getFullYear() && view.m <= created.getMonth());
  const shift = (delta) => {
    let { y, m } = view;
    m += delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    monthView.set(r.id, { y, m });
    nav.refresh();
  };
  let monthDone = 0;
  const grid = cells.map((k) => {
    if (!k) return h('span', { class: 'mc-cell is-blank' });
    const done = routineDone(r, k);
    if (done) monthDone++;
    const cls = ['mc-cell'];
    if (done) cls.push('is-done');
    else if (k > t || k < r.createdOn) cls.push('is-off');
    else if (k < t) cls.push('is-missed');
    if (k === t) cls.push('is-today');
    return h('span', { class: cls.join(' '), title: fmtDate(k) }, String(parseKey(k).getDate()));
  });
  const label = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return h(
    'div',
    { class: 'mc' },
    h(
      'div',
      { class: 'mc-head' },
      h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': 'Previous month', disabled: atStart, onclick: () => shift(-1) }, icon('chevron-left')),
      h('span', { class: 'mc-title' }, label, h('span', { class: 'mc-count' }, ` · ${monthDone} ${monthDone === 1 ? 'day' : 'days'}`)),
      h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': 'Next month', disabled: atCurrent, onclick: () => shift(1) }, icon('chevron-right'))
    ),
    h('div', { class: 'mc-dow' }, DOW.map((d) => h('span', null, d))),
    h('div', { class: 'mc-grid' }, grid)
  );
}

function streakCard(r, t) {
  const info = streakInfo(r);
  const status = info.doneToday ? 'Done today' : info.current ? 'Not done yet today' : 'Start today';
  return h(
    'article',
    { class: `card streak${info.current ? ' is-live' : ''}` },
    h(
      'div',
      { class: 'streak-head' },
      h('div', { class: 'streak-name' }, h('strong', null, r.title), h('span', null, `${SECTION_LABEL[r.section]} · ${status}`)),
      h(
        'div',
        { class: 'streak-now' },
        icon('flame', 'streak-flame'),
        h('span', { class: 'streak-num' }, String(info.current)),
        h('span', { class: 'streak-unit' }, info.current === 1 ? 'day' : 'days')
      )
    ),
    h(
      'div',
      { class: 'streak-stats' },
      h('span', null, h('b', null, String(info.best)), ' best'),
      h('span', null, h('b', null, String(info.total)), ' total days')
    ),
    miniCalendar(r, t)
  );
}

function streaksSection(t) {
  const active = S().routine.filter((r) => !r.archivedOn);
  const trackers = active.filter((r) => r.streak);
  const head = h(
    'div',
    { class: 'block-head' },
    h('h2', null, 'Streaks'),
    active.length ? h('button', { class: 'btn btn-sm', type: 'button', onclick: openStreakManager }, trackers.length ? 'Manage' : 'Choose tasks') : null
  );
  let body;
  if (!active.length) body = emptyState('Add tasks to your Morning or Night routine first. Then pick which ones to track as streaks.');
  else if (!trackers.length) body = emptyState('Pick daily tasks to track. Each gets a current streak, best streak, and a mini calendar.', 'Choose tasks', openStreakManager);
  else body = h('div', { class: 'streak-list' }, trackers.map((r) => streakCard(r, t)));
  return h('section', { class: 'block' }, head, body);
}

/* ---------- History ---------- */

function historyRow(k) {
  const score = dayScore(k);
  const priorities = itemsFor(k, 'today').filter((it) => it.type === 'priority' && !it.carriedTo);
  const pDone = priorities.filter(isComplete).length;
  const pct = score ? score.pct : null;
  return h(
    'button',
    { class: 'hist-row', type: 'button', onclick: () => openDaySheet(k) },
    h('span', { class: 'hist-date' }, fmtDate(k, { weekday: 'short' }), h('b', null, fmtShort(k))),
    h('span', { class: 'hist-bar' }, h('span', { class: `hist-fill${pct === 100 ? ' is-perfect' : ''}`, style: { width: `${pct || 0}%` } })),
    h(
      'span',
      { class: 'hist-num' },
      h('b', null, pct == null ? '–' : `${pct}%`),
      h('span', null, score ? `${score.done}/${score.total}${priorities.length ? ` · P ${pDone}/${priorities.length}` : ''}` : 'no tasks')
    )
  );
}

function historySection(t) {
  const start = S().settings.startDate;
  const days = [];
  let k = addDays(t, -1);
  while (k >= start && days.length < historyCount) {
    days.push(k);
    k = addDays(k, -1);
  }
  const more = k >= start;
  const head = h('div', { class: 'block-head' }, h('h2', null, 'History'));
  if (!days.length) return h('section', { class: 'block' }, head, emptyState('Your past days show up here, with what you finished and your score.'));

  const groups = [];
  for (const day of days) {
    const ws = weekStartOf(day);
    let g = groups[groups.length - 1];
    if (!g || g.ws !== ws) {
      g = { ws, days: [] };
      groups.push(g);
    }
    g.days.push(day);
  }
  return h(
    'section',
    { class: 'block' },
    head,
    groups.map((g) => {
      const stats = weekStats(g.ws);
      return h(
        'div',
        { class: 'hist-group' },
        h(
          'div',
          { class: 'hist-week' },
          h('span', null, `Week of ${fmtShort(g.ws)}`),
          h('span', null, stats.avg != null ? `avg ${stats.avg}%` : '')
        ),
        h('div', { class: 'hist-list' }, g.days.map(historyRow))
      );
    }),
    more
      ? h(
          'button',
          {
            class: 'btn btn-block',
            type: 'button',
            onclick: () => {
              historyCount += 21;
              nav.refresh();
            },
          },
          'Show earlier days'
        )
      : h('p', { class: 'list-end' }, `Tracking since ${fmtDate(start, { month: 'long', day: 'numeric', year: 'numeric' })} · ${plural(days.length, 'day')}`)
  );
}

export function renderProgress() {
  const t = todayKey();
  return [pageHeader('Progress', 'Your daily score, streaks and past days.'), scoreCard(t), streaksSection(t), historySection(t)];
}
