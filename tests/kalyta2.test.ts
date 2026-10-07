import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';
import { dayHeading, fmt } from '../src/lib/format';
import { accountGroup } from '../src/lib/meta';
import { makeMoney } from '../src/lib/money';
import { buildView, localToday } from '../src/lib/outbox';
import { comparison, monthSummary, weekSpending } from '../src/lib/stats';
import type { Op, OpBody, ServerData, View } from '../src/lib/types';

const server: ServerData = {
  tx: [
    ['s1', '2026-09-02T10:00', 40, 'PLN', 'Biedronka', 'Revolut', 'Food', '', 'app', 10],
    ['s2', '2026-09-20T10:00', 400, 'PLN', 'IKEA', 'Revolut', 'Home', '', 'app', 100],
    ['o1', '2026-10-01T09:00', 350, 'USD', 'Rent', 'Wise', 'Home', '', 'app', 350],
    ['o2', '2026-10-03T18:00', 80, 'PLN', 'Biedronka', 'Cash', 'Food', '', 'app', 20],
    ['o3', '2026-10-05T11:00', 420, 'USD', 'Upwork', 'Wise', 'Income', '', 'app', 420],
    ['o4', '2026-10-06T12:00', 40, 'PLN', 'Biedronka', 'Cash', 'Food', '', 'app', 10],
  ],
  transfers: [['tr1', '2026-10-05T14:30', 'monobank', 2294, 'UAH', 'Bybit', 50, 'USDT', '']],
  accounts: [
    { name: 'Wise', type: 'Account', currency: 'USD', balance: 656, updated: '2026-10-07', usd: 656 },
    { name: 'monobank', type: 'Account', currency: 'UAH', balance: 1289, updated: '2026-10-05', usd: 31.13 },
    { name: 'Bybit', type: 'Account', currency: 'USDT', balance: 159, updated: '2026-10-05', usd: 159 },
    { name: 'Cash', type: 'Account', currency: 'PLN', balance: 100, updated: '2026-10-01', usd: 25 },
    { name: 'Рітулік', type: 'You owe', currency: 'USD', balance: 224, updated: '2026-09-12', usd: -224 },
  ],
  adjustments: [['adj1', '2026-10-04T09:00', 'Cash', -5, 'PLN']],
  rates: { USD: 1, USDT: 1, PLN: 0.25, UAH: 0.024, EUR: 1.09 },
  sheetName: 'Kalyta 2026',
  categories: ['Food', 'Transport', 'Home', 'Lifestyle', 'Subscriptions', 'Business', 'Other'],
  colors: [],
  income: 'Income',
  base: 'USD',
  today: '2026-10-07',
  fetchedAt: '2026-10-07T14:00:00.000Z',
};

const op = (body: OpBody, error?: string): Op => ({
  ...body,
  opId: Math.random().toString(),
  createdAt: 0,
  error,
});

function view(ops: Op[] = []): View {
  const v = buildView(server, ops);
  if (!v) throw new Error('no view');
  return { ...v, today: '2026-10-07' };
}

const balance = (v: View, name: string) => v.accounts.find((a) => a.name === name)?.balance;

describe('transfers', () => {
  const tr = {
    id: 'tr1',
    date: '2026-10-05T14:30',
    from: 'monobank',
    sent: '2000',
    fromCurrency: 'UAH',
    to: 'Bybit',
    received: '40',
    toCurrency: 'USDT',
    note: '',
  };

  it('editing a transfer moves both balances by the difference', () => {
    const v = view([op({ action: 'updateTransfer', id: 'tr1', tr })]);
    expect(balance(v, 'monobank')).toBe(1583);
    expect(balance(v, 'Bybit')).toBe(149);
    expect(v.transfers[0].sent).toBe(2000);
  });

  it('deleting a queued transfer takes its balances back', () => {
    const add = op({ action: 'transfer', tr: { ...tr, id: 'tr2' } });
    const v = view([add, op({ action: 'deleteTransfer', id: 'tr2' })]);
    expect(balance(v, 'monobank')).toBe(1289);
    expect(balance(v, 'Bybit')).toBe(159);
  });
});

describe('balance adjustments', () => {
  it('logs the change as an adjustment and marks the balance as checked', () => {
    const v = view([op({ action: 'balance', account: 'Cash', balance: '90', mode: 'adjust', id: 'adj2' })]);
    const adj = v.adjustments.find((a) => a.id === 'adj2');
    expect(adj?.change).toBe(-10);
    expect(adj?.pending).toBe(true);
    expect(balance(v, 'Cash')).toBe(90);
    // the check is stamped with the real date, not the fixture's "today"
    expect(v.accounts.find((a) => a.name === 'Cash')?.checked).toBe(localToday());
  });

  it('a plain check logs nothing', () => {
    const v = view([op({ action: 'balance', account: 'Cash', balance: '90', mode: 'check', id: 'c1' })]);
    expect(v.adjustments).toHaveLength(1);
  });

  it('removing an adjustment moves the balance back', () => {
    const v = view([op({ action: 'deleteAdjustment', id: 'adj1' })]);
    expect(v.adjustments).toHaveLength(0);
    expect(balance(v, 'Cash')).toBe(105);
  });
});

describe('month statistics', () => {
  it('sums spending, income, categories and places', () => {
    const m = monthSummary(view(), '2026-10');
    expect(m.spent).toBe(380);
    expect(m.income).toBe(420);
    expect(m.passed).toBe(7);
    expect(m.cats[0]).toEqual(['Home', 350]);
    expect(m.places[0]).toMatchObject({ name: 'Rent', count: 1 });
    expect(m.places.find((p) => p.name === 'Biedronka')?.count).toBe(2);
    expect(m.days[2]).toBe(20);
  });

  it('compares a running month with the same days of the previous one', () => {
    const v = view();
    const cmp = comparison(v, monthSummary(v, '2026-10'));
    expect(cmp.base).toBe(10);
    expect(cmp.label).toBe('Sep 1–7');
    const past = comparison(v, monthSummary(v, '2026-09'));
    expect(past.label).toBe('August');
  });

  it('builds this week from Monday', () => {
    const w = weekSpending(view());
    expect(w.todayIndex).toBe(2); // Oct 7, 2026 is a Wednesday
    expect(w.days[0]).toBe(0); // Mon Oct 5: only income and a transfer
    expect(w.days[1]).toBe(10);
  });
});

describe('formatting', () => {
  it('formats like the design', () => {
    expect(fmt(656, 'USD')).toBe('$656');
    expect(fmt(23.4, 'PLN', '−')).toBe('− 23.40 zł');
    expect(fmt(1289, 'UAH')).toBe('1,289 ₴');
    expect(fmt(159, 'USDT')).toBe('159 USDT');
    expect(fmt(23.4, 'PLN', '', false)).toBe('23 zł');
  });

  it('shows amounts in the base currency', () => {
    const m = makeMoney(view().rates, 'PLN', true);
    expect(m.B(25)).toBe('100 zł');
    expect(m.convert(2294, 'UAH', 'USDT')).toBeCloseTo(55.06, 2);
    expect(makeMoney({ USD: 1 }, 'PLN', true).base).toBe('USD');
  });

  it('names days like iOS', () => {
    expect(dayHeading('2026-10-07T10:00', '2026-10-07')).toBe('Today');
    expect(dayHeading('2026-10-06T10:00', '2026-10-07')).toBe('Yesterday');
    expect(dayHeading('2026-10-05T10:00', '2026-10-07')).toBe('Mon, Oct 5');
  });
});

describe('accounts and export', () => {
  it('groups accounts', () => {
    const v = view();
    const groups = Object.fromEntries(v.accounts.map((a) => [a.name, accountGroup(a)]));
    expect(groups).toMatchObject({ Wise: 'Banks', Bybit: 'Crypto', Cash: 'Cash', Рітулік: 'Debts' });
  });

  it('exports one month as CSV, quoting where needed', () => {
    const v = view([
      op({
        action: 'add',
        tx: {
          id: 'n1',
          kind: 'expense',
          date: '2026-10-07T12:00',
          amount: '5',
          currency: 'PLN',
          merchant: 'Café "Nero", Wola',
          account: 'Cash',
          category: 'Food',
          note: '',
        },
      }),
    ]);
    const lines = toCsv(v, '2026-10').split('\r\n');
    expect(lines[0]).toMatch(/^Date,Type,Amount/);
    expect(lines).toHaveLength(1 + 4 + 1 + 1 + 1); // header, 4 tx, transfer, adjustment, new
    expect(lines.at(-1)).toContain('"Café ""Nero"", Wola"');
  });
});
