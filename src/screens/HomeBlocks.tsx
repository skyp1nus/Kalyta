import { Icon, SectionHead } from '../components/ui';
import { categoryMeta } from '../lib/meta';
import type { Money } from '../lib/money';
import { usePrefs } from '../lib/prefs';
import { usePrivacy } from '../lib/privacy';
import { needsReview } from '../lib/rules';
import { monthSummary } from '../lib/stats';
import { BUDGET_COLOR, BUDGET_TEXT, budgetState, dShort, dWeekday, hasBudgets, subStates } from '../lib/subs';
import type { View } from '../lib/types';
import { useNav } from '../nav';

function Pace({ left }: { left: number }) {
  return <i className="pace" style={{ left: `${left}%` }} />;
}

export function BudgetsBlock({ view, money }: { view: View; money: Money }) {
  const nav = useNav();
  const has = hasBudgets(view);
  const ym = view.today.slice(0, 7);
  const m = monthSummary(view, ym);
  const day = m.passed;
  const pace = (day / m.dim) * 100;
  const spent = new Map(m.cats);
  const b = view.budgets;
  const rows = Object.entries(b.cats)
    .filter(([, lim]) => lim > 0)
    .map(([k, lim]) => {
      const v = spent.get(k) ?? 0;
      return { k, v, lim, ...budgetState(v, lim), meta: categoryMeta(k, view.income) };
    })
    .sort((x, y) => y.p - x.p)
    .slice(0, 4);
  const total = b.total > 0 ? budgetState(m.spent, b.total) : null;

  return (
    <>
      <SectionHead
        title="Budgets"
        action={
          has && (
            <button type="button" className="link-btn" onClick={() => nav.open({ kind: 'budgets' })}>
              Edit
            </button>
          )
        }
      />
      <div className="group">
        {has ? (
          <>
            {total && (
              <button type="button" className="bud-total tap" onClick={() => nav.push({ name: 'stats' })}>
                <span className="bud-head">
                  <span style={{ fontSize: 17, fontWeight: 600 }}>All spending</span>
                  <span style={{ fontSize: 15, color: 'var(--text2)' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: total.st === 'ok' ? 'var(--text)' : BUDGET_TEXT[total.st],
                      }}
                    >
                      {money.B(m.spent)}
                    </span>{' '}
                    of {money.B(b.total)}
                  </span>
                </span>
                <span className="bud-bar big">
                  <i style={{ width: `${total.w}%`, background: BUDGET_COLOR[total.st] }} />
                  <Pace left={pace} />
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    marginTop: 9,
                    color: total.st === 'over' ? 'var(--red)' : 'var(--text2)',
                  }}
                >
                  {total.st === 'over'
                    ? `${money.B(m.spent - b.total)} over the monthly limit`
                    : `${money.B(b.total - m.spent)} left · ${m.dim - day} days to go`}
                </span>
              </button>
            )}
            {rows.map((r, i) => (
              <div key={r.k}>
                {(i > 0 || total) && <div className="sep" style={{ marginLeft: 58 }} />}
                <button type="button" className="bud-row tap" onClick={() => nav.push({ name: 'stats' })}>
                  <span className="ic" style={{ background: r.meta.color }}>
                    <Icon name={r.meta.icon} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="bud-head">
                      <span style={{ fontSize: 15 }}>{r.k}</span>
                      <span
                        style={{
                          fontSize: 13,
                          color: BUDGET_TEXT[r.st],
                          fontWeight: r.st === 'ok' ? 400 : 600,
                        }}
                      >
                        {r.st === 'over'
                          ? `${money.B(r.v - r.lim)} over`
                          : `${money.B(r.v)} of ${money.B(r.lim)}`}
                      </span>
                    </span>
                    <span className="bud-bar">
                      <i style={{ width: `${r.w}%`, background: BUDGET_COLOR[r.st] }} />
                      <Pace left={pace} />
                    </span>
                  </span>
                </button>
              </div>
            ))}
            <div className="bud-legend">
              <i />
              Expected by today · day {day} of {m.dim}
            </div>
          </>
        ) : (
          <div className="block-empty">
            <Icon name="savings" size={40} style={{ color: 'var(--text3)' }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 10 }}>No budgets yet</div>
            <div
              style={{
                fontSize: 15,
                color: 'var(--text2)',
                marginTop: 4,
                lineHeight: 1.4,
                textWrap: 'pretty',
              }}
            >
              Set a monthly limit for each category. Start from what you spent last month.
            </div>
            <button type="button" className="fill-btn" onClick={() => nav.open({ kind: 'budgets' })}>
              Set budgets
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function UpcomingBlock({ view, money }: { view: View; money: Money }) {
  const nav = useNav();
  const states = subStates(view).filter((s) => !s.sub.paused);
  const up = [
    ...states.filter((s) => s.overdue),
    ...states.filter((s) => s.days >= 0 && s.days <= 7).sort((a, b) => (a.next < b.next ? -1 : 1)),
  ];
  return (
    <>
      <SectionHead
        title="Upcoming"
        action={
          <button type="button" className="link-btn" onClick={() => nav.push({ name: 'subs' })}>
            View all
          </button>
        }
      />
      <div className="group">
        {up.length === 0 && (
          <div
            className="row"
            style={{ justifyContent: 'center', gap: 10, fontSize: 16, color: 'var(--text2)' }}
          >
            <Icon name="event_available" size={22} />
            Nothing due in the next 7 days
          </div>
        )}
        {up.map(({ sub: x, next, days, overdue }, i) => {
          const meta = categoryMeta(x.category, view.income);
          const usd = money.toUsd(x.amount, x.currency);
          return (
            <div key={x.id}>
              {i > 0 && <div className="sep" />}
              <button type="button" className="row" onClick={() => nav.open({ kind: 'sub', edit: x })}>
                <span className="avatar" style={{ background: meta.color }}>
                  <Icon name={meta.icon} />
                </span>
                <span className="main">
                  <span className="title ellipsis" style={{ display: 'block' }}>
                    {x.name}
                  </span>
                  <span
                    className="sub ellipsis"
                    style={{ display: 'block', color: overdue ? 'var(--red)' : undefined }}
                  >
                    {overdue
                      ? `Overdue · expected ${dShort(next)}`
                      : `${dWeekday(next, view.today)} · ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`}
                  </span>
                </span>
                <span className="amt">
                  {money.n(x.amount, x.currency)}
                  <span className="amt2" style={{ display: 'block' }}>
                    {x.currency === money.base || usd == null ? x.account : `≈ ${money.B(usd)}`}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ReviewBanner({ view, tight }: { view: View; tight: boolean }) {
  const nav = useNav();
  const n = view.tx.filter(needsReview).length;
  if (!n) return null;
  return (
    <button
      type="button"
      className="banner"
      style={{ marginTop: tight ? 12 : 28 }}
      onClick={() => nav.open({ kind: 'review' })}
    >
      <Icon name="contactless" style={{ color: '#ff9f0a' }} />
      <span className="main">
        <span className="t" style={{ display: 'block' }}>
          {n} Apple Pay record{n === 1 ? ' needs' : 's need'} a category
        </span>
        <span className="s" style={{ display: 'block' }}>
          One tap each. Kalyta can remember the choice for next time.
        </span>
      </span>
      <Icon name="chevron_right" size={22} style={{ color: 'var(--text3)' }} />
    </button>
  );
}

export function PeekHint() {
  const nav = useNav();
  const { hide } = usePrefs();
  const { peek } = usePrivacy();
  if (!hide) return null;
  return (
    <div className="center" style={{ marginTop: 14 }}>
      <button type="button" className="peek-hint" onClick={() => nav.open({ kind: 'security' })}>
        <Icon name={peek ? 'visibility' : 'visibility_off'} size={16} />
        {peek ? 'Showing amounts' : 'Touch and hold to peek'}
      </button>
    </div>
  );
}
