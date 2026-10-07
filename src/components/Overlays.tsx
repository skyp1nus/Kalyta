import { useEffect, useState } from 'react';
import { getPrefs, usePrefs } from '../lib/prefs';
import { checkPasscode, turnLockOff, unlock, usePrivacy, verifyFaceId } from '../lib/privacy';
import { forgetDevice, useStore } from '../lib/store';
import { applyUpdate, dismissUpdate, useUpdate } from '../lib/update';
import { AppMark } from '../sheets/WhatsNewSheet';
import { Dots, Keypad } from './Keypad';
import { BackButton, Icon } from './ui';

export function LockScreen({ sheetName }: { sheetName: string }) {
  const { locked } = usePrivacy();
  const prefs = usePrefs();
  const s = useStore();
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState(0);
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(0);
  const [scan, setScan] = useState<0 | 1 | 2>(0);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (!locked) {
      setCode('');
      setMsg('');
      setForgot(false);
    }
  }, [locked]);

  if (!locked || !prefs.lockOn || !s.settings) return null;

  function digit(d: string) {
    if (code.length >= 6 || scan) return;
    const c = code + d;
    setCode(c);
    setMsg('');
    if (c.length < 6) return;
    setTimeout(async () => {
      if (await checkPasscode(c)) {
        setErrors(0);
        unlock();
        return;
      }
      const n = errors + 1;
      setErrors(n);
      setCode('');
      setShake((x) => x + 1);
      setMsg(n >= 3 ? `Wrong passcode · ${n} attempts` : 'Wrong passcode');
    }, 160);
  }

  async function face() {
    if (scan) return;
    setScan(1);
    const ok = await verifyFaceId();
    if (!ok) return setScan(0);
    setScan(2);
    setTimeout(() => {
      setScan(0);
      unlock();
    }, 450);
  }

  const unsynced = s.outbox.length;
  const canFace = getPrefs().lockMethod === 'face' && !!getPrefs().credId;

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="Kalyta is locked">
      <div className="glow home" style={{ height: 620 }} />
      {!forgot ? (
        <div className="lock-pad">
          <AppMark size={64} />
          <div style={{ fontSize: 17, marginTop: 18, color: msg ? 'var(--red)' : 'var(--text)' }}>
            {msg || 'Enter passcode'}
          </div>
          <Dots filled={code.length} error={!!msg} shake={shake} />
          <div style={{ marginTop: 44 }}>
            <Keypad
              onDigit={digit}
              onDelete={() => setCode((c) => c.slice(0, -1))}
              onFace={canFace ? () => void face() : undefined}
            />
          </div>
          <button
            type="button"
            className="text-btn"
            style={{ marginTop: 30, fontSize: 16 }}
            onClick={() => setForgot(true)}
          >
            Forgot passcode?
          </button>
          {scan > 0 && (
            <div className="face-scan">
              <div className="card">
                <Icon
                  name={scan === 2 ? 'check_circle' : 'face'}
                  size={64}
                  style={{
                    color: scan === 2 ? 'var(--green)' : 'var(--text)',
                    animation: scan === 1 ? 'kpulse 1s ease-in-out infinite' : undefined,
                  }}
                />
                <div style={{ fontSize: 15, fontWeight: 500 }}>Face ID</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="lock-forgot">
          <BackButton onClick={() => setForgot(false)} />
          <div className="acc-hero" style={{ padding: '30px 12px 0' }}>
            <div className="sync-hero" style={{ padding: 0 }}>
              <div className="circle" style={{ background: 'var(--seg)' }}>
                <Icon name="table_view" />
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>Forgot passcode?</div>
            <div
              style={{
                fontSize: 16,
                color: 'var(--text2)',
                marginTop: 8,
                lineHeight: 1.4,
                textWrap: 'pretty',
              }}
            >
              Kalyta can't recover the passcode, but your records are safe in your Google Sheet
              {sheetName ? ` “${sheetName}”` : ''}.
            </div>
          </div>
          <div className="group" style={{ margin: '26px 0 0', borderRadius: 26 }}>
            {[
              'Enter your web app URL and access key again on this iPhone.',
              'Kalyta downloads your records from the Sheet.',
              'App lock turns off. Set a new passcode in Settings.',
            ].map((t, i) => (
              <div key={t}>
                {i > 0 && <div className="sep" style={{ marginLeft: 60 }} />}
                <div className="row" style={{ minHeight: 0 }}>
                  <span className="step-n">{i + 1}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.35 }}>{t}</span>
                </div>
              </div>
            ))}
          </div>
          {unsynced > 0 && (
            <div className="hint-line" style={{ color: '#ff9f0a', margin: '14px 8px 0' }}>
              <Icon name="warning" />
              {unsynced}
              {unsynced === 1 ? ' record on this iPhone hasn’t' : ' records on this iPhone haven’t'} reached
              the Sheet yet and will be removed.
            </div>
          )}
          <div style={{ flex: 1, minHeight: 24 }} />
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              turnLockOff();
              forgetDevice();
            }}
          >
            Reconnect this iPhone
          </button>
          <button type="button" className="text-btn" onClick={() => setForgot(false)}>
            Back to passcode
          </button>
        </div>
      )}
    </div>
  );
}

// What the app switcher shows instead of balances
export function Cover() {
  const { cover } = usePrivacy();
  const { blurSw } = usePrefs();
  return (
    <div className={`app-cover ${cover && blurSw ? 'on' : ''}`} aria-hidden="true">
      <AppMark />
      <div style={{ fontSize: 17, fontWeight: 600 }}>Kalyta</div>
    </div>
  );
}

export function Reloading() {
  const { reloading } = useUpdate();
  if (!reloading) return null;
  return (
    <div className="reloading">
      <AppMark />
      <Icon name="progress_activity" className="spin" style={{ color: 'var(--text2)' }} />
    </div>
  );
}

export function UpdatePill() {
  const u = useUpdate();
  if (!(u.available && !u.dismissed) && !u.updating) return null;
  return (
    <div className="update-wrap">
      <div className="update-pill" style={{ paddingRight: u.updating ? 16 : 6 }}>
        <Icon
          name={u.updating ? 'progress_activity' : 'arrow_circle_up'}
          size={19}
          className={u.updating ? 'spin' : ''}
        />
        <span style={{ color: 'var(--text2)' }}>{u.updating ? 'Updating…' : 'New version available'}</span>
        {!u.updating && (
          <>
            <button type="button" className="go" onClick={applyUpdate}>
              Update
            </button>
            <button type="button" className="x" aria-label="Not now" onClick={dismissUpdate}>
              <Icon name="close" size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
