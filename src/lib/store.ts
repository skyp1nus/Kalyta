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

export function enqueue(body: OpBody) {
  const op = { ...body, opId: newId(), createdAt: Date.now() } as Op;
  set({ outbox: [...state.outbox, op] });
  void sync();
}

export function discardOp(opId: string) {
  set({ outbox: state.outbox.filter((o) => o.opId !== opId) });
}

export function retryOp(opId: string) {
  set({ outbox: state.outbox.map((o) => (o.opId === opId ? { ...o, error: undefined } : o)) });
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

// Sends queued entries one by one, then pulls fresh data
export async function sync(): Promise<void> {
  const settings = state.settings;
  if (!settings) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  set({ syncing: true });
  try {
    let fresh = false;
    for (const op of state.outbox) {
      if (op.error) continue;
      const { opId, createdAt: _c, error: _e, ...body } = op;
      try {
        const data = await callApi(settings, body as OpBody);
        set({
          server: data,
          outbox: state.outbox.filter((o) => o.opId !== opId),
          online: true,
          lastError: null,
        });
        fresh = true;
      } catch (err) {
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
      set({ server: data, online: true, lastError: null });
    }
    set({ lastSync: Date.now() });
  } catch (err) {
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
