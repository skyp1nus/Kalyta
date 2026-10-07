import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react';
import { accountLook } from '../lib/meta';

export function Icon({
  name,
  size,
  fill,
  className = '',
  style,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`ms ${className}`}
      aria-hidden="true"
      style={{
        fontSize: size,
        fontVariationSettings: fill ? "'FILL' 1" : undefined,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

export function CircleButton({
  icon,
  label,
  onClick,
  size = 'normal',
  iconSize,
  disabled,
  className = '',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  size?: 'small' | 'normal' | 'mid' | 'big';
  iconSize?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`cbtn ${size === 'normal' ? '' : size} ${className}`}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={iconSize ?? (size === 'small' ? 22 : 24)} />
    </button>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return <CircleButton icon="chevron_left" label="Back" iconSize={28} onClick={onClick} />;
}

export function Avatar({
  name,
  type,
  size = 40,
  className = 'avatar',
}: {
  name: string;
  type?: string;
  size?: number;
  className?: string;
}) {
  const look = accountLook(name, type);
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{ background: look.color, width: size, height: size, fontSize: Math.round(size * 0.43) }}
    >
      {look.icon ? <Icon name={look.icon} size={Math.round(size * 0.55)} /> : look.letter}
    </span>
  );
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange?: () => void }) {
  if (!onChange)
    return (
      <span className={`toggle ${on ? 'on' : ''}`} aria-hidden="true">
        <i />
      </span>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={onChange}
    >
      <i />
    </button>
  );
}

// Segmented control with a sliding thumb
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; icon?: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const i = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div className="segmented" title={label}>
      <span
        className="thumb"
        style={{
          width: `calc((100% - 6px - ${(options.length - 1) * 2}px) / ${options.length})`,
          transform: `translateX(calc(${i * 100}% + ${i * 2}px))`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: string;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div className="et">{title}</div>
      <div className="ex">{text}</div>
      {action && (
        <button type="button" className="soft-btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function MonthHead({
  title,
  sub,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  title: string;
  sub: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="month-head">
      <div>
        <div className="mt">{title}</div>
        <div className="msub">{sub}</div>
      </div>
      <div className="arrows">
        <CircleButton
          icon="chevron_left"
          label="Previous month"
          size="small"
          onClick={onPrev}
          disabled={!canPrev}
        />
        <CircleButton
          icon="chevron_right"
          label="Next month"
          size="small"
          onClick={onNext}
          disabled={!canNext}
        />
      </div>
    </div>
  );
}

// A text input that grows with its content, like the big amount fields in the design
export function AmountInput({
  value,
  onChange,
  placeholder = '0',
  charWidth,
  className = 'amount-input',
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  charWidth: number;
  className?: string;
  label: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const len = Math.max(1, (value || placeholder).length);
  return (
    <input
      ref={ref}
      className={className}
      value={value}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      aria-label={label}
      placeholder={placeholder}
      style={{ width: len * charWidth + 6 }}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
    />
  );
}

export function Skeleton({ children }: { children: ReactNode }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {children}
    </div>
  );
}
