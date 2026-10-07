import { memo, useMemo } from 'react';
import { BackButton, CircleButton, EmptyState, Icon } from '../components/ui';
import { categoryMeta } from '../lib/meta';
import { type Money, useMoney } from '../lib/money';
import { newId } from '../lib/outbox';
import { getPrefs, setPrefs, usePrefs } from '../lib/prefs';
import { enqueue } from '../lib/store';
import {
  CADENCE_LABEL,
  dShort,
  findRecurring,
  monthlyFactor,
  type SubState,
  type Suggestion,
  subStates,
} from '../lib/subs';
import type { View } from '../lib/types';
import { useNav } from '../nav';

function SubRow({ s, view, money }: { s: SubState; view: View; money: Money }) {
  const nav = useNav();
  const x = s.sub;
  const meta = categoryMeta(x.category, view.income);
  const usd = money.toUsd(x.amount, x.currency);
  const priceUp = x.prev != null && x.prev !== x.amount;
  const diffUsd = priceUp ? money.toUsd(Math.abs(x.amount - (x.prev ?? 0)), x.currency) : null;
  const chip: [string, string] | null = x.paused
    ? ['Paused', '']
    : s.overdue
      ? [`Expected ${dShort(s.next)} · not found`, 'err']
      : priceUp && diffUsd != null
        ? [`${x.amount > (x.prev ?? 0) ? '+' : '−'}${money.B(diffUsd)} since last charge`, 'warn']
        : null;
  const op = x.paused ? 0.45 : 1;
  return (
    <button type="button" className="row" onClick={() => nav.open({ kind: 'sub', edit: x })}>
      <span className="avatar" style={{ background: meta.color, opacity: op }}>
        <Icon name={meta.icon} />
      </span>
      <span className="main">
        <span className="title ellipsis" style={{ display: 'block' }}>
          {x.name}
        </span>
        <span className="sub ellipsis" style={{ display: 'block' }}>
          {x.paused ? '' : `${dShort(s.next)} · `}
          {CADENCE_LABEL[x.cadence]} · {x.account}
        </span>
        {chip && <span className={`sub-chip ${chip[1]}`}>{chip[0]}</span>}
      </span>
      <span className="amt" style={{ opacity: op }}>
        {money.n(x.amount, x.currency)}
        <span className="amt2" style={{ display: 'block' }}>
          {x.currency === money.base || usd == null ? '' : `≈ ${money.B(usd)}`}
        </span>
      </span>
    </button>
  );
}

function SuggestionCard({ g, view, money }: { g: Suggestion; view: View; money: Money }) {
  const nav = useNav();
  const meta = categoryMeta(g.category, view.income);
  const usd = money.toUsd(g.amount, g.currency);
  return (
    <div className="sug-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="avatar" style={{ background: meta.color }}>
          <Icon name={meta.icon} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="ellipsis" style={{ display: 'block', fontSize: 17 }}>
            {g.name}
          </span>
          <span style={{ display: 'block', fontSize: 14, color: 'var(--text2)', marginTop: 1 }}>
            {CADENCE_LABEL[g.cadence]} · {g.account}
          </span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>
            {money.n(g.amount, g.currency)}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
            {usd != null && g.currency !== money.base ? `≈ ${money.B(usd)}` : ''}
          </span>
        </span>
      </div>
      <div className="sug-text">
        Charged {g.seen}. Next one expected {dShort(g.next)}.
      </div>
      <div className="sug-actions">
        <button
          type="button"
          className="small-btn inv"
          onClick={() => {
            enqueue({
              action: 'subscription',
              sub: {
                id: newId(),
                name: g.name,
                amount: g.amount,
                currency: g.currency,
                cadence: g.cadence,
                next: g.next,
                account: g.account,
                category: g.category,
                paused: false,
                prev: null,
              },
            });
            nav.toast(`${g.name} added to subscriptions`);
          }}
        >
          Confirm
        </button>
        <button
          type="button"
          className="small-btn"
          onClick={() => {
            setPrefs({ ignoredSubs: [...getPrefs().ignoredSubs, g.id] });
            nav.toast(`${g.name} ignored`, () =>
              setPrefs({ ignoredSubs: getPrefs().ignoredSubs.filter((k) => k !== g.id) }),
            );
          }}
        >
          Ignore
        </button>
      </div>
    </div>
  );
}

export const Subscriptions = memo(function Subscriptions({ view }: { view: View }) {
  const nav = useNav();
  const money = useMoney(view);
  const { ignoredSubs } = usePrefs();
  const states = useMemo(() => subStates(view), [view]);
  const sugs = useMemo(() => findRecurring(view, ignoredSubs), [view, ignoredSubs]);
  const active = states.filter((s) => !s.sub.paused);
  const perMonth = active.reduce(
    (a, s) => a + (money.toUsd(s.sub.amount, s.sub.currency) ?? 0) * monthlyFactor(s.sub.cadence),
    0,
  );
  const byNext = (a: SubState, b: SubState) => (a.next < b.next ? -1 : 1);
  const groups: Array<[string, string, SubState[]]> = [
    ['Overdue', 'var(--red)', active.filter((s) => s.days < 0)],
    ['Next 7 days', 'var(--text2)', active.filter((s) => s.days >= 0 && s.days <= 7)],
    ['Later', 'var(--text2)', active.filter((s) => s.days > 7)],
    ['Paused', 'var(--text2)', states.filter((s) => s.sub.paused)],
  ];
  const has = states.length > 0 || sugs.length > 0;
  const add = () => nav.open({ kind: 'sub' });

  return (
    <>
      <div className="scroll">
        <div className="glow" />
        <div className="page">
          <h1 className="large-title">Subscriptions</h1>
          {has ? (
            <>
              <div style={{ padding: '18px 20px 0' }}>
                <div style={{ fontSize: 15, color: 'var(--text2)' }}>Per month</div>
                <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.2, marginTop: 2 }}>
                  {money.B(perMonth)}
                </div>
                <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 4 }}>
                  ≈ {money.B(perMonth * 12)} a year · {active.length} active
                </div>
              </div>
              {sugs.length > 0 && (
                <>
                  <div className="section-head" style={{ margin: '28px 24px 10px' }}>
                    <h2>Looks recurring</h2>
                  </div>
                  {sugs.map((g) => (
                    <SuggestionCard key={g.id} g={g} view={view} money={money} />
                  ))}
                </>
              )}
              {groups
                .filter(([, , l]) => l.length)
                .map(([label, color, l]) => (
                  <section key={label} aria-label={label}>
                    <div className="section-head" style={{ margin: '28px 24px 10px' }}>
                      <h2 style={{ color }}>{label}</h2>
                      <span style={{ fontSize: 15, color: 'var(--text2)' }}>
                        {label === 'Paused'
                          ? ''
                          : money.B(
                              l.reduce((a, s) => a + (money.toUsd(s.sub.amount, s.sub.currency) ?? 0), 0),
                            )}
                      </span>
                    </div>
                    <div className="group">
                      {[...l].sort(byNext).map((s, i) => (
                        <div key={s.sub.id}>
                          {i > 0 && <div className="sep" />}
                          <SubRow s={s} view={view} money={money} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
            </>
          ) : (
            <EmptyState
              icon="event_repeat"
              title="No subscriptions yet"
              text="Kalyta looks for charges that repeat every week, month or year. You can also add one yourself."
              action="Add subscription"
              onAction={add}
            />
          )}
        </div>
      </div>
      <div className="topbar">
        <BackButton onClick={nav.pop} />
        <CircleButton icon="add" label="Add by hand" iconSize={26} onClick={add} />
      </div>
    </>
  );
});
