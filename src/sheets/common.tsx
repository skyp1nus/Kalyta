import type { ReactNode } from 'react';
import { CircleButton, Icon, Toggle } from '../components/ui';
import { dayHeading, time } from '../lib/format';
import { CATEGORY_META } from '../lib/meta';

export function SheetHead({ left, title, right }: { left: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="sheet-head">
      {left}
      <div className="nt">{title}</div>
      {right ?? <div style={{ width: 44 }} />}
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return <CircleButton icon="close" label="Close" onClick={onClick} />;
}

export function SaveButton({ onClick, enabled }: { onClick: () => void; enabled: boolean }) {
  return (
    <button
      type="button"
      className="cbtn"
      aria-label="Save"
      aria-disabled={!enabled}
      style={{ opacity: enabled ? 1 : 0.35, backdropFilter: 'none' }}
      onClick={onClick}
    >
      <Icon name="check" size={26} />
    </button>
  );
}

// "Today, 16:04" with the native date picker on top
export function DateRow({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="kv-row">
      <span style={{ flex: 1 }}>Date</span>
      <span className="value">
        {dayHeading(value, today)}, {time(value)}
      </span>
      <input
        type="datetime-local"
        className="hidden-date"
        aria-label="Date and time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </label>
  );
}

export function NoteRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="kv-row">
      <span>Note</span>
      <input
        value={value}
        placeholder="Optional"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function DeleteButton({
  armed,
  label,
  onClick,
}: {
  armed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`danger-btn ${armed ? 'armed' : ''}`} onClick={onClick}>
      <Icon name="delete" size={22} />
      {armed ? 'Tap again to delete' : label}
    </button>
  );
}

export function tintFor(color: string): string {
  return `radial-gradient(120% 85% at 50% 0%, ${color}66 0%, transparent 72%)`;
}

export function CategoryChips({
  categories,
  value,
  onChange,
  style,
}: {
  categories: string[];
  value: string;
  onChange: (c: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="cat-chips" style={style}>
      {categories.map((c) => {
        const meta = CATEGORY_META[c] ?? CATEGORY_META.Other;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            className="cat-chip"
            style={{ borderColor: value === c ? meta.color : 'transparent' }}
            onClick={() => onChange(c)}
          >
            <span className="ic" style={{ background: meta.color }}>
              <Icon name={meta.icon} />
            </span>
            {c}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({
  icon,
  color,
  title,
  text,
  children,
}: {
  icon: string;
  color: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="notice">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name={icon} style={{ color }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          <div
            style={{ fontSize: 14, color: 'var(--text2)', marginTop: 3, lineHeight: 1.4, textWrap: 'pretty' }}
          >
            {text}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ToggleRow({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button type="button" className="toggle-row" aria-pressed={on} onClick={onChange}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="ellipsis" style={{ display: 'block', fontSize: 17 }}>
          {label}
        </span>
        {sub && (
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{sub}</span>
        )}
      </span>
      <Toggle on={on} label={label} />
    </button>
  );
}
