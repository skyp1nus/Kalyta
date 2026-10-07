import { CategoryBars, Tile, TransferRowItem, TxRowItem } from '../components/ui';
import { daysBetween, money, monthName, native, SHORT_MONTHS, signedMoney } from '../lib/format';
import { categoryTotals, daysIn, monthStats, netWorth, shiftYm } from '../lib/stats';
import type { Transfer, Tx, View } from '../lib/types';

export const POCKET_COLORS = [
  '#1D9E75',
  '#BA7517',
  '#7F77DD',
  '#D4537E',
  '#378ADD',
  '#D85A30',
  '#639922',
  '#888780',
];

export function Home({
  view,
  onOpenTx,
  onOpenTransfer,
  onSeeAll,
  onAccounts,
}: {
  view: View;
  onOpenTx: (t: Tx) => void;
  onOpenTransfer: (t: Transfer) => void;
  onSeeAll: () => void;
  onAccounts: () => void;
}) {
  const ym = view.today.slice(0, 7);
  const day = Number(view.today.slice(8, 10));
  const dim = daysIn(ym);
  const cur = monthStats(view, ym);
  const prev = monthStats(view, shiftYm(ym, -1));
  const accounts = [...view.accounts].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  const positive = accounts.reduce((s, a) => s + Math.max(0, a.usd ?? 0), 0);
  const stale = accounts.filter((a) => !a.updated || daysBetween(a.updated.slice(0, 10), view.today) > 7);

  const months = Array.from({ length: 6 }, (_, i) => monthStats(view, shiftYm(ym, i - 5)));
  const top = Math.max(1, ...months.map((m) => Math.max(m.spent, m.earned)));

  const recent: Array<{ kind: 'tx'; t: Tx } | { kind: 'tr'; t: Transfer }> = [
    ...view.tx.slice(-8).map((t) => ({ kind: 'tx' as const, t })),
    ...view.transfers.slice(-3).map((t) => ({ kind: 'tr' as const, t })),
  ]
    .sort((a, b) => (a.t.date < b.t.date ? 1 : -1))
    .slice(0, 5);

  return (
    <>
      <section aria-label="Net worth">
        <p className="hero-label">Net worth</p>
        <p className="hero num">{money(netWorth(view))}</p>
        <button
          type="button"
          className="pockets"
          onClick={onAccounts}
          aria-label="Open accounts"
          style={{ width: '100%', border: 0, padding: 0, cursor: 'pointer', background: 'none' }}
        >
          {accounts.map((a, i) =>
            (a.usd ?? 0) > 0 ? (
              <span
                key={a.name}
                style={{ width: `${((a.usd ?? 0) / positive) * 100}%`, background: POCKET_COLORS[i % 8] }}
              />
            ) : null,
          )}
        </button>
        <ul className="pocket-legend">
          {accounts.map((a, i) => (
            <li key={a.name}>
              <span className="swatch" style={{ background: POCKET_COLORS[i % 8] }} />
              {a.name}{' '}
              <span className="muted num">
                {a.currency === 'USD' ? money(a.usd) : native(a.balance, a.currency)}
              </span>
            </li>
          ))}
        </ul>
        {stale.length > 0 && (
          <p className="hint warn">
            {stale.map((a) => a.name).join(', ')} not updated for over a week.{' '}
            <button type="button" className="link" onClick={onAccounts}>
              Update
            </button>
          </p>
        )}
      </section>

      <h2 className="section">
        {monthName(ym)} so far
        <span className="aside">
          day {day} of {dim}
        </span>
      </h2>
      <div className="tiles">
        <Tile label="Spent" value={money(cur.spent)} sub={`${cur.spending.length} entries`} />
        <Tile
          label="Income"
          value={cur.earned ? money(cur.earned) : '–'}
          sub={`last month ${money(prev.earned)}`}
        />
        <Tile
          label="Per day"
          value={money(cur.spent / day)}
          sub={`last month ${money(prev.spent / daysIn(prev.ym))}`}
        />
        <Tile
          label="On pace for"
          value={money((cur.spent / day) * dim)}
          sub={`last month ${money(prev.spent)}`}
        />
      </div>

      <h2 className="section">Where it went</h2>
      <CategoryBars totals={categoryTotals(view, cur.spending)} total={cur.spent} />

      <h2 className="section">Spent and earned, 6 months</h2>
      <div className="legend">
        <span>
          <span className="swatch" style={{ background: 'var(--spent)' }} />
          Spent
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--earned)' }} />
          Earned
        </span>
      </div>
      <div className="cols" role="img" aria-label="Spent and earned per month for the last six months">
        {months.map((m) => (
          <div className="col" key={m.ym}>
            <span
              style={{ height: `${(m.spent / top) * 100}%`, background: 'var(--spent)' }}
              title={`Spent ${money(m.spent)}`}
            />
            <span
              style={{ height: `${(m.earned / top) * 100}%`, background: 'var(--earned)' }}
              title={`Earned ${money(m.earned)}`}
            />
          </div>
        ))}
      </div>
      <div className="cols col-labels">
        {months.map((m) => {
          const net = m.earned - m.spent;
          const current = m.ym === ym;
          return (
            <div key={m.ym}>
              {SHORT_MONTHS[Number(m.ym.slice(5, 7)) - 1]}
              <br />
              <span
                className={`num ${current || (!m.spent && !m.earned) ? 'muted' : net >= 0 ? 'good' : 'bad'}`}
              >
                {current ? 'now' : m.spent || m.earned ? signedMoney(net) : '–'}
              </span>
            </div>
          );
        })}
      </div>

      <h2 className="section">
        Recent
        <button type="button" className="link" onClick={onSeeAll}>
          See all
        </button>
      </h2>
      <div className="list">
        {recent.length === 0 && <p className="empty">Nothing yet. Tap + to add your first entry.</p>}
        {recent.map((r) =>
          r.kind === 'tx' ? (
            <TxRowItem key={r.t.id} t={r.t} view={view} onOpen={onOpenTx} />
          ) : (
            <TransferRowItem key={r.t.id} t={r.t} onOpen={onOpenTransfer} />
          ),
        )}
      </div>
    </>
  );
}
