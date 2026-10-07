import { useEffect, useRef, useState } from 'react';
import { Dots, Keypad } from '../components/Keypad';
import { CircleButton, Icon, Segmented, Toggle } from '../components/ui';
import { type AutoLock, getPrefs, setPrefs, usePrefs } from '../lib/prefs';
import { confirmWithLock, enrollFaceId, faceIdAvailable, setPasscode, turnLockOff } from '../lib/privacy';
import { useNav } from '../nav';
import { SheetHead } from './common';

const AUTO: AutoLock[] = ['Immediately', '1 min', '5 min', '15 min'];

function AutoLockPicker() {
  const { autoLock } = usePrefs();
  return (
    <Segmented
      label="Auto-lock"
      tight
      value={autoLock}
      onChange={(v) => setPrefs({ autoLock: v })}
      options={AUTO.map((k) => ({ value: k, label: k }))}
    />
  );
}

export function toggleHide(toast: (m: string, u?: () => void, i?: { icon: string; color: string }) => void) {
  const on = !getPrefs().hide;
  setPrefs({ hide: on });
  if (on)
    toast('Amounts hidden · touch and hold to peek', undefined, {
      icon: 'visibility_off',
      color: 'var(--text)',
    });
}

export function SecuritySheet() {
  const nav = useNav();
  const p = usePrefs();
  const rows = [
    {
      icon: 'lock',
      label: 'App lock',
      toggle: p.lockOn,
      onClick: () => {
        if (p.lockOn)
          confirmWithLock('Turn off App lock', () => {
            turnLockOff();
            nav.toast('App lock turned off');
          });
        else nav.open({ kind: 'lockSetup', step: 'method' });
      },
    },
    ...(p.lockOn
      ? [
          {
            icon: p.lockMethod === 'face' ? 'face' : 'pin',
            label: 'Unlock with',
            value: p.lockMethod === 'face' ? 'Face ID' : 'Passcode',
            onClick: () =>
              confirmWithLock('Change how you unlock', () => nav.open({ kind: 'lockSetup', step: 'method' })),
          },
          {
            icon: 'password',
            label: 'Change passcode',
            onClick: () =>
              confirmWithLock('Change passcode', () =>
                nav.open({ kind: 'lockSetup', step: 'enter', change: true }),
              ),
          },
        ]
      : []),
  ];
  const priv = [
    { icon: 'visibility_off', label: 'Hide amounts', on: p.hide, onClick: () => toggleHide(nav.toast) },
    {
      icon: 'blur_on',
      label: 'Blur in app switcher',
      on: p.blurSw,
      onClick: () => setPrefs({ blurSw: !p.blurSw }),
    },
  ];

  return (
    <>
      <SheetHead
        left={
          <CircleButton
            icon="chevron_left"
            label="Back"
            iconSize={28}
            onClick={() => nav.open({ kind: 'settings' })}
          />
        }
        title="Security"
      />
      <div className="sync-hero" style={{ paddingTop: 24 }}>
        <div
          className="circle"
          style={{ background: p.lockOn ? 'color-mix(in srgb, #30d158 15%, transparent)' : 'var(--seg)' }}
        >
          <Icon
            name={p.lockOn ? 'lock' : 'lock_open'}
            style={{ color: p.lockOn ? 'var(--green)' : 'var(--text2)' }}
          />
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 14 }}>
          {p.lockOn ? 'App lock is on' : 'App lock is off'}
        </div>
        <div
          style={{ fontSize: 15, color: 'var(--text2)', marginTop: 6, lineHeight: 1.4, textWrap: 'pretty' }}
        >
          {p.lockOn
            ? `${p.lockMethod === 'face' ? 'Face ID, with a 6-digit passcode as backup.' : '6-digit passcode.'} Locks ${p.autoLock === 'Immediately' ? 'as soon as you leave.' : `after ${p.autoLock} in the background.`}`
            : 'Anyone holding your unlocked iPhone can open Kalyta.'}
        </div>
      </div>

      <div className="group" style={{ margin: '24px 20px 0', borderRadius: 28 }}>
        {rows.map((r, i) => (
          <div key={r.label}>
            {i > 0 && <div className="sep" style={{ marginLeft: 60 }} />}
            <button type="button" className="set-row tap" onClick={r.onClick}>
              <Icon name={r.icon} />
              <span className="lbl">{r.label}</span>
              {'value' in r && <span className="value">{r.value}</span>}
              {'toggle' in r ? (
                <Toggle on={!!r.toggle} label={r.label} />
              ) : (
                <Icon name="chevron_right" className="chev" />
              )}
            </button>
          </div>
        ))}
      </div>

      {p.lockOn && (
        <>
          <div className="sheet-section">Auto-lock</div>
          <div style={{ marginTop: -20 }}>
            <AutoLockPicker />
          </div>
          <div className="sheet-note" style={{ marginTop: 10 }}>
            How long Kalyta can stay in the background before it asks again.
          </div>
        </>
      )}

      <div className="sheet-section">Privacy</div>
      <div className="group" style={{ borderRadius: 28 }}>
        {priv.map((r, i) => (
          <div key={r.label}>
            {i > 0 && <div className="sep" style={{ marginLeft: 60 }} />}
            <button type="button" className="set-row tap" aria-pressed={r.on} onClick={r.onClick}>
              <Icon name={r.icon} />
              <span className="lbl">{r.label}</span>
              <Toggle on={r.on} label={r.label} />
            </button>
          </div>
        ))}
      </div>
      <div className="sheet-note" style={{ marginTop: 10 }}>
        Hidden amounts show as •••. Touch and hold anywhere to peek. The app switcher shows a blurred cover
        instead of your balances.
      </div>
    </>
  );
}

type Step = 'method' | 'enter' | 'confirm' | 'face' | 'done';

export function LockSetupSheet({
  step: startStep = 'method',
  change = false,
}: {
  step?: 'method' | 'enter';
  change?: boolean;
}) {
  const nav = useNav();
  const p = usePrefs();
  // with the lock already on, "Unlock with" only switches the method
  const switching = p.lockOn && !change && startStep === 'method';
  const [step, setStep] = useState<Step>(startStep);
  const [method, setMethod] = useState<'face' | 'passcode'>(p.lockMethod);
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(0);
  const [scan, setScan] = useState<0 | 1 | 2>(0);
  const [faceOk, setFaceOk] = useState(true);
  const busy = useRef(false);

  // don't offer Face ID where there's no passkey support
  useEffect(() => {
    let live = true;
    void faceIdAvailable().then((ok) => {
      if (!live || ok) return;
      setFaceOk(false);
      setMethod('passcode');
    });
    return () => {
      live = false;
    };
  }, []);

  async function finish(m: 'face' | 'passcode', pass: string) {
    if (pass) await setPasscode(pass);
    setPrefs({ lockOn: true, lockMethod: m });
    if (change) {
      nav.close();
      nav.toast('Passcode changed');
      return;
    }
    setMethod(m);
    setStep('done');
  }

  function digit(d: string) {
    if (busy.current || code.length >= 6) return;
    const c = code + d;
    setCode(c);
    setMsg('');
    if (c.length < 6) return;
    busy.current = true;
    setTimeout(() => {
      busy.current = false;
      if (step === 'enter') {
        setFirst(c);
        setCode('');
        setStep('confirm');
      } else if (c === first) {
        setCode('');
        if (method === 'face' && !change) setStep('face');
        else void finish(method, c);
      } else {
        setStep('enter');
        setFirst('');
        setCode('');
        setMsg("Passcodes didn't match. Try again.");
        setShake((n) => n + 1);
      }
    }, 180);
  }

  async function enableFace() {
    if (scan) return;
    setScan(1);
    const res = await enrollFaceId();
    if (res === 'cancelled') {
      setScan(0);
      nav.toast('Face ID was cancelled', undefined, { icon: 'face', color: 'var(--text)' });
      return;
    }
    if (res === 'unavailable') {
      setScan(0);
      nav.toast('Face ID isn’t available here. Using the passcode.', undefined, {
        icon: 'pin',
        color: 'var(--text)',
      });
      if (switching) {
        setPrefs({ lockMethod: 'passcode' });
        nav.close();
      } else void finish('passcode', first);
      return;
    }
    setScan(2);
    setTimeout(() => {
      if (switching) {
        setPrefs({ lockMethod: 'face' });
        nav.close();
        nav.toast('Unlock with Face ID');
      } else void finish('face', first);
    }, 500);
  }

  const isCode = step === 'enter' || step === 'confirm';
  const back = () => {
    if (step === 'confirm') {
      setStep('enter');
      setCode('');
      setFirst('');
      setMsg('');
    } else if (step === 'enter' && !change) {
      setStep('method');
      setCode('');
    } else nav.close();
  };

  return (
    <>
      <SheetHead
        left={
          <CircleButton
            icon={isCode ? 'chevron_left' : 'close'}
            label={isCode ? 'Back' : 'Close'}
            iconSize={isCode ? 28 : 24}
            onClick={back}
          />
        }
        title="App lock"
      />

      {step === 'method' && (
        <div style={{ animation: 'rise .35s var(--ease)' }}>
          <div style={{ padding: '22px 24px 0' }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>Turn on App lock</div>
            <div
              style={{
                fontSize: 16,
                color: 'var(--text2)',
                marginTop: 6,
                lineHeight: 1.4,
                textWrap: 'pretty',
              }}
            >
              Kalyta asks for Face ID or a passcode when you open it. Your Sheet is not affected.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '24px 20px 0' }}>
            {(
              [
                [
                  'face',
                  'face',
                  'Face ID',
                  'Unlock with a passkey on this iPhone. A passcode is still needed as a fallback.',
                ],
                ['passcode', 'pin', 'Passcode only', 'Enter 6 digits each time Kalyta locks.'],
              ] as const
            ).map(([k, icon, t, s]) => (
              <button
                key={k}
                type="button"
                className="method-card"
                aria-pressed={method === k}
                disabled={k === 'face' && !faceOk}
                style={{
                  borderColor: method === k ? 'var(--text)' : 'transparent',
                  opacity: k === 'face' && !faceOk ? 0.45 : 1,
                }}
                onClick={() => setMethod(k)}
              >
                <span className="mic">
                  <Icon name={icon} size={26} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>{t}</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 14,
                      color: 'var(--text2)',
                      marginTop: 3,
                      lineHeight: 1.35,
                    }}
                  >
                    {s}
                  </span>
                </span>
                <Icon name={method === k ? 'check_circle' : 'radio_button_unchecked'} fill />
              </button>
            ))}
          </div>
          <div style={{ margin: '28px 20px 0' }}>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                if (!switching) return setStep('enter');
                if (method === 'face') setStep('face');
                else {
                  setPrefs({ lockMethod: 'passcode' });
                  nav.close();
                  nav.toast('Unlock with passcode');
                }
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {isCode && (
        <div style={{ animation: 'rise .3s var(--ease)' }}>
          <div className="acc-hero" style={{ padding: '28px 24px 0' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {step === 'confirm'
                ? 'Repeat the passcode'
                : change
                  ? 'Enter a new passcode'
                  : 'Create a passcode'}
            </div>
            <div
              style={{
                fontSize: 15,
                color: msg ? 'var(--red)' : 'var(--text2)',
                marginTop: 6,
                minHeight: 20,
              }}
            >
              {msg ||
                (step === 'confirm'
                  ? 'Enter the same 6 digits again.'
                  : 'Six digits. You need it if Face ID fails.')}
            </div>
            <Dots filled={code.length} shake={shake} />
          </div>
          <div style={{ marginTop: 34 }}>
            <Keypad onDigit={digit} onDelete={() => !busy.current && setCode((c) => c.slice(0, -1))} />
          </div>
        </div>
      )}

      {step === 'face' && (
        <div style={{ animation: 'rise .35s var(--ease)' }}>
          <div className="acc-hero" style={{ padding: '56px 36px 0' }}>
            <div className="face-circle">
              <Icon
                name={scan === 2 ? 'check_circle' : 'face'}
                size={54}
                style={{
                  color: scan === 2 ? 'var(--green)' : 'var(--text)',
                  animation: scan === 1 ? 'kpulse 1s ease-in-out infinite' : undefined,
                }}
              />
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 18 }}>Use Face ID?</div>
            <div
              style={{
                fontSize: 15,
                color: 'var(--text2)',
                marginTop: 6,
                lineHeight: 1.4,
                textWrap: 'pretty',
              }}
            >
              Kalyta saves a passkey on this iPhone. Your 6-digit passcode stays as the backup.
            </div>
          </div>
          <div style={{ margin: '36px 20px 0' }}>
            <button type="button" className="primary-btn" onClick={enableFace}>
              Enable Face ID
            </button>
          </div>
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              if (switching) return nav.close();
              void finish('passcode', first);
            }}
          >
            Not now
          </button>
        </div>
      )}

      {step === 'done' && (
        <div style={{ animation: 'rise .35s var(--ease)' }}>
          <div className="acc-hero" style={{ padding: '40px 36px 0' }}>
            <span className="done-circle">
              <Icon name="lock" size={38} />
            </span>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 14 }}>App lock is on</div>
            <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 6, lineHeight: 1.4 }}>
              {method === 'face'
                ? 'Unlock with Face ID. Your passcode is the backup.'
                : 'Unlock with your 6-digit passcode.'}
            </div>
          </div>
          <div className="sheet-section" style={{ marginTop: 28 }}>
            Auto-lock
          </div>
          <div style={{ marginTop: -20 }}>
            <AutoLockPicker />
          </div>
          <div style={{ margin: '32px 20px 0' }}>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                nav.close();
                nav.toast('App lock is on', undefined, { icon: 'lock', color: 'var(--green)' });
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
