import { useMemo, useSyncExternalStore } from 'react';
import { callApi, NetworkError, ServerError } from './api';
import { buildView, newId } from './outbox';
import type { Op, OpBody, ServerData, Settings, View } from './types';

export interface State {
  settings: Settings | null;
  server: ServerData | null;
  outbox: Op[];
  syncing: boolean;
  online: boolean;
  lastSync: number | null;
  lastError: string | null;
}

const KEYS = {
  settings: 'kalyta.settings',
  server: 'kalyta.server',
  outbox: 'kalyta.outbox',
  lastSync: 'kalyta.lastSync',
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the app keeps working in memory
  }
}

let state: State = {
  settings: load<Settings | null>(KEYS.settings, null),
  server: load<ServerData | null>(KEYS.server, null),
  outbox: load<Op[]>(KEYS.outbox, []),
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSync: load<number | null>(KEYS.lastSync, null),
  lastError: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  if ('settings' in patch) save(KEYS.settings, state.settings);
  if ('server' in patch) save(KEYS.server, state.server);
  if ('outbox' in patch) save(KEYS.outbox, state.outbox);
  if ('lastSync' in patch) save(KEYS.lastSync, state.lastSync);
  for (const l of listeners) l();
}

export function getState(): State {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useView(): View | null {
  const s = useStore();
  return useMemo(() => buildView(s.server, s.outbox), [s.server, s.outbox]);
}

// ----- actions -----

// holdMs keeps the entry on the phone for a while so "Undo" can take it back before it reaches the sheet
export function enqueue(body: OpBody, holdMs = 0): string {
  const now = Date.now();
  const op = { ...body, opId: newId(), createdAt: now, notBefore: holdMs ? now + holdMs : undefined } as Op;
  set({ outbox: [...state.outbox, op] });
  void sync();
  return op.opId;
}

export function discardOp(opId: string) {
  set({ outbox: state.outbox.filter((o) => o.opId !== opId) });
}

// Removes queued ops (and gives them back for "Undo")
export function takeOps(pred: (o: Op) => boolean): Op[] {
  const taken = state.outbox.filter(pred);
  if (taken.length) set({ outbox: state.outbox.filter((o) => !pred(o)) });
  return taken;
}

export function putBackOps(ops: Op[]) {
  set({ outbox: [...state.outbox, ...ops] });
}

export function retryOp(opId: string) {
  set({ outbox: state.outbox.map((o) => (o.opId === opId ? { ...o, error: undefined } : o)) });
  void sync();
}

export function retryAll() {
  set({ outbox: state.outbox.map((o) => (o.error ? { ...o, error: undefined } : o)) });
  void sync();
}

// Recreates missing tabs in the sheet, then tries everything that failed again
export function repairAndRetry() {
  const body: OpBody = { action: 'repair' };
  const op = { ...body, opId: newId(), createdAt: Date.now() } as Op;
  set({ outbox: [op, ...state.outbox.map((o) => (o.error ? { ...o, error: undefined } : o))] });
  void sync();
}

export async function connect(settings: Settings): Promise<void> {
  const data = await callApi(settings, { action: 'data' });
  set({ settings, server: data, online: true, lastSync: Date.now(), lastError: null });
}

export function forgetDevice() {
  set({ settings: null, server: null, outbox: [], lastSync: null, lastError: null });
}

let running = false;
let again = false;
let wake: ReturnType<typeof setTimeout> | undefined;

// Sends queued entries one by one, then pulls fresh data
export async function sync(): Promise<void> {
  const settings = state.settings;
  if (!settings) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  // the device was disconnected (or reconnected) while a request was out: drop its result
  const stale = () => state.settings !== settings;
  set({ syncing: true });
  try {
    let fresh = false;
    let held = Number.POSITIVE_INFINITY;
    for (const op of state.outbox) {
      if (op.error) continue;
      if (op.notBefore && op.notBefore > Date.now()) {
        // keep the order: later ops may depend on this one (a balance check after a delete)
        held = op.notBefore;
        break;
      }
      if (!state.outbox.some((o) => o.opId === op.opId)) continue; // undone while we were sending
      const { opId, createdAt: _c, error: _e, notBefore: _n, ...body } = op;
      try {
        const data = await callApi(settings, body as OpBody);
        if (stale()) return;
        set({
          server: data,
          outbox: state.outbox.filter((o) => o.opId !== opId),
          online: true,
          lastError: null,
        });
        fresh = true;
      } catch (err) {
        if (stale()) return;
        if (err instanceof ServerError) {
          set({ outbox: state.outbox.map((o) => (o.opId === opId ? { ...o, error: err.message } : o)) });
          continue;
        }
        set({ online: false, lastError: (err as Error).message });
        return;
      }
    }
    if (!fresh) {
      const data = await callApi(settings, { action: 'data' });
      if (stale()) return;
      set({ server: data, online: true, lastError: null });
    }
    set({ lastSync: Date.now() });
    if (held < Number.POSITIVE_INFINITY) {
      clearTimeout(wake);
      wake = setTimeout(() => void sync(), held - Date.now() + 50);
    }
  } catch (err) {
    if (stale()) return;
    set({ online: err instanceof NetworkError ? false : state.online, lastError: (err as Error).message });
  } finally {
    running = false;
    set({ syncing: false });
    if (again) {
      again = false;
      void sync();
    }
  }
}

export function startBackgroundSync() {
  const kick = () => {
    if (document.visibilityState === 'visible') void sync();
  };
  window.addEventListener('online', () => {
    set({ online: true });
    void sync();
  });
  window.addEventListener('offline', () => set({ online: false }));
  document.addEventListener('visibilitychange', kick);
  setInterval(kick, 60_000);
  void sync();
}
