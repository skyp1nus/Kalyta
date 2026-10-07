import type { State } from './store';

export type SyncMode = 'syncing' | 'offline' | 'error' | 'pending' | 'ok';

export interface SyncInfo {
  mode: SyncMode;
  waiting: number; // queued and ready to send
  failed: number; // rejected by the sheet
  error: string; // what went wrong, if anything
}

export function syncInfo(s: State): SyncInfo {
  const now = Date.now();
  const failedOps = s.outbox.filter((o) => o.error);
  const waiting = s.outbox.filter((o) => !o.error && !(o.notBefore && o.notBefore > now)).length;
  const failed = failedOps.length;
  const error = failedOps[0]?.error ?? s.lastError ?? '';
  let mode: SyncMode = 'ok';
  if (failed) mode = 'error';
  else if (!s.online) mode = 'offline';
  else if (s.syncing) mode = 'syncing';
  else if (s.lastError) mode = 'error';
  else if (waiting) mode = 'pending';
  return { mode, waiting, failed, error };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
