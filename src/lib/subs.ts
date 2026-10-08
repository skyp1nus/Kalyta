import { daysBetween, SHORT_MONTHS } from './format';
import { isIncomeCat } from './meta';
import { kwOf, norm } from './rules';
import type { Cadence, Subscription, Tx, View } from './types';

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};
export const CADENCE_WORDS: Record<Cadence, string> = {
  weekly: 'every week',
  monthly: 'every month',
  yearly: 'every year',
};

const pad = (n: number) => String(n).padStart(2, '0');
const parse = (k: string) =>
  new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addCadence(day: string, cad: Cadence, n = 1): string {
  const d = parse(day);
  if (cad === 'weekly') {
    d.setDate(d.getDate() + 7 * n);
    return key(d);
  }
  // Jan 31 + 1 month is Feb 28, not Mar 3; Feb 29 + 1 year is Feb 28
  const months = cad === 'yearly' ? 12 * n : n;
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return key(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), dim)));
}

// The first charge date on or after `from`, keeping the subscription's day of the month
export function nextOnOrAfter(day: string, cad: Cadence, from: string): string {
  if (!day || day >= from) return day;
  for (let i = 1; i < 2000; i++) {
    const d = addCadence(day, cad, i);
    if (d >= from) return d;
  }
  return day;
}

// "Oct 5"
export function dShort(day: string): string {
  return `${SHORT_MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

// "Fri, Oct 9", with the year when it isn't this year
export function dWeekday(day: string, today: string): string {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parse(day).getDay()];
  return `${wd}, ${dShort(day)}${day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : ''}`;
}

export function monthlyFactor(cad: Cadence): number {
  return cad === 'weekly' ? 52 / 12 : cad === 'yearly' ? 1 / 12 : 1;
}

// How far from the expected date a charge can land
const TOLERANCE: Record<Cadence, number> = { weekly: 2, monthly: 5, yearly: 10 };

// A charge within 30% of the subscription's price (in USD when the currencies differ)
function closeAmount(view: View, t: Tx, sub: Partial<Pick<Subscription, 'amount' | 'currency'>>): boolean {
  if (!sub.amount || !sub.currency) return true;
  const same = t.currency === sub.currency;
  const a = same ? t.amount : t.usd;
  const b = same ? sub.amount : sub.amount * (view.rates[sub.currency] ?? Number.NaN);
  if (!(a != null && a > 0) || !(b > 0)) return true;
  return Math.abs(a - b) <= 0.3 * b;
}

function sameThing(sub: string, place: string): boolean {
  const a = norm(sub).trim();
  const b = norm(place);
  if (a.length < 3 || !b) return false;
  if (b.includes(a)) return true;
  const k = norm(kwOf(place)).trim();
  return k.length >= 3 && a.includes(k);
}

// Expenses that look like charges of this subscription, newest first
export function chargesOf(
  view: View,
  sub: Pick<Subscription, 'name'> & Partial<Pick<Subscription, 'amount' | 'currency'>>,
): Tx[] {
  return view.tx
    .filter(
      (t) =>
        !isIncomeCat(t.category) &&
        t.merchant &&
        sameThing(sub.name, t.merchant) &&
        closeAmount(view, t, sub),
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// The next charge date, skipping past dates for which a matching charge already showed up.
// Each charge pays for one period only.
export function effectiveNext(view: View, sub: Subscription): string {
  let next = sub.next;
  if (!next || next >= view.today) return next;
  const tol = TOLERANCE[sub.cadence] ?? 5;
  const charges = chargesOf(view, sub).map((t) => t.date.slice(0, 10));
  const used = new Set<number>();
  for (let i = 1; i <= 120 && next < view.today; i++) {
    const n = next;
    const hit = charges.findIndex((d, j) => !used.has(j) && Math.abs(daysBetween(n, d)) <= tol);
    if (hit < 0) break;
    used.add(hit);
    next = addCadence(sub.next, sub.cadence, i);
  }
  return next;
}

// A price change seen in the last two charges, or entered by hand before any charge showed it.
// It clears by itself once the next charge comes in at the same price.
export function priceChange(view: View, sub: Subscription): { from: number; to: number } | null {
  const c = chargesOf(view, sub).filter((t) => t.currency === sub.currency);
  if (c.length >= 2) {
    const [a, b] = c;
    return Math.abs(a.amount - b.amount) > 0.01 * b.amount ? { from: b.amount, to: a.amount } : null;
  }
  return sub.prev != null && sub.prev !== sub.amount ? { from: sub.prev, to: sub.amount } : null;
}

export interface SubState {
  sub: Subscription;
  next: string;
  days: number; // until the next charge; negative when overdue
  overdue: boolean;
}

export function subStates(view: View): SubState[] {
  return view.subscriptions.map((sub) => {
    const next = effectiveNext(view, sub);
    const days = next ? daysBetween(view.today, next) : 0;
    return { sub, next, days, overdue: !sub.paused && days < 0 };
  });
}

export interface Suggestion {
  id: string;
  name: string;
  amount: number;
  currency: string;
  cadence: Cadence;
  next: string;
  account: string;
  category: string;
  seen: string; // "Jul 14, Aug 14 and Sep 14"
}

// Charges at the same place with a similar amount, not tracked yet: four weeks, three months
// or two years in a row
export function findRecurring(view: View, ignored: string[]): Suggestion[] {
  const groups = new Map<string, Tx[]>();
  for (const t of view.tx) {
    if (isIncomeCat(t.category) || !t.merchant || daysBetween(t.date.slice(0, 10), view.today) > 400)
      continue;
    const k = norm(kwOf(t.merchant)).trim();
    if (k.length < 3) continue;
    const g = groups.get(k) ?? [];
    g.push(t);
    groups.set(k, g);
  }
  const out: Suggestion[] = [];
  for (const [k, list] of groups) {
    if (ignored.includes(k) || list.length < 2) continue;
    if (view.subscriptions.some((s) => sameThing(s.name, list[0].merchant) || norm(s.name).includes(k)))
      continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const lastT = sorted[sorted.length - 1];
    const dayOf = (t: Tx) => t.date.slice(0, 10);
    const fits = (n: number, lo: number, hi: number, tol: number) => {
      const xs = sorted.slice(-n);
      if (xs.length < n) return false;
      const gapsOk = xs.slice(1).every((t, i) => {
        const g = daysBetween(dayOf(xs[i]), dayOf(t));
        return g >= lo && g <= hi;
      });
      return (
        gapsOk &&
        xs.every(
          (t) => t.currency === lastT.currency && Math.abs(t.amount - lastT.amount) <= lastT.amount * tol,
        )
      );
    };
    // weekly needs the same price four times, so a weekly grocery run isn't a subscription
    const cadence: Cadence | null = fits(4, 6, 8, 0.03)
      ? 'weekly'
      : fits(3, 26, 35, 0.15)
        ? 'monthly'
        : fits(2, 350, 380, 0.15)
          ? 'yearly'
          : null;
    if (!cadence) continue;
    const days = sorted.slice(cadence === 'yearly' ? -2 : -3).map(dayOf);
    const next = addCadence(days[days.length - 1], cadence);
    if (daysBetween(view.today, next) < -7) continue; // stopped a while ago
    const name = /[a-zżźćńółęąś]/.test(lastT.merchant) ? lastT.merchant : kwOf(lastT.merchant);
    out.push({
      id: k,
      name,
      amount: lastT.amount,
      currency: lastT.currency,
      cadence,
      next,
      account: lastT.account,
      category: lastT.category || 'Subscriptions',
      seen:
        cadence === 'yearly'
          ? `${dShort(days[0])} ${days[0].slice(0, 4)} and ${dShort(days[1])} ${days[1].slice(0, 4)}`
          : `${dShort(days[0])}, ${dShort(days[1])} and ${dShort(days[2])}`,
    });
  }
  return out;
}

// ----- budgets -----

export type BudgetState = 'ok' | 'close' | 'over';

export function budgetState(spent: number, limit: number): { p: number; st: BudgetState; w: number } {
  const p = (spent / limit) * 100;
  const st: BudgetState = spent > limit + 0.004 ? 'over' : p >= 80 ? 'close' : 'ok';
  return { p, st, w: Math.min(100, p) };
}

export const BUDGET_COLOR: Record<BudgetState, string> = {
  ok: 'var(--green)',
  close: '#ff9f0a',
  over: 'var(--red)',
};
export const BUDGET_TEXT: Record<BudgetState, string> = {
  ok: 'var(--text2)',
  close: '#ff9f0a',
  over: 'var(--red)',
};

export function hasBudgets(view: View): boolean {
  return view.budgets.total > 0 || Object.keys(view.budgets.cats).length > 0;
}
