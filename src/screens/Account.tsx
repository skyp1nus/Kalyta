import { memo, useMemo, useState } from 'react';
import { useOpenEntry } from '../components/hooks';
import { EntryRow } from '../components/rows';
import { Avatar, BackButton, Icon, SectionHead } from '../components/ui';
import { allEntries, touchesAccount } from '../lib/entries';
import { MONTHS, shortDate } from '../lib/format';
import { accountGroup, accountLook, isDebt, isPerson } from '../lib/meta';
import { useMoney } from '../lib/money';
import { discardOp, enqueue } from '../lib/store';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { DeleteButton } from '../sheets/common';

export const AccountScreen = memo(function AccountScreen({ view, name }: { view: View; name: string }) {
  const nav = useNav();
  const money = useMoney(view);
  const openEntry = useOpenEntry();
  const a = view.accounts.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const mine = useMemo(() => allEntries(view).filter((e) => touchesAccount(e, name)), [view, name]);
  const [armed, setArmed] = useState(false);

  if (!a) {
    return (
      <>
        <div className="scroll">
          <div className="page">
            <p style={{ margin: '40px 28px', color: 'var(--text2)' }}>
              This account is no longer in your sheet.
            </p>
          </div>
        </div>
        <div className="topbar">
          <BackButton onClick={nav.pop} />
        </div>
      </>
    );
  }

  const look = accountLook(a.name, a.type);
  const ym = view.today.slice(0, 7);
  // money in and out this month, in the account's own currency
  const inAcc = (amount: number, cur: string) =>
    cur === a.currency ? amount : (money.convert(amount, cur, a.currency) ?? 0);
  let tin = 0;
  let tout = 0;
  for (const e of mine) {
    if (!e.t.date.startsWith(ym)) continue;
    if (e.kind === 'transfer') {
      if (e.t.to.toLowerCase() === name.toLowerCase()) tin += inAcc(e.t.received, e.t.toCurrency);
      else tout += inAcc(e.t.sent, e.t.fromCurrency);
    } else if (e.kind === 'tx') {
      if (e.t.category === view.income) tin += inAcc(e.t.amount, e.t.currency);
      else tout += inAcc(e.t.amount, e.t.currency);
    }
  }
  const month = MONTHS[Number(ym.slice(5, 7)) - 1];

  return (
    <>
      <div className="scroll">
        <div
          className="glow"
          style={{
            height: 520,
            opacity: 0.85,
            background: `radial-gradient(70% 50% at 50% 18%, ${look.color}55 0%, transparent 70%), linear-gradient(180deg, var(--glow) 0%, transparent 85%)`,
          }}
        />
        <div className="page" style={{ paddingTop: 'calc(var(--st) + 53px)' }}>
          <div className="acc-hero">
            {isPerson(a.type) || accountGroup(a) === 'Cash' ? (
              <Avatar name={a.name} type={a.type} domain={a.domain} size={72} />
            ) : (
              <button
                type="button"
                aria-label="Change logo"
                onClick={() => nav.open({ kind: 'logo', account: a.name })}
              >
                <Avatar name={a.name} type={a.type} domain={a.domain} size={72} />
              </button>
            )}
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 12 }}>{a.name}</div>
            <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1.4, marginTop: 4 }}>
              {money.n(a.balance, a.currency)}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 2 }}>
              {isDebt(a)
                ? `You owe this to ${a.name}`
                : a.currency !== money.base && a.usd != null
                  ? `≈ ${money.B(a.usd)}`
                  : accountGroup(a)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
              Balance checked {shortDate(a.checked || a.updated, view.today)}
            </div>
          </div>

          <div className="acc-actions">
            <button type="button" onClick={() => nav.open({ kind: 'balance', account: a.name })}>
              <span className="c primary">
                <Icon name="tune" size={26} />
              </span>
              Update balance
            </button>
            <button type="button" onClick={() => nav.open({ kind: 'transfer', from: a.name })}>
              <span className="c">
                <Icon name="swap_horiz" size={26} />
              </span>
              Transfer
            </button>
            <button type="button" onClick={() => nav.open({ kind: 'tx', account: a.name })}>
              <span className="c">
                <Icon name="add" size={28} />
              </span>
              Add
            </button>
          </div>

          <div
            className="group r26"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 26, overflow: 'visible' }}
          >
            <div style={{ padding: '16px 18px', borderRight: '.5px solid var(--sep)' }}>
              <div style={{ fontSize: 14, color: 'var(--text2)' }}>{month} in</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, color: 'var(--green)' }}>
                {money.n(tin, a.currency, tin ? '+' : '')}
              </div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 14, color: 'var(--text2)' }}>{month} out</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
                {money.n(tout, a.currency, tout ? '−' : '')}
              </div>
            </div>
          </div>

          <SectionHead title="Transactions" />
          <div className="group">
            {mine.length === 0 && (
              <div style={{ padding: '24px 18px', textAlign: 'center', fontSize: 15, color: 'var(--text2)' }}>
                No transactions on this account yet.
              </div>
            )}
            {mine.slice(0, 30).map((e, i) => (
              <div key={`${e.kind}:${e.t.id}`}>
                {i > 0 && <div className="sep" />}
                <EntryRow entry={e} view={view} money={money} onOpen={openEntry} />
              </div>
            ))}
          </div>

          <div style={{ margin: '28px 20px 0' }}>
            <DeleteButton
              armed={armed}
              label={isPerson(a.type) ? 'Remove from debts' : 'Delete account'}
              onClick={() => {
                if (!armed) return setArmed(true);
                // held back a few seconds so Undo can take it back
                const opId = enqueue({ action: 'deleteAccount', account: a.name }, 4500);
                nav.pop();
                nav.toast(`${a.name} deleted`, () => discardOp(opId));
              }}
            />
            <div className="sheet-note" style={{ margin: '10px 8px 0', textAlign: 'center' }}>
              {mine.length
                ? `Its ${mine.length === 1 ? 'record stays' : 'records stay'} in your Sheet under “${a.name}”.`
                : 'Removes it from the Accounts tab of your Sheet.'}
            </div>
          </div>
        </div>
      </div>
      <div className="topbar">
        <BackButton onClick={nav.pop} />
      </div>
    </>
  );
});
