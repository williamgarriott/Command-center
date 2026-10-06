// Settings: reminders, backup and restore, install help, erase.
import { S, replaceAll, eraseAll } from '../store.js';
import { h, icon, openSheet, toast, toggleSwitch, confirmDialog, closeAllSheets } from '../ui.js';
import { setReminders, markBackup } from '../actions.js';
import { permissionState, askPermission, notify, buildCalendar, notificationsSupported } from '../reminders.js';
import { backupFile, canShareFiles, shareFile, downloadFile, parseBackup } from '../backup.js';
import { fmtFull, dateKey, plural } from '../util.js';

export const APP_VERSION = '1.0.0';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const PERMISSION_TEXT = {
  granted: 'Notifications are allowed.',
  denied: 'Notifications are blocked. Allow them for this app in your phone’s settings.',
  default: 'Notifications haven’t been allowed yet.',
  unsupported: 'This browser can’t show notifications. On iPhone, add the app to your Home Screen first (iOS 16.4 or later).',
};

function remindersBlock() {
  const rem = S().settings.reminders;
  const status = h('p', { class: 'field-hint' });
  const allowBtn = h('button', { class: 'btn btn-sm', type: 'button' }, icon('bell'), 'Allow notifications');
  const paintStatus = () => {
    const p = permissionState();
    status.textContent = PERMISSION_TEXT[p] || '';
    allowBtn.hidden = p !== 'default';
  };
  allowBtn.addEventListener('click', async () => {
    await askPermission();
    paintStatus();
  });

  const lead = h(
    'select',
    {
      class: 'input select',
      'aria-label': 'When to remind',
      onchange: (e) => setReminders({ lead: Number(e.target.value) }),
    },
    [0, 5, 10, 15, 30].map((m) => h('option', { value: String(m), selected: Number(rem.lead) === m }, m ? `${m} minutes before` : 'At the task’s time'))
  );
  const leadRow = h('div', { class: 'form-block', hidden: !rem.tasks }, h('span', { class: 'field-label' }, 'Remind me'), lead);

  const nightTime = h('input', {
    type: 'time',
    class: 'input input-time',
    value: rem.nightlyTime,
    'aria-label': 'Nightly reminder time',
    onchange: (e) => {
      if (e.target.value) setReminders({ nightlyTime: e.target.value });
    },
  });
  const nightRow = h('div', { class: 'form-block', hidden: !rem.nightly }, h('span', { class: 'field-label' }, 'Nightly reminder time'), nightTime);

  const ensurePermission = async () => {
    if (permissionState() === 'default') await askPermission();
    paintStatus();
  };

  const calendarBtn = h('button', { class: 'btn', type: 'button' }, icon('calendar'), 'Add reminders to my calendar');
  calendarBtn.addEventListener('click', async () => {
    const { text, count } = buildCalendar();
    if (!count) {
      toast('Turn on the nightly reminder or give a Morning or Night task a time first.');
      return;
    }
    const file = new File([text], 'command-center-reminders.ics', { type: 'text/calendar' });
    try {
      if (canShareFiles(file)) await shareFile(file, 'Command Center reminders');
      else downloadFile(file);
    } catch {
      downloadFile(file);
    }
  });

  const testBtn = h('button', { class: 'btn-text', type: 'button' }, 'Send a test notification');
  testBtn.addEventListener('click', async () => {
    await ensurePermission();
    const ok = await notify('Command Center', 'Notifications are working.', 'test', { force: true });
    if (!ok) toast('Couldn’t show a notification. Check that notifications are allowed for this app.');
  });

  paintStatus();
  return h(
    'section',
    { class: 'settings-block' },
    h('h3', null, icon('bell'), 'Reminders'),
    toggleSwitch(
      rem.tasks,
      async (on) => {
        setReminders({ tasks: on });
        leadRow.hidden = !on;
        if (on) await ensurePermission();
      },
      'Timed task reminders',
      'For any task with a time. Turn single tasks off in their options.'
    ),
    leadRow,
    toggleSwitch(
      rem.nightly,
      async (on) => {
        setReminders({ nightly: on });
        nightRow.hidden = !on;
        if (on) await ensurePermission();
      },
      'Nightly reminder to plan tomorrow',
      'Also shows a Plan tomorrow banner on the home screen after this time.'
    ),
    nightRow,
    h('div', { class: 'perm' }, status, allowBtn),
    h(
      'p',
      { class: 'field-hint' },
      'Phones only let web apps notify you while the app is open or recently used. For alarms that fire even when it’s closed, add your daily reminders to your calendar.'
    ),
    h('div', { class: 'btn-row' }, calendarBtn, notificationsSupported() ? testBtn : null)
  );
}

function backupBlock() {
  const last = S().settings.lastBackup;
  const lastText = last ? `Last backup: ${fmtFull(dateKey(new Date(last)))}` : 'No backup yet.';
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    'aria-label': 'Backup file to restore',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      let parsed;
      try {
        parsed = parseBackup(await file.text());
      } catch (err) {
        toast(err.message);
        return;
      }
      const when = parsed.exportedAt ? ` from ${fmtFull(dateKey(new Date(parsed.exportedAt)))}` : '';
      const ok = await confirmDialog({
        title: 'Restore this backup?',
        message: `Everything in the app now will be replaced with the backup${when}.`,
        confirm: 'Restore',
        danger: true,
      });
      if (!ok) return;
      replaceAll(parsed.data);
      closeAllSheets();
      toast('Backup restored');
    },
  });

  const save = async (mode) => {
    const file = backupFile();
    try {
      if (mode === 'share') {
        if (!(await shareFile(file, 'Command Center backup'))) return;
      } else {
        downloadFile(file);
      }
      markBackup();
      toast('Backup saved');
    } catch {
      downloadFile(file);
      markBackup();
    }
  };

  const shareable = canShareFiles(backupFile());
  return h(
    'section',
    { class: 'settings-block', id: 'settings-backup' },
    h('h3', null, icon('download'), 'Backup'),
    h('p', { class: 'field-hint' }, `Everything is stored on this device only. Save a backup file before you reset your phone or switch to a new one. ${lastText}`),
    h(
      'div',
      { class: 'btn-row' },
      shareable ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save('share') }, icon('share'), 'Save backup…') : null,
      h('button', { class: `btn${shareable ? '' : ' btn-primary'}`, type: 'button', onclick: () => save('download') }, icon('download'), 'Download backup'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Restore from file'),
      fileInput
    )
  );
}

function installBlock() {
  if (isStandalone()) return null;
  const steps = isIOS()
    ? 'In Safari, tap the Share button, then Add to Home Screen.'
    : 'In Chrome, open the menu (⋮) and tap Add to Home screen or Install app.';
  return h(
    'section',
    { class: 'settings-block' },
    h('h3', null, icon('phone'), 'Add to Home Screen'),
    h('p', { class: 'field-hint' }, `${steps} It then opens full screen like a regular app and works offline.`)
  );
}

function dataBlock() {
  const s = S();
  const days = Object.keys(s.days).length;
  return h(
    'section',
    { class: 'settings-block' },
    h('h3', null, icon('info'), 'Data'),
    h(
      'p',
      { class: 'field-hint' },
      `Tracking since ${fmtFull(s.settings.startDate)} · ${plural(days, 'day')} logged · ${plural(s.goals.length, 'goal')} · ${plural(s.letters.length, 'letter')}`
    ),
    h(
      'button',
      {
        class: 'btn btn-ghost-danger',
        type: 'button',
        onclick: async () => {
          const first = await confirmDialog({
            title: 'Erase everything?',
            message: 'All tasks, history, streaks, goals, reviews and letters will be deleted from this device.',
            confirm: 'Continue',
            danger: true,
          });
          if (!first) return;
          const second = await confirmDialog({
            title: 'Are you sure?',
            message: 'This can’t be undone. Save a backup first if you might want this data later.',
            confirm: 'Erase all data',
            danger: true,
          });
          if (!second) return;
          eraseAll();
          closeAllSheets();
          toast('All data erased');
        },
      },
      icon('trash'),
      'Erase all data'
    ),
    h('p', { class: 'version' }, `Command Center ${APP_VERSION}`)
  );
}

export function openSettings(focus) {
  const sheet = openSheet({ title: 'Settings', className: 'sheet-settings' });
  sheet.setBody(h('div', { class: 'settings' }, remindersBlock(), backupBlock(), installBlock(), dataBlock()));
  if (focus === 'backup') {
    requestAnimationFrame(() => sheet.panel.querySelector('#settings-backup')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
}
