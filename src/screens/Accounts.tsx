import { ArrowRightLeft } from 'lucide-react';
import { TransferRowItem } from '../components/ui';
import { age, daysBetween, money, native } from '../lib/format';
import { netWorth } from '../lib/stats';
import type { Account, Transfer, View } from '../lib/types';
import { POCKET_COLORS } from './Home';

export function Accounts({
  view,
  onOpenAccount,
  onOpenTransfer,
  onNewTransfer,
}: {
  view: View;
  onOpenAccount: (a: Account) => void;
  onOpenTransfer: (t: Transfer) => void;
  onNewTransfer: () => void;
}) {
  const accounts = [...view.accounts].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  const transfers = [...view.transfers].reverse().slice(0, 15);
  return (
    <>
      <p className="hero-label">All accounts</p>
      <p className="hero num">{money(netWorth(view))}</p>

      <div className="list">
        {accounts.length === 0 && <p className="empty">Add accounts on the Accounts tab of your sheet.</p>}
        {accounts.map((a, i) => {
          const days = a.updated ? daysBetween(a.updated.slice(0, 10), view.today) : 99;
          return (
            <button type="button" className="row" key={a.name} onClick={() => onOpenAccount(a)}>
              <span className="mark" style={{ background: POCKET_COLORS[i % 8] }} aria-hidden="true">
                {a.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="main">
                <p className="title">{a.name}</p>
                <p className={`meta ${days > 7 ? 'warn' : ''}`}>
                  {a.type !== 'Account' ? `${a.type.toLowerCase()}, ` : ''}
                  {age(a.updated, view.today)}
                </p>
              </span>
              <span className="amount num">
                {native(a.balance, a.currency)}
                {a.currency !== 'USD' && a.usd != null && <span className="sub">≈ {money(a.usd)}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hint">Tap an account to update its balance.</p>

      <button type="button" className="btn" style={{ marginTop: 18 }} onClick={onNewTransfer}>
        <ArrowRightLeft size={18} />
        Move money between accounts
      </button>

      <h2 className="section">Transfers</h2>
      <div className="list">
        {transfers.length === 0 && <p className="empty">No transfers yet.</p>}
        {transfers.map((t) => (
          <TransferRowItem key={t.id} t={t} onOpen={onOpenTransfer} />
        ))}
      </div>
    </>
  );
}
