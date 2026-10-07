import { useSyncExternalStore } from 'react';

// Per-device display settings. They never go to the sheet.
export type Theme = 'auto' | 'dark' | 'light';
export type Block = 'cards' | 'accounts' | 'debts' | 'recent' | 'places';

export interface Prefs {
  theme: Theme;
  base: string;
  cents: boolean;
  order: Block[];
  hidden: Block[];
}

export const BASES = ['USD', 'PLN', 'EUR', 'UAH'];
export const BLOCKS: Block[] = ['cards', 'accounts', 'debts', 'recent', 'places'];
const KEY = 'kalyta.prefs';
const DEFAULTS: Prefs = { theme: 'auto', base: 'USD', cents: true, order: BLOCKS, hidden: [] };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
    // keep blocks added in later versions
    p.order = [...p.order.filter((b) => BLOCKS.includes(b)), ...BLOCKS.filter((b) => !p.order.includes(b))];
    return p;
  } catch {
    return DEFAULTS;
  }
}

let prefs: Prefs = typeof localStorage === 'undefined' ? DEFAULTS : load();
const listeners = new Set<() => void>();

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // private mode: keep it for this session
  }
  for (const l of listeners) l();
}

export function resetHome() {
  setPrefs({ order: BLOCKS, hidden: [] });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}

export function getPrefs(): Prefs {
  return prefs;
}
