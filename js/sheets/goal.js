// Create and edit goals: category, timeframe, sub-steps, linked tasks.
import { h, icon, openSheet, toast, chip, progressBar, confirmDialog } from '../ui.js';
import {
  CATEGORIES,
  TIMEFRAMES,
  timeframeLabel,
  goalById,
  goalTarget,
  goalProgress,
  goalLinks,
  streakInfo,
  routineDone,
  SECTION_LABEL,
} from '../logic.js';
import { addGoal, updateGoal, deleteGoal, addStep, toggleStep, renameStep, deleteStep } from '../actions.js';
import { todayKey, addMonths, fmtFull, plural } from '../util.js';

export const catClass = (c) => (c ? `cat-${c.toLowerCase()}` : 'cat-none');

function timeframeSelect(createdOn, months, onChange) {
  return h(
    'select',
    { class: 'input select', 'aria-label': 'Timeframe', onchange: (e) => onChange(Number(e.target.value)) },
    TIMEFRAMES.map((m) => h('option', { value: String(m), selected: m === months }, `${timeframeLabel(m)} · by ${fmtFull(addMonths(createdOn, m))}`))
  );
}

function categoryChips(current, onPick) {
  const wrap = h('div', { class: 'chips' });
  let value = current;
  const paint = () =>
    wrap.replaceChildren(
      ...CATEGORIES.map((c) =>
        chip(
          [h('span', { class: `dot ${catClass(c)}` }), c],
          value === c,
          () => {
            value = value === c ? null : c;
            paint();
            onPick(value);
          }
        )
      )
    );
  paint();
  return wrap;
}

export function openGoalSheet({ id = null, months = 12 } = {}) {
  if (id) openGoalEditor(id);
  else openNewGoal(months);
}

function openNewGoal(months) {
  const t = todayKey();
  const f = { title: '', category: null, months, steps: [] };
  const sheet = openSheet({ title: 'New goal', className: 'sheet-form' });
  const titleInput = h('input', {
    class: 'input input-lg',
    type: 'text',
    placeholder: 'What do you want to achieve?',
    maxlength: '120',
    autocomplete: 'off',
    'aria-label': 'Goal',
    oninput: (e) => {
      f.title = e.target.value;
      titleInput.classList.remove('invalid');
    },
  });
  const stepsList = h('ul', { class: 'draft-steps' });
  const stepInput = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Add a step and press Enter',
    maxlength: '120',
    enterkeyhint: 'enter',
    'aria-label': 'New step',
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        pushStep();
      }
    },
  });
  const pushStep = () => {
    const v = stepInput.value.trim();
    if (!v) return;
    f.steps.push(v);
    stepInput.value = '';
    paintSteps();
  };
  const paintSteps = () =>
    stepsList.replaceChildren(
      ...f.steps.map((text, i) =>
        h(
          'li',
          null,
          h('span', null, text),
          h(
            'button',
            {
              class: 'icon-btn icon-btn-sm',
              type: 'button',
              'aria-label': 'Remove step',
              onclick: () => {
                f.steps.splice(i, 1);
                paintSteps();
              },
            },
            icon('x')
          )
        )
      )
    );

  sheet.setBody(
    h(
      'div',
      { class: 'form' },
      h('div', { class: 'form-block' }, titleInput),
      h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Category'), categoryChips(f.category, (c) => (f.category = c))),
      h(
        'div',
        { class: 'form-block' },
        h('span', { class: 'field-label' }, 'Timeframe'),
        timeframeSelect(t, f.months, (m) => (f.months = m)),
        h('span', { class: 'field-hint' }, 'The target date counts from today, the day you create the goal.')
      ),
      h(
        'div',
        { class: 'form-block' },
        h('span', { class: 'field-label' }, 'Steps (optional)'),
        stepsList,
        h('div', { class: 'inline-add' }, stepInput, h('button', { class: 'btn', type: 'button', onclick: pushStep }, 'Add'))
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
          if (!f.title.trim()) {
            titleInput.classList.add('invalid');
            titleInput.focus();
            return;
          }
          if (stepInput.value.trim()) pushStep();
          addGoal(f);
          toast(`Goal added to ${timeframeLabel(f.months)}`);
          sheet.close();
        },
      },
      'Create goal'
    )
  );
  titleInput.focus();
}

function openGoalEditor(goalId) {
  const g0 = goalById(goalId);
  if (!g0) return;
  const sheet = openSheet({ title: 'Goal', className: 'sheet-form sheet-goal' });

  const titleInput = h('input', {
    class: 'input input-lg',
    type: 'text',
    value: g0.title,
    maxlength: '120',
    'aria-label': 'Goal',
    onchange: (e) => {
      const v = e.target.value.trim();
      if (v) updateGoal(goalId, { title: v });
      else e.target.value = goalById(goalId).title;
    },
  });
  const summary = h('div', { class: 'goal-summary' });
  const stepsList = h('div', { class: 'steps' });
  const linksWrap = h('div', { class: 'goal-links' });
  const stepInput = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Add a step',
    maxlength: '120',
    enterkeyhint: 'enter',
    'aria-label': 'New step',
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addStepNow();
      }
    },
  });
  const addStepNow = () => {
    const v = stepInput.value.trim();
    if (!v) return;
    addStep(goalId, v);
    stepInput.value = '';
    paint();
  };

  const completeBtn = h('button', { class: 'btn btn-primary', type: 'button' });
  completeBtn.addEventListener('click', () => {
    const g = goalById(goalId);
    updateGoal(goalId, { done: !g.done });
    toast(g.done ? 'Goal complete' : 'Goal reopened');
    paint();
  });

  const paint = () => {
    const g = goalById(goalId);
    if (!g) return;
    const p = goalProgress(g);
    const doneSteps = g.steps.filter((s) => s.done).length;
    summary.replaceChildren(
      h(
        'div',
        { class: 'goal-summary-top' },
        h('span', null, `Target ${fmtFull(goalTarget(g))}`),
        h('span', null, g.steps.length ? `${doneSteps}/${g.steps.length} steps · ${Math.round(p * 100)}%` : g.done ? 'Complete' : 'No steps yet')
      ),
      progressBar(p, 'bar-lg'),
      h('span', { class: 'field-hint' }, `Created ${fmtFull(g.createdOn)}${g.done && g.doneOn ? ` · completed ${fmtFull(g.doneOn)}` : ''}`)
    );

    stepsList.replaceChildren(
      ...g.steps.map((st) => {
        const input = h('input', {
          class: 'step-text',
          type: 'text',
          value: st.text,
          maxlength: '120',
          'aria-label': 'Step',
          onchange: (e) => {
            const v = e.target.value.trim();
            if (v) renameStep(goalId, st.id, v);
            else e.target.value = st.text;
          },
        });
        return h(
          'div',
          { class: `step${st.done ? ' is-done' : ''}` },
          h(
            'button',
            {
              class: 'check',
              type: 'button',
              role: 'checkbox',
              'aria-checked': String(st.done),
              'aria-label': st.text,
              onclick: () => {
                toggleStep(goalId, st.id);
                paint();
              },
            },
            h('span', { class: 'box' }, icon('check'))
          ),
          input,
          h(
            'button',
            {
              class: 'icon-btn icon-btn-sm',
              type: 'button',
              'aria-label': 'Delete step',
              onclick: () => {
                deleteStep(goalId, st.id);
                paint();
              },
            },
            icon('x')
          )
        );
      })
    );

    const links = goalLinks(goalId);
    const t = todayKey();
    linksWrap.replaceChildren(
      links.habits.length
        ? h(
            'ul',
            { class: 'link-list' },
            links.habits.map((r) => {
              const info = r.streak ? streakInfo(r) : null;
              return h(
                'li',
                null,
                h('span', { class: `link-dot${routineDone(r, t) ? ' is-done' : ''}` }),
                h('span', { class: 'link-title' }, r.title),
                h('span', { class: 'link-meta' }, info ? `${plural(info.current, 'day')} streak` : SECTION_LABEL[r.section])
              );
            })
          )
        : null,
      links.tasksTotal ? h('p', { class: 'field-hint' }, `One-off tasks: ${links.tasksDone} of ${links.tasksTotal} done`) : null,
      !links.habits.length && !links.tasksTotal
        ? h('p', { class: 'field-hint' }, 'Nothing linked yet. Open any task and choose this goal under "Builds toward".')
        : null
    );

    completeBtn.replaceChildren(icon(g.done ? 'repeat' : 'check'), g.done ? 'Reopen goal' : 'Mark complete');
  };

  const g = g0;
  sheet.setBody(
    h(
      'div',
      { class: 'form' },
      h('div', { class: 'form-block' }, titleInput),
      summary,
      h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Category'), categoryChips(g.category, (c) => updateGoal(goalId, { category: c }))),
      h(
        'div',
        { class: 'form-block' },
        h('span', { class: 'field-label' }, 'Timeframe'),
        timeframeSelect(g.createdOn, g.months, (m) => {
          updateGoal(goalId, { months: m });
          toast(`Moved to ${timeframeLabel(m)}`);
          paint();
        })
      ),
      h(
        'div',
        { class: 'form-block' },
        h('span', { class: 'field-label' }, 'Steps'),
        stepsList,
        h('div', { class: 'inline-add' }, stepInput, h('button', { class: 'btn', type: 'button', onclick: addStepNow }, 'Add'))
      ),
      h('div', { class: 'form-block' }, h('span', { class: 'field-label' }, 'Habits and tasks building this'), linksWrap)
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
            title: 'Delete goal?',
            message: `"${goalById(goalId)?.title}" and its steps will be deleted. Linked tasks stay, just unlinked.`,
            confirm: 'Delete',
            danger: true,
          });
          if (!ok) return;
          sheet.close();
          const undo = deleteGoal(goalId);
          toast('Goal deleted', { action: 'Undo', onAction: undo, duration: 6000 });
        },
      },
      icon('trash'),
      'Delete'
    ),
    completeBtn
  );
  paint();
}
