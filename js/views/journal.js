// Journal: weekly reviews and letters to your future self.
import { S } from '../store.js';
import { h, icon, pageHeader, emptyState } from '../ui.js';
import { weekStats, lettersSorted, letterUnlocked, wroteThisMonth } from '../logic.js';
import { openReviewSheet, openLetterWrite, openLetterRead, openLetterLocked, statTiles, weekRange } from '../sheets/journal.js';
import { todayKey, weekStartOf, dayOfWeek, daysBetween, fmtFull, fmtDate, plural } from '../util.js';

function reviewCard(t) {
  const ws = weekStartOf(t);
  const stats = weekStats(ws);
  const saved = S().reviews[ws];
  const sunday = dayOfWeek(t) === 0;
  let note;
  if (saved) note = 'Saved. Open it to read or edit.';
  else if (sunday) note = 'It’s Sunday. Look back at your week and set next week’s focus.';
  else note = 'You’ll get a prompt on Sunday. You can start early.';
  return h(
    'section',
    { class: `card review-card${sunday && !saved ? ' is-due' : ''}` },
    h('div', { class: 'card-head' }, h('h2', null, icon('book'), 'Weekly review'), h('span', { class: 'card-meta' }, weekRange(ws))),
    statTiles(stats),
    h('p', { class: 'review-note' }, note),
    h(
      'button',
      { class: `btn ${saved ? '' : 'btn-primary'} btn-block`, type: 'button', onclick: () => openReviewSheet(ws) },
      saved ? 'Open this week’s review' : 'Write this week’s review'
    )
  );
}

function pastReviews(t) {
  const current = weekStartOf(t);
  const reviews = S().reviews;
  const weeks = Object.keys(reviews)
    .filter((ws) => ws !== current)
    .sort()
    .reverse();
  if (!weeks.length) return null;
  return h(
    'section',
    { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', null, 'Past reviews')),
    h(
      'div',
      { class: 'review-list' },
      weeks.map((ws) => {
        const r = reviews[ws];
        const st = r.stats || {};
        const snippet = r.focus || r.wentWell || r.didnt || 'No notes';
        return h(
          'button',
          { class: 'review-row', type: 'button', onclick: () => openReviewSheet(ws) },
          h(
            'span',
            { class: 'review-row-top' },
            h('b', null, weekRange(ws)),
            h('span', null, [st.avg != null ? `${st.avg}% avg` : null, st.pTotal ? `P ${st.pDone}/${st.pTotal}` : null].filter(Boolean).join(' · '))
          ),
          h('span', { class: 'review-row-text' }, snippet)
        );
      })
    )
  );
}

function letterRow(l, t) {
  const open = letterUnlocked(l, t);
  const left = daysBetween(t, l.unlockOn);
  let sub;
  if (!open) sub = `Opens ${fmtFull(l.unlockOn)} · ${plural(left, 'day')} left`;
  else if (!l.openedAt) sub = 'Unlocked. Ready to open.';
  else sub = `Opened · unlocked ${fmtFull(l.unlockOn)}`;
  return h(
    'button',
    {
      class: `letter-row${open ? ' is-open' : ' is-locked'}${open && !l.openedAt ? ' is-new' : ''}`,
      type: 'button',
      onclick: () => (open ? openLetterRead(l.id) : openLetterLocked(l.id)),
    },
    icon(open ? 'mail' : 'lock', 'letter-ico'),
    h('span', { class: 'letter-info' }, h('b', null, `Written ${fmtFull(l.writtenOn)}`), h('span', null, sub)),
    h('span', { class: `pill ${open ? 'pill-open' : 'pill-locked'}` }, open ? 'Unlocked' : 'Locked')
  );
}

function lettersSection(t) {
  const letters = lettersSorted();
  const month = fmtDate(t, { month: 'long' });
  const draft = S().letterDraft.trim();
  return h(
    'section',
    { class: 'block' },
    h(
      'div',
      { class: 'block-head' },
      h('h2', null, 'Letters to future you'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: openLetterWrite }, icon('edit'), draft ? 'Continue draft' : 'Write')
    ),
    !wroteThisMonth(t)
      ? h(
          'button',
          { class: 'notice-inline', type: 'button', onclick: openLetterWrite },
          icon('mail'),
          `You haven’t written ${month}’s letter yet. Each one stays sealed for 6 months.`
        )
      : null,
    letters.length
      ? h('div', { class: 'letter-list' }, letters.map((l) => letterRow(l, t)))
      : emptyState('Write a letter each month. Once sealed, it stays locked for 6 months, then opens here.')
  );
}

export function renderJournal() {
  const t = todayKey();
  return [pageHeader('Journal', 'Weekly reviews and letters to your future self.'), reviewCard(t), pastReviews(t), lettersSection(t)];
}
