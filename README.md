# Command Center

A personal daily command center that installs on your phone's home screen. It runs entirely in the browser, works offline, and keeps all data on your device.

- **Now / Next**: the top of the home screen shows what you should be doing right now and what's coming up, based on your timed tasks.
- **Daily checklist**: Morning, Today and Night. Morning and Night hold your permanent daily tasks and reset at midnight. Today holds one-off tasks, and anything left unchecked carries over to the next day.
- **Times and order**: any task can have a time. Timed tasks sort into place automatically; untimed tasks stay where you put them. Drag the grip to reorder.
- **Task types**: Priority (max 3 a day, amber outline, also listed in the Top 3 card), Required (violet diamond), and Normal.
- **Plan**: set up tomorrow, or any future date from the calendar. At midnight it becomes Today.
- **Counters**: a task can track a number toward a target (200 g protein, 30 min of practice, 100 cards). It counts as done when you hit the target.
- **Notes**: on any task or day.
- **Daily score and weekly average**, **streaks** with mini calendars, and **history** of past days.
- **Weekly review** every Sunday, saved with that week's stats.
- **Goals** in 10 timeframes from 6 months to 5 years, with categories, sub-steps and links to your daily tasks.
- **Letters to future you**: sealed for 6 months, then they unlock.
- **Reminders** for timed tasks and a nightly "plan tomorrow" nudge.
- **Backup** export and restore.

## Put it on your phone

The app is plain static files, so any static host works. GitHub Pages is free for this public repo:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, pick the branch with this code and the **/ (root)** folder, then **Save**.
3. After a minute the site is live at `https://williamgarriott.github.io/Command-center/`.
4. **iPhone**: open that link in Safari, tap **Share**, then **Add to Home Screen**.
   **Android**: open it in Chrome, open the **⋮** menu, then **Install app** (or **Add to Home screen**).

Open it from the home screen icon from then on. It runs full screen and works without a connection.

## Your data

- Everything is stored on the device in the browser's IndexedDB storage (localStorage is the fallback). Nothing is sent anywhere.
- The app asks the browser to keep its storage persistent, and keeps a daily fallback copy of your data.
- Data does not sync between devices. To move to a new phone, use **Settings → Backup**: save a backup file, then **Restore from file** on the new phone.
- Clearing Safari or Chrome website data for the site, or deleting the home screen app, deletes its data. Keep a recent backup.

## Reminders

Phones only let a web app show notifications while it's open or was used very recently. They can't schedule alarms for a closed web app the way a native app can. So:

- With reminders on, you get a notification (or an in-app banner) at a task's time while the app is running.
- For alarms that fire even when the app is closed, use **Settings → Add reminders to my calendar**. It exports the nightly planning reminder and your timed Morning and Night tasks as repeating calendar events with alerts. Export again after you change their times.
- On iPhone, notifications need iOS 16.4 or later and only work from the home screen app.

## How the rules work

- **Carry-over**: at midnight, unfinished one-off tasks move to the new day (marked "Carried from…"). The original stays in that day's history as "Moved to…", so past scores stay accurate. If a carried priority would make more than 3, it becomes Required.
- **Time order**: adding a time slots the task in before the first later timed task. Dragging a timed task past another timed task snaps it back; change its time to move it further.
- **Daily score**: done tasks ÷ all tasks that day (Morning + Today + Night). The weekly average runs Monday to Sunday.
- **Streaks**: today counts once the task is done. Until then the streak runs through yesterday. Missing a full day resets the current streak to 0. Best streak is kept.
- **Goals**: the target date is the creation date plus the timeframe, and moving a goal to another timeframe recalculates it.
- **Letters**: unlock 6 months after the day they were written. A locked letter can be deleted but never opened early. Letter text is stored encoded, so it doesn't show in plain text in a backup file.

## Development

No build step: the app is `index.html`, `css/app.css` and ES modules in `js/`.

```sh
python3 -m http.server 4173          # serve the repo root
node tests/e2e.mjs                   # end-to-end test (needs `npm i -D playwright`)
```

The end-to-end test drives the app in a phone-sized headless browser with a fake clock: it adds tasks, swipes and drags, rolls over several days, checks streaks, goals, letters, the weekly review, and a backup round trip.

When you ship a change, bump `VERSION` in `sw.js` (and `APP_VERSION` in `js/sheets/settings.js`). Installed copies pick up the new files and show an **Update** prompt.
