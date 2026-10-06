// End-to-end check of Command Center in a phone-sized headless Chromium.
//
//   python3 -m http.server 4173      (from the repo root, in another terminal)
//   node tests/e2e.mjs [screenshot-dir]
//
// Needs Playwright: `npm i -D playwright`, or set PLAYWRIGHT to its index.mjs.
import { mkdirSync, readFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const SHOTS = process.argv[2] || 'tests/screenshots';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
  serviceWorkers: 'block',
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const sheet = () => page.locator('.sheet.open').last();
const settle = (ms = 350) => page.waitForTimeout(ms);
const shot = (name, fullPage = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
const titles = (section) => page.locator(`.view .sec-${section} .row .row-text`).allTextContents();
const row = (text) => page.locator('.view .row', { has: page.locator('.row-text', { hasText: text }) }).first();
const toastText = () => page.locator('.toast').last().textContent();

async function setTime(iso) {
  await page.clock.setSystemTime(new Date(iso));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await settle();
}

async function fillTask({ title, repeat, day, type, time, counter, note, goal, streak }) {
  const s = sheet();
  await s.locator('input.input-lg').fill(title);
  if (repeat) await s.locator('.seg-btn', { hasText: repeat }).click();
  if (day) await s.locator('.chip', { hasText: day }).click();
  if (type) await s.locator('.seg-btn', { hasText: type }).click();
  if (time) await s.locator('input[type=time]').fill(time);
  if (counter || note || goal || streak) {
    const more = s.locator('details.more');
    if (!(await more.evaluate((d) => d.open))) await more.locator('summary').click();
  }
  if (counter) {
    await s.locator('.switch-row', { hasText: 'Track a number' }).click();
    const inputs = s.locator('.counter-fields input');
    await inputs.nth(0).fill(String(counter.target));
    await inputs.nth(1).fill(counter.unit || '');
    if (counter.step) await inputs.nth(2).fill(String(counter.step));
  }
  if (streak) await s.locator('.switch-row', { hasText: 'Track as a streak' }).click();
  if (goal) await s.locator('select[aria-label="Linked goal"]').selectOption({ label: goal });
  if (note) await s.locator('textarea').fill(note);
  await s.locator('.sheet-foot .btn-primary').click();
  await settle();
}

async function addTo(section, task) {
  await page.click(`.view .sec-${section} .section-add`);
  await settle(300);
  await fillTask(task);
}

async function quickAdd(task) {
  await page.click('#fab');
  await settle(300);
  await fillTask(task);
}

async function swipe(locator, dx) {
  const box = await locator.locator('.row-main').boundingBox();
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (dx * i) / 12, y);
  await page.mouse.up();
  await settle(500);
}

async function dragGrip(from, to, offset = -10) {
  await from.scrollIntoViewIfNeeded();
  const g = await from.locator('.grip').boundingBox();
  const t = await to.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const targetY = t.y + offset;
  const startY = g.y + g.height / 2;
  for (let i = 1; i <= 15; i++) await page.mouse.move(g.x + g.width / 2, startY + ((targetY - startY) * i) / 15);
  await page.mouse.up();
  await settle(400);
}

async function closeSheet() {
  await sheet().locator('.sheet-close').click();
  await settle(350);
}

async function tab(name) {
  await page.click(`.tab[data-tab=${name}]`);
  await settle(250);
}

// ---------------------------------------------------------------------------
console.log('Day 1 · Monday Oct 5 2026, 7:10 AM');
await page.clock.install({ time: new Date('2026-10-05T07:10:00') });
await page.goto(BASE);
await settle(500);
check((await page.locator('.tab').count()) === 5, 'five tabs render');

await addTo('morning', { title: 'Wake up + water', time: '06:00' });
await addTo('morning', { title: 'Make bed' });
await addTo('morning', { title: 'Gym', time: '06:30', streak: true });
await addTo('morning', { title: 'Protein', counter: { target: 200, unit: 'g', step: 25 } });
check(JSON.stringify(await titles('morning')) === JSON.stringify(['Wake up + water', 'Make bed', 'Gym', 'Protein']), 'morning tasks in time order, untimed where added');

await addTo('night', { title: 'Read 20 pages' });
await addTo('night', { title: 'Skincare', time: '22:00' });

await quickAdd({ title: 'Finish pitch deck', type: 'Priority' });
await quickAdd({ title: 'Violin lesson', type: 'Required', time: '16:30' });
await quickAdd({ title: 'Buy groceries', type: 'Required' });
await quickAdd({ title: 'Call mom', time: '19:00' });
await quickAdd({ title: 'Review trade journal', type: 'Priority', time: '08:00' });
await quickAdd({ title: 'Ship landing page', type: 'Priority' });
check(JSON.stringify(await titles('today')) === JSON.stringify(['Finish pitch deck', 'Review trade journal', 'Violin lesson', 'Buy groceries', 'Call mom', 'Ship landing page']), 'today tasks sort by time');

await page.click('#fab');
await settle(300);
check(await sheet().locator('.seg-btn', { hasText: 'Priority' }).isDisabled(), 'a 4th priority is blocked');
check((await sheet().locator('.field-hint', { hasText: 'All 3 priorities' }).count()) === 1, 'priority limit is explained');
await closeSheet();

check((await page.locator('.top3-item').count()) === 3, 'Top 3 card lists 3 priorities');
check((await row('Finish pitch deck').getAttribute('class')).includes('type-priority'), 'priority row is marked');
check((await row('Violin lesson').locator('.req-mark').count()) === 1, 'required row has its own marker');
check((await row('Call mom').locator('.req-mark, .prio-flag').count()) === 0, 'normal row has no marker');

const nowText = await page.locator('.nn-now').textContent();
check(nowText.includes('Gym') && nowText.includes('1 more unfinished'), 'Now shows the current timed task and what is behind');
check((await page.locator('.nn-next').textContent()).includes('Review trade journal'), 'Next shows the next timed task');
await shot('01-today-day1');

// Check off by tap and by swipe.
await row('Wake up + water').locator('.check').click();
await settle();
check((await row('Wake up + water').getAttribute('class')).includes('is-done'), 'tap the box to check off');
await swipe(row('Gym'), 160);
check((await row('Gym').getAttribute('class')).includes('is-done'), 'swipe right to check off');

// Swipe left deletes, Undo restores.
await swipe(row('Call mom'), -200);
check(!(await titles('today')).includes('Call mom'), 'swipe left deletes');
await page.locator('.toast-action', { hasText: 'Undo' }).click();
await settle();
check((await titles('today')).includes('Call mom'), 'undo brings it back');

// Drag to reorder.
await dragGrip(row('Protein'), row('Wake up + water'));
check((await titles('morning'))[0] === 'Protein', 'drag an untimed task to the top');
await dragGrip(row('Gym'), row('Protein'));
check(JSON.stringify(await titles('morning')) === JSON.stringify(['Protein', 'Wake up + water', 'Make bed', 'Gym']), 'timed task snaps back into time order');
check((await toastText()).includes('time order'), 'snap back is explained');

// Counter.
await row('Protein').locator('.check').click();
await settle(300);
await sheet().locator('.counter-btn', { hasText: '+25' }).click();
await sheet().locator('.counter-btn', { hasText: '+25' }).click();
check((await sheet().locator('.counter-value').textContent()) === '50', 'counter adds steps');
await shot('02-counter');
await sheet().locator('.counter-set input').fill('200');
await sheet().locator('.counter-set .btn').click();
check((await sheet().locator('.counter-status').textContent()).includes('Target hit'), 'hitting the target completes it');
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
check((await row('Protein').getAttribute('class')).includes('is-done'), 'counter row shows done');
await swipe(row('Protein'), 160);
check((await row('Protein').locator('.meta-count').textContent()).startsWith('225'), 'swipe right on a counter adds one step');
await page.locator('.toast-action', { hasText: 'Undo' }).click();
await settle();

// Notes and edits.
await row('Violin lesson').locator('.row-body').click();
await settle(300);
await sheet().locator('textarea').fill('Worked on the Bach partita, bars 1-24');
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
check((await row('Violin lesson').locator('.meta-note').textContent()).includes('Bach'), 'task note shows on the row');
await row('Review trade journal').locator('.check').click();
await row('Review trade journal').locator('.check').click();
await settle();
await page.locator('.note-card').click();
await settle(300);
await sheet().locator('textarea').fill('Bench 185x5. Good energy.');
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
check((await page.locator('.note-card .note-text').textContent()).includes('Bench'), 'day note saves');

await page.reload();
await settle(800);
check((await titles('morning')).length === 4 && (await titles('today')).length === 6, 'everything is still there after closing and reopening');
check((await row('Wake up + water').getAttribute('class')).includes('is-done'), 'check marks survive a reload');

// Letter.
await page.locator('.notice-main', { hasText: 'letter' }).click();
await settle(300);
await sheet().locator('textarea').fill('Hey future me. Did you ship it?');
await sheet().locator('.sheet-foot .btn-primary').click();
await settle(300);
await sheet().locator('.sheet-foot .btn-primary').click();
await settle(500);
check((await page.locator('.notice-main', { hasText: 'letter' }).count()) === 0, 'letter reminder clears after writing');
await shot('03-today-progress', true);

// Plan tomorrow and a later day.
await tab('plan');
check((await page.locator('.plan-day h2').textContent()).includes('Tuesday'), 'Plan opens on tomorrow');
await quickAdd({ title: 'Deep work block', type: 'Priority' });
await quickAdd({ title: 'Dentist', type: 'Required', time: '09:00' });
check(JSON.stringify(await titles('today')) === JSON.stringify(['Deep work block', 'Dentist']), 'tasks added to tomorrow');
await page.click('.page-head-actions .icon-btn');
await settle(300);
await sheet().locator('.cal-cell', { hasText: /^15$/ }).click();
await settle(400);
check((await page.locator('.plan-day h2').textContent()).includes('15'), 'calendar picks a later date');
await quickAdd({ title: 'Pay rent', type: 'Required' });
check((await titles('today')).includes('Pay rent'), 'task planned for Oct 15');
await page.locator('.date-chip').first().click();
await settle();
await shot('04-plan');

// Streak trackers.
await tab('progress');
await page.locator('.block-head .btn', { hasText: 'Manage' }).click();
await settle(300);
await sheet().locator('.switch-row', { hasText: 'Protein' }).click();
await closeSheet();
check((await page.locator('.streak').count()) === 2, 'two streak trackers');

// Goals.
await tab('goals');
await page.locator('.page-head .btn-primary').click();
await settle(300);
await sheet().locator('input.input-lg').fill('Bench 225 for 5');
await sheet().locator('.chip', { hasText: 'Fitness' }).click();
await sheet().locator('select').selectOption('12');
for (const step of ['Hit 185x5', 'Hit 205x5', 'Hit 225x5']) {
  await sheet().locator('.inline-add input').fill(step);
  await sheet().locator('.inline-add .btn').click();
}
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
const goalTf = page.locator('.tf', { has: page.locator('h2', { hasText: /^1 year$/ }) });
check((await goalTf.locator('.goal-card').count()) === 1, 'goal lands in the 1 year timeframe');
check((await goalTf.locator('.goal-meta').textContent()).includes('Oct 5, 2027'), 'target date counts from creation');
await goalTf.locator('.goal-card').click();
await settle(300);
await sheet().locator('.step .check').first().click();
await settle();
check((await sheet().locator('.goal-summary-top').textContent()).includes('1/3'), 'checking a step updates progress');
await sheet().locator('select[aria-label="Timeframe"]').selectOption('18');
await settle();
await closeSheet();
const tf18 = page.locator('.tf', { has: page.locator('h2', { hasText: /^1.5 years$/ }) });
check((await tf18.locator('.goal-card').count()) === 1, 'goal moved to 1.5 years');
check((await tf18.locator('.goal-meta').textContent()).includes('Apr 5, 2028'), 'target date follows the new timeframe');
await shot('05-goals', true);

// Link Gym to the goal.
await tab('today');
await row('Gym').locator('.row-body').click();
await settle(300);
await fillTask({ title: 'Gym', goal: 'Bench 225 for 5 · Fitness' });
check((await row('Gym').locator('.meta-goal').textContent()).includes('Bench'), 'task shows its linked goal');

// ---------------------------------------------------------------------------
console.log('Day 2 · Tuesday Oct 6, 8:00 AM');
await setTime('2026-10-06T08:00:00');
check((await page.locator('h1').textContent()).includes('October 6'), 'app moves to the new day');
check((await toastText()).includes('carried over'), 'carry-over toast shows');
check((await toastText()).includes('became Required'), 'extra carried priority is downgraded');
const day2 = await titles('today');
check(day2.includes('Finish pitch deck') && day2.includes('Deep work block') && day2.includes('Dentist'), "yesterday's unfinished tasks and tomorrow's plan are both in Today");
check((await page.locator('.view .sec-morning .row.is-done').count()) === 0, 'morning routine unchecked at the new day');
check((await page.locator('.top3-item').count()) === 3, 'still max 3 priorities');
await row('Gym').locator('.check').click();
await row('Protein').locator('.check').click();
await settle(300);
await sheet().locator('.counter-set input').fill('210');
await sheet().locator('.counter-set .btn').click();
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
await shot('06-today-day2', true);

console.log('Day 3 · Wednesday Oct 7 (Gym skipped)');
await setTime('2026-10-07T21:30:00');
await row('Protein').locator('.check').click();
await settle(300);
await sheet().locator('.counter-set input').fill('200');
await sheet().locator('.counter-set .btn').click();
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
check((await page.locator('.banner', { hasText: 'Plan tomorrow' }).count()) === 1, 'plan-tomorrow banner after the nightly time');
await tab('progress');
const gymCard = page.locator('.streak', { hasText: 'Gym' });
check((await gymCard.locator('.streak-num').textContent()) === '2', 'streak stays alive until the day ends');

console.log('Day 4 · Thursday Oct 8');
await setTime('2026-10-08T09:00:00');
check((await gymCard.locator('.streak-num').textContent()) === '0', 'a missed day resets the streak to 0');
check((await gymCard.locator('.streak-stats').textContent()).includes('2 best'), 'best streak is kept');
check((await page.locator('.streak', { hasText: 'Protein' }).locator('.streak-num').textContent()) === '3', 'counter task streak counts days the target was hit');
check((await page.locator('.hist-row').count()) === 3, 'history lists past days');
await shot('07-progress', true);
await page.locator('.hist-row').last().click();
await settle(400);
check((await sheet().locator('.day-score-text strong').textContent()).includes('of'), 'past day shows its score');
check((await sheet().locator('.row.is-moved').count()) > 0, 'moved tasks are marked in history');
await shot('08-history-day');
await closeSheet();

console.log('Sunday Oct 11 · weekly review');
await setTime('2026-10-11T18:00:00');
await tab('today');
check((await page.locator('.banner', { hasText: 'Weekly review' }).count()) === 1, 'Sunday review prompt');
await page.locator('.banner', { hasText: 'Weekly review' }).locator('.banner-btn').click();
await settle(300);
check((await sheet().locator('.stat-label', { hasText: 'Priorities' }).count()) === 1, 'review shows priority stats');
const areas = sheet().locator('textarea');
await areas.nth(0).fill('Kept protein every day.');
await areas.nth(1).fill('Skipped gym Wednesday.');
await areas.nth(2).fill('Ship the landing page.');
await shot('09-review');
await sheet().locator('.sheet-foot .btn-primary').click();
await settle();
check((await page.locator('.banner', { hasText: 'Weekly review' }).count()) === 0, 'prompt clears after saving');
await tab('journal');
check((await page.locator('.review-card .btn').textContent()).includes('Open'), 'saved review is listed');
check((await page.locator('.letter-row.is-locked').count()) === 1, 'sealed letter shows as locked');
check((await page.locator('.letter-row .letter-info').textContent()).includes('Apr 5, 2027'), 'locked letter shows its unlock date');
await page.locator('.letter-row').click();
await settle(300);
check((await sheet().locator('.letter-body').count()) === 0, 'a locked letter cannot be opened');
await closeSheet();
await shot('10-journal', true);

// Backup round trip.
await tab('today');
await page.click('.home-head .icon-btn[aria-label="Settings"]');
await settle(300);
await shot('11-settings');
const [download] = await Promise.all([page.waitForEvent('download'), sheet().locator('.btn', { hasText: 'Download backup' }).click()]);
const backupPath = `${SHOTS}/backup.json`;
await download.saveAs(backupPath);
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
check(backup.app === 'command-center' && backup.data.routine.length === 6, 'backup file holds the data');
check(!JSON.stringify(backup).includes('Did you ship it'), 'sealed letter text is not readable in the backup');
await sheet().locator('.btn', { hasText: 'Erase all data' }).click();
await settle(300);
await sheet().locator('.sheet-foot .btn-danger').click();
await settle(300);
await sheet().locator('.sheet-foot .btn-danger').click();
await settle(500);
check((await page.locator('.view .row').count()) === 0, 'erase clears everything');
await page.click('.home-head .icon-btn[aria-label="Settings"]');
await settle(300);
await sheet().locator('input[type=file]').setInputFiles(backupPath);
await settle(400);
await sheet().locator('.sheet-foot .btn-danger').click();
await settle(600);
check((await titles('morning')).length === 4, 'restore brings the data back');
check(page.url() === BASE, 'closing stacked sheets never navigates away from the app');

await page.click('#fab');
await settle(300);
await page.goBack();
await settle(400);
check((await page.locator('.sheet.open').count()) === 0 && page.url() === BASE, 'the back gesture closes a sheet and stays in the app');
await page.click('#fab');
await settle(300);
await closeSheet();
check(page.url() === BASE, 'reopening after a back gesture still works');

console.log('Six months later · Apr 5 2027');
await setTime('2027-04-05T09:00:00');
check((await page.locator('.banner', { hasText: 'letter from your past self' }).count()) === 1, 'unlocked letter banner');
await page.locator('.banner', { hasText: 'letter from your past self' }).locator('.banner-btn').click();
await settle(400);
check((await sheet().locator('.letter-body').textContent()).includes('Did you ship it'), 'unlocked letter opens');
await closeSheet();
check((await page.locator('.banner', { hasText: 'letter from your past self' }).count()) === 0, 'banner clears after opening');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
