import { Icon, Toggle } from '../components/ui';
import { saveCsv } from '../lib/csv';
import { BASES, setPrefs, type Theme, usePrefs } from '../lib/prefs';
import { useStore } from '../lib/store';
import { hasBudgets, subStates } from '../lib/subs';
import { syncInfo } from '../lib/syncState';
import type { View } from '../lib/types';
import { applyUpdate, useUpdate, VERSION } from '../lib/update';
import { useNav } from '../nav';
import { CloseButton } from './common';

const THEMES: Theme[] = ['auto', 'dark', 'light'];
const THEME_LABEL: Record<Theme, string> = { auto: 'Automatic', dark: 'Dark', light: 'Light' };
const SYNC_LABEL = { ok: 'On', pending: 'On', syncing: 'Syncing', offline: 'Offline', error: 'Error' };

interface Row {
  icon: string;
  label: string;
  value?: string;
  chev?: boolean;
  toggle?: boolean;
  strong?: boolean;
  onClick: () => void;
}

export function SettingsSheet({ view }: { view: View }) {
  const nav = useNav();
  const prefs = usePrefs();
  const info = syncInfo(useStore());
  const next = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length];
  const upd = useUpdate();
  const limits = Object.keys(view.budgets.cats).length + (view.budgets.total ? 1 : 0);
  const activeSubs = subStates(view).filter((s) => !s.sub.paused).length;
  const goTo = (name: 'subs' | 'rules' | 'accounts') => {
    nav.close();
    nav.reset([{ name }]);
  };

  const groups: Row[][] = [
    [
      {
        icon: 'table_view',
        label: 'Google Sheet',
        value: view.sheetName || 'Connected',
        chev: true,
        onClick: () => nav.open({ kind: 'sync' }),
      },
      {
        icon: 'cloud_sync',
        label: 'Sync',
        value: SYNC_LABEL[info.mode],
        chev: true,
        onClick: () => nav.open({ kind: 'sync' }),
      },
    ],
    [
      {
        icon: 'savings',
        label: 'Budgets',
        value: hasBudgets(view) ? `${limits} limit${limits === 1 ? '' : 's'}` : 'Not set',
        chev: true,
        onClick: () => nav.open({ kind: 'budgets' }),
      },
      {
        icon: 'event_repeat',
        label: 'Subscriptions',
        value: String(activeSubs),
        chev: true,
        onClick: () => goTo('subs'),
      },
      {
        icon: 'rule',
        label: 'Category rules',
        value: String(view.rules.length),
        chev: true,
        onClick: () => goTo('rules'),
      },
    ],
    [
      {
        icon: 'payments',
        label: 'Base currency',
        value: prefs.base,
        onClick: () => setPrefs({ base: next(BASES, prefs.base) }),
      },
      {
        icon: 'contrast',
        label: 'Appearance',
        value: THEME_LABEL[prefs.theme],
        onClick: () => setPrefs({ theme: next(THEMES, prefs.theme) }),
      },
      {
        icon: 'toll',
        label: 'Show cents',
        toggle: prefs.cents,
        onClick: () => setPrefs({ cents: !prefs.cents }),
      },
    ],
    [
      {
        icon: 'lock',
        label: 'Security',
        value: prefs.lockOn ? (prefs.lockMethod === 'face' ? 'Face ID' : 'Passcode') : 'Off',
        chev: true,
        onClick: () => nav.open({ kind: 'security' }),
      },
    ],
    [
      {
        icon: 'account_balance_wallet',
        label: 'Accounts',
        chev: true,
        onClick: () => goTo('accounts'),
      },
      {
        icon: 'dashboard_customize',
        label: 'Customize home',
        chev: true,
        onClick: () => nav.open({ kind: 'widgets' }),
      },
      {
        icon: 'ios_share',
        label: 'Export CSV',
        chev: true,
        onClick: async () => {
          const name = await saveCsv(view);
          if (name) nav.toast(`${name} is ready`);
        },
      },
    ],
    [
      {
        icon: 'system_update',
        label: 'Version',
        value: upd.available ? 'Update available' : `${VERSION} · up to date`,
        strong: upd.available,
        chev: true,
        onClick: () => (upd.available ? applyUpdate() : nav.toast(`Kalyta ${VERSION} is the latest version`)),
      },
    ],
  ];

  return (
    <>
      <div style={{ padding: '20px 20px 0' }}>
        <CloseButton onClick={nav.close} />
      </div>
      <h2 className="large-title" style={{ paddingTop: 18 }}>
        Settings
      </h2>
      {groups.map((rows) => (
        <div key={rows[0].label} className="group" style={{ margin: '22px 20px 0', borderRadius: 28 }}>
          {rows.map((r, i) => (
            <div key={r.label}>
              {i > 0 && <div className="sep" style={{ marginLeft: 60 }} />}
              <button type="button" className="set-row tap" aria-pressed={r.toggle} onClick={r.onClick}>
                <Icon name={r.icon} />
                <span className="lbl">{r.label}</span>
                {r.value && (
                  <span
                    className="value"
                    style={r.strong ? { color: 'var(--text)', fontWeight: 600 } : undefined}
                  >
                    {r.value}
                  </span>
                )}
                {r.toggle !== undefined && <Toggle on={r.toggle} label={r.label} />}
                {r.chev && <Icon name="chevron_right" className="chev" />}
              </button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ margin: '18px 36px 0', fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
        Kalyta {VERSION} · your data lives in your own Google Sheet.
      </div>
    </>
  );
}
