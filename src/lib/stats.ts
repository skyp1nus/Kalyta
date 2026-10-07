import { MONTHS, SHORT_MONTHS } from './format';
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

// ----- Kalyta 2.0 statistics -----

export interface Place {
  name: string;
  value: number;
  count: number;
}

export interface MonthSummary {
  ym: string;
  dim: number;
  rows: Tx[];
  exp: Tx[];
  inc: Tx[];
  spent: number;
  income: number;
  net: number;
  passed: number; // days of the month that already happened
  avg: number; // spent per passed day
  cats: Array<[string, number]>; // biggest first
  places: Place[]; // biggest first
  days: number[]; // spent per day of month
}

export function monthSummary(view: View, ym: string): MonthSummary {
  const dim = daysIn(ym);
  const cur = view.today.slice(0, 7);
  const passed = ym === cur ? Number(view.today.slice(8, 10)) : ym > cur ? 0 : dim;
  const rows = view.tx.filter((t) => t.date.startsWith(ym));
  const exp = rows.filter((t) => !isIncome(view, t));
  const inc = rows.filter((t) => isIncome(view, t));
  const cats = new Map<string, number>();
  const places = new Map<string, Place>();
  const days = new Array<number>(dim).fill(0);
  let spent = 0;
  for (const t of exp) {
    const v = t.usd ?? 0;
    spent += v;
    const c = view.categories.includes(t.category) ? t.category : 'Other';
    cats.set(c, (cats.get(c) ?? 0) + v);
    const d = Number(t.date.slice(8, 10));
    if (d >= 1 && d <= dim) days[d - 1] += v;
    if (t.merchant) {
      const p = places.get(t.merchant) ?? { name: t.merchant, value: 0, count: 0 };
      p.value += v;
      p.count += 1;
      places.set(t.merchant, p);
    }
  }
  const income = sumUsd(inc);
  return {
    ym,
    dim,
    rows,
    exp,
    inc,
    spent,
    income,
    net: income - spent,
    passed,
    avg: passed ? spent / passed : 0,
    cats: [...cats.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    places: [...places.values()].sort((a, b) => b.value - a.value),
    days,
  };
}

// Spending from the 1st up to and including `day`
export function spentUntil(m: MonthSummary, day: number): number {
  return m.days.slice(0, day).reduce((s, v) => s + v, 0);
}

// The month to compare with: the same days of the previous month while this one is running
export function comparison(view: View, m: MonthSummary): { base: number; label: string; prev: MonthSummary } {
  const prev = monthSummary(view, shiftYm(m.ym, -1));
  const short = SHORT_MONTHS[Number(prev.ym.slice(5, 7)) - 1];
  if (m.passed && m.passed < m.dim) {
    const day = Math.min(m.passed, prev.dim);
    return { base: spentUntil(prev, day), label: `${short} 1–${day}`, prev };
  }
  return { base: prev.spent, label: MONTHS[Number(prev.ym.slice(5, 7)) - 1], prev };
}

// Monday to Sunday of the week that contains today, spending per day
export function weekSpending(view: View): { days: number[]; todayIndex: number } {
  const [y, m, d] = view.today.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const todayIndex = (today.getUTCDay() + 6) % 7;
  const keys = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(today.getTime() + (i - todayIndex) * 864e5);
    return x.toISOString().slice(0, 10);
  });
  const days = keys.map(() => 0);
  for (const t of view.tx) {
    if (isIncome(view, t)) continue;
    const i = keys.indexOf(t.date.slice(0, 10));
    if (i >= 0) days[i] += t.usd ?? 0;
  }
  return { days, todayIndex };
}
