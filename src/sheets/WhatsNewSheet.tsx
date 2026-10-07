import { CircleButton, Icon } from '../components/ui';
import { VERSION } from '../lib/update';
import { useNav } from '../nav';

const ITEMS = [
  {
    icon: 'savings',
    t: 'Budgets',
    s: 'Monthly limits per category, with a marker for where you should be today.',
  },
  {
    icon: 'event_repeat',
    t: 'Subscriptions',
    s: 'Repeating charges found in your history, and what is due next.',
  },
  { icon: 'rule', t: 'Category rules', s: 'Fix a category once and Kalyta remembers it for that place.' },
  { icon: 'lock', t: 'App lock', s: 'Face ID or a passcode, plus a switch that hides amounts.' },
];

export function AppMark({ size = 72 }: { size?: number }) {
  return (
    <span className="app-mark" style={{ width: size, height: size, borderRadius: size * 0.28 }}>
      <Icon name="wallet" size={size * 0.55} fill />
    </span>
  );
}

export function WhatsNewSheet() {
  const nav = useNav();
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 20px 0' }}>
        <CircleButton icon="close" label="Close" onClick={nav.close} />
      </div>
      <div className="acc-hero" style={{ padding: '0 32px' }}>
        <AppMark />
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5, marginTop: 16 }}>What's new</div>
        <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 4 }}>
          Kalyta {VERSION} · updated just now
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, margin: '32px 32px 0' }}>
        {ITEMS.map((p, i) => (
          <div
            key={p.t}
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              animation: `rise .5s var(--ease) ${120 + i * 70}ms both`,
            }}
          >
            <Icon name={p.icon} size={28} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{p.t}</div>
              <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 2, lineHeight: 1.35 }}>{p.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ margin: '36px 20px 0' }}>
        <button type="button" className="primary-btn" onClick={nav.close}>
          Continue
        </button>
      </div>
    </>
  );
}
