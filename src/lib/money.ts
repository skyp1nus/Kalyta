import { useMemo } from 'react';
import { fmt } from './format';
import { usePrefs } from './prefs';
import { usePeek } from './privacy';
import type { View } from './types';

export interface Money {
  base: string;
  cents: boolean;
  hidden: boolean; // amounts show as •••
  // USD per unit, null when we can't price the currency
  rate(currency: string): number | null;
  convert(amount: number, from: string, to: string): number | null;
  toUsd(amount: number, currency: string): number | null;
  // a USD value shown in the base currency
  B(usd: number, sign?: '' | '+' | '−'): string;
  // an amount in its own currency
  n(amount: number, currency: string, sign?: '' | '+' | '−'): string;
}

export function makeMoney(
  rates: Record<string, number>,
  wantedBase: string,
  cents: boolean,
  hidden = false,
): Money {
  const rate = (c: string) => rates[c.toUpperCase()] ?? null;
  const base = rate(wantedBase) ? wantedBase : 'USD';
  const baseRate = rate(base) ?? 1;
  return {
    base,
    cents,
    hidden,
    rate,
    convert(amount, from, to) {
      const a = rate(from);
      const b = rate(to);
      return a && b ? (amount * a) / b : null;
    },
    toUsd(amount, currency) {
      const r = rate(currency);
      return r == null ? null : amount * r;
    },
    B: (usd, sign = '') => fmt(usd / baseRate, base, sign, cents, hidden),
    n: (amount, currency, sign = '') => fmt(amount, currency, sign, cents, hidden),
  };
}

const NO_RATES = { USD: 1, USDT: 1 };

export function useMoney(view: View | null): Money {
  const p = usePrefs();
  const peek = usePeek();
  const hidden = p.hide && !peek;
  const rates = view?.rates ?? NO_RATES;
  return useMemo(() => makeMoney(rates, p.base, p.cents, hidden), [rates, p.base, p.cents, hidden]);
}
