import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CategoryBars, Tile, TransferRowItem, TxRowItem } from '../components/ui';
import { dayHeading, money, monthName, signedMoney } from '../lib/format';
import { categoryTotals, groupBy, monthStats, shiftYm, title } from '../lib/stats';
import type { Transfer, Tx, View } from '../lib/types';

type Entry = { kind: 'tx'; t: Tx } | { kind: 'tr'; t: Transfer };

export function Activity({
  view,
  ym,
  setYm,
  onOpenTx,
  onOpenTransfer,
}: {
  view: View;
  ym: string;
  setYm: (ym: string) => void;
  onOpenTx: (t: Tx) => void;
  onOpenTransfer: (t: Transfer) => void;
}) {
  const s = monthStats(view, ym);
  const prev = monthStats(view, shiftYm(ym, -1));
  const net = s.earned - s.spent;
  const latestYm = view.today.slice(0, 7);
  const earliest = view.tx[0]?.date.slice(0, 7) ?? latestYm;

  const entries: Entry[] = [
    ...s.rows.map((t) => ({ kind: 'tx' as const, t })),
    ...view.transfers.filter((t) => t.date.startsWith(ym)).map((t) => ({ kind: 'tr' as const, t })),
  ].sort((a, b) => (a.t.date < b.t.date ? 1 : -1));
  const days: Array<{ day: string; items: Entry[]; total: number }> = [];
  for (const e of entries) {
    const day = e.t.date.slice(0, 10);
    let g = days[days.length - 1];
    if (!g || g.day !== day) {
      g = { day, items: [], total: 0 };
      days.push(g);
    }
    g.items.push(e);
    if (e.kind === 'tx' && e.t.category !== view.income) g.total += e.t.usd ?? 0;
  }

  const vs = prev.spent ? Math.round((s.spent / prev.spent - 1) * 100) : null;
  const merchants = groupBy(s.spending, (t) => title(t)).slice(0, 6);
  const byAccount = groupBy(s.spending, (t) => t.account);

  return (
    <>
      <div className="month-switch">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous month"
          disabled={ym <= earliest}
          onClick={() => setYm(shiftYm(ym, -1))}
        >
          <ChevronLeft size={20} />
        </button>
        <h1>
          {monthName(ym)} {ym.slice(0, 4)}
        </h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next month"
          disabled={ym >= latestYm}
          onClick={() => setYm(shiftYm(ym, 1))}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="tiles">
        <Tile
          label="Spent"
          value={money(s.spent)}
          sub={
            vs == null
              ? 'nothing last month'
              : `${vs >= 0 ? '+' : '−'}${Math.abs(vs)}% vs ${monthName(prev.ym)}`
          }
        />
        <Tile
          label="Income"
          value={s.earned ? money(s.earned) : '–'}
          sub={
            groupBy(s.income, (t) => t.note || t.merchant)
              .slice(0, 2)
              .map((g) => g.name)
              .join(', ') || 'none yet'
          }
        />
        <Tile
          label="Net"
          value={s.spent || s.earned ? signedMoney(net) : '–'}
          tone={net < 0 ? 'bad' : net > 0 ? 'good' : undefined}
          sub={s.earned ? `${Math.round((net / s.earned) * 100)}% of income kept` : undefined}
        />
        <Tile
          label="Entries"
          value={String(s.spending.length)}
          sub={s.spending.length ? `${money(s.spent / s.spending.length)} on average` : undefined}
        />
      </div>

      <h2 className="section">By category</h2>
      <CategoryBars totals={categoryTotals(view, s.spending)} total={s.spent} />

      <h2 className="section">
        Entries <span className="aside">{entries.length}</span>
      </h2>
      {days.length === 0 && (
        <div className="list">
          <p className="empty">No entries in {monthName(ym)}.</p>
        </div>
      )}
      {days.map((g) => (
        <section key={g.day} aria-label={dayHeading(g.day, view.today)}>
          <p className="day">
            <span>{dayHeading(g.day, view.today)}</span>
            {g.total > 0 && <span className="num">{money(g.total)}</span>}
          </p>
          <div className="list">
            {g.items.map((e) =>
              e.kind === 'tx' ? (
                <TxRowItem key={e.t.id} t={e.t} view={view} onOpen={onOpenTx} />
              ) : (
                <TransferRowItem key={e.t.id} t={e.t} onOpen={onOpenTransfer} />
              ),
            )}
          </div>
        </section>
      ))}

      {merchants.length > 0 && (
        <>
          <h2 className="section">Top places</h2>
          <div className="list">
            {merchants.map((m) => (
              <div className="kv" key={m.name}>
                <span>
                  {m.name} <span className="muted">×{m.count}</span>
                </span>
                <span className="num">{money(m.value)}</span>
              </div>
            ))}
          </div>
          <h2 className="section">By account</h2>
          <div className="list">
            {byAccount.map((m) => (
              <div className="kv" key={m.name}>
                <span>
                  {m.name} <span className="muted">×{m.count}</span>
                </span>
                <span className="num">{money(m.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
