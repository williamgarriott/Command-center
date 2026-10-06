// DOM helpers and shared UI pieces: element builder, bottom sheets, toasts,
// confirmations, form controls, progress rings.
import { icon } from './icons.js';

export { icon };

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'readOnly', 'open']);

// h('button', { class: 'x', onclick: fn }, 'Label', childNode, [more], null)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (key === 'class') el.className = v;
      else if (key === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2), v);
      else if (PROP_KEYS.has(key)) el[key] = v;
      else el.setAttribute(key, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export const buzz = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Not supported.
  }
};

/* ---------- Navigation registry (filled in by app.js) ---------- */

export const nav = {
  current: 'today',
  go() {},
  refresh() {},
};

/* ---------- Interaction lock: no re-render mid-swipe or mid-drag ---------- */

let busy = 0;
const idleQueue = [];
export const isBusy = () => busy > 0;
export function beginInteraction() {
  busy++;
}
export function endInteraction() {
  busy = Math.max(0, busy - 1);
  if (!busy) idleQueue.splice(0).forEach((fn) => fn());
}
export function whenIdle(fn) {
  if (!busy) fn();
  else idleQueue.push(fn);
}

/* ---------- Bottom sheets ---------- */

// While any sheet is open, one extra history entry sits on top so the phone's
// back gesture closes the sheet instead of leaving the app. Only one entry is
// ever pushed, and never while a back() we issued is still in flight, so the
// app can't step back past its own page.
const sheets = [];
let armed = false;
let pendingBacks = 0;
let armQueued = false;

function arm() {
  if (armed) return;
  if (pendingBacks > 0) {
    armQueued = true;
    return;
  }
  history.pushState({ ccSheet: true }, '');
  armed = true;
}

function disarm() {
  if (armQueued) {
    armQueued = false;
    return;
  }
  if (!armed) return;
  armed = false;
  pendingBacks++;
  history.back();
}

window.addEventListener('popstate', () => {
  if (pendingBacks > 0) {
    pendingBacks--;
    if (!pendingBacks && armQueued) {
      armQueued = false;
      if (sheets.length) arm();
    }
    return;
  }
  // The back gesture or button: close the top sheet.
  armed = false;
  const top = sheets[sheets.length - 1];
  if (!top) return;
  top.close({ fromHistory: true });
  if (sheets.length) arm();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
});

// Lifts sheets above the on-screen keyboard.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(inset)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}

export function openSheet({ title = '', className = '', onClose } = {}) {
  const layer = sheets.length;
  const titleEl = h('h2', { class: 'sheet-title' }, title);
  const closeBtn = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'Close' }, icon('x'));
  const body = h('div', { class: 'sheet-body' });
  const foot = h('div', { class: 'sheet-foot', hidden: true });
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h(
    'div',
    { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, titleEl, closeBtn),
    body,
    foot
  );
  backdrop.style.zIndex = String(100 + layer * 2);
  panel.style.zIndex = String(101 + layer * 2);

  let closed = false;
  const api = {
    panel,
    body,
    setTitle(text) {
      titleEl.textContent = text;
      panel.setAttribute('aria-label', text);
    },
    setBody(...nodes) {
      body.replaceChildren(...nodes.flat().filter(Boolean));
    },
    setFooter(...nodes) {
      const list = nodes.flat().filter(Boolean);
      foot.replaceChildren(...list);
      foot.hidden = !list.length;
    },
    close(opts = {}) {
      if (closed) return;
      closed = true;
      sheets.splice(sheets.indexOf(api), 1);
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      setTimeout(() => {
        panel.remove();
        backdrop.remove();
      }, 260);
      if (!opts.fromHistory && !sheets.length) disarm();
      document.body.classList.toggle('sheet-open', sheets.length > 0);
      onClose?.();
    },
  };

  closeBtn.addEventListener('click', () => api.close());
  backdrop.addEventListener('click', () => api.close());
  document.body.append(backdrop, panel);
  document.body.classList.add('sheet-open');
  sheets.push(api);
  arm();
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    panel.classList.add('open');
  });
  return api;
}

export function closeAllSheets() {
  for (const s of [...sheets].reverse()) s.close();
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      title,
      className: 'sheet-confirm',
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
    sheet.setBody(h('p', { class: 'confirm-msg' }, message));
    sheet.setFooter(
      h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
      h(
        'button',
        {
          class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
          type: 'button',
          onclick: () => {
            answered = true;
            resolve(true);
            sheet.close();
          },
        },
        confirm
      )
    );
  });
}

/* ---------- Toasts ---------- */

let toastTimer = null;

export function toast(message, { action, onAction, duration = 4000 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  clearTimeout(toastTimer);
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', { class: 'toast-msg' }, message),
    action
      ? h(
          'button',
          {
            class: 'toast-action',
            type: 'button',
            onclick: () => {
              hide();
              onAction?.();
            },
          },
          action
        )
      : null
  );
  root.replaceChildren(el);
  requestAnimationFrame(() => el.classList.add('show'));
  function hide() {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }
  toastTimer = setTimeout(hide, duration);
}

/* ---------- Form controls ---------- */

export function field(label, control, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null
  );
}

// options: [{ value, label, className?, disabled? }]
export function segmented(options, value, onChange, ariaLabel = '') {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': ariaLabel });
  let current = value;
  const paint = () => {
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: `seg-btn ${o.className || ''}${o.value === current ? ' on' : ''}`,
            role: 'radio',
            'aria-checked': String(o.value === current),
            disabled: !!o.disabled,
            onclick: () => {
              if (o.value === current) return;
              current = o.value;
              paint();
              onChange(current);
            },
          },
          o.label
        )
      )
    );
  };
  paint();
  wrap.setOptions = (next, v = current) => {
    options = next;
    current = v;
    paint();
  };
  return wrap;
}

export function toggleSwitch(checked, onChange, label, hint) {
  const input = h('input', {
    type: 'checkbox',
    class: 'switch-input',
    checked: !!checked,
    onchange: (e) => onChange(e.target.checked),
  });
  return h(
    'label',
    { class: 'switch-row' },
    h(
      'span',
      { class: 'switch-text' },
      h('span', { class: 'switch-label' }, label),
      hint ? h('span', { class: 'switch-hint' }, hint) : null
    ),
    input,
    h('span', { class: 'switch', 'aria-hidden': 'true' })
  );
}

export function chip(label, on, onclick, extra = {}) {
  return h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(!!on), onclick, ...extra }, label);
}

/* ---------- Rings and bars ---------- */

export function ringSvg(fraction, complete, size = 28) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const mid = size / 2;
  const span = document.createElement('span');
  span.className = `ring-svg${complete ? ' full' : ''}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<circle cx="${mid}" cy="${mid}" r="${r}" class="ring-track"/>` +
    `<circle cx="${mid}" cy="${mid}" r="${r}" class="ring-fill" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - f)).toFixed(2)}" transform="rotate(-90 ${mid} ${mid})"/>` +
    (complete ? `<path d="M${mid - 5} ${mid + 0.5}l3.3 3.3L${mid + 5.5} ${mid - 4}" class="ring-check"/>` : '') +
    `</svg>`;
  return span;
}

export function scoreRing(pct, size = 52) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const f = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const span = document.createElement('span');
  span.className = 'score-ring';
  span.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="${mid}" cy="${mid}" r="${r}" class="ring-track"/>` +
    `<circle cx="${mid}" cy="${mid}" r="${r}" class="ring-fill" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - f)).toFixed(2)}" transform="rotate(-90 ${mid} ${mid})"/>` +
    `</svg><span class="score-ring-num">${pct == null ? '–' : `${pct}<small>%</small>`}</span>`;
  return span;
}

export function progressBar(fraction, cls = '') {
  const f = Math.max(0, Math.min(1, fraction || 0));
  return h(
    'div',
    { class: `bar ${cls}${f >= 1 ? ' full' : ''}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(f * 100)) },
    h('span', { style: { width: `${f * 100}%` } })
  );
}

export function pageHeader(title, sub, ...right) {
  return h(
    'header',
    { class: 'page-head' },
    h('div', { class: 'page-head-text' }, h('h1', null, title), sub ? h('p', { class: 'page-sub' }, sub) : null),
    right.length ? h('div', { class: 'page-head-actions' }, right) : null
  );
}

export function emptyState(text, actionLabel, onAction) {
  return h(
    'div',
    { class: 'empty' },
    h('p', null, text),
    actionLabel ? h('button', { class: 'btn btn-sm', type: 'button', onclick: onAction }, icon('plus'), actionLabel) : null
  );
}

// Lets a transparent date input sitting over a chip open its picker on click.
export function openPicker(input) {
  try {
    input.showPicker?.();
  } catch {
    // Some browsers only open the picker on a direct tap, which the overlay handles.
  }
}
