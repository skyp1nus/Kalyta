import { useState } from 'react';
import { Avatar, Icon, Segmented } from '../components/ui';
import { parseAmount } from '../lib/format';
import { BANK_REGIONS, BANKS, type Bank, type BankRegion, CURRENCIES } from '../lib/meta';
import { useMoney } from '../lib/money';
import { enqueue } from '../lib/store';
import type { AccountType, View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SaveButton, SheetHead } from './common';

const TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'Account', label: 'Account' },
  { value: 'Owed to you', label: 'Owed to me' },
  { value: 'You owe', label: 'I owe' },
];

const cleanDomain = (d: string) =>
  d
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

// New account, card or debt. Accounts can start from a known bank (name, logo, currency);
// people get a blobatar made from their name.
export function AccountSheet({ view, type: startType }: { view: View; type?: AccountType }) {
  const nav = useNav();
  const money = useMoney(view);
  const [type, setType] = useState<AccountType>(startType ?? 'Account');
  const [name, setName] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);
  const [domain, setDomain] = useState('');
  const [currency, setCurrency] = useState(CURRENCIES.includes(money.base) ? money.base : 'USD');
  const [balance, setBalance] = useState('');
  const [region, setRegion] = useState<BankRegion>('Global');

  const person = type !== 'Account';
  const n = name.trim();
  const dup = !!n && view.accounts.some((a) => a.name.toLowerCase() === n.toLowerCase());
  const num = balance.trim() === '' ? 0 : parseAmount(balance);
  const okNum = Number.isFinite(num) && num >= 0;
  const d = cleanDomain(domain);
  const okDomain = !d || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);
  const valid = !!n && !dup && okNum && okDomain;

  function pickBank(b: Bank) {
    // replace the name only if it was empty or came from the previous pick
    if (!n || n === bank?.name) setName(b.name);
    setBank(b);
    setDomain(b.domain);
    if (b.currency) setCurrency(b.currency);
  }

  function save() {
    if (!valid) return;
    enqueue({
      action: 'addAccount',
      acc: { name: n, type, currency, balance: String(num), domain: person ? '' : d },
    });
    nav.close();
    nav.toast(person ? `${n} added to debts` : `${n} added`, undefined, {
      icon: person ? 'handshake' : 'account_balance_wallet',
      color: 'var(--green)',
    });
  }

  const question =
    type === 'You owe'
      ? 'How much you owe'
      : type === 'Owed to you'
        ? 'How much they owe you'
        : 'Balance now';

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title={person ? 'New debt' : 'New account'}
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      <Segmented label="Type" value={type} onChange={setType} options={TYPES} />

      <div className="acc-hero" style={{ padding: '18px 24px 0' }}>
        <Avatar
          key={`${type}:${n}:${d}`}
          name={n || (person ? '?' : 'Account')}
          type={type}
          domain={person ? '' : okDomain ? d : ''}
          size={72}
        />
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 12 }}>
          {n || (person ? 'New person' : 'New account')}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.2, marginTop: 2 }}>
          {money.n(okNum ? num : 0, currency)}
        </div>
        <div
          style={{ fontSize: 15, color: dup ? 'var(--red)' : 'var(--text2)', marginTop: 2, minHeight: 20 }}
        >
          {dup
            ? `You already have “${n}”`
            : person
              ? 'Not counted in your net worth'
              : currency !== money.base && okNum && num
                ? `≈ ${money.B(money.toUsd(num, currency) ?? 0)}`
                : ''}
        </div>
      </div>

      <div className="group" style={{ margin: '18px 20px 0' }}>
        <label className="kv-row">
          <span>{person ? 'Person' : 'Name'}</span>
          <input
            value={name}
            placeholder={person ? 'e.g. Alex' : 'e.g. Wise USD'}
            autoComplete="off"
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="kv-sep" />
        <label className="kv-row" style={{ gap: 8 }}>
          <span>{question}</span>
          <input
            value={balance}
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            style={{ fontWeight: 600 }}
            onChange={(e) => setBalance(e.target.value.replace(/[^0-9.,\s]/g, ''))}
          />
          <span className="value">{currency}</span>
        </label>
        {!person && (
          <>
            <div className="kv-sep" />
            <label className="kv-row">
              <span>Website</span>
              <input
                value={domain}
                placeholder="for the logo, optional"
                inputMode="url"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                style={{ color: okDomain ? undefined : 'var(--red)' }}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setBank(null);
                }}
              />
            </label>
          </>
        )}
      </div>

      <Segmented
        label="Currency"
        tight
        value={currency}
        onChange={setCurrency}
        options={[...new Set([...CURRENCIES, currency])].map((c) => ({ value: c, label: c }))}
      />

      {person ? (
        <div className="sheet-note" style={{ marginTop: 14 }}>
          The avatar is made from the name. Update the amount from the person’s page when they pay you back or
          you pay them.
        </div>
      ) : (
        <>
          <div className="sheet-section">Pick a bank or exchange</div>
          <div style={{ marginTop: -20 }}>
            <Segmented
              label="Region"
              tight
              value={region}
              onChange={setRegion}
              options={BANK_REGIONS.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div className="group bank-grid" style={{ marginTop: 12 }}>
            {BANKS.filter((b) => b.region === region).map((b) => (
              <button
                key={b.domain}
                type="button"
                className="bank-opt"
                aria-pressed={bank?.domain === b.domain}
                onClick={() => pickBank(b)}
              >
                <span className="ring">
                  <Avatar name={b.name} domain={b.domain} size={48} />
                  {bank?.domain === b.domain && (
                    <span className="tick">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </span>
                <span className="ellipsis">{b.name}</span>
              </button>
            ))}
          </div>
          <div className="sheet-note">Logos by Brandfetch. Saved to the Accounts tab of your Sheet.</div>
        </>
      )}
    </>
  );
}
