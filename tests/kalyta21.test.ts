import { describe, expect, it } from 'vitest';
import { fmt } from '../src/lib/format';
import { accountDomain, logoUrls } from '../src/lib/meta';
import { buildView } from '../src/lib/outbox';
import { kwOf, norm, ruleFor } from '../src/lib/rules';
import { debtTotals, monthSummary, netWorth } from '../src/lib/stats';
import {
  addCadence,
  budgetState,
  effectiveNext,
  findRecurring,
  nextOnOrAfter,
  priceChange,
  subStates,
} from '../src/lib/subs';
import type { Op, OpBody, ServerData, View } from '../src/lib/types';

const tx = (id: string, date: string, amount: number, merchant: string, category: string, cur = 'PLN') =>
  [id, date, amount, cur, merchant, 'Revolut', category, '', 'app', amount / 4] as ServerData['tx'][number];

const server: ServerData = {
  tx: [
    tx('a', '2026-07-14T10:00', 24.99, 'UBER ONE', 'Transport'),
    tx('b', '2026-08-14T10:00', 24.99, 'UBER ONE', 'Transport'),
    tx('c', '2026-09-14T10:00', 24.99, 'UBER ONE', 'Transport'),
    tx('d', '2026-09-05T10:00', 8.99, 'Google One', 'Subscriptions'),
    tx('e', '2026-10-07T12:10', 12.49, 'ZABKA Z4754 K.2', ''),
    tx('f', '2026-10-01T12:10', 30, 'Żabka', 'Food'),
  ],
  transfers: [],
  accounts: [{ name: 'Revolut', type: 'Account', currency: 'PLN', balance: 27, updated: '', usd: 7 }],
  rules: [['Uber', 'Transport']],
  budgets: { total: 1000, cats: { Food: 220 } },
  subscriptions: [
    {
      id: 's5',
      name: 'Google One',
      amount: 8.99,
      currency: 'PLN',
      cadence: 'monthly',
      next: '2026-09-05',
      account: 'Revolut',
      category: 'Subscriptions',
      paused: false,
      prev: null,
    },
  ],
  categories: ['Food', 'Transport', 'Home', 'Lifestyle', 'Subscriptions', 'Business', 'Other'],
  colors: [],
  income: 'Income',
  base: 'USD',
  today: '2026-10-07',
  fetchedAt: '',
};

const op = (body: OpBody): Op => ({ ...body, opId: Math.random().toString(), createdAt: 0 });
function view(ops: Op[] = []): View {
  const v = buildView(server, ops);
  if (!v) throw new Error('no view');
  return { ...v, today: '2026-10-07' };
}

describe('rules', () => {
  it('pulls a keyword out of raw bank strings', () => {
    expect(kwOf('ZABKA Z4754 K.2')).toBe('Zabka');
    expect(kwOf('SQ *BUNKIER SZTUKI')).toBe('Bunkier');
    expect(kwOf('APPLE PAY *ORLEN STACJA')).toBe('Orlen');
    expect(kwOf('Hala Koszyki')).toBe('Hala Koszyki');
  });

  it('matches without case and accents', () => {
    expect(norm('Żabka')).toBe('zabka');
    expect(ruleFor([{ kw: 'Żabka', cat: 'Food' }], 'ZABKA Z4754')?.cat).toBe('Food');
    expect(ruleFor([{ kw: 'Żabka', cat: 'Food' }], 'za')).toBeUndefined();
  });

  it('one keyword keeps one rule, and past records can move with it', () => {
    const v = view([op({ action: 'rule', kw: 'UBER', cat: 'Lifestyle', past: true })]);
    expect(v.rules).toEqual([{ kw: 'UBER', cat: 'Lifestyle' }]);
    expect(v.tx.filter((t) => t.merchant === 'UBER ONE').every((t) => t.category === 'Lifestyle')).toBe(true);
  });

  it('a new expense without a category takes it from the rules', () => {
    const v = view([
      op({
        action: 'add',
        tx: {
          id: 'n',
          kind: 'expense',
          date: '2026-10-07T13:00',
          amount: '18',
          currency: 'PLN',
          merchant: 'Uber trip',
          account: 'Revolut',
          category: '',
          note: '',
        },
      }),
    ]);
    expect(v.tx.find((t) => t.id === 'n')?.category).toBe('Transport');
  });
});

describe('subscriptions', () => {
  it('adds periods', () => {
    expect(addCadence('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addCadence('2026-08-31', 'monthly')).toBe('2026-09-30');
    expect(addCadence('2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(addCadence('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(addCadence('2026-10-05', 'weekly')).toBe('2026-10-12');
    expect(addCadence('2026-10-05', 'yearly')).toBe('2027-10-05');
  });

  it('skips a past due date when the charge already showed up', () => {
    const v = view();
    expect(effectiveNext(v, v.subscriptions[0])).toBe('2026-10-05');
    expect(subStates(v)[0].overdue).toBe(true); // no charge on Oct 5
  });

  it('finds charges that repeat three months in a row', () => {
    const s = findRecurring(view(), []);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: 'Uber', cadence: 'monthly', next: '2026-10-14' });
    expect(s[0].seen).toBe('Jul 14, Aug 14 and Sep 14');
    expect(findRecurring(view(), ['uber'])).toHaveLength(0);
  });
});

describe('budgets and privacy', () => {
  it('rates spending against a limit', () => {
    expect(budgetState(100, 220).st).toBe('ok');
    expect(budgetState(180, 220).st).toBe('close');
    expect(budgetState(230, 220)).toMatchObject({ st: 'over', w: 100 });
  });

  it('keeps budgets the user just saved', () => {
    const v = view([op({ action: 'budgets', total: 900, cats: { Home: 400 } })]);
    expect(v.budgets).toEqual({ total: 900, cats: { Home: 400 } });
  });

  it('hides amounts but keeps the currency', () => {
    expect(fmt(656, 'USD', '', true, true)).toBe('$•••');
    expect(fmt(23.4, 'PLN', '−', true, true)).toBe('− ••• zł');
  });
});

describe('review fixes', () => {
  it('finds the real place behind a payment processor or an order number', () => {
    expect(kwOf('PAYPAL *SPOTIFY')).toBe('Spotify');
    expect(kwOf('BOLT.EU/O/2310081234')).toBe('Bolt');
    expect(norm('MALPKA EXPRESS').includes(norm('Małpka'))).toBe(true);
  });

  it('matches short keywords like the script does', () => {
    const v = view([op({ action: 'rule', kw: 'BP', cat: 'Transport' })]);
    expect(ruleFor(v.rules, 'BP Stacja')?.cat).toBe('Transport');
  });

  it('lets one charge pay for one week only', () => {
    const v = view();
    const sub = {
      ...v.subscriptions[0],
      name: 'UBER ONE',
      amount: 24.99,
      cadence: 'weekly' as const,
      next: '2026-09-12',
    };
    // the Sep 14 charge pays for Sep 12; nothing paid Sep 19 (it used to count for both)
    expect(effectiveNext({ ...v, subscriptions: [sub] }, sub)).toBe('2026-09-19');
  });

  it('ignores charges at the same place with a very different price', () => {
    const v = view();
    const sub = { ...v.subscriptions[0], name: 'Uber', amount: 100, next: '2026-09-14' };
    expect(effectiveNext({ ...v, subscriptions: [sub] }, sub)).toBe('2026-09-14');
  });

  it('moves a resumed subscription to its next date', () => {
    expect(nextOnOrAfter('2026-05-10', 'monthly', '2026-10-07')).toBe('2026-10-10');
    expect(nextOnOrAfter('2026-10-10', 'monthly', '2026-10-07')).toBe('2026-10-10');
  });

  it('does not take a weekly grocery run for a subscription', () => {
    const shop = (id: string, d: string, a: number) => tx(id, `${d}T18:00`, a, 'BIEDRONKA 123', 'Food');
    const v = buildView(
      {
        ...server,
        tx: [
          shop('g1', '2026-09-16', 80),
          shop('g2', '2026-09-23', 87),
          shop('g3', '2026-09-30', 94),
          shop('g4', '2026-10-07', 90),
        ],
      },
      [],
    );
    if (!v) throw new Error('no view');
    expect(findRecurring({ ...v, today: '2026-10-07' }, []).filter((x) => x.id === 'biedronka')).toHaveLength(
      0,
    );
  });

  it('finds yearly charges', () => {
    const v = buildView(
      {
        ...server,
        tx: [
          tx('y1', '2025-10-20T10:00', 199, 'ICLOUD', 'Subscriptions'),
          tx('y2', '2026-10-20T10:00', 199, 'ICLOUD', 'Subscriptions'),
        ],
      },
      [],
    );
    if (!v) throw new Error('no view');
    const s = findRecurring({ ...v, today: '2026-10-21' }, []);
    expect(s[0]).toMatchObject({ cadence: 'yearly', next: '2027-10-20' });
  });

  it('shows a price change until the next charge at the same price', () => {
    const v = view();
    const sub = { ...v.subscriptions[0], name: 'UBER ONE', amount: 29.99, prev: 24.99, next: '2026-10-14' };
    expect(priceChange(v, sub)).toBeNull(); // the last two charges were the same price
    const fresh = { ...sub, name: 'Netflix' };
    expect(priceChange(v, fresh)).toEqual({ from: 24.99, to: 29.99 }); // no charges yet: what was typed in
  });
});

describe('accounts from the app', () => {
  it('shows a new account right away, debts count against net worth', () => {
    const v = view([
      op({
        action: 'addAccount',
        acc: { name: 'Bybit', type: 'Account', currency: 'USDT', balance: '50', domain: 'bybit.com' },
      }),
      op({
        action: 'addAccount',
        acc: { name: 'Alex', type: 'You owe', currency: 'USD', balance: '20', domain: '' },
      }),
    ]);
    expect(v.accounts.find((a) => a.name === 'Bybit')).toMatchObject({
      balance: 50,
      usd: 50,
      domain: 'bybit.com',
    });
    expect(v.accounts.find((a) => a.name === 'Alex')?.usd).toBe(-20);
  });

  it('does not add the same name twice and removes deleted accounts', () => {
    const v = view([
      op({
        action: 'addAccount',
        acc: { name: 'revolut', type: 'Account', currency: 'PLN', balance: '1', domain: '' },
      }),
    ]);
    expect(v.accounts.filter((a) => a.name.toLowerCase() === 'revolut')).toHaveLength(1);
    expect(view([op({ action: 'deleteAccount', account: 'Revolut' })]).accounts).toHaveLength(0);
  });

  it('finds logos for known banks by name', () => {
    expect(accountDomain('mono black')).toBe('monobank.ua');
    expect(accountDomain('ING konto')).toBe('ing.pl');
    expect(accountDomain('Shopping')).toBe('');
    expect(accountDomain('Anything', 'example.com')).toBe('example.com');
  });

  it('tries Brandfetch first, then the bundled App Store icon or the site icon', () => {
    const mono = logoUrls('monobank.ua');
    expect(mono[0]).toContain('cdn.brandfetch.io/domain/monobank.ua/');
    expect(mono[1]).toBe('./logos/monobank.ua.jpg');
    expect(logoUrls('example.com')[1]).toContain('gstatic.com');
    expect(logoUrls('')).toEqual([]);
  });
});

describe('balances follow records', () => {
  const base: ServerData = {
    ...server,
    tx: [
      tx('before', '2026-10-05T10:00', 40, 'Biedronka', 'Food', 'PLN'),
      ['ap1', '2026-10-08T13:00', 20.9, '', 'Green Caffè Nero', 'Wise Card', 'Food', '', 'apple_pay', 5.38],
      ['inc', '2026-10-08T13:30', 100, 'USD', 'Client', 'Wise', 'Income', '', 'app', 100],
    ],
    accounts: [
      {
        name: 'Wise',
        type: 'Account',
        currency: 'USD',
        balance: 500,
        updated: '2026-10-08',
        checked: '2026-10-08T12:00',
        usd: 500,
      },
      {
        name: 'Revolut',
        type: 'Account',
        currency: 'PLN',
        balance: 100,
        updated: '2026-10-08',
        checked: '2026-10-08T12:00',
        usd: 25,
      },
    ],
  };

  it('counts records made after the last balance check, Apple Pay cards included', () => {
    const v = buildView(base, []);
    // 500 − 5.38 (PLN coffee via USD) + 100 income; the Revolut record is from before the check
    expect(v?.accounts.find((a) => a.name === 'Wise')?.balance).toBe(594.62);
    expect(v?.accounts.find((a) => a.name === 'Revolut')?.balance).toBe(100);
  });

  it('moves the balance for queued adds, edits and deletes', () => {
    const add = op({
      action: 'add',
      tx: {
        id: 'n',
        kind: 'expense',
        date: '2026-10-08T14:00',
        amount: '30',
        currency: 'PLN',
        merchant: 'Lidl',
        account: 'Revolut',
        category: 'Food',
        note: '',
      },
    });
    const del = op({ action: 'delete', id: 'inc' });
    const v = buildView(base, [add, del]);
    expect(v?.accounts.find((a) => a.name === 'Revolut')?.balance).toBe(70);
    expect(v?.accounts.find((a) => a.name === 'Wise')?.balance).toBe(494.62);
  });
});

describe('categories from the sheet', () => {
  const withCats: ServerData = {
    ...server,
    tx: [
      ...server.tx,
      ['sal', '2026-10-02T10:00', 2000, 'USD', 'Client', 'Revolut', 'Salary', '', 'app', 2000],
    ],
    incomeCategories: ['Salary', 'Income'],
    categoryLooks: [
      ['Salary', 'income', '💰', '#30d158'],
      ['Food', 'expense', '', '#ff9f0a'],
    ],
  };

  it('counts an income category as income', () => {
    const v = buildView(withCats, []);
    if (!v) throw new Error('no view');
    expect(monthSummary(v, '2026-10').income).toBe(2000);
  });

  it('adds and deletes categories right away', () => {
    const v = buildView(withCats, [
      op({ action: 'category', cat: { name: 'Pets', kind: 'expense', emoji: '🐶', color: '#ff9f0a' } }),
      op({ action: 'deleteCategory', name: 'Salary' }),
    ]);
    if (!v) throw new Error('no view');
    expect(v.categories).toContain('Pets');
    expect(v.incomeCategories).not.toContain('Salary');
    // its record falls back to the catch-all income category and still counts as income
    expect(v.tx.find((t) => t.id === 'sal')?.category).toBe('Income');
    expect(monthSummary(v, '2026-10').income).toBe(2000);
  });
});

describe('a record in the same minute as the balance check', () => {
  it('counts, because it was added after the check', () => {
    const v = buildView(
      {
        ...server,
        tx: [
          ['inc', '2026-10-08T15:25', 6000, 'UAH', 'Family Care', 'PrivatBank', 'Income', '', 'app', 133.62],
        ],
        accounts: [
          {
            name: 'PrivatBank',
            type: 'Account',
            currency: 'UAH',
            balance: 482.1,
            updated: '2026-10-08',
            checked: '2026-10-08T15:25',
            usd: 10.74,
          },
        ],
      },
      [],
    );
    expect(v?.accounts[0].balance).toBe(6482.1);
  });
});

describe('net worth', () => {
  it('leaves debts out', () => {
    const acc = (name: string, type: string, usd: number) => ({
      name,
      type,
      currency: 'USD',
      balance: Math.abs(usd),
      updated: '',
      usd,
    });
    const view = {
      accounts: [acc('Wise', 'Account', 600), acc('Alex', 'Owed to you', 200), acc('Bob', 'You owe', -50)],
    } as unknown as View;
    expect(netWorth(view)).toBe(600);
    expect(debtTotals(view)).toEqual({ lent: 200, owe: 50 });
  });
});
