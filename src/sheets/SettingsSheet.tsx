import { Icon, Toggle } from '../components/ui';
import { saveCsv } from '../lib/csv';
import { BASES, setPrefs, type Theme, usePrefs } from '../lib/prefs';
import { useStore } from '../lib/store';
import { syncInfo } from '../lib/syncState';
import type { View } from '../lib/types';
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
  onClick: () => void;
}

export function SettingsSheet({ view }: { view: View }) {
  const nav = useNav();
  const prefs = usePrefs();
  const info = syncInfo(useStore());
  const next = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length];

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
        icon: 'account_balance_wallet',
        label: 'Accounts',
        chev: true,
        onClick: () => {
          nav.close();
          nav.reset([{ name: 'accounts' }]);
        },
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
                {r.value && <span className="value">{r.value}</span>}
                {r.toggle !== undefined && <Toggle on={r.toggle} label={r.label} />}
                {r.chev && <Icon name="chevron_right" className="chev" />}
              </button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ margin: '18px 36px 0', fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
        Kalyta 2.0 · your data lives in your own Google Sheet.
      </div>
    </>
  );
}
