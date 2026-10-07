import { parseAmount } from './format';
import type { Account, Op, ServerData, Transfer, Tx, TxInput, View } from './types';

const STABLE = new Set(['USD', 'USDT', 'USDC']);

export function sameCurrency(a: string, b: string): boolean {
  const norm = (c: string) => (STABLE.has(c.toUpperCase()) ? 'USD' : c.toUpperCase());
  return norm(a) === norm(b);
}

export function toTx(r: ServerData['tx'][number]): Tx {
  const [id, date, amount, currency, merchant, account, category, note, source, usd] = r;
  return { id, date, amount, currency, merchant, account, category, note, source, usd };
}

export function toTransfer(r: ServerData['transfers'][number]): Transfer {
  const [id, date, from, sent, fromCurrency, to, received, toCurrency, note] = r;
  return { id, date, from, sent, fromCurrency, to, received, toCurrency, note };
}

// Best guess of USD per unit of a currency, from what the server already converted
export function usdRate(currency: string, tx: Tx[], accounts: Account[]): number | null {
  if (STABLE.has(currency)) return 1;
  for (let i = tx.length - 1; i >= 0; i--) {
    const t = tx[i];
    if (t.currency === currency && t.usd != null && t.amount > 0) return t.usd / t.amount;
  }
  const a = accounts.find((x) => x.currency === currency && x.usd != null && x.balance !== 0);
  return a?.usd != null ? Math.abs(a.usd / a.balance) : null;
}

function txFromInput(input: TxInput, view: View, rate: number | null): Tx {
  const amount = parseAmount(input.amount);
  return {
    id: input.id,
    date: input.date,
    amount,
    currency: input.currency,
    merchant: input.merchant,
    account: input.account,
    category: input.kind === 'income' ? view.income : input.category || 'Other',
    note: input.note,
    source: 'app',
    usd: rate == null || Number.isNaN(amount) ? null : Math.round(amount * rate * 100) / 100,
    pending: true,
  };
}

function moveBalance(
  accounts: Account[],
  name: string,
  delta: number,
  currency: string,
  rate: number | null,
) {
  const i = accounts.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
  if (i < 0 || !sameCurrency(accounts[i].currency, currency)) return;
  const a = accounts[i];
  const balance = Math.round((a.balance + delta) * 100) / 100;
  const perUnit = a.balance !== 0 && a.usd != null ? a.usd / a.balance : rate;
  accounts[i] = { ...a, balance, usd: perUnit == null ? a.usd : Math.round(balance * perUnit * 100) / 100 };
}

// Server data plus everything still waiting in the outbox, so the UI shows edits instantly
export function buildView(server: ServerData | null, outbox: Op[]): View | null {
  if (!server) return null;
  const view: View = {
    tx: server.tx.map(toTx),
    transfers: server.transfers.map(toTransfer),
    accounts: server.accounts.map((a) => ({ ...a })),
    categories: server.categories,
    colors: server.colors,
    income: server.income,
    today: localToday(),
  };

  for (const op of outbox) {
    const failed = op.error;
    switch (op.action) {
      case 'add': {
        if (view.tx.some((t) => t.id === op.tx.id)) break;
        const t = txFromInput(op.tx, view, usdRate(op.tx.currency, view.tx, view.accounts));
        view.tx.push({ ...t, failed });
        break;
      }
      case 'update': {
        const i = view.tx.findIndex((t) => t.id === op.id);
        if (i >= 0) {
          const t = txFromInput(op.tx, view, usdRate(op.tx.currency, view.tx, view.accounts));
          view.tx[i] = { ...t, id: op.id, source: view.tx[i].source, failed };
        }
        break;
      }
      case 'delete':
        view.tx = view.tx.filter((t) => t.id !== op.id);
        break;
      case 'transfer': {
        if (view.transfers.some((t) => t.id === op.tr.id)) break;
        const sent = parseAmount(op.tr.sent);
        const received = parseAmount(op.tr.received);
        view.transfers.push({
          id: op.tr.id,
          date: op.tr.date,
          from: op.tr.from,
          sent,
          fromCurrency: op.tr.fromCurrency,
          to: op.tr.to,
          received,
          toCurrency: op.tr.toCurrency,
          note: op.tr.note,
          pending: true,
          failed,
        });
        if (!failed) {
          moveBalance(
            view.accounts,
            op.tr.from,
            -sent,
            op.tr.fromCurrency,
            usdRate(op.tr.fromCurrency, view.tx, view.accounts),
          );
          moveBalance(
            view.accounts,
            op.tr.to,
            received,
            op.tr.toCurrency,
            usdRate(op.tr.toCurrency, view.tx, view.accounts),
          );
        }
        break;
      }
      case 'deleteTransfer': {
        const tr = view.transfers.find((t) => t.id === op.id);
        view.transfers = view.transfers.filter((t) => t.id !== op.id);
        if (tr && !tr.pending) {
          moveBalance(view.accounts, tr.from, tr.sent, tr.fromCurrency, null);
          moveBalance(view.accounts, tr.to, -tr.received, tr.toCurrency, null);
        }
        break;
      }
      case 'balance': {
        const i = view.accounts.findIndex((a) => a.name.toLowerCase() === op.account.toLowerCase());
        if (i >= 0 && !failed) {
          const a = view.accounts[i];
          const balance = parseAmount(op.balance);
          const rate =
            a.balance !== 0 && a.usd != null
              ? a.usd / a.balance
              : usdRate(a.currency, view.tx, view.accounts);
          view.accounts[i] = {
            ...a,
            balance,
            usd: rate == null ? a.usd : Math.round(balance * rate * 100) / 100,
            updated: view.today,
          };
        }
        break;
      }
    }
  }

  view.tx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  view.transfers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return view;
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
