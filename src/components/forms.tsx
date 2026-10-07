import { Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { native, nowLocal, parseAmount } from '../lib/format';
import { newId, sameCurrency } from '../lib/outbox';
import { categoryColor } from '../lib/stats';
import { enqueue } from '../lib/store';
import type { Account, Transfer, Tx, TxInput, View } from '../lib/types';

export const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH', 'USDT', 'GBP'];

function accountNames(view: View): string[] {
  const own = view.accounts.filter((a) => a.type === 'Account').map((a) => a.name);
  const used = [
    ...new Set(
      view.tx
        .slice(-200)
        .map((t) => t.account)
        .filter(Boolean),
    ),
  ];
  return [...new Set([...own, ...used])];
}

function recentMerchants(view: View, income: boolean): string[] {
  const seen = new Set<string>();
  for (let i = view.tx.length - 1; i >= 0 && seen.size < 40; i--) {
    const t = view.tx[i];
    if ((t.category === view.income) === income && t.merchant) seen.add(t.merchant);
  }
  return [...seen];
}

// ----- expense / income -----
export function TxForm({
  view,
  kind,
  initial,
  onDone,
}: {
  view: View;
  kind: 'expense' | 'income';
  initial?: Tx;
  onDone: (message: string) => void;
}) {
  const accounts = useMemo(() => accountNames(view), [view]);
  const merchants = useMemo(() => recentMerchants(view, kind === 'income'), [view, kind]);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState(initial?.currency || (kind === 'income' ? 'USD' : 'PLN'));
  const [category, setCategory] = useState(
    initial?.category && initial.category !== view.income ? initial.category : '',
  );
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [account, setAccount] = useState(initial?.account || accounts[0] || '');
  const [date, setDate] = useState(initial?.date || nowLocal());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = parseAmount(amount);
    if (!(n > 0)) {
      setError('Enter an amount');
      return;
    }
    const tx: TxInput = {
      id: initial?.id ?? newId(),
      kind,
      date,
      amount: String(n),
      currency,
      merchant: merchant.trim(),
      account,
      category: kind === 'income' ? view.income : category,
      note: note.trim(),
    };
    if (initial) enqueue({ action: 'update', id: initial.id, tx });
    else enqueue({ action: 'add', tx });
    onDone(initial ? 'Changes saved' : kind === 'income' ? 'Income added' : 'Expense added');
    if (!initial) {
      setAmount('');
      setMerchant('');
      setNote('');
      setCategory('');
      setDate(nowLocal());
    }
  }

  function remove() {
    if (!initial) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    enqueue({ action: 'delete', id: initial.id });
    onDone('Entry deleted');
  }

  const listId = `merchants-${kind}`;
  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label className="label" htmlFor="amount">
          Amount
        </label>
        <div className="amount-field">
          <input
            id="amount"
            className="input amount-input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            aria-invalid={!!error}
            onChange={(e) => {
              setAmount(e.target.value);
              setError('');
            }}
          />
          <select
            className="select"
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {[...new Set([currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {kind === 'expense' && (
        <div className="field">
          <span className="label">Category</span>
          <div className="chips">
            {view.categories.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? '' : c)}
              >
                <span className="swatch" style={{ background: categoryColor(view, c) }} />
                {c}
              </button>
            ))}
          </div>
          {!category && <p className="hint">Leave empty and the sheet picks one from your Rules.</p>}
        </div>
      )}

      <label className="field">
        <span className="label">{kind === 'income' ? 'From' : 'Where'}</span>
        <input
          className="input"
          list={listId}
          autoComplete="off"
          placeholder={kind === 'income' ? 'Client, salary' : 'Biedronka'}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
        <datalist id={listId}>
          {merchants.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span className="label">Account</span>
        <select className="select" value={account} onChange={(e) => setAccount(e.target.value)}>
          {[...new Set([account, ...accounts])].filter(Boolean).map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">When</span>
        <input
          className="input"
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="label">Note</span>
        <input
          className="input"
          autoComplete="off"
          placeholder="Optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <button type="submit" className="btn primary">
        {initial ? 'Save changes' : kind === 'income' ? 'Add income' : 'Add expense'}
      </button>
      {initial && (
        <button type="button" className={`btn danger ${armed ? 'armed' : ''}`} onClick={remove}>
          <Trash2 size={18} />
          {armed ? 'Tap again to delete' : 'Delete entry'}
        </button>
      )}
    </form>
  );
}

// ----- transfer between own accounts -----
export function TransferForm({
  view,
  onDone,
  from: presetFrom,
}: {
  view: View;
  onDone: (m: string) => void;
  from?: string;
}) {
  const names = view.accounts.map((a) => a.name);
  const cur = (name: string) => view.accounts.find((a) => a.name === name)?.currency || 'PLN';
  const [from, setFrom] = useState(presetFrom || names[0] || '');
  const [to, setTo] = useState(names.find((n) => n !== (presetFrom || names[0])) || '');
  const [sent, setSent] = useState('');
  const [received, setReceived] = useState('');
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [fromCurrency, setFromCurrency] = useState(cur(from));
  const [toCurrency, setToCurrency] = useState(cur(to));
  const [date, setDate] = useState(nowLocal());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const same = sameCurrency(fromCurrency, toCurrency);
  const rate =
    parseAmount(sent) > 0 && parseAmount(received) > 0 ? parseAmount(sent) / parseAmount(received) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const s = parseAmount(sent);
    const r = parseAmount(same && !receivedTouched ? sent : received);
    if (!from || !to || from === to) return setError('Pick two different accounts');
    if (!(s > 0)) return setError('Enter how much you sent');
    if (!(r > 0)) return setError('Enter how much arrived');
    enqueue({
      action: 'transfer',
      tr: {
        id: newId(),
        date,
        from,
        sent: String(s),
        fromCurrency,
        to,
        received: String(r),
        toCurrency,
        note: note.trim(),
      },
    });
    onDone('Transfer added');
    setSent('');
    setReceived('');
    setReceivedTouched(false);
    setNote('');
    setDate(nowLocal());
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="two">
        <label className="field">
          <span className="label">From</span>
          <select
            className="select"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setFromCurrency(cur(e.target.value));
              setError('');
            }}
          >
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">To</span>
          <select
            className="select"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setToCurrency(cur(e.target.value));
              setError('');
            }}
          >
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <label className="label" htmlFor="sent">
          Sent
        </label>
        <div className="amount-field">
          <input
            id="sent"
            className="input amount-input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={sent}
            onChange={(e) => {
              setSent(e.target.value);
              setError('');
            }}
          />
          <select
            className="select"
            aria-label="Sent currency"
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
          >
            {[...new Set([fromCurrency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="received">
          Arrived
        </label>
        <div className="amount-field">
          <input
            id="received"
            className="input amount-input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder={same ? sent || '0.00' : '0.00'}
            value={same && !receivedTouched ? sent : received}
            onChange={(e) => {
              setReceived(e.target.value);
              setReceivedTouched(true);
              setError('');
            }}
          />
          <select
            className="select"
            aria-label="Arrived currency"
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
          >
            {[...new Set([toCurrency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {!same && rate && (
          <p className="hint num">
            Rate {rate.toFixed(rate >= 10 ? 2 : 4)} {fromCurrency} per {toCurrency}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <label className="field">
        <span className="label">When</span>
        <input
          className="input"
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Note</span>
        <input
          className="input"
          autoComplete="off"
          placeholder="P2P, ATM"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <button type="submit" className="btn primary">
        Add transfer
      </button>
      <p className="hint">
        Transfers move money between your accounts. They don’t count as spending or income.
      </p>
    </form>
  );
}

export function TransferDetails({ t, onDone }: { t: Transfer; onDone: (m: string) => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div>
      <div className="list">
        <div className="kv">
          <span className="muted">From {t.from}</span>
          <span className="num">{native(t.sent, t.fromCurrency)}</span>
        </div>
        <div className="kv">
          <span className="muted">To {t.to}</span>
          <span className="num">{native(t.received, t.toCurrency)}</span>
        </div>
        {!sameCurrency(t.fromCurrency, t.toCurrency) && t.received > 0 && (
          <div className="kv">
            <span className="muted">Rate</span>
            <span className="num">
              {(t.sent / t.received).toFixed(2)} {t.fromCurrency} per {t.toCurrency}
            </span>
          </div>
        )}
        <div className="kv">
          <span className="muted">When</span>
          <span>{t.date.replace('T', ' ')}</span>
        </div>
        {t.note && (
          <div className="kv">
            <span className="muted">Note</span>
            <span>{t.note}</span>
          </div>
        )}
      </div>
      <p className="hint">Deleting a transfer also moves both balances back.</p>
      <button
        type="button"
        className={`btn danger ${armed ? 'armed' : ''}`}
        style={{ marginTop: 14 }}
        onClick={() => {
          if (!armed) return setArmed(true);
          enqueue({ action: 'deleteTransfer', id: t.id });
          onDone('Transfer deleted');
        }}
      >
        <Trash2 size={18} />
        {armed ? 'Tap again to delete' : 'Delete transfer'}
      </button>
    </div>
  );
}

// ----- set an account balance -----
export function BalanceForm({
  view,
  account,
  onDone,
}: {
  view: View;
  account?: Account;
  onDone: (m: string) => void;
}) {
  const [name, setName] = useState(account?.name || view.accounts[0]?.name || '');
  const current = view.accounts.find((a) => a.name === name);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = parseAmount(value);
    if (!name) return setError('Pick an account');
    if (!(n >= 0)) return setError('Enter the new balance');
    enqueue({ action: 'balance', account: name, balance: String(n) });
    onDone(`${name} updated`);
    setValue('');
  }

  return (
    <form onSubmit={submit} noValidate>
      {!account && (
        <label className="field">
          <span className="label">Account</span>
          <select className="select" value={name} onChange={(e) => setName(e.target.value)}>
            {view.accounts.map((a) => (
              <option key={a.name}>{a.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="field">
        <label className="label" htmlFor="balance">
          New balance{current ? `, ${current.currency}` : ''}
        </label>
        <input
          id="balance"
          className="input amount-input num"
          inputMode="decimal"
          autoComplete="off"
          placeholder={current ? String(current.balance) : '0.00'}
          value={value}
          aria-invalid={!!error}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
        />
        {current && <p className="hint num">Now {native(current.balance, current.currency)}</p>}
        {error && <p className="error">{error}</p>}
      </div>
      <button type="submit" className="btn primary">
        Update balance
      </button>
    </form>
  );
}
