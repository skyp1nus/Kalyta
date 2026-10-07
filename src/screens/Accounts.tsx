import { memo } from 'react';
import { Avatar, BackButton, Icon } from '../components/ui';
import { accountGroup, accountLook, GROUPS, isDebt } from '../lib/meta';
import { useMoney } from '../lib/money';
import { netWorth } from '../lib/stats';
import type { View } from '../lib/types';
import { useNav } from '../nav';

export const Accounts = memo(function Accounts({ view }: { view: View }) {
  const nav = useNav();
  const money = useMoney(view);
  const nw = netWorth(view);
  const debts = -view.accounts.filter(isDebt).reduce((s, a) => s + (a.usd ?? 0), 0);
  const assets = nw + debts;
  const alloc = view.accounts.filter((a) => !isDebt(a) && (a.usd ?? 0) > 0);

  return (
    <>
      <div className="scroll">
        <div className="glow" />
        <div className="page">
          <h1 className="large-title">Accounts</h1>
          <div style={{ padding: '18px 20px 0' }}>
            <div style={{ fontSize: 15, color: 'var(--text2)' }}>Net worth</div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.2, marginTop: 2 }}>
              {money.B(nw, nw < 0 ? '−' : '')}
            </div>
            {alloc.length > 0 && (
              <div className="alloc" aria-hidden="true">
                {alloc.map((a) => (
                  <i
                    key={a.name}
                    style={{ flex: Math.max(a.usd ?? 0, 1), background: accountLook(a.name, a.type).color }}
                  />
                ))}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                color: 'var(--text2)',
                marginTop: 8,
              }}
            >
              <span>Assets {money.B(assets)}</span>
              {debts > 0 && <span>You owe {money.B(debts)}</span>}
            </div>
          </div>

          {view.accounts.length === 0 && (
            <p style={{ margin: '40px 28px', color: 'var(--text2)', fontSize: 16, lineHeight: 1.4 }}>
              Add accounts on the Accounts tab of your Sheet, then tap Sync now in Settings.
            </p>
          )}

          {GROUPS.map((g) => {
            const rows = view.accounts.filter((a) => accountGroup(a) === g);
            if (!rows.length) return null;
            return (
              <section key={g} aria-label={g}>
                <div className="section-head" style={{ margin: '28px 24px 10px' }}>
                  <h2>{g}</h2>
                </div>
                <div className="group">
                  {rows.map((a, i) => (
                    <div key={a.name}>
                      {i > 0 && <div className="sep" />}
                      <button
                        type="button"
                        className="row"
                        style={{ paddingRight: 14 }}
                        onClick={() => nav.push({ name: 'account', account: a.name })}
                      >
                        <Avatar name={a.name} type={a.type} domain={a.domain} />
                        <span className="main">
                          <span className="title">{a.name}</span>
                          <span className="sub" style={{ display: 'block' }}>
                            {isDebt(a) ? 'You owe' : a.currency}
                            {a.currency !== money.base && a.usd != null
                              ? ` · ≈ ${money.B(Math.abs(a.usd))}`
                              : ''}
                          </span>
                        </span>
                        <span className="amt">{money.n(a.balance, a.currency)}</span>
                        <Icon name="chevron_right" className="chev" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="topbar">
        <BackButton onClick={nav.pop} />
      </div>
    </>
  );
});
