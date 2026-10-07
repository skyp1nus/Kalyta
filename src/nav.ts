import { createContext, useContext } from 'react';
import type { Rule, Subscription, Transfer, Tx } from './lib/types';

export type Screen =
  | { name: 'home' }
  | { name: 'accounts' }
  | { name: 'account'; account: string }
  | { name: 'transactions'; ym?: string; filter?: string }
  | { name: 'stats'; ym?: string }
  | { name: 'subs' }
  | { name: 'rules' };

export type SheetSpec =
  | { kind: 'tx'; edit?: Tx; account?: string; type?: 'expense' | 'income' }
  | { kind: 'transfer'; edit?: Transfer; from?: string }
  | { kind: 'balance'; account: string }
  | { kind: 'convert' }
  | { kind: 'settings' }
  | { kind: 'sync' }
  | { kind: 'widgets' }
  | { kind: 'budgets' }
  | { kind: 'sub'; edit?: Subscription }
  | { kind: 'rule'; edit?: Rule }
  | { kind: 'review' }
  | { kind: 'whatsnew' }
  | { kind: 'security' }
  | { kind: 'lockSetup'; step?: 'method' | 'enter'; change?: boolean }
  | { kind: 'logo'; account: string };

export interface ToastIcon {
  icon: string;
  color: string;
}

export interface Nav {
  push(s: Screen): void;
  pop(): void;
  reset(stack: Screen[]): void;
  open(sheet: SheetSpec): void;
  close(): void;
  toast(message: string, undo?: () => void, icon?: ToastIcon): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav outside NavContext');
  return nav;
}
