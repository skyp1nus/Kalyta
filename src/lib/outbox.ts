import { parseAmount } from './format';
import { isIncomeCat, setCategoryLooks } from './meta';
import { norm, placeMatches, ruleFor } from './rules';
import type {
  Account,
  Adjustment,
  Op,
  ServerData,
  Transfer,
  TransferInput,
  Tx,
  TxInput,
  View,
} from './types';

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

function toAdjustment(r: NonNullable<ServerData['adjustments']>[number]): Adjustment {
  const [id, date, account, change, currency] = r;
  return { id, date, account, change, currency };
}

function transferFromInput(tr: TransferInput): Transfer {
  return {
    id: tr.id,
    date: tr.date,
    from: tr.from,
    sent: parseAmount(tr.sent),
    fromCurrency: tr.fromCurrency,
    to: tr.to,
    received: parseAmount(tr.received),
    toCurrency: tr.toCurrency,
    note: tr.note,
    pending: true,
  };
}

// Applies (dir 1) or takes back (dir -1) a transfer's effect on both balances
function moveTransfer(view: View, t: Transfer, dir: 1 | -1) {
  moveBalance(
    view.accounts,
    t.from,
    -dir * t.sent,
    t.fromCurrency,
    usdRate(t.fromCurrency, view.tx, view.accounts),
  );
  moveBalance(
    view.accounts,
    t.to,
    dir * t.received,
    t.toCurrency,
    usdRate(t.toCurrency, view.tx, view.accounts),
  );
}

// USD per unit for every currency we can price: the server's rates first, then guesses from the data
function knownRates(server: ServerData, tx: Tx[], accounts: Account[]): Record<string, number> {
  const rates: Record<string, number> = { USD: 1, USDT: 1, USDC: 1, ...(server.rates ?? {}) };
  const seen = new Set([
    ...tx.map((t) => t.currency),
    ...accounts.map((a) => a.currency),
    'PLN',
    'EUR',
    'UAH',
  ]);
  for (const c of seen) {
    if (!c || rates[c]) continue;
    const r = usdRate(c, tx, accounts);
    if (r) rates[c] = r;
  }
  return rates;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
  // the sheet fills an empty category from Rules, or Other
  const auto = ruleFor(view.rules, input.merchant)?.cat || 'Other';
  return {
    id: input.id,
    date: input.date,
    amount,
    currency: input.currency,
    merchant: input.merchant,
    account: input.account,
    category: input.kind === 'income' ? view.income : input.category || auto,
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

// The account a record belongs to: the same name, or else an account whose name is part of the
// card's ("Wise Card" from Apple Pay → Wise); the longest name wins.
export function accountOf(accounts: Account[], card: string): Account | undefined {
  const c = (card ?? '').trim().toLowerCase();
  if (!c) return undefined;
  const exact = accounts.find((a) => a.name.trim().toLowerCase() === c);
  if (exact) return exact;
  let best: Account | undefined;
  for (const a of accounts) {
    const n = a.name.trim().toLowerCase();
    if (n.length >= 3 && c.includes(n) && n.length > (best?.name.length ?? 0)) best = a;
  }
  return best;
}

// When the balance was last entered by hand. Records after that are not in it yet.
// An older sheet only sends the day, so that whole day counts as already included.
function checkedAt(a: Account): string {
  const c = a.checked || a.updated || '';
  return c.length === 10 ? `${c}T23:59` : c;
}

// What a record does to its account's balance, in the account's currency
function txDelta(t: Tx, a: Account, view: View): number | null {
  const sign = isIncomeCat(t.category) ? 1 : -1;
  if (Number.isNaN(t.amount)) return null;
  if (t.currency ? sameCurrency(t.currency, a.currency) : t.usd == null) return sign * t.amount;
  const perUnit = STABLE.has(a.currency) ? 1 : (view.rates[a.currency] ?? null);
  if (t.usd == null || !perUnit) return null;
  return (sign * t.usd) / perUnit;
}

// Adds (dir 1) or takes back (dir -1) a record's effect on its account, if it came after the
// last balance check
function trackTx(view: View, t: Tx, dir: 1 | -1) {
  const a = accountOf(view.accounts, t.account);
  if (!a || t.date <= checkedAt(a)) return;
  const d = txDelta(t, a, view);
  if (d == null || !d) return;
  const i = view.accounts.indexOf(a);
  const balance = Math.round((a.balance + dir * d) * 100) / 100;
  const rate = view.rates[a.currency];
  const perUnit =
    a.balance !== 0 && a.usd != null
      ? a.usd / a.balance
      : rate != null
        ? rate * (a.type === 'You owe' ? -1 : 1)
        : null;
  view.accounts[i] = {
    ...a,
    balance,
    usd: perUnit == null ? a.usd : Math.round(balance * perUnit * 100) / 100,
  };
}

// Server data plus everything still waiting in the outbox, so the UI shows edits instantly
export function buildView(server: ServerData | null, outbox: Op[]): View | null {
  if (!server) return null;
  const tx = server.tx.map(toTx);
  const accounts = server.accounts.map((a) => ({ ...a }));
  const view: View = {
    tx,
    transfers: server.transfers.map(toTransfer),
    accounts,
    adjustments: (server.adjustments ?? []).map(toAdjustment),
    rates: knownRates(server, tx, accounts),
    fetchedAt: server.fetchedAt,
    sheetName: server.sheetName ?? '',
    budgets: server.budgets ?? { total: 0, cats: {} },
    subscriptions: (server.subscriptions ?? []).map((x) => ({ ...x })),
    rules: (server.rules ?? []).map(([kw, cat]) => ({ kw, cat })),
    categories: [...server.categories],
    incomeCategories: server.incomeCategories ? [...server.incomeCategories] : [server.income],
    categoryLooks: (server.categoryLooks ?? []).map((r) => [...r] as View['categoryLooks'][number]),
    colors: server.colors,
    income: server.income,
    today: localToday(),
  };

  setCategoryLooks(view.categoryLooks, view.income);

  // the sheet keeps each balance as last entered; records since then move it
  for (const t of view.tx) trackTx(view, t, 1);

  for (const op of outbox) {
    const failed = op.error;
    switch (op.action) {
      case 'add': {
        if (view.tx.some((t) => t.id === op.tx.id)) break;
        const t = txFromInput(op.tx, view, usdRate(op.tx.currency, view.tx, view.accounts));
        view.tx.push({ ...t, failed });
        if (!failed) trackTx(view, t, 1);
        break;
      }
      case 'update': {
        const i = view.tx.findIndex((t) => t.id === op.id);
        if (i >= 0) {
          const t = txFromInput(op.tx, view, usdRate(op.tx.currency, view.tx, view.accounts));
          const next = { ...t, id: op.id, source: view.tx[i].source, failed };
          if (!failed) {
            trackTx(view, view.tx[i], -1);
            trackTx(view, next, 1);
          }
          view.tx[i] = next;
        }
        break;
      }
      case 'delete': {
        // a delete the sheet refused leaves the record where it is
        if (failed) break;
        const old = view.tx.find((t) => t.id === op.id);
        if (old) trackTx(view, old, -1);
        view.tx = view.tx.filter((t) => t.id !== op.id);
        break;
      }
      case 'transfer': {
        if (view.transfers.some((t) => t.id === op.tr.id)) break;
        const t = { ...transferFromInput(op.tr), failed };
        view.transfers.push(t);
        if (!failed) moveTransfer(view, t, 1);
        break;
      }
      case 'updateTransfer': {
        const i = view.transfers.findIndex((t) => t.id === op.id);
        if (i < 0 || failed) break;
        const old = view.transfers[i];
        if (!old.failed) moveTransfer(view, old, -1);
        const t = { ...transferFromInput(op.tr), id: op.id };
        view.transfers[i] = t;
        moveTransfer(view, t, 1);
        break;
      }
      case 'deleteTransfer': {
        if (failed) break;
        const tr = view.transfers.find((t) => t.id === op.id);
        view.transfers = view.transfers.filter((t) => t.id !== op.id);
        if (tr && !tr.failed && !failed) moveTransfer(view, tr, -1);
        break;
      }
      case 'deleteAdjustment': {
        if (failed) break;
        const adj = view.adjustments.find((a) => a.id === op.id);
        view.adjustments = view.adjustments.filter((a) => a.id !== op.id);
        if (adj && !adj.failed && !failed)
          moveBalance(view.accounts, adj.account, -adj.change, adj.currency, null);
        break;
      }
      case 'repair':
        break;
      case 'budgets':
        if (!failed) view.budgets = { total: op.total, cats: { ...op.cats } };
        break;
      case 'subscription': {
        if (failed) break;
        const x = { ...op.sub, pending: true };
        const i = view.subscriptions.findIndex((y) => y.id === x.id);
        if (i >= 0) view.subscriptions[i] = x;
        else view.subscriptions.push(x);
        break;
      }
      case 'deleteSubscription':
        if (!failed) view.subscriptions = view.subscriptions.filter((y) => y.id !== op.id);
        break;
      case 'rule': {
        if (failed) break;
        const drop = [norm(op.kw), norm(op.replaces)].filter(Boolean);
        view.rules = [{ kw: op.kw, cat: op.cat }, ...view.rules.filter((r) => !drop.includes(norm(r.kw)))];
        if (op.past) {
          view.tx = view.tx.map((t) =>
            !isIncomeCat(t.category) && t.merchant && placeMatches(op.kw, t.merchant)
              ? { ...t, category: op.cat }
              : t,
          );
        }
        break;
      }
      case 'deleteRule':
        if (!failed) view.rules = view.rules.filter((r) => norm(r.kw) !== norm(op.kw));
        break;
      case 'addAccount': {
        const acc = op.acc;
        if (failed || view.accounts.some((x) => x.name.toLowerCase() === acc.name.toLowerCase())) break;
        const n = parseAmount(acc.balance || '0');
        const balance = Number.isFinite(n) ? n : 0;
        const rate = view.rates[acc.currency] ?? usdRate(acc.currency, view.tx, view.accounts);
        const day = view.today;
        view.accounts.push({
          name: acc.name,
          type: acc.type,
          currency: acc.currency,
          balance,
          updated: day,
          checked: day,
          domain: acc.domain,
          // "You owe" counts against net worth, like the USD formula in the sheet
          usd:
            rate == null ? null : Math.round(balance * rate * (acc.type === 'You owe' ? -1 : 1) * 100) / 100,
        });
        break;
      }
      case 'deleteAccount':
        if (!failed)
          view.accounts = view.accounts.filter((x) => x.name.toLowerCase() !== op.account.toLowerCase());
        break;
      case 'category': {
        if (failed) break;
        const c = op.cat;
        const list = c.kind === 'income' ? view.incomeCategories : view.categories;
        if (!list.includes(c.name)) list.push(c.name);
        view.categoryLooks = [
          ...view.categoryLooks.filter((r) => r[0] !== c.name),
          [c.name, c.kind, c.emoji, c.color],
        ];
        setCategoryLooks(view.categoryLooks, view.income);
        break;
      }
      case 'deleteCategory': {
        if (failed) break;
        const income = view.incomeCategories.includes(op.name);
        const to = income ? view.income : 'Other';
        view.categories = view.categories.filter((c) => c !== op.name);
        view.incomeCategories = view.incomeCategories.filter((c) => c !== op.name);
        view.categoryLooks = view.categoryLooks.filter((r) => r[0] !== op.name);
        view.tx = view.tx.map((t) => (t.category === op.name ? { ...t, category: to } : t));
        view.rules = view.rules.filter((r) => r.cat !== op.name);
        if (view.budgets.cats[op.name]) {
          const cats = { ...view.budgets.cats };
          delete cats[op.name];
          view.budgets = { ...view.budgets, cats };
        }
        setCategoryLooks(view.categoryLooks, view.income);
        break;
      }
      case 'accountDomain': {
        const a = view.accounts.find((x) => x.name === op.account);
        if (a && !failed) a.domain = op.domain;
        break;
      }
      case 'balance': {
        const i = view.accounts.findIndex((a) => a.name.toLowerCase() === op.account.toLowerCase());
        if (i >= 0 && !failed) {
          const a = view.accounts[i];
          const balance = parseAmount(op.balance);
          const change = Math.round((balance - a.balance) * 100) / 100;
          if (op.mode === 'adjust' && change && !view.adjustments.some((x) => x.id === op.id)) {
            view.adjustments.push({
              id: op.id ?? op.opId,
              date: stamp(op.createdAt),
              account: a.name,
              change,
              currency: a.currency,
              pending: true,
            });
          }
          const rate =
            a.balance !== 0 && a.usd != null
              ? a.usd / a.balance
              : usdRate(a.currency, view.tx, view.accounts);
          view.accounts[i] = {
            ...a,
            balance,
            usd: rate == null ? a.usd : Math.round(balance * rate * 100) / 100,
            updated: view.today,
            checked: stamp(op.createdAt),
          };
        }
        break;
      }
    }
  }

  view.tx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  view.transfers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  view.adjustments.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
