// App shell: tab bar, quick-add button, rendering, day change, service worker.
import { load, subscribe, onStorageError, flush } from './store.js';
import { rollover } from './actions.js';
import { h, icon, nav, toast, isBusy, whenIdle } from './ui.js';
import { renderToday } from './views/today.js';
import { renderPlan, planDate, setPlanDate } from './views/plan.js';
import { renderProgress } from './views/progress.js';
import { renderGoals } from './views/goals.js';
import { renderJournal } from './views/journal.js';
import { openTaskForm } from './sheets/task.js';
import { startReminders, checkReminders } from './reminders.js';
import { todayKey, plural } from './util.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'home', render: renderToday },
  { id: 'plan', label: 'Plan', icon: 'calendar', render: renderPlan },
  { id: 'progress', label: 'Progress', icon: 'chart', render: renderProgress },
  { id: 'goals', label: 'Goals', icon: 'target', render: renderGoals },
  { id: 'journal', label: 'Journal', icon: 'book', render: renderJournal },
];

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let lastDay = null;

function render() {
  const tab = TABS.find((t) => t.id === nav.current) || TABS[0];
  const nodes = [].concat(tab.render()).filter(Boolean);
  view.replaceChildren(...nodes);
  view.dataset.tab = tab.id;
  for (const btn of tabbar.querySelectorAll('.tab')) {
    const on = btn.dataset.tab === tab.id;
    btn.classList.toggle('on', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (isBusy()) whenIdle(scheduleRender);
    else render();
  });
}

nav.go = (tab, opts = {}) => {
  if (tab === 'plan' && opts.date) setPlanDate(opts.date);
  const changed = nav.current !== tab;
  nav.current = tab;
  try {
    sessionStorage.setItem('commandCenter:tab', tab);
  } catch {
    // Tab memory is optional.
  }
  render();
  if (changed || opts.date) window.scrollTo(0, 0);
};
nav.refresh = scheduleRender;

function buildChrome() {
  tabbar.replaceChildren(
    ...TABS.map((t) =>
      h(
        'button',
        {
          class: 'tab',
          type: 'button',
          'data-tab': t.id,
          onclick: () => {
            if (nav.current === t.id) window.scrollTo({ top: 0, behavior: 'smooth' });
            else nav.go(t.id);
          },
        },
        icon(t.icon),
        h('span', null, t.label)
      )
    )
  );
  const fab = document.getElementById('fab');
  fab.replaceChildren(icon('plus'));
  fab.addEventListener('click', () => {
    const date = nav.current === 'plan' ? planDate() : todayKey();
    openTaskForm({ date, dest: 'day' });
  });
}

// Handles midnight: carries unfinished one-off tasks over and refreshes.
function checkDay() {
  const t = todayKey();
  const result = rollover();
  if (result && result.carried) {
    const extra = result.demoted ? ` ${plural(result.demoted, 'priority', 'priorities')} became Required (3 max).` : '';
    toast(`${plural(result.carried, 'unfinished task')} carried over to today.${extra}`, { duration: 6000 });
  }
  if (lastDay && lastDay !== t) scheduleRender();
  lastDay = t;
}

function tick() {
  checkDay();
  checkReminders();
  if (document.visibilityState === 'visible' && (nav.current === 'today' || nav.current === 'plan')) scheduleRender();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const offer = (worker) =>
        toast('A new version of Command Center is ready.', {
          action: 'Update',
          duration: 20000,
          onAction: () => worker.postMessage('skipWaiting'),
        });
      if (reg.waiting && hadController) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}

async function init() {
  await load();
  onStorageError(() => toast('Couldn’t save. Your phone’s storage for this app may be full. Save a backup from Settings.', { duration: 8000 }));
  try {
    const saved = sessionStorage.getItem('commandCenter:tab');
    if (TABS.some((t) => t.id === saved)) nav.current = saved;
  } catch {
    // Start on Today.
  }
  buildChrome();
  checkDay();
  render();
  subscribe(scheduleRender);
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
    else flush();
  });
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('focus', tick);
  startReminders();
  registerServiceWorker();
  // Ask the browser not to clear this app's storage under pressure.
  navigator.storage?.persist?.().catch(() => {});
}

init();
