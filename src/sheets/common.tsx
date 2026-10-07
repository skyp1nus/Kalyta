import type { ReactNode } from 'react';
import { CircleButton, Icon } from '../components/ui';
import { dayHeading, time } from '../lib/format';

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
