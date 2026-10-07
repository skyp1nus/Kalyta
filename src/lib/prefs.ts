import { useSyncExternalStore } from 'react';

// Per-device display settings. They never go to the sheet.
export type Theme = 'auto' | 'dark' | 'light';
export type Block = 'cards' | 'budgets' | 'upcoming' | 'accounts' | 'debts' | 'recent' | 'places';
export type AutoLock = 'Immediately' | '1 min' | '5 min' | '15 min';

export interface Prefs {
  theme: Theme;
  base: string;
  cents: boolean;
  order: Block[];
  hidden: Block[];
  ignoredSubs: string[]; // "Looks recurring" suggestions the user dismissed
  lockOn: boolean;
  lockMethod: 'face' | 'passcode';
  autoLock: AutoLock;
  passHash: string; // pbkdf2$<iterations>$<hex> (2.1 stored a single SHA-256)
  passSalt: string;
  passFails: number; // wrong passcodes in a row
  passWaitUntil: number; // no passcode attempts before this time (ms)
  credId: string; // WebAuthn credential for Face ID
  hide: boolean; // show amounts as •••
  blurSw: boolean; // cover the app in the app switcher
  seenVersion: string;
}

export const BASES = ['USD', 'PLN', 'EUR', 'UAH'];
export const BLOCKS: Block[] = ['cards', 'budgets', 'upcoming', 'accounts', 'debts', 'recent', 'places'];
const KEY = 'kalyta.prefs';
const DEFAULTS: Prefs = {
  theme: 'auto',
  base: 'USD',
  cents: true,
  order: BLOCKS,
  hidden: [],
  ignoredSubs: [],
  lockOn: false,
  lockMethod: 'face',
  autoLock: '1 min',
  passHash: '',
  passSalt: '',
  passFails: 0,
  passWaitUntil: 0,
  credId: '',
  hide: false,
  blurSw: true,
  seenVersion: '',
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
    // blocks added in later versions go where they sit by default
    const order = p.order.filter((b) => BLOCKS.includes(b));
    for (const b of BLOCKS) {
      if (order.includes(b)) continue;
      const before = BLOCKS.slice(0, BLOCKS.indexOf(b))
        .reverse()
        .find((x) => order.includes(x));
      order.splice(before ? order.indexOf(before) + 1 : 0, 0, b);
    }
    p.order = order;
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
