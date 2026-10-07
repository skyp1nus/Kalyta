import { describe, expect, it } from 'vitest';
import { fmt } from '../src/lib/format';
import { buildView } from '../src/lib/outbox';
import { kwOf, norm, ruleFor } from '../src/lib/rules';
import { addCadence, budgetState, effectiveNext, findRecurring, subStates } from '../src/lib/subs';
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
    expect(addCadence('2026-01-31', 'monthly')).toBe('2026-03-03');
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
