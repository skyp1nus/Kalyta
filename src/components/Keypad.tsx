import { Icon } from './ui';

export function Dots({ filled, error, shake }: { filled: number; error?: boolean; shake: number }) {
  return (
    <div
      className="pass-dots"
      key={shake}
      style={{ animation: shake ? `${shake % 2 ? 'kshakeA' : 'kshakeB'} .45s ease-in-out` : undefined }}
      role="img"
      aria-label={`${filled} of 6 digits`}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <i
          key={i}
          style={{
            background: i < filled ? 'var(--text)' : 'transparent',
            borderColor: error ? 'var(--red)' : 'var(--text)',
          }}
        />
      ))}
    </div>
  );
}

export function Keypad({
  onDigit,
  onDelete,
  onFace,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onFace?: () => void;
}) {
  return (
    <div className="keypad">
      {'123456789'.split('').map((d) => (
        <button key={d} type="button" className="key" onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      {onFace ? (
        <button type="button" className="key bare" aria-label="Unlock with Face ID" onClick={onFace}>
          <Icon name="face" size={32} />
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="key" onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className="key bare" aria-label="Delete" onClick={onDelete}>
        <Icon name="backspace" size={30} />
      </button>
    </div>
  );
}
