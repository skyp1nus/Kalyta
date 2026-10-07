import { useState } from 'react';
import { Icon } from '../components/ui';
import { dayHeading } from '../lib/format';
import { ADJUST_META, categoryMeta, TRANSFER_META } from '../lib/meta';
import { type Money, useMoney } from '../lib/money';
import { discardOp, forgetDevice, getState, repairAndRetry, retryAll, sync, useStore } from '../lib/store';
import { plural, syncInfo } from '../lib/syncState';
import type { Op, View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SheetHead } from './common';

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function describe(
  op: Op,
  view: View,
  money: Money,
): { icon: string; color: string; title: string; amt: string } {
  const grey = '#8e8e93';
  switch (op.action) {
    case 'add':
    case 'update': {
      const income = op.tx.kind === 'income';
      const meta = categoryMeta(income ? view.income : op.tx.category, view.income);
      const title = op.tx.merchant || (income ? 'Income' : op.tx.category || 'Expense');
      return {
        ...meta,
        title: op.action === 'update' ? `Edit · ${title}` : title,
        amt: money.n(Number(op.tx.amount), op.tx.currency, income ? '+' : '−'),
      };
    }
    case 'delete':
      return { icon: 'delete', color: grey, title: 'Delete transaction', amt: '' };
    case 'transfer':
    case 'updateTransfer':
      return {
        ...TRANSFER_META,
        title: `${op.action === 'updateTransfer' ? 'Edit · ' : ''}${op.tr.from} → ${op.tr.to}`,
        amt: money.n(Number(op.tr.sent), op.tr.fromCurrency),
      };
    case 'deleteTransfer':
      return { icon: 'delete', color: grey, title: 'Delete transfer', amt: '' };
    case 'balance': {
      const a = view.accounts.find((x) => x.name === op.account);
      return {
        ...ADJUST_META,
        title: `${op.account} balance`,
        amt: money.n(Number(op.balance), a?.currency ?? ''),
      };
    }
    case 'deleteAdjustment':
      return { icon: 'delete', color: grey, title: 'Remove adjustment', amt: '' };
    case 'repair':
      return { icon: 'table_view', color: '#0f9d58', title: 'Recreate missing tabs', amt: '' };
    case 'budgets':
      return { icon: 'savings', color: '#30d158', title: 'Budgets', amt: '' };
    case 'subscription':
      return {
        ...categoryMeta(op.sub.category, view.income),
        title: op.sub.name,
        amt: money.n(op.sub.amount, op.sub.currency),
      };
    case 'deleteSubscription':
      return { icon: 'block', color: grey, title: 'Stop tracking a subscription', amt: '' };
    case 'rule':
      return { ...categoryMeta(op.cat, view.income), title: `Rule “${op.kw}”`, amt: op.cat };
    case 'deleteRule':
      return { icon: 'delete', color: grey, title: `Delete rule “${op.kw}”`, amt: '' };
    case 'accountDomain':
      return { icon: 'image', color: grey, title: `${op.account} logo`, amt: op.domain };
  }
}

function lastSyncLabel(ms: number | null, today: string): string {
  if (!ms) return 'Never';
  const s = stamp(ms);
  return `${dayHeading(s, today)}, ${s.slice(11, 16)}`;
}

export function SyncSheet({ view }: { view: View }) {
  const nav = useNav();
  const money = useMoney(view);
  const s = useStore();
  const info = syncInfo(s);
  const [armedOp, setArmedOp] = useState<string | null>(null);
  const [armedDisconnect, setArmedDisconnect] = useState(false);
  const sheetName = view.sheetName || 'your Sheet';
  const queue = [...s.outbox.filter((o) => o.error), ...s.outbox.filter((o) => !o.error)];
  const last = lastSyncLabel(s.lastSync, view.today);

  const hero =
    info.mode === 'syncing'
      ? {
          icon: 'sync',
          color: '#8e8e93',
          title: 'Syncing…',
          sub: `Sending ${plural(info.waiting, 'record')} to ${sheetName}.`,
        }
      : info.mode === 'offline'
        ? {
            icon: 'cloud_off',
            color: '#ff9f0a',
            title: 'You’re offline',
            sub: `${plural(info.waiting, 'record')} ${info.waiting === 1 ? 'is' : 'are'} saved on this iPhone and will be sent automatically when you’re back online.`,
          }
        : info.mode === 'error'
          ? info.failed
            ? {
                icon: 'sync_problem',
                color: '#ff453a',
                title: `${plural(info.failed, 'record')} didn’t sync`,
                sub: 'Kalyta keeps them on this iPhone. Nothing is lost.',
              }
            : { icon: 'sync_problem', color: '#ff453a', title: 'Can’t reach your Sheet', sub: info.error }
          : info.mode === 'pending'
            ? {
                icon: 'cloud_upload',
                color: '#8e8e93',
                title: 'Waiting to send',
                sub: `${plural(info.waiting, 'record')} will go to ${sheetName} in a moment.`,
              }
            : {
                icon: 'cloud_done',
                color: '#30d158',
                title: 'Everything is synced',
                sub: `Last sync ${last.toLowerCase()}. Kalyta syncs after every change.`,
              };

  async function syncNow() {
    if (s.syncing) return;
    if (!s.online && !navigator.onLine) {
      nav.toast('No connection. Kalyta retries automatically');
      return;
    }
    const before = getState().outbox.filter((o) => !o.error).length;
    await sync();
    const st = getState();
    if (!st.online || st.lastError) nav.toast(st.lastError || 'No connection');
    else {
      const sent = before - st.outbox.filter((o) => !o.error).length;
      nav.toast(sent > 0 ? `Sent ${plural(sent, 'record')} to your Sheet` : 'Everything is up to date');
    }
  }

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title="Sync"
        right={
          <button
            type="button"
            className="tbtn"
            onClick={syncNow}
            disabled={s.syncing || info.mode === 'offline'}
          >
            Sync now
          </button>
        }
      />
      <div className="sync-hero">
        <div className="circle" style={{ background: `${hero.color}26` }}>
          <Icon
            name={hero.icon}
            className={info.mode === 'syncing' ? 'spin' : ''}
            style={{ color: hero.color }}
          />
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 14 }}>{hero.title}</div>
        <div
          style={{ fontSize: 15, color: 'var(--text2)', marginTop: 6, lineHeight: 1.4, textWrap: 'pretty' }}
        >
          {hero.sub}
        </div>
      </div>

      {info.failed > 0 && !s.syncing && (
        <div className="err-card">
          <div className="h">ERROR FROM GOOGLE SHEETS</div>
          <div style={{ fontSize: 15, marginTop: 6, lineHeight: 1.4 }}>{info.error}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="small-btn inv" onClick={retryAll}>
              Retry all
            </button>
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                repairAndRetry();
                nav.toast('Recreating missing tabs');
              }}
            >
              Recreate tab
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <>
          <div className="section-head" style={{ margin: '26px 24px 10px' }}>
            <h2>Waiting to sync</h2>
          </div>
          <div className="group" style={{ borderRadius: 28 }}>
            {queue.map((op, i) => {
              const d = describe(op, view, money);
              const failed = !!op.error;
              const armed = armedOp === op.opId;
              return (
                <div key={op.opId}>
                  {i > 0 && <div className="sep" style={{ marginLeft: 66 }} />}
                  <div className="row" style={{ padding: '12px 16px 12px 18px', gap: 12, minHeight: 60 }}>
                    <span className="avatar" style={{ width: 36, height: 36, background: d.color }}>
                      <Icon name={d.icon} size={20} />
                    </span>
                    <span className="main">
                      <span className="ellipsis" style={{ display: 'block', fontSize: 16 }}>
                        {d.title}
                      </span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)' }}>
                        {[d.amt, dayHeading(stamp(op.createdAt), view.today)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {failed ? (
                      <button
                        type="button"
                        className="q-chip err"
                        onClick={() => {
                          if (!armed) return setArmedOp(op.opId);
                          discardOp(op.opId);
                          setArmedOp(null);
                        }}
                      >
                        {armed ? 'Discard?' : 'Failed'}
                      </button>
                    ) : (
                      <span className="q-chip">Waiting</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {info.failed > 0 && (
            <div className="hint-line">Tap “Failed” twice to discard a record that can’t be saved.</div>
          )}
        </>
      )}

      <div className="section-head" style={{ margin: '26px 24px 10px' }}>
        <h2>Connection</h2>
      </div>
      <div className="group" style={{ borderRadius: 28 }}>
        <div className="set-row">
          <Icon name="table_view" size={24} style={{ color: 'var(--text2)' }} />
          <span className="lbl">Spreadsheet</span>
          <span className="value ellipsis" style={{ maxWidth: 170 }}>
            {view.sheetName || 'Connected'}
          </span>
        </div>
        <div className="sep" style={{ marginLeft: 56 }} />
        <div className="set-row">
          <Icon name="history" size={24} style={{ color: 'var(--text2)' }} />
          <span className="lbl">Last sync</span>
          <span className="value">{last}</span>
        </div>
        <div className="sep" style={{ marginLeft: 56 }} />
        <button
          type="button"
          className="set-row tap"
          style={{ color: 'var(--red)' }}
          onClick={() => {
            if (!armedDisconnect) return setArmedDisconnect(true);
            nav.close();
            forgetDevice();
          }}
        >
          <Icon name="link_off" size={24} />
          <span className="lbl">
            {armedDisconnect
              ? s.outbox.length
                ? `Tap again: ${plural(s.outbox.length, 'unsynced record')} will be lost`
                : 'Tap again to disconnect'
              : 'Disconnect Sheet'}
          </span>
        </button>
      </div>
      <div className="hint-line">Your Sheet keeps all data. Disconnecting only clears this iPhone.</div>
    </>
  );
}
