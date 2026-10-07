import { type FormEvent, useState } from 'react';
import { BackButton, Icon } from '../components/ui';
import { connect, getState } from '../lib/store';
import { useNav } from '../nav';
import { AppMark } from '../sheets/WhatsNewSheet';

const POINTS = [
  {
    icon: 'table_view',
    t: 'Every record goes to your Sheet',
    s: 'Edit, filter and chart your data on a computer any time.',
  },
  {
    icon: 'cloud_off',
    t: 'Works offline',
    s: 'Records wait on this iPhone and sync when you’re back online.',
  },
  {
    icon: 'currency_exchange',
    t: 'Five currencies, one net worth',
    s: 'PLN, USD, UAH, EUR and USDT, converted to your base currency.',
  },
];

const SETUP_URL = 'https://github.com/skyp1nus/Kalyta#set-up';

export function Onboarding() {
  const nav = useNav();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(u)) {
      setError('Paste the web app URL that ends with /exec');
      return;
    }
    if (!key.trim()) {
      setError('Paste the VIEW_KEY from the script');
      return;
    }
    setError('');
    setStep(2);
    try {
      await connect({ url: u, key: key.trim() });
      const name = getState().server?.sheetName;
      nav.toast(name ? `Connected to ${name}` : 'Connected to your Sheet');
    } catch (err) {
      setError((err as Error).message);
      setStep(1);
    }
  }

  return (
    <div className="onboarding">
      <div className="glow home" style={{ height: 620 }} />
      {step === 0 && (
        <div className="ob-step" style={{ padding: 'calc(var(--st) + 56px) 28px max(44px, var(--sb))' }}>
          <div style={{ animation: 'rise .5s var(--ease) both' }}>
            <AppMark size={64} />
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1.5, marginTop: 20 }}>Kalyta</div>
          <div
            style={{ fontSize: 20, color: 'var(--text2)', marginTop: 8, lineHeight: 1.3, textWrap: 'pretty' }}
          >
            Personal finance that lives in your own Google Sheet.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 44 }}>
            {POINTS.map((p, i) => (
              <div
                key={p.icon}
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                  animation: `rise .5s var(--ease) ${100 + i * 80}ms both`,
                }}
              >
                <Icon name={p.icon} size={28} />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{p.t}</div>
                  <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 2, lineHeight: 1.35 }}>
                    {p.s}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 32 }} />
          <button type="button" className="primary-btn" onClick={() => setStep(1)}>
            Connect Google Sheet
          </button>
          <a
            href={SETUP_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              textAlign: 'center',
              fontSize: 17,
              fontWeight: 500,
              marginTop: 18,
              color: 'var(--text2)',
              textDecoration: 'none',
            }}
          >
            How to set up the script
          </a>
        </div>
      )}

      {step === 1 && (
        <form
          className="ob-step"
          onSubmit={submit}
          noValidate
          style={{ padding: 'calc(var(--st) + 1px) 20px max(40px, var(--sb))' }}
        >
          <BackButton onClick={() => setStep(0)} />
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5, marginTop: 20 }}>
            Connect your Sheet
          </div>
          <div style={{ fontSize: 16, color: 'var(--text2)', marginTop: 6, lineHeight: 1.4 }}>
            Paste the web app URL of your Kalyta Apps Script and the VIEW_KEY you set in it. Kalyta adds
            Transfers and Balance history tabs. Nothing else is changed.
          </div>
          <div className="group" style={{ margin: '24px 0 0' }}>
            <label className="ob-field">
              <span>Web app URL</span>
              <input
                type="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="https://script.google.com/macros/s/…/exec"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError('');
                }}
              />
            </label>
            <div className="kv-sep" />
            <label className="ob-field">
              <span>Access key</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="VIEW_KEY from the script"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError('');
                }}
              />
            </label>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div style={{ flex: 1, minHeight: 32 }} />
          <button type="submit" className="primary-btn" disabled={!url.trim() || !key.trim()}>
            Connect
          </button>
          <a
            href={SETUP_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              textAlign: 'center',
              fontSize: 15,
              marginTop: 16,
              color: 'var(--text2)',
              textDecoration: 'none',
            }}
          >
            Where do I find these?
          </a>
        </form>
      )}

      {step === 2 && (
        <div className="ob-step" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Icon name="progress_activity" size={40} className="spin" />
          <div style={{ fontSize: 17, color: 'var(--text2)' }}>Connecting to your Sheet…</div>
        </div>
      )}
    </div>
  );
}
