// Home: Now/Next, reminders and banners, Top 3, then the full checklist.
import { S } from '../store.js';
import { h, icon, nav, scoreRing } from '../ui.js';
import { nowNext, dayScore, weekStats, getDay, readyLetters, wroteThisMonth } from '../logic.js';
import { dismiss } from '../actions.js';
import { checkControl, checklistView, top3Card, dayNoteCard } from '../checklist.js';
import { openTaskForm } from '../sheets/task.js';
import { openSettings } from '../sheets/settings.js';
import { openReviewSheet, openLetterRead, openLetterWrite } from '../sheets/journal.js';
import {
  todayKey,
  addDays,
  fmtDate,
  fmtTime,
  fmtFull,
  fmtDuration,
  toMin,
  nowMin,
  weekStartOf,
  dayOfWeek,
  daysBetween,
  dateKey,
  plural,
} from '../util.js';

function header(k) {
  const score = dayScore(k);
  const week = weekStats(weekStartOf(k));
  const parts = [];
  parts.push(score ? `${score.done} of ${score.total} done` : 'No tasks yet');
  if (week.avg != null) parts.push(`Week avg ${week.avg}%`);
  return h(
    'header',
    { class: 'page-head home-head' },
    h(
      'div',
      { class: 'page-head-text' },
      h('p', { class: 'eyebrow' }, 'Command Center'),
      h('h1', null, fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' })),
      h('button', { class: 'score-line', type: 'button', onclick: () => nav.go('progress') }, parts.join(' · '))
    ),
    h(
      'div',
      { class: 'page-head-actions' },
      h(
        'button',
        {
          class: 'score-btn',
          type: 'button',
          'aria-label': score ? `Daily score ${score.pct} percent` : 'Daily score',
          onclick: () => nav.go('progress'),
        },
        scoreRing(score ? score.pct : null, 54)
      ),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: openSettings }, icon('gear'))
    )
  );
}

/* ---------- Banners ---------- */

function banner({ tone = '', glyph, title, text, action, onAction, onDismiss }) {
  return h(
    'div',
    { class: `banner ${tone}` },
    icon(glyph, 'banner-ico'),
    h('div', { class: 'banner-text' }, h('strong', null, title), text ? h('span', null, text) : null),
    action ? h('button', { class: 'btn btn-sm banner-btn', type: 'button', onclick: onAction }, action) : null,
    onDismiss
      ? h('button', { class: 'icon-btn banner-x', type: 'button', 'aria-label': 'Dismiss for today', onclick: onDismiss }, icon('x'))
      : null
  );
}

function notice(text, onOpen, onDismiss) {
  return h(
    'div',
    { class: 'notice' },
    h('button', { class: 'notice-main', type: 'button', onclick: onOpen }, h('span', null, text), icon('chevron-right')),
    h('button', { class: 'icon-btn notice-x', type: 'button', 'aria-label': 'Dismiss for today', onclick: onDismiss }, icon('x'))
  );
}

function banners(k) {
  const s = S();
  const out = [];
  const hidden = (key) => s.ui.dismissed[key] === k;

  for (const letter of readyLetters(k)) {
    out.push(
      banner({
        tone: 'tone-letter',
        glyph: 'mail',
        title: 'A letter from your past self is ready',
        text: `Written ${fmtFull(letter.writtenOn)}`,
        action: 'Open',
        onAction: () => openLetterRead(letter.id),
      })
    );
  }

  const ws = weekStartOf(k);
  const dow = dayOfWeek(k);
  if (dow === 0 && !s.reviews[ws] && !hidden('review')) {
    out.push(
      banner({
        tone: 'tone-review',
        glyph: 'book',
        title: 'Weekly review',
        text: 'Look back at this week and set your focus for the next one.',
        action: 'Start',
        onAction: () => openReviewSheet(ws),
        onDismiss: () => dismiss('review'),
      })
    );
  } else if (dow === 1) {
    const prev = addDays(ws, -7);
    if (!s.reviews[prev] && prev >= weekStartOf(s.settings.startDate) && !hidden('review')) {
      out.push(
        banner({
          tone: 'tone-review',
          glyph: 'book',
          title: "Last week's review is still open",
          text: 'Two minutes: what went well, what didn’t, what’s next.',
          action: 'Start',
          onAction: () => openReviewSheet(prev),
          onDismiss: () => dismiss('review'),
        })
      );
    }
  }

  const rem = s.settings.reminders;
  const tomorrow = addDays(k, 1);
  if (rem.nightly && nowMin() >= toMin(rem.nightlyTime) && !getDay(tomorrow).tasks.length && !hidden('plan')) {
    out.push(
      banner({
        tone: 'tone-plan',
        glyph: 'calendar',
        title: 'Plan tomorrow',
        text: 'Set tomorrow’s tasks, times and Top 3 before bed.',
        action: 'Plan',
        onAction: () => nav.go('plan', { date: tomorrow }),
        onDismiss: () => dismiss('plan'),
      })
    );
  }

  if (!wroteThisMonth(k) && !hidden('letter')) {
    const month = fmtDate(k, { month: 'long' });
    out.push(notice(`You haven’t written ${month}’s letter to future you yet`, openLetterWrite, () => dismiss('letter')));
  }

  const lastBackup = s.settings.lastBackup ? dateKey(new Date(s.settings.lastBackup)) : null;
  const needsBackup = lastBackup ? daysBetween(lastBackup, k) >= 30 : daysBetween(s.settings.startDate, k) >= 7;
  if (needsBackup && !hidden('backup')) {
    out.push(
      notice(
        lastBackup ? `Last backup was ${plural(daysBetween(lastBackup, k), 'day')} ago. Save a fresh copy` : 'Save a backup of your data',
        () => openSettings('backup'),
        () => dismiss('backup')
      )
    );
  }

  return out.length ? h('div', { class: 'banners' }, out) : null;
}

/* ---------- Now / Next ---------- */

function nowNextCard(k) {
  const nn = nowNext(k);
  const m = nn.minute;

  if (!nn.hasTimed) {
    return h(
      'section',
      { class: 'card nownext' },
      h(
        'div',
        { class: 'nn-row' },
        h('span', { class: 'nn-label' }, 'Now'),
        h(
          'div',
          { class: 'nn-main' },
          h('p', { class: 'nn-title is-muted' }, nn.focus ? nn.focus.title : 'Nothing scheduled'),
          h('p', { class: 'nn-sub' }, nn.focus ? 'Top priority. Give tasks a time to see Now and Next.' : 'Give any task a time and it shows up here as Now and Next.')
        )
      )
    );
  }

  let nowRow;
  if (nn.now) {
    const it = nn.now;
    const since = m - toMin(it.time);
    const sub =
      nn.state === 'current'
        ? `Since ${fmtTime(it.time)}${since > 0 ? ` · ${fmtDuration(since)}` : ''}`
        : `Overdue · was ${fmtTime(it.time)}`;
    nowRow = h(
      'div',
      { class: `nn-row nn-now${nn.state === 'overdue' ? ' is-overdue' : ''}` },
      h('span', { class: 'nn-label' }, 'Now'),
      h(
        'button',
        { class: 'nn-main', type: 'button', onclick: () => openTaskForm({ item: it }) },
        h('span', { class: 'nn-title' }, it.title),
        h('span', { class: 'nn-sub' }, sub, nn.behind ? h('span', { class: 'nn-behind' }, ` · ${nn.behind} more unfinished`) : null)
      ),
      checkControl(it, true)
    );
  } else {
    const allDone = !nn.next && !nn.remaining;
    nowRow = h(
      'div',
      { class: 'nn-row nn-now is-free' },
      h('span', { class: 'nn-label' }, 'Now'),
      nn.focus
        ? h(
            'button',
            { class: 'nn-main', type: 'button', onclick: () => openTaskForm({ item: nn.focus }) },
            h('span', { class: 'nn-title' }, nn.focus.title),
            h('span', { class: 'nn-sub' }, 'Open time. Work on a priority.')
          )
        : h(
            'div',
            { class: 'nn-main' },
            h('p', { class: 'nn-title is-muted' }, allDone ? 'All done for today' : 'Open time'),
            h('p', { class: 'nn-sub' }, allDone ? 'Every task on the list is checked off.' : 'Nothing scheduled right now.')
          ),
      nn.focus ? checkControl(nn.focus, true) : null
    );
  }

  const nextRow = nn.next
    ? h(
        'div',
        { class: 'nn-row nn-next' },
        h('span', { class: 'nn-label' }, 'Next'),
        h(
          'button',
          { class: 'nn-main', type: 'button', onclick: () => openTaskForm({ item: nn.next }) },
          h('span', { class: 'nn-title' }, nn.next.title),
          h('span', { class: 'nn-sub' }, `${fmtTime(nn.next.time)} · in ${fmtDuration(toMin(nn.next.time) - m)}`)
        )
      )
    : h(
        'div',
        { class: 'nn-row nn-next' },
        h('span', { class: 'nn-label' }, 'Next'),
        h('div', { class: 'nn-main' }, h('p', { class: 'nn-sub' }, 'Nothing else scheduled today.'))
      );

  return h('section', { class: 'card nownext', 'aria-label': 'Now and next' }, nowRow, nextRow);
}

export function renderToday() {
  const k = todayKey();
  return [header(k), banners(k), nowNextCard(k), top3Card(k, 'today'), ...checklistView(k, 'today'), dayNoteCard(k, 'today')];
}
