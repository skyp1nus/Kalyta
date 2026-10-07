import { daysBetween, SHORT_MONTHS } from './format';
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
  if (cad === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (cad === 'yearly') d.setFullYear(d.getFullYear() + n);
  else d.setMonth(d.getMonth() + n);
  return key(d);
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

function sameThing(sub: string, place: string): boolean {
  const a = norm(sub).trim();
  const b = norm(place);
  if (a.length < 3 || !b) return false;
  if (b.includes(a)) return true;
  const k = norm(kwOf(place)).trim();
  return k.length >= 3 && a.includes(k);
}

// Expenses that look like charges of this subscription, newest first
export function chargesOf(view: View, sub: Pick<Subscription, 'name'>): Tx[] {
  return view.tx
    .filter((t) => t.category !== view.income && t.merchant && sameThing(sub.name, t.merchant))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// The next charge date, skipping past dates for which a matching charge already showed up
export function effectiveNext(view: View, sub: Subscription): string {
  let next = sub.next;
  if (!next || next >= view.today) return next;
  const charges = chargesOf(view, sub).map((t) => t.date.slice(0, 10));
  for (let i = 0; i < 120 && next < view.today; i++) {
    const n = next;
    const paid = charges.some((d) => Math.abs(daysBetween(n, d)) <= 5);
    if (!paid) break;
    next = addCadence(next, sub.cadence);
  }
  return next;
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

// Charges at the same place with a similar amount, three periods in a row, not tracked yet
export function findRecurring(view: View, ignored: string[]): Suggestion[] {
  const groups = new Map<string, Tx[]>();
  for (const t of view.tx) {
    if (t.category === view.income || !t.merchant || daysBetween(t.date.slice(0, 10), view.today) > 200)
      continue;
    const k = norm(kwOf(t.merchant)).trim();
    if (k.length < 3) continue;
    const g = groups.get(k) ?? [];
    g.push(t);
    groups.set(k, g);
  }
  const out: Suggestion[] = [];
  for (const [k, list] of groups) {
    if (ignored.includes(k) || list.length < 3) continue;
    if (view.subscriptions.some((s) => sameThing(s.name, list[0].merchant) || norm(s.name).includes(k)))
      continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const last3 = sorted.slice(-3);
    const days = last3.map((t) => t.date.slice(0, 10));
    const gaps = [daysBetween(days[0], days[1]), daysBetween(days[1], days[2])];
    const cadence: Cadence | null = gaps.every((g) => g >= 26 && g <= 35)
      ? 'monthly'
      : gaps.every((g) => g >= 6 && g <= 8)
        ? 'weekly'
        : null;
    if (!cadence) continue;
    const lastT = last3[2];
    const similar = last3.every(
      (t) => t.currency === lastT.currency && Math.abs(t.amount - lastT.amount) <= lastT.amount * 0.15,
    );
    if (!similar) continue;
    const next = addCadence(days[2], cadence);
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
      seen: `${dShort(days[0])}, ${dShort(days[1])} and ${dShort(days[2])}`,
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
