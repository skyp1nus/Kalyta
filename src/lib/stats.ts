import type { Tx, View } from './types';

export function shiftYm(ym: string, k: number): string {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) - 1 + k;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function daysIn(ym: string): number {
  return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
}

export function sumUsd(rows: Tx[]): number {
  return rows.reduce((s, t) => s + (t.usd ?? 0), 0);
}

export function isIncome(view: Pick<View, 'income'>, t: Tx): boolean {
  return t.category === view.income;
}

export interface MonthStats {
  ym: string;
  rows: Tx[];
  spending: Tx[];
  income: Tx[];
  spent: number;
  earned: number;
}

export function monthStats(view: View, ym: string): MonthStats {
  const rows = view.tx.filter((t) => t.date.startsWith(ym));
  const spending = rows.filter((t) => !isIncome(view, t));
  const income = rows.filter((t) => isIncome(view, t));
  return { ym, rows, spending, income, spent: sumUsd(spending), earned: sumUsd(income) };
}

export interface CategoryTotal {
  name: string;
  color: string;
  value: number;
}

export function categoryTotals(view: View, rows: Tx[]): CategoryTotal[] {
  const totals = new Map<string, number>(view.categories.map((c) => [c, 0]));
  for (const t of rows) {
    const key = totals.has(t.category) ? t.category : 'Other';
    totals.set(key, (totals.get(key) ?? 0) + (t.usd ?? 0));
  }
  return view.categories.map((name, i) => ({
    name,
    color: view.colors[i] ?? '#888780',
    value: totals.get(name) ?? 0,
  }));
}

export interface Group {
  name: string;
  value: number;
  count: number;
}

export function groupBy(rows: Tx[], keyOf: (t: Tx) => string): Group[] {
  const map = new Map<string, Group>();
  for (const t of rows) {
    const name = keyOf(t) || '—';
    const g = map.get(name) ?? { name, value: 0, count: 0 };
    g.value += t.usd ?? 0;
    g.count += 1;
    map.set(name, g);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function netWorth(view: View): number {
  return view.accounts.reduce((s, a) => s + (a.usd ?? 0), 0);
}

export function categoryColor(view: View, category: string): string {
  if (category === view.income) return '#1d9e75';
  const i = view.categories.indexOf(category);
  return view.colors[i >= 0 ? i : view.categories.indexOf('Other')] ?? '#888780';
}

export function title(t: Tx): string {
  return t.merchant || t.note || t.category || 'Untitled';
}
