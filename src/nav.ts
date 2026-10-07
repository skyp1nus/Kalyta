import { createContext, useContext } from 'react';
import type { Transfer, Tx } from './lib/types';

export type Screen =
  | { name: 'home' }
  | { name: 'accounts' }
  | { name: 'account'; account: string }
  | { name: 'transactions'; ym?: string; filter?: string }
  | { name: 'stats'; ym?: string };

export type SheetSpec =
  | { kind: 'tx'; edit?: Tx; account?: string; type?: 'expense' | 'income' }
  | { kind: 'transfer'; edit?: Transfer; from?: string }
  | { kind: 'balance'; account: string }
  | { kind: 'convert' }
  | { kind: 'settings' }
  | { kind: 'sync' }
  | { kind: 'widgets' };

export interface Nav {
  push(s: Screen): void;
  pop(): void;
  reset(stack: Screen[]): void;
  open(sheet: SheetSpec): void;
  close(): void;
  toast(message: string, undo?: () => void): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav outside NavContext');
  return nav;
}
