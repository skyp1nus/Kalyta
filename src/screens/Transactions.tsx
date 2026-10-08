import { memo, useCallback, useMemo, useState } from 'react';
import { useDeleteEntry, useOpenEntry, usePinnedGlow } from '../components/hooks';
import { SwipeRow } from '../components/rows';
import { BackButton, CircleButton, EmptyState, Icon, MonthHead } from '../components/ui';
import { allEntries, type Entry, entryKey } from '../lib/entries';
import { dayHeading, monthName } from '../lib/format';
import { categoryMeta, isIncomeCat } from '../lib/meta';
import { useMoney } from '../lib/money';
import { shiftYm } from '../lib/stats';
import { plural } from '../lib/syncState';
import type { View } from '../lib/types';
import { useNav } from '../nav';

const KINDS: Array<[string, string]> = [
  ['all', 'All'],
  ['expense', 'Expenses'],
  ['income', 'Income'],
  ['transfer', 'Transfers'],
];

function matches(e: Entry, filter: string, income: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'transfer') return e.kind === 'transfer';
  if (e.kind !== 'tx') return false;
  const isIncome = isIncomeCat(e.t.category) || e.t.category === income;
  if (filter === 'expense') return !isIncome;
  if (filter === 'income') return isIncome;
  return (e.t.category || 'Other') === filter;
}

function searchText(e: Entry): string {
  if (e.kind === 'transfer') return `${e.t.from} ${e.t.to} ${e.t.note} transfer`;
  if (e.kind === 'adjust') return `${e.t.account} balance adjustment`;
  return `${e.t.merchant} ${e.t.note} ${e.t.category} ${e.t.account}`;
}

export const Transactions = memo(function Transactions({
  view,
  ym: startYm,
  filter: startFilter,
}: {
  view: View;
  ym?: string;
  filter?: string;
}) {
  const nav = useNav();
  const glow = usePinnedGlow();
  const money = useMoney(view);
  const openEntry = useOpenEntry();
  const deleteEntry = useDeleteEntry();
  const current = view.today.slice(0, 7);
  const [ym, setYm] = useState(startYm ?? current);
  const [filter, setFilter] = useState(startFilter ?? 'all');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [swiped, setSwiped] = useState<string | null>(null);

  const entries = useMemo(() => allEntries(view), [view]);
  const earliest = entries.length ? entries[entries.length - 1].t.date.slice(0, 7) : current;
  const latest = shiftYm(current, 1);

  const inMonth = useMemo(() => entries.filter((e) => e.t.date.startsWith(ym)), [entries, ym]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inMonth.filter(
      (e) => matches(e, filter, view.income) && (!needle || searchText(e).toLowerCase().includes(needle)),
    );
  }, [inMonth, filter, q, view.income]);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Entry[]; spent: number }> = [];
    for (const e of shown) {
      const day = e.t.date.slice(0, 10);
      let g = out[out.length - 1];
      if (!g || g.day !== day) {
        g = { day, items: [], spent: 0 };
        out.push(g);
      }
      g.items.push(e);
      if (e.kind === 'tx' && !isIncomeCat(e.t.category)) g.spent += e.t.usd ?? 0;
    }
    return out;
  }, [shown, view.income]);

  const monthSpent = inMonth.reduce(
    (s, e) => s + (e.kind === 'tx' && !isIncomeCat(e.t.category) ? (e.t.usd ?? 0) : 0),
    0,
  );
  const filtered = filter !== 'all' || q.trim() !== '';
  const label = `${monthName(ym)} ${ym.slice(0, 4)}`;

  const onReveal = useCallback((e: Entry | null) => setSwiped(e ? entryKey(e) : null), []);
  const onDelete = useCallback(
    (e: Entry) => {
      setSwiped(null);
      deleteEntry(e);
    },
    [deleteEntry],
  );
  const go = (next: string) => {
    setSwiped(null);
    setYm(next);
  };

  const chips = [
    ...KINDS.map(([k, l]) => ({ k, label: l, color: '' })),
    ...view.categories.map((c) => ({
      k: c,
      label: c,
      color: categoryMeta(c).color,
    })),
  ];

  return (
    <>
      <div className="glow" ref={glow.ref} />
      <div className="scroll" onScroll={glow.onScroll}>
        <div className="page with-bar">
          <h1 className="large-title">Transactions</h1>
          <MonthHead
            title={label}
            sub={`${plural(inMonth.length, 'transaction')}${monthSpent ? ` · ${money.B(monthSpent, '−')}` : ''}`}
            canPrev={ym > earliest}
            canNext={ym < latest}
            onPrev={() => go(shiftYm(ym, -1))}
            onNext={() => go(shiftYm(ym, 1))}
          />
          <div className={`collapse ${showFilters ? '' : 'closed'}`}>
            <div>
              <div className="chips">
                {chips.map((c) => (
                  <button
                    key={c.k}
                    type="button"
                    aria-pressed={filter === c.k}
                    className={`chip ${filter === c.k ? 'on' : ''}`}
                    onClick={() => {
                      setSwiped(null);
                      setFilter(c.k);
                    }}
                  >
                    {c.color && <span className="dot" style={{ background: c.color }} />}
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {groups.map((g) => (
            <section key={g.day} aria-label={dayHeading(g.day, view.today)}>
              <div className="day-head">
                <span className="dl">{dayHeading(g.day, view.today)}</span>
                <span className="dt">{g.spent ? money.B(g.spent, '−') : ''}</span>
              </div>
              <div className="group r26">
                {g.items.map((e, i) => (
                  <div key={entryKey(e)}>
                    {i > 0 && <div className="sep" />}
                    <SwipeRow
                      entry={e}
                      view={view}
                      money={money}
                      open={swiped === entryKey(e)}
                      onOpen={openEntry}
                      onReveal={onReveal}
                      onDelete={onDelete}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {groups.length === 0 &&
            (filtered ? (
              <EmptyState
                icon="search_off"
                title="Nothing found"
                text={`No records match these filters in ${label}.`}
                action="Clear filters"
                onAction={() => {
                  setFilter('all');
                  setQ('');
                }}
              />
            ) : (
              <EmptyState
                icon="receipt_long"
                title="No transactions"
                text={`Nothing recorded in ${label} yet.`}
                action="Add transaction"
                onAction={() => nav.open({ kind: 'tx' })}
              />
            ))}
        </div>
      </div>

      <div className="topbar">
        <BackButton onClick={nav.pop} />
        <div className="pill">
          <button type="button" className="pill-seg" aria-label="This month" onClick={() => go(current)}>
            <Icon name="calendar_today" size={23} />
          </button>
          <button
            type="button"
            className="pill-seg"
            aria-label={showFilters ? 'Hide filters' : 'Show filters'}
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Icon name="filter_list" />
          </button>
        </div>
      </div>

      <div className="fade-bottom" style={{ height: 'calc(130px + var(--sb))' }} />
      <div className="bottom-bar">
        <label className="search">
          <Icon name="search" size={22} style={{ color: 'var(--text2)' }} />
          <input
            value={q}
            type="search"
            enterKeyHint="search"
            placeholder="Search places, notes"
            aria-label="Search"
            onChange={(e) => {
              setSwiped(null);
              setQ(e.target.value);
            }}
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ('')}
              style={{ display: 'grid' }}
            >
              <Icon name="cancel" size={20} fill style={{ color: 'var(--text2)' }} />
            </button>
          )}
        </label>
        <CircleButton
          icon="add"
          label="New transaction"
          size="mid"
          iconSize={28}
          onClick={() => nav.open({ kind: 'tx' })}
        />
      </div>
    </>
  );
});
