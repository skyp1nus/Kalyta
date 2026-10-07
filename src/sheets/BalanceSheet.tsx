import { useState } from 'react';
import { AmountInput, Avatar, Segmented } from '../components/ui';
import { MONTHS, nowLocal, parseAmount } from '../lib/format';
import { accountGroup, isDebt } from '../lib/meta';
import { useMoney } from '../lib/money';
import { newId } from '../lib/outbox';
import { enqueue } from '../lib/store';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SaveButton, SheetHead } from './common';

type Mode = 'adjust' | 'tx';

export function BalanceSheet({ view, name }: { view: View; name: string }) {
  const nav = useNav();
  const money = useMoney(view);
  const a = view.accounts.find((x) => x.name === name);
  const [val, setVal] = useState('');
  const [mode, setMode] = useState<Mode>('adjust');
  if (!a) return null;

  const debt = isDebt(a);
  const nv = parseAmount(val);
  const has = val.trim() !== '' && Number.isFinite(nv) && nv >= 0;
  const diff = has ? Math.round((nv - a.balance) * 100) / 100 : 0;
  const month = MONTHS[Number(view.today.slice(5, 7)) - 1];
  const placeholder = money.n(a.balance, '').replace(/[^\d.,]/g, '') || '0';
  const question = debt
    ? 'How much do you owe now?'
    : accountGroup(a) === 'Cash'
      ? 'How much cash do you have?'
      : 'What does the app show right now?';

  function save() {
    if (!has || !a) return;
    if (!diff) {
      enqueue({ action: 'balance', account: a.name, balance: String(nv), mode: 'check', id: newId() });
      nav.close();
      nav.toast('Balance confirmed');
      return;
    }
    if (mode === 'tx' && !debt) {
      const income = diff > 0;
      enqueue({
        action: 'add',
        tx: {
          id: newId(),
          kind: income ? 'income' : 'expense',
          date: nowLocal(),
          amount: String(Math.abs(diff)),
          currency: a.currency,
          merchant: 'Balance correction',
          account: a.name,
          category: income ? view.income : 'Other',
          note: '',
        },
      });
      enqueue({ action: 'balance', account: a.name, balance: String(nv), mode: 'check', id: newId() });
    } else {
      enqueue({ action: 'balance', account: a.name, balance: String(nv), mode: 'adjust', id: newId() });
    }
    nav.close();
    nav.toast(`${a.name} balance updated`);
  }

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title="Update balance"
        right={<SaveButton onClick={save} enabled={has} />}
      />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 22 }}>
        <Avatar name={a.name} type={a.type} size={60} />
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }}>{a.name}</div>
        <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 3 }}>
          In Kalyta: {money.n(a.balance, a.currency)}
        </div>
      </div>
      <div className="amount-card" style={{ marginTop: 22, padding: '22px 16px' }}>
        <div style={{ fontSize: 15, color: 'var(--text2)' }}>{question}</div>
        <div className="amount-line" style={{ marginTop: 8 }}>
          <AmountInput
            value={val}
            onChange={setVal}
            placeholder={placeholder}
            charWidth={33}
            className="amount-input balance"
            label="New balance"
          />
          <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text2)' }}>{a.currency}</div>
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginTop: 8,
            minHeight: 20,
            color: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text2)',
          }}
        >
          {has
            ? diff
              ? `Difference ${money.n(Math.abs(diff), a.currency, diff > 0 ? '+' : '−')}`
              : 'Matches Kalyta'
            : ''}
        </div>
      </div>
      {has && diff !== 0 && !debt && (
        <div style={{ animation: 'rise .3s var(--ease)' }}>
          <Segmented
            label="Record as"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'adjust', label: 'Adjustment' },
              { value: 'tx', label: diff > 0 ? 'Income' : 'Expense' },
            ]}
          />
          <div
            style={{
              margin: '10px 32px 0',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--text2)',
              lineHeight: 1.4,
              textWrap: 'pretty',
            }}
          >
            {mode === 'adjust'
              ? 'Fixes the balance without touching statistics. Shows up as “Balance adjustment”.'
              : `Recorded as ${diff > 0 ? 'income' : 'an expense in Other'} and counted in ${month} statistics.`}
          </div>
        </div>
      )}
    </>
  );
}
