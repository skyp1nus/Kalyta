import { memo, useMemo, useState } from 'react';
import { BackButton, CircleButton, EmptyState, Icon, MonthHead } from '../components/ui';
import { saveCsv } from '../lib/csv';
import { MONTHS, monthName, SHORT_MONTHS } from '../lib/format';
import { CATEGORY_META } from '../lib/meta';
import { useMoney } from '../lib/money';
import { comparison, monthSummary, shiftYm } from '../lib/stats';
import { plural } from '../lib/syncState';
import type { View } from '../lib/types';
import { useNav } from '../nav';

const short = (ym: string) => SHORT_MONTHS[Number(ym.slice(5, 7)) - 1];

export const Statistics = memo(function Statistics({ view, ym: startYm }: { view: View; ym?: string }) {
  const nav = useNav();
  const money = useMoney(view);
  const current = view.today.slice(0, 7);
  const [ym, setYm] = useState(startYm ?? current);
  const earliest = view.tx[0]?.date.slice(0, 7) ?? current;

  const m = useMemo(() => monthSummary(view, ym), [view, ym]);
  const cmp = useMemo(() => comparison(view, m), [view, m]);
  const prev = cmp.prev;
  const months = useMemo(
    () => [-5, -4, -3, -2, -1, 0].map((k) => monthSummary(view, shiftYm(ym, k))),
    [view, ym],
  );
  const hasData = m.exp.length + m.inc.length > 0;
  const label = `${monthName(ym)} ${ym.slice(0, 4)}`;

  const dmax = Math.max(1, ...m.days);
  const spark = m.days
    .slice(0, m.passed || m.dim)
    .map((v, i) => `${((i / Math.max(1, m.dim - 1)) * 150).toFixed(1)},${(44 - (v / dmax) * 42).toFixed(1)}`)
    .join(' ');
  const dq = cmp.base ? Math.round((m.spent / cmp.base - 1) * 100) : null;
  const cmax = Math.max(1, ...months.map((x) => Math.max(x.spent, x.income)));
  const busiest = m.days.indexOf(Math.max(...m.days));
  const todayIdx = ym === current ? Number(view.today.slice(8, 10)) - 1 : -1;
  const pmax = m.places[0]?.value || 1;

  let acc = 0;
  const gap = m.cats.length > 1 ? 0.8 : 0;
  const conic = m.cats.length
    ? `conic-gradient(${m.cats
        .map(([k, v]) => {
          const a = acc;
          const b = acc + (v / m.spent) * 100;
          acc = b;
          const c = (CATEGORY_META[k] ?? CATEGORY_META.Other).color;
          return `${c} ${(a + gap / 2).toFixed(2)}% ${(b - gap / 2).toFixed(2)}%, transparent ${(b - gap / 2).toFixed(2)}% ${b.toFixed(2)}%`;
        })
        .join(', ')})`
    : 'var(--track)';
  // a running month is compared with the same days of the previous one
  const running = m.passed > 0 && m.passed < m.dim;
  const prevCats = new Map<string, number>();
  for (const t of prev.exp) {
    if (running && Number(t.date.slice(8, 10)) > m.passed) continue;
    const c = view.categories.includes(t.category) ? t.category : 'Other';
    prevCats.set(c, (prevCats.get(c) ?? 0) + (t.usd ?? 0));
  }
  const vsLabel = running ? cmp.label : short(prev.ym);

  return (
    <>
      <div className="scroll">
        <div className="glow" style={{ height: 620 }} />
        <div className="page">
          <h1 className="large-title">Statistics</h1>
          <MonthHead
            title={label}
            sub={`${plural(m.exp.length, 'expense')} · ${m.inc.length} income`}
            canPrev={ym > earliest}
            canNext={ym < current}
            onPrev={() => setYm(shiftYm(ym, -1))}
            onNext={() => setYm(shiftYm(ym, 1))}
          />

          {!hasData ? (
            <EmptyState
              icon="insert_chart"
              title="Nothing to analyze yet"
              text="Statistics appear after your first expense or income this month."
              action="Add transaction"
              onAction={() => nav.open({ kind: 'tx' })}
            />
          ) : (
            <div key={ym} style={{ animation: 'rise .4s var(--ease)' }}>
              <div className="grid2" style={{ marginTop: 22 }}>
                <div className="stat">
                  <span className="st">
                    <Icon name="south_west" />
                    Income
                  </span>
                  <span className="sv">{money.B(m.income, m.income ? '+' : '')}</span>
                  <span className="ss">{plural(m.inc.length, 'payment')}</span>
                </div>
                <div className="stat">
                  <span className="st">
                    <Icon name="north_east" />
                    Spent
                  </span>
                  <span className="sv">{money.B(m.spent, m.spent ? '−' : '')}</span>
                  <svg
                    viewBox="0 0 150 46"
                    preserveAspectRatio="none"
                    style={{ width: '100%', height: 46, marginTop: 'auto', overflow: 'visible' }}
                    aria-hidden="true"
                  >
                    <polyline
                      points={spark}
                      fill="none"
                      stroke="var(--red)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
                <div className="stat">
                  <span className="st">
                    <Icon name="equal" />
                    Difference
                  </span>
                  <span className="sv">
                    {money.B(Math.abs(m.net), m.net < 0 ? '−' : m.net > 0 ? '+' : '')}
                  </span>
                  <span
                    style={{
                      marginTop: 'auto',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      color: 'var(--text2)',
                    }}
                  >
                    <span>Income</span>
                    <span>Spent</span>
                  </span>
                  <span style={{ display: 'flex', gap: 3, height: 8, marginTop: 6 }}>
                    <i
                      style={{
                        flex: Math.max(m.income, 0.01),
                        minWidth: 6,
                        background: 'var(--green)',
                        borderRadius: 4,
                      }}
                    />
                    <i
                      style={{
                        flex: Math.max(m.spent, 0.01),
                        minWidth: 6,
                        background: 'var(--red)',
                        borderRadius: 4,
                      }}
                    />
                  </span>
                </div>
                <div className="stat">
                  <span className="st">
                    <Icon name="calendar_today" />
                    Per day
                  </span>
                  <span className="sv">{money.B(m.avg)}</span>
                  <span className="ss">
                    {short(prev.ym)}: {money.B(prev.avg)}/day
                  </span>
                </div>
              </div>

              <div className="panel">
                <div className="pt">Compared with past months</div>
                <div
                  style={{
                    fontSize: 14,
                    marginTop: 3,
                    color: dq == null ? 'var(--text2)' : dq <= 0 ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {dq == null
                    ? `Nothing spent in ${cmp.label}`
                    : dq === 0
                      ? `Same as ${cmp.label}`
                      : `${Math.abs(dq)}% ${dq < 0 ? 'less' : 'more'} spent than ${cmp.label}`}
                </div>
                <div className="compare">
                  {months.map((x, i) => {
                    const on = i === 5;
                    return (
                      <button
                        type="button"
                        key={x.ym}
                        aria-label={`${MONTHS[Number(x.ym.slice(5, 7)) - 1]}: spent ${money.B(x.spent)}, income ${money.B(x.income)}`}
                        onClick={() => x.ym >= earliest && x.ym <= current && setYm(x.ym)}
                      >
                        <span className="bars">
                          <i
                            style={{
                              height: Math.max(3, (x.spent / cmax) * 96),
                              background: 'var(--text)',
                              opacity: on ? 1 : 0.45,
                            }}
                          />
                          <i
                            style={{
                              height: Math.max(3, (x.income / cmax) * 96),
                              background: 'var(--green)',
                              opacity: on ? 1 : 0.45,
                            }}
                          />
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: on ? 700 : 400,
                            color: on ? 'var(--text)' : 'var(--text2)',
                          }}
                        >
                          {short(x.ym)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: 'var(--text)' }} />
                    Spent
                  </span>
                  <span>
                    <i style={{ background: 'var(--green)' }} />
                    Income
                  </span>
                </div>
              </div>

              {m.cats.length > 0 && (
                <div className="panel flush">
                  <div className="pt" style={{ padding: '0 18px' }}>
                    Categories
                  </div>
                  <div className="donut">
                    <div className="ring" style={{ background: conic }} />
                    <div className="mid">
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{money.B(m.spent)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>spent</div>
                    </div>
                  </div>
                  {m.cats.map(([k, v], i) => {
                    const meta = CATEGORY_META[k] ?? CATEGORY_META.Other;
                    const pv = prevCats.get(k) ?? 0;
                    const d = pv ? Math.round((v / pv - 1) * 100) : null;
                    return (
                      <div key={k}>
                        {i > 0 && <div className="sep" style={{ marginLeft: 62 }} />}
                        <button
                          type="button"
                          className="cat-row tap"
                          onClick={() => nav.push({ name: 'transactions', ym, filter: k })}
                        >
                          <span className="ic" style={{ background: meta.color }}>
                            <Icon name={meta.icon} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 16 }}>{k}</span>
                            <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)' }}>
                              {Math.round((v / m.spent) * 100)}% of spending
                            </span>
                          </span>
                          <span style={{ textAlign: 'right' }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>
                              {money.B(v)}
                            </span>
                            <span
                              style={{
                                display: 'block',
                                fontSize: 12,
                                color: d == null ? 'var(--text2)' : d > 0 ? 'var(--red)' : 'var(--green)',
                              }}
                            >
                              {d == null ? 'new' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}% vs ${vsLabel}`}
                            </span>
                          </span>
                          <Icon name="chevron_right" size={20} style={{ color: 'var(--text3)' }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {m.spent > 0 && (
                <div className="panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className="pt">By day</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      Biggest: {short(ym)} {busiest + 1} · {money.B(m.days[busiest])}
                    </div>
                  </div>
                  <div className="days" aria-hidden="true">
                    {m.days.map((v, i) => (
                      <i
                        // biome-ignore lint/suspicious/noArrayIndexKey: days of the month
                        key={i}
                        style={{
                          height: v ? Math.max(4, (v / dmax) * 96) : 3,
                          background: v ? (i === todayIdx ? 'var(--red)' : 'var(--text)') : 'var(--track)',
                          animationDelay: `${i * 12}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="day-labels" aria-hidden="true">
                    {m.days.map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: days of the month
                      <span key={i}>{[0, 9, 19, 29].includes(i) ? i + 1 : ''}</span>
                    ))}
                  </div>
                </div>
              )}

              {m.places.length > 0 && (
                <div className="panel flush">
                  <div className="pt" style={{ padding: '0 18px 6px' }}>
                    Top places
                  </div>
                  {m.places.slice(0, 5).map((p, i) => (
                    <div key={p.name} style={{ padding: '10px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <div style={{ width: 16, fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>
                          {i + 1}
                        </div>
                        <div className="ellipsis" style={{ flex: 1, fontSize: 16 }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{p.count}×</div>
                        <div style={{ fontSize: 16, fontWeight: 600, minWidth: 64, textAlign: 'right' }}>
                          {money.B(p.value)}
                        </div>
                      </div>
                      <div className="place-bar">
                        <i
                          style={{
                            width: `${Math.round((p.value / pmax) * 100)}%`,
                            animationDelay: `${i * 40}ms`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="topbar">
        <BackButton onClick={nav.pop} />
        <CircleButton
          icon="ios_share"
          label="Export this month as CSV"
          iconSize={23}
          onClick={async () => {
            const name = await saveCsv(view, ym);
            if (name) nav.toast(`${name} is ready`);
          }}
        />
      </div>
    </>
  );
});
