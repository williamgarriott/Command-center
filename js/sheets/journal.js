// Weekly reviews and letters to your future self.
import { S } from '../store.js';
import { h, icon, openSheet, toast, confirmDialog } from '../ui.js';
import { weekStats, LETTER_LOCK_MONTHS } from '../logic.js';
import { saveReview, sealLetter, deleteLetter, openLetter, saveLetterDraft } from '../actions.js';
import { weekBars } from '../views/progress.js';
import { todayKey, addDays, addMonths, daysBetween, fmtFull, fmtShort, plural, debounce } from '../util.js';

export const weekRange = (ws) => `${fmtShort(ws)} – ${fmtShort(addDays(ws, 6))}`;

export function statTiles(stats) {
  const tile = (label, value, sub) =>
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null);
  return h(
    'div',
    { class: 'stats' },
    tile('Weekly avg', stats.avg != null ? `${stats.avg}%` : '–', `${stats.done} of ${stats.total} tasks`),
    tile('Priorities', stats.pTotal ? `${stats.pDone}/${stats.pTotal}` : '0', 'finished'),
    tile('Perfect days', String(stats.perfect), '100% done')
  );
}

/* ---------- Weekly review ---------- */

export function openReviewSheet(ws) {
  const stats = weekStats(ws);
  const existing = S().reviews[ws] || {};
  const f = { wentWell: existing.wentWell || '', didnt: existing.didnt || '', focus: existing.focus || '' };
  const sheet = openSheet({ title: `Week of ${weekRange(ws)}`, className: 'sheet-form sheet-review' });

  const area = (key, label, placeholder) => {
    const ta = h('textarea', {
      class: 'input textarea',
      rows: '4',
      placeholder,
      oninput: (e) => {
        f[key] = e.target.value;
      },
    });
    ta.value = f[key];
    return h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, label), ta);
  };

  sheet.setBody(
    h(
      'div',
      { class: 'review' },
      h('aside', { class: 'review-stats card' }, h('p', { class: 'review-stats-title' }, 'This week'), statTiles(stats), weekBars(stats)),
      h(
        'div',
        { class: 'form' },
        area('wentWell', 'What went well', 'Wins, streaks kept, things that clicked'),
        area('didnt', 'What didn’t', 'What slipped and why'),
        area('focus', 'Focus for next week', 'The one or two things that matter most')
      )
    )
  );
  sheet.setFooter(
    h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          const { avg, done, total, perfect, pDone, pTotal } = weekStats(ws);
          saveReview(ws, f, { avg, done, total, perfect, pDone, pTotal });
          toast('Review saved');
          sheet.close();
        },
      },
      existing.savedAt ? 'Save changes' : 'Save review'
    )
  );
}

/* ---------- Letters ---------- */

export function openLetterWrite() {
  const t = todayKey();
  const unlock = addMonths(t, LETTER_LOCK_MONTHS);
  const sheet = openSheet({ title: 'Letter to future you', className: 'sheet-form sheet-letter' });
  const saveDraft = debounce((v) => saveLetterDraft(v), 600);
  const sealBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('lock'), 'Seal letter');
  const ta = h('textarea', {
    class: 'input textarea letter-text',
    rows: '12',
    placeholder: 'Dear future me,',
    oninput: (e) => {
      saveDraft(e.target.value);
      sealBtn.disabled = !e.target.value.trim();
    },
  });
  ta.value = S().letterDraft;
  sealBtn.disabled = !ta.value.trim();

  sealBtn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) return;
    saveDraft.flush(ta.value);
    const ok = await confirmDialog({
      title: 'Seal this letter?',
      message: `Once sealed you can’t read or edit it until ${fmtFull(unlock)}.`,
      confirm: 'Seal it',
    });
    if (!ok) return;
    sealLetter(text);
    toast(`Sealed until ${fmtFull(unlock)}`);
    sheet.close();
  });

  sheet.setBody(
    h(
      'div',
      { class: 'form' },
      h('p', { class: 'field-hint' }, `Written ${fmtFull(t)}. Opens ${fmtFull(unlock)}. Your draft saves as you type.`),
      ta
    )
  );
  sheet.setFooter(sealBtn);
  ta.focus();
}

export function openLetterRead(id) {
  const letter = S().letters.find((l) => l.id === id);
  if (!letter) return;
  const text = openLetter(id);
  if (text == null) {
    openLetterLocked(id);
    return;
  }
  const sheet = openSheet({ title: `From ${fmtFull(letter.writtenOn)}`, className: 'sheet-letter' });
  sheet.setBody(
    h(
      'div',
      { class: 'letter-read' },
      h('p', { class: 'field-hint' }, `Written ${fmtFull(letter.writtenOn)} · opened ${fmtFull(letter.unlockOn)}`),
      h('div', { class: 'letter-body' }, text)
    )
  );
  sheet.setFooter(
    h(
      'button',
      {
        class: 'btn btn-ghost-danger',
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Delete letter?', message: 'This letter will be gone for good.', confirm: 'Delete', danger: true });
          if (!ok) return;
          deleteLetter(id);
          sheet.close();
          toast('Letter deleted');
        },
      },
      icon('trash'),
      'Delete'
    ),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Close')
  );
}

export function openLetterLocked(id) {
  const letter = S().letters.find((l) => l.id === id);
  if (!letter) return;
  const left = daysBetween(todayKey(), letter.unlockOn);
  const sheet = openSheet({ title: 'Sealed letter', className: 'sheet-letter' });
  sheet.setBody(
    h(
      'div',
      { class: 'sealed' },
      icon('lock', 'sealed-ico'),
      h('p', { class: 'sealed-count' }, plural(left, 'day')),
      h('p', null, `Opens ${fmtFull(letter.unlockOn)}`),
      h('p', { class: 'field-hint' }, `Written ${fmtFull(letter.writtenOn)}. It stays sealed until then.`)
    )
  );
  sheet.setFooter(
    h(
      'button',
      {
        class: 'btn btn-ghost-danger',
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Delete sealed letter?',
            message: 'You will never be able to read it. This can’t be undone.',
            confirm: 'Delete',
            danger: true,
          });
          if (!ok) return;
          deleteLetter(id);
          sheet.close();
          toast('Letter deleted');
        },
      },
      icon('trash'),
      'Delete'
    ),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Close')
  );
}
