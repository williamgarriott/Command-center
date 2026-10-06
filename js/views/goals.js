// Goals in ten timeframes, from 6 months to 5 years.
import { S } from '../store.js';
import { h, icon, nav, pageHeader, progressBar } from '../ui.js';
import { CATEGORIES, TIMEFRAMES, timeframeLabel, goalTarget, goalProgress, goalLinks } from '../logic.js';
import { openGoalSheet, catClass } from '../sheets/goal.js';
import { todayKey, addMonths, daysBetween, fmtFull, plural } from '../util.js';

let filter = 'All';

function dueText(target, t) {
  const d = daysBetween(t, target);
  if (d < 0) return `${plural(-d, 'day')} past target`;
  if (d === 0) return 'Due today';
  if (d < 60) return `${plural(d, 'day')} left`;
  return `${Math.round(d / 30.44)} months left`;
}

function goalCard(g, t) {
  const target = goalTarget(g);
  const p = goalProgress(g);
  const links = goalLinks(g.id);
  const doneSteps = g.steps.filter((s) => s.done).length;
  const meta = [`Target ${fmtFull(target)}`];
  if (g.steps.length) meta.push(`${doneSteps}/${g.steps.length} steps`);
  if (links.habits.length) meta.push(plural(links.habits.length, 'habit'));
  return h(
    'button',
    { class: `goal-card${g.done ? ' is-done' : ''}`, type: 'button', onclick: () => openGoalSheet({ id: g.id }) },
    h(
      'span',
      { class: 'goal-top' },
      h('span', { class: `cat-tag ${catClass(g.category)}` }, h('span', { class: `dot ${catClass(g.category)}` }), g.category || 'No category'),
      g.done
        ? h('span', { class: 'goal-state is-done' }, icon('check'), 'Complete')
        : h('span', { class: `goal-state${daysBetween(t, target) < 0 ? ' is-late' : ''}` }, dueText(target, t))
    ),
    h('span', { class: 'goal-title' }, g.title),
    g.steps.length || g.done ? progressBar(p) : null,
    h('span', { class: 'goal-meta' }, meta.join(' · '))
  );
}

function timeframeGroup(months, goals, t) {
  const sorted = [...goals].sort((a, b) => Number(a.done) - Number(b.done) || a.createdOn.localeCompare(b.createdOn));
  const label = timeframeLabel(months);
  const head = h(
    'div',
    { class: 'tf-head' },
    h('h2', null, label),
    sorted.length ? h('span', { class: 'tf-count' }, `${sorted.filter((g) => g.done).length}/${sorted.length} done`) : null,
    h(
      'button',
      { class: 'icon-btn icon-btn-sm tf-add', type: 'button', 'aria-label': `Add a ${label} goal`, onclick: () => openGoalSheet({ months }) },
      icon('plus')
    )
  );
  if (!sorted.length) {
    return h(
      'section',
      { class: 'tf is-empty' },
      head,
      h('p', { class: 'tf-hint' }, `A goal added today would target ${fmtFull(addMonths(t, months))}.`)
    );
  }
  return h('section', { class: 'tf' }, head, h('div', { class: 'goal-list' }, sorted.map((g) => goalCard(g, t))));
}

export function renderGoals() {
  const t = todayKey();
  const all = S().goals;
  const shown = filter === 'All' ? all : all.filter((g) => g.category === filter);
  const done = all.filter((g) => g.done).length;
  const filters = h(
    'div',
    { class: 'chip-scroll', role: 'tablist', 'aria-label': 'Filter by category' },
    ['All', ...CATEGORIES].map((c) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `chip${filter === c ? ' on' : ''}`,
          'aria-selected': String(filter === c),
          onclick: () => {
            filter = c;
            nav.refresh();
          },
        },
        c !== 'All' ? h('span', { class: `dot ${catClass(c)}` }) : null,
        c
      )
    )
  );
  return [
    pageHeader(
      'Goals',
      all.length ? `${plural(all.length, 'goal')} · ${done} complete` : 'Where your daily habits are heading, 6 months to 5 years out.',
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openGoalSheet({}) }, icon('plus'), 'New goal')
    ),
    filters,
    ...TIMEFRAMES.map((m) => timeframeGroup(m, shown.filter((g) => g.months === m), t)),
  ];
}
