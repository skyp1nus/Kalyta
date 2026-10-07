import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/lib/format';
import { buildView, sameCurrency, usdRate } from '../src/lib/outbox';
import { categoryTotals, monthStats, shiftYm } from '../src/lib/stats';
import type { Op, OpBody, ServerData } from '../src/lib/types';

const server: ServerData = {
  tx: [
    ['a1', '2026-10-01T10:00', 40, 'PLN', 'Biedronka', 'Wise', 'Food', '', 'apple_pay', 10],
    ['a2', '2026-10-02T12:00', 2000, 'USD', 'Client', 'Wise', 'Income', 'Salary', 'app', 2000],
    ['a3', '2026-09-20T09:00', 100, 'UAH', 'Steam', 'monobank', 'Lifestyle', '', 'fineye', 2.4],
  ],
  transfers: [],
  accounts: [
    { name: 'Wise', type: 'Account', currency: 'USD', balance: 500, updated: '2026-10-06', usd: 500 },
    { name: 'monobank', type: 'Account', currency: 'UAH', balance: 3583, updated: '2026-10-06', usd: 80 },
    { name: 'Bybit', type: 'Account', currency: 'USD', balance: 109.1, updated: '2026-10-06', usd: 109.1 },
  ],
  categories: ['Food', 'Transport', 'Home', 'Lifestyle', 'Subscriptions', 'Business', 'Other'],
  colors: ['#1', '#2', '#3', '#4', '#5', '#6', '#7'],
  income: 'Income',
  base: 'USD',
  today: '2026-10-07',
  fetchedAt: '',
};

const op = (body: OpBody, error?: string): Op => ({
  ...body,
  opId: Math.random().toString(),
  createdAt: 0,
  error,
});

describe('parseAmount', () => {
  it('reads both decimal styles', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('1 234,50')).toBe(1234.5);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });
});

describe('buildView', () => {
  it('shows a queued expense right away with an estimated USD value', () => {
    const v = buildView(server, [
      op({
        action: 'add',
        tx: {
          id: 'n1',
          kind: 'expense',
          date: '2026-10-07T11:00',
          amount: '20',
          currency: 'PLN',
          merchant: 'Żabka',
          account: 'Wise',
          category: 'Food',
          note: '',
        },
      }),
    ]);
    const t = v?.tx.find((x) => x.id === 'n1');
    expect(t?.pending).toBe(true);
    expect(t?.usd).toBe(5); // 40 PLN was $10 on the server
  });

  it('applies edits and deletes', () => {
    const v = buildView(server, [
      op({
        action: 'update',
        id: 'a1',
        tx: {
          id: 'a1',
          kind: 'expense',
          date: '2026-10-01T10:00',
          amount: '80',
          currency: 'PLN',
          merchant: 'Lidl',
          account: 'Wise',
          category: 'Food',
          note: 'big shop',
        },
      }),
      op({ action: 'delete', id: 'a3' }),
    ]);
    expect(v?.tx.find((x) => x.id === 'a1')?.merchant).toBe('Lidl');
    expect(v?.tx.find((x) => x.id === 'a1')?.usd).toBe(20);
    expect(v?.tx.some((x) => x.id === 'a3')).toBe(false);
  });

  it('moves balances for a queued transfer, treating USDT as USD', () => {
    const v = buildView(server, [
      op({
        action: 'transfer',
        tr: {
          id: 't1',
          date: '2026-10-07T15:00',
          from: 'monobank',
          sent: '2294',
          fromCurrency: 'UAH',
          to: 'Bybit',
          received: '50',
          toCurrency: 'USDT',
          note: 'P2P',
        },
      }),
    ]);
    expect(v?.accounts.find((a) => a.name === 'monobank')?.balance).toBe(1289);
    expect(v?.accounts.find((a) => a.name === 'Bybit')?.balance).toBe(159.1);
    expect(v?.transfers).toHaveLength(1);
  });

  it('does not move balances for a transfer the server rejected', () => {
    const v = buildView(server, [
      op(
        {
          action: 'transfer',
          tr: {
            id: 't2',
            date: '2026-10-07T15:00',
            from: 'Wise',
            sent: '10',
            fromCurrency: 'USD',
            to: 'Bybit',
            received: '10',
            toCurrency: 'USD',
            note: '',
          },
        },
        'Pick two different accounts',
      ),
    ]);
    expect(v?.accounts.find((a) => a.name === 'Wise')?.balance).toBe(500);
    expect(v?.transfers[0].failed).toBe('Pick two different accounts');
  });

  it('sets a new balance and rescales its USD value', () => {
    const v = buildView(server, [op({ action: 'balance', account: 'monobank', balance: '1791.5' })]);
    const a = v?.accounts.find((x) => x.name === 'monobank');
    expect(a?.balance).toBe(1791.5);
    expect(a?.usd).toBe(40);
  });

  it('ignores a queued add the server already has', () => {
    const v = buildView(server, [
      op({
        action: 'add',
        tx: {
          id: 'a1',
          kind: 'expense',
          date: '2026-10-01T10:00',
          amount: '40',
          currency: 'PLN',
          merchant: 'Biedronka',
          account: 'Wise',
          category: 'Food',
          note: '',
        },
      }),
    ]);
    expect(v?.tx.filter((x) => x.id === 'a1')).toHaveLength(1);
  });
});

describe('stats', () => {
  it('splits spending and income per month', () => {
    const v = buildView(server, []);
    if (!v) throw new Error('no view');
    const oct = monthStats(v, '2026-10');
    expect(oct.spent).toBe(10);
    expect(oct.earned).toBe(2000);
    const cats = categoryTotals(v, oct.spending);
    expect(cats.find((c) => c.name === 'Food')?.value).toBe(10);
  });

  it('shifts months across years', () => {
    expect(shiftYm('2026-01', -1)).toBe('2025-12');
    expect(shiftYm('2026-12', 1)).toBe('2027-01');
  });

  it('knows stablecoins are dollars', () => {
    expect(sameCurrency('USDT', 'usd')).toBe(true);
    expect(usdRate('USDT', [], [])).toBe(1);
  });
});
