// Export and restore all data as a JSON file.
import { S, SCHEMA } from './store.js';
import { todayKey } from './util.js';

export function backupFile() {
  const payload = { app: 'command-center', schema: SCHEMA, exportedAt: new Date().toISOString(), data: S() };
  const name = `command-center-backup-${todayKey()}.json`;
  return new File([JSON.stringify(payload)], name, { type: 'application/json' });
}

export function canShareFiles(file) {
  try {
    return !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

// Resolves true when the file was handed off, false if the person cancelled.
export async function shareFile(file, title) {
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    throw err;
  }
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  const data = parsed && parsed.app === 'command-center' ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !Array.isArray(data.routine) || typeof data.days !== 'object') {
    throw new Error('That file isn’t a Command Center backup.');
  }
  return { data, exportedAt: parsed.exportedAt || null };
}
