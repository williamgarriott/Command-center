// A past day from History: what got done, the score, and the day note.
import { subscribe } from '../store.js';
import { h, openSheet, scoreRing } from '../ui.js';
import { dayScore, itemsFor, isComplete } from '../logic.js';
import { checklistView, dayNoteCard } from '../checklist.js';
import { fmtLong } from '../util.js';

export function openDaySheet(k) {
  let off = null;
  const sheet = openSheet({ title: fmtLong(k), className: 'sheet-day', onClose: () => off?.() });
  const paint = () => {
    const score = dayScore(k);
    const priorities = itemsFor(k, 'today').filter((it) => it.type === 'priority' && !it.carriedTo);
    const pDone = priorities.filter(isComplete).length;
    sheet.setBody(
      h(
        'div',
        { class: 'day-detail' },
        h(
          'div',
          { class: 'day-score' },
          scoreRing(score ? score.pct : null, 64),
          h(
            'div',
            { class: 'day-score-text' },
            h('strong', null, score ? `${score.done} of ${score.total} done` : 'No tasks this day'),
            priorities.length ? h('span', null, `Top 3: ${pDone} of ${priorities.length} priorities`) : null,
            h('span', { class: 'field-hint' }, 'Tap a check box to fix a day you forgot to log.')
          )
        ),
        checklistView(k, 'history'),
        dayNoteCard(k, 'history')
      )
    );
  };
  paint();
  off = subscribe(paint);
}
