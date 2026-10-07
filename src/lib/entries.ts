import { time } from './format';
import { ADJUST_META, categoryMeta, TRANSFER_META } from './meta';
import type { Money } from './money';
import { discardOp, enqueue } from './store';
import type { Adjustment, Transfer, Tx, View } from './types';

// Everything that shows up in a list of records
export type Entry =
  | { kind: 'tx'; t: Tx }
  | { kind: 'transfer'; t: Transfer }
  | { kind: 'adjust'; t: Adjustment };

export function allEntries(view: View): Entry[] {
  const out: Entry[] = [
    ...view.tx.map((t) => ({ kind: 'tx' as const, t })),
    ...view.transfers.map((t) => ({ kind: 'transfer' as const, t })),
    ...view.adjustments.map((t) => ({ kind: 'adjust' as const, t })),
  ];
  return out.sort((a, b) => (a.t.date < b.t.date ? 1 : a.t.date > b.t.date ? -1 : 0));
}

export function entryKey(e: Entry): string {
  return `${e.kind}:${e.t.id}`;
}

export function touchesAccount(e: Entry, account: string): boolean {
  const a = account.toLowerCase();
  if (e.kind === 'transfer') return e.t.from.toLowerCase() === a || e.t.to.toLowerCase() === a;
  return e.t.account.toLowerCase() === a;
}

export interface RowLook {
  icon: string;
  color: string;
  title: string;
  sub: string;
  amt: string;
  amt2: string;
  income: boolean;
  pending: boolean;
  failed: boolean;
}

export function rowLook(e: Entry, view: View, money: Money): RowLook {
  const pending = !!e.t.pending && !e.t.failed;
  const failed = !!e.t.failed;
  if (e.kind === 'transfer') {
    const t = e.t;
    return {
      ...TRANSFER_META,
      title: `${t.from} → ${t.to}`,
      sub: t.note ? `Transfer · ${t.note}` : 'Transfer',
      amt: money.n(t.sent, t.fromCurrency),
      amt2: `→ ${money.n(t.received, t.toCurrency)}`,
      income: false,
      pending,
      failed,
    };
  }
  if (e.kind === 'adjust') {
    const t = e.t;
    return {
      ...ADJUST_META,
      title: 'Balance adjustment',
      sub: t.account,
      amt: money.n(Math.abs(t.change), t.currency, t.change > 0 ? '+' : '−'),
      amt2: time(t.date),
      income: false,
      pending,
      failed,
    };
  }
  const t = e.t;
  const income = t.category === view.income;
  const cat = income ? 'Income' : t.category || 'Other';
  const meta = categoryMeta(t.category, view.income);
  return {
    ...meta,
    title: t.merchant || t.note || cat,
    sub: t.account ? `${cat} · ${t.account}` : cat,
    amt: money.n(t.amount, t.currency, income ? '+' : '−'),
    amt2: t.currency === money.base || t.usd == null ? time(t.date) : `≈ ${money.B(t.usd)}`,
    income,
    pending,
    failed,
  };
}

const HOLD = 4500;

// Queues the delete but holds it back long enough for "Undo"; returns the function that undoes it
export function deleteEntry(e: Entry): () => void {
  const body =
    e.kind === 'tx'
      ? { action: 'delete' as const, id: e.t.id }
      : e.kind === 'transfer'
        ? { action: 'deleteTransfer' as const, id: e.t.id }
        : { action: 'deleteAdjustment' as const, id: e.t.id };
  const opId = enqueue(body, HOLD);
  return () => discardOp(opId);
}

export function deletedMessage(e: Entry): string {
  return e.kind === 'transfer'
    ? 'Transfer deleted'
    : e.kind === 'adjust'
      ? 'Adjustment removed'
      : 'Transaction deleted';
}
