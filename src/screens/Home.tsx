import { memo, useMemo, useRef, useState } from 'react';
import { useOpenEntry } from '../components/hooks';
import { UpdatePill } from '../components/Overlays';
import { EntryRow } from '../components/rows';
import { Avatar, CircleButton, Icon, SectionHead, Skeleton } from '../components/ui';
import { allEntries } from '../lib/entries';
import { MONTHS, SHORT_MONTHS, shortDate } from '../lib/format';
import { isDebt } from '../lib/meta';
import { type Money, useMoney } from '../lib/money';
import { type Block, usePrefs } from '../lib/prefs';
import { comparison, monthSummary, netWorth, shiftYm, weekSpending } from '../lib/stats';
import { useStore } from '../lib/store';
import { plural, type SyncInfo, syncInfo } from '../lib/syncState';
import type { Account, View } from '../lib/types';
import { useNav } from '../nav';
import { BudgetsBlock, PeekHint, ReviewBanner, UpcomingBlock } from './HomeBlocks';

export function syncLook(info: SyncInfo) {
  switch (info.mode) {
    case 'syncing':
      return { icon: 'sync', color: 'var(--text)', spin: true, count: '' };
    case 'offline':
      return { icon: 'cloud_off', color: 'var(--warn)', spin: false, count: info.waiting || '' };
    case 'error':
      return { icon: 'sync_problem', color: 'var(--red)', spin: false, count: info.failed || '' };
    case 'pending':
      return { icon: 'cloud_upload', color: 'var(--text)', spin: false, count: info.waiting };
    default:
      return { icon: 'cloud_done', color: 'var(--text)', spin: false, count: '' };
  }
}

function Banner({ info, sheetName, onOpen }: { info: SyncInfo; sheetName: string; onOpen: () => void }) {
  let b: { icon: string; color: string; spin?: boolean; title: string; sub: string } | null = null;
  if (info.mode === 'syncing' && info.waiting) {
    b = {
      icon: 'sync',
      color: 'var(--text)',
      spin: true,
      title: 'Syncing…',
      sub: `Sending records to ${sheetName || 'your Sheet'}`,
    };
  } else if (info.mode === 'offline') {
    b = {
      icon: 'cloud_off',
      color: 'var(--warn)',
      title: 'You’re offline',
      sub: info.waiting
        ? `${plural(info.waiting, 'record')} ${info.waiting === 1 ? 'is' : 'are'} saved on this iPhone. They’ll go to your Sheet when you’re back online.`
        : 'New records will be saved on this iPhone and synced later.',
    };
  } else if (info.mode === 'error') {
    b = info.failed
      ? {
          icon: 'sync_problem',
          color: 'var(--red)',
          title: `${plural(info.failed, 'record')} didn’t reach your Sheet`,
          sub: 'Google Sheets returned an error. Tap to review and retry.',
        }
      : { icon: 'sync_problem', color: 'var(--red)', title: 'Can’t reach your Sheet', sub: info.error };
  }
  if (!b) return null;
  return (
    <button type="button" className="banner" onClick={onOpen}>
      <Icon name={b.icon} className={b.spin ? 'spin' : ''} style={{ color: b.color }} />
      <span className="main">
        <span className="t" style={{ display: 'block' }}>
          {b.title}
        </span>
        <span className="s" style={{ display: 'block' }}>
          {b.sub}
        </span>
      </span>
      <Icon name="chevron_right" size={22} style={{ color: 'var(--text3)' }} />
    </button>
  );
}

function HeroPager({ view, money }: { view: View; money: Money }) {
  const nav = useNav();
  const [page, setPage] = useState(0);
  const ym = view.today.slice(0, 7);
  const m = monthSummary(view, ym);
  const cmp = comparison(view, m);
  const nw = netWorth(view);
  const debts = -view.accounts.filter(isDebt).reduce((s, a) => s + (a.usd ?? 0), 0);
  const assets = nw + debts;
  const dq = cmp.base && m.spent ? Math.round((m.spent / cmp.base - 1) * 100) : null;
  const month = MONTHS[Number(ym.slice(5, 7)) - 1];
  const pages = [
    {
      value: money.B(nw, nw < 0 ? '−' : ''),
      label: 'Net worth',
      sub:
        debts > 0
          ? `Assets ${money.B(assets)} · You owe ${money.B(debts)}`
          : plural(view.accounts.length, 'account'),
      go: () => nav.push({ name: 'accounts' }),
    },
    {
      value: money.B(m.spent, m.spent ? '−' : ''),
      label: `Spent in ${month}`,
      sub: !m.spent
        ? 'Nothing yet'
        : dq == null
          ? plural(m.exp.length, 'expense')
          : dq === 0
            ? `Same as ${cmp.label}`
            : `${Math.abs(dq)}% ${dq < 0 ? 'less' : 'more'} than ${cmp.label}`,
      go: () => nav.push({ name: 'stats' }),
    },
    {
      value: money.B(m.income, m.income ? '+' : ''),
      label: `Income in ${month}`,
      sub: plural(m.inc.length, 'payment'),
      go: () => nav.push({ name: 'stats' }),
    },
  ];
  return (
    <>
      <div
        className="hero-pager"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== page) setPage(i);
        }}
      >
        {pages.map((p) => (
          <button type="button" key={p.label} className="hero-page" onClick={p.go}>
            <span className="hero-value">{p.value}</span>
            <span className="hero-label">{p.label}</span>
            <span className="hero-sub">{p.sub}</span>
          </button>
        ))}
      </div>
      <div className="dots" aria-hidden="true">
        {pages.map((p, i) => (
          <span key={p.label} className={i === page ? 'on' : ''} />
        ))}
      </div>
    </>
  );
}

function Cards({ view, money }: { view: View; money: Money }) {
  const nav = useNav();
  const week = weekSpending(view);
  const wmax = Math.max(1, ...week.days);
  const ym = view.today.slice(0, 7);
  const m = monthSummary(view, ym);
  const prev = monthSummary(view, shiftYm(ym, -1));
  const ratio = prev.spent ? m.spent / prev.spent : 0;
  const deg = Math.min(1, ratio) * 180;
  return (
    <div className="grid2">
      <button type="button" className="widget" onClick={() => nav.push({ name: 'transactions' })}>
        <span className="wt">
          <Icon name="receipt_long" />
          Spent
        </span>
        <span className="ws">This week</span>
        <span className="wv">{money.B(week.days.reduce((a, b) => a + b, 0))}</span>
        <span className="week">
          {week.days.map((v, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed Monday to Sunday
            <span key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span className="bar">
                <i style={{ height: v ? Math.max(5, (v / wmax) * 44) : 0, animationDelay: `${i * 30}ms` }} />
              </span>
              <span className={`l ${i === week.todayIndex ? 'today' : ''}`}>{'MTWTFSS'[i]}</span>
            </span>
          ))}
        </span>
      </button>
      <button type="button" className="widget" onClick={() => nav.push({ name: 'stats' })}>
        <span className="wt">
          <Icon name="donut_small" />
          {MONTHS[Number(ym.slice(5, 7)) - 1]}
        </span>
        <span className="ws">This month</span>
        <span className="wv">{money.B(m.spent)}</span>
        <span className="gauge">
          <span
            className="ring"
            style={{
              display: 'block',
              background: `conic-gradient(from -90deg, var(--text) 0deg ${deg}deg, var(--track) ${deg}deg 180deg, transparent 180deg)`,
            }}
          />
          <span className="lbl">
            {prev.spent
              ? `${Math.round(ratio * 100)}% of ${SHORT_MONTHS[Number(prev.ym.slice(5, 7)) - 1]}`
              : ''}
          </span>
        </span>
      </button>
    </div>
  );
}

function AccountRows({
  accounts,
  money,
  today,
  debts,
}: {
  accounts: Account[];
  money: Money;
  today: string;
  debts?: boolean;
}) {
  const nav = useNav();
  return (
    <div className="group">
      {accounts.map((a, i) => (
        <div key={a.name}>
          {i > 0 && <div className="sep" />}
          <button
            type="button"
            className="row"
            onClick={() => nav.push({ name: 'account', account: a.name })}
          >
            <Avatar name={a.name} type={a.type} domain={a.domain} />
            <span className="main">
              <span className="title">{a.name}</span>
              <span className="sub" style={{ display: 'block' }}>
                {debts
                  ? `You owe · since ${shortDate(a.checked || a.updated, today)}`
                  : a.currency === money.base || a.usd == null
                    ? a.currency
                    : `${a.currency} · ≈ ${money.B(Math.abs(a.usd))}`}
              </span>
            </span>
            <span className="amt">{money.n(a.balance, a.currency)}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

const HomeBody = memo(function HomeBody({ view, order }: { view: View; order: Block[] }) {
  const nav = useNav();
  const money = useMoney(view);
  const openEntry = useOpenEntry();
  const info = syncInfo(useStore());
  const entries = useMemo(() => allEntries(view), [view]);
  const ym = view.today.slice(0, 7);
  const places = monthSummary(view, ym).places.slice(0, 3);
  const own = view.accounts.filter((a) => !isDebt(a));
  const debts = view.accounts.filter(isDebt);

  const blocks: Record<Block, React.ReactNode> = {
    cards: <Cards view={view} money={money} />,
    budgets: <BudgetsBlock view={view} money={money} />,
    upcoming: <UpcomingBlock view={view} money={money} />,
    accounts: own.length > 0 && (
      <>
        <SectionHead
          title="Accounts"
          action={
            <button type="button" className="link-btn" onClick={() => nav.push({ name: 'accounts' })}>
              View all
            </button>
          }
        />
        <AccountRows accounts={own} money={money} today={view.today} />
      </>
    ),
    debts: debts.length > 0 && (
      <>
        <SectionHead title="Debts" />
        <AccountRows accounts={debts} money={money} today={view.today} debts />
      </>
    ),
    recent: (
      <>
        <SectionHead
          title="Recent transactions"
          action={
            <button type="button" className="link-btn" onClick={() => nav.push({ name: 'transactions' })}>
              View all
            </button>
          }
        />
        <div className="group">
          {entries.length === 0 && (
            <button
              type="button"
              className="row"
              style={{ justifyContent: 'center', gap: 10 }}
              onClick={() => nav.open({ kind: 'tx' })}
            >
              <Icon name="add_circle" style={{ color: 'var(--text2)' }} />
              Add your first expense
            </button>
          )}
          {entries.slice(0, 4).map((e, i) => (
            <div key={`${e.kind}:${e.t.id}`}>
              {i > 0 && <div className="sep" />}
              <EntryRow entry={e} view={view} money={money} onOpen={openEntry} />
            </div>
          ))}
        </div>
      </>
    ),
    places: places.length > 0 && (
      <>
        <SectionHead
          title="Top places"
          action={
            <button type="button" className="link-btn" onClick={() => nav.push({ name: 'stats' })}>
              {MONTHS[Number(ym.slice(5, 7)) - 1]}
            </button>
          }
        />
        <div className="group">
          {places.map((p, i) => (
            <div key={p.name}>
              {i > 0 && <div className="sep" style={{ marginLeft: 52 }} />}
              <div className="row">
                <span className="rank">{i + 1}</span>
                <span className="main">
                  <span className="title ellipsis">{p.name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {plural(p.count, 'visit')}
                  </span>
                </span>
                <span className="amt">{money.B(p.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  };

  return (
    <>
      <HeroPager view={view} money={money} />
      <PeekHint />
      <Banner info={info} sheetName={view.sheetName} onOpen={() => nav.open({ kind: 'sync' })} />
      <ReviewBanner
        view={view}
        tight={
          info.mode === 'offline' || info.mode === 'error' || (info.mode === 'syncing' && info.waiting > 0)
        }
      />
      {order.map((k) => (
        <div key={k}>{blocks[k]}</div>
      ))}
      <div className="center" style={{ marginTop: 30 }}>
        <button
          type="button"
          className="soft-btn"
          style={{ height: 48 }}
          onClick={() => nav.open({ kind: 'widgets' })}
        >
          <Icon name="tune" size={22} />
          Customize home
        </button>
      </div>
    </>
  );
});

function HomeSkeleton() {
  return (
    <Skeleton>
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 22 }}
      >
        <i style={{ width: 210, height: 56, borderRadius: 16 }} />
        <i style={{ width: 90, height: 14, borderRadius: 7 }} />
      </div>
      <div className="grid2" style={{ marginTop: 46 }}>
        <i style={{ height: 176, borderRadius: 28 }} />
        <i style={{ height: 176, borderRadius: 28 }} />
      </div>
      <i style={{ margin: '30px 20px 0', height: 300, borderRadius: 28 }} />
    </Skeleton>
  );
}

// Grey glow behind Home: base gradient plus three slowly drifting blobs (CSS animations on transform/opacity).
// It lives outside the scroll area and is pinned to the top of the screen, so the pull-down bounce
// slides the content over it with no seam; scrolling up moves it along with the content.
const HomeBackdrop = memo(function HomeBackdrop({ innerRef }: { innerRef: React.Ref<HTMLDivElement> }) {
  return (
    <div className="home-bg" ref={innerRef} aria-hidden="true">
      <div className="home-bg-base" />
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
    </div>
  );
});

export const Home = memo(function Home({ view }: { view: View | null }) {
  const bgRef = useRef<HTMLDivElement>(null);
  const bgY = useRef(0);
  const nav = useNav();
  const s = useStore();
  const prefs = usePrefs();
  const info = syncInfo(s);
  const pill = syncLook(info);
  const order = useMemo(
    () => prefs.order.filter((b) => !prefs.hidden.includes(b)),
    [prefs.order, prefs.hidden],
  );

  return (
    <>
      <HomeBackdrop innerRef={bgRef} />
      <div
        className="scroll"
        onScroll={(e) => {
          // follow the content when scrolling up; stay pinned during the pull-down bounce.
          // Past its own height the glow is off screen, so stop touching it.
          const y = Math.min(Math.max(0, e.currentTarget.scrollTop), 720);
          if (y === bgY.current) return;
          bgY.current = y;
          if (bgRef.current) bgRef.current.style.transform = `translate3d(0,${-y}px,0)`;
        }}
      >
        <div className="page home">
          {view ? (
            <HomeBody view={view} order={order} />
          ) : (
            <>
              <HomeSkeleton />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 18,
                  fontSize: 14,
                  color: 'var(--text2)',
                }}
              >
                <Icon name="progress_activity" size={18} className="spin" />
                Loading from Google Sheet…
              </div>
            </>
          )}
        </div>
      </div>

      <div className="topbar">
        <div className="pill">
          <button
            type="button"
            className="pill-seg"
            aria-label="Settings"
            onClick={() => nav.open({ kind: 'settings' })}
          >
            <Icon name="settings" />
          </button>
          <button
            type="button"
            className="pill-sync"
            aria-label="Sync status"
            style={{ color: pill.color }}
            onClick={() => nav.open({ kind: 'sync' })}
          >
            <Icon name={pill.icon} size={22} className={pill.spin ? 'spin' : ''} />
            {pill.count}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <CircleButton
            icon="receipt_long"
            label="Transactions"
            iconSize={23}
            onClick={() => nav.push({ name: 'transactions' })}
          />
          <CircleButton
            icon="pie_chart"
            label="Statistics"
            iconSize={23}
            onClick={() => nav.push({ name: 'stats' })}
          />
        </div>
      </div>

      <UpdatePill />
      <div className="fade-bottom home" />
      <div className="bottom-cluster">
        <CircleButton
          icon="swap_horiz"
          label="Transfer"
          size="big"
          iconSize={28}
          onClick={() => nav.open({ kind: 'transfer' })}
        />
        <button
          type="button"
          className="fab"
          aria-label="New transaction"
          onClick={() => nav.open({ kind: 'tx' })}
        >
          <Icon name="add" />
        </button>
        <CircleButton
          icon="currency_exchange"
          label="Quick convert"
          size="big"
          iconSize={27}
          onClick={() => nav.open({ kind: 'convert' })}
        />
      </div>
    </>
  );
});
