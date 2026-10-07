import { AlertCircle, ArrowRightLeft, Clock, X } from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { money, native, time } from '../lib/format';
import { type CategoryTotal, categoryColor, title } from '../lib/stats';
import { useStore } from '../lib/store';
import type { Transfer, Tx, View } from '../lib/types';

// ----- toast -----
export const ToastContext = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

// ----- sync status in the top bar -----
export function SyncPill({ onOpen }: { onOpen: () => void }) {
  const s = useStore();
  const waiting = s.outbox.filter((o) => !o.error).length;
  const failed = s.outbox.filter((o) => o.error).length;
  let cls = '';
  let text = 'Synced';
  if (failed) {
    cls = 'err';
    text = `${failed} not saved`;
  } else if (!s.online) {
    cls = 'off';
    text = waiting ? `Offline, ${waiting} waiting` : 'Offline';
  } else if (s.syncing) {
    cls = 'wait';
    text = 'Syncing';
  } else if (waiting) {
    cls = 'wait';
    text = `${waiting} waiting`;
  } else if (s.lastError) {
    cls = 'err';
    text = 'Sync failed';
  }
  return (
    <button type="button" className={`sync ${cls}`} onClick={onOpen} aria-label={`Sync status: ${text}`}>
      <span className="dot" aria-hidden="true" />
      {text}
    </button>
  );
}

export function TopBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      {title}
      {children}
    </header>
  );
}

// ----- bottom sheet -----
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tapping the dimmed backdrop closes the sheet; Escape and the close button do the same
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ----- rows -----
export function TxRowItem({ t, view, onOpen }: { t: Tx; view: View; onOpen: (t: Tx) => void }) {
  const income = t.category === view.income;
  const color = categoryColor(view, t.category);
  const meta = [t.category || 'No category', t.account, time(t.date)].filter(Boolean).join(', ');
  return (
    <button type="button" className="row" onClick={() => onOpen(t)}>
      <span className="mark" style={{ background: color }} aria-hidden="true">
        {(t.category || '?').slice(0, 1)}
      </span>
      <span className="main">
        <p className="title">{title(t)}</p>
        <p className="meta">
          {t.failed ? (
            <span className="badge err">
              <AlertCircle size={12} /> Not saved: {t.failed}
            </span>
          ) : t.pending ? (
            <span className="badge">
              <Clock size={12} /> Waiting to sync
            </span>
          ) : (
            meta
          )}
        </p>
      </span>
      <span className={`amount num ${income ? 'good' : ''}`}>
        {income ? '+' : ''}
        {t.currency === 'USD' || t.usd == null ? native(t.amount, t.currency) : money(t.usd, 2)}
        {t.currency !== 'USD' && t.usd != null && <span className="sub">{native(t.amount, t.currency)}</span>}
      </span>
    </button>
  );
}

export function TransferRowItem({ t, onOpen }: { t: Transfer; onOpen: (t: Transfer) => void }) {
  return (
    <button type="button" className="row" onClick={() => onOpen(t)}>
      <span className="mark" style={{ background: 'var(--ink-3)' }} aria-hidden="true">
        <ArrowRightLeft size={16} />
      </span>
      <span className="main">
        <p className="title">
          {t.from} to {t.to}
        </p>
        <p className="meta">
          {t.failed ? (
            <span className="badge err">
              <AlertCircle size={12} /> Not saved: {t.failed}
            </span>
          ) : t.pending ? (
            <span className="badge">
              <Clock size={12} /> Waiting to sync
            </span>
          ) : (
            ['Transfer', t.note, time(t.date)].filter(Boolean).join(', ')
          )}
        </p>
      </span>
      <span className="amount num">
        {native(t.received, t.toCurrency)}
        <span className="sub">{native(t.sent, t.fromCurrency)}</span>
      </span>
    </button>
  );
}

// ----- category bars -----
export function CategoryBars({ totals, total }: { totals: CategoryTotal[]; total: number }) {
  const max = Math.max(0, ...totals.map((c) => c.value));
  if (!totals.some((c) => c.value > 0)) return <p className="empty">No spending yet.</p>;
  return (
    <div>
      {totals
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((c) => (
          <div className="bar-row" key={c.name}>
            <span className="name">
              <span className="swatch" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="track" aria-hidden="true">
              <span
                style={{ width: `${max ? Math.max(1.5, (c.value / max) * 100) : 0}%`, background: c.color }}
              />
            </span>
            <span className="right num">{money(c.value)}</span>
            <span className="right small muted num">{total ? Math.round((c.value / total) * 100) : 0}%</span>
          </div>
        ))}
    </div>
  );
}

export function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="tile">
      <p className="label">{label}</p>
      <p className={`value num ${tone ?? ''}`}>{value}</p>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}
