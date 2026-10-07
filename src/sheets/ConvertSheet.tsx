import { useState } from 'react';
import { Icon } from '../components/ui';
import { CURRENCY_SIGN, parseAmount, shortDate, time } from '../lib/format';
import { CURRENCIES, CURRENCY_NAMES } from '../lib/meta';
import { useMoney } from '../lib/money';
import { useStore } from '../lib/store';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SheetHead } from './common';

function localStamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ConvertSheet({ view }: { view: View }) {
  const nav = useNav();
  const money = useMoney(view);
  const online = useStore().online;
  const [active, setActive] = useState({ cur: money.base === 'USD' ? 'USD' : money.base, val: '100' });
  const v = parseAmount(active.val) || 0;
  const at = localStamp(view.fetchedAt);
  const when = at ? `${shortDate(at, view.today)} at ${time(at)}` : 'never';

  return (
    <>
      <SheetHead left={<CloseButton onClick={nav.close} />} title="Quick convert" />
      <div className="group" style={{ margin: '24px 20px 0', borderRadius: 28 }}>
        {CURRENCIES.map((c, i) => {
          const on = c === active.cur;
          const conv = on ? null : money.convert(v, active.cur, c);
          return (
            <div key={c}>
              {i > 0 && <div className="sep" />}
              <label className="row">
                <span
                  className="avatar"
                  style={{ background: 'var(--seg)', color: 'var(--text)', boxShadow: 'none' }}
                >
                  {CURRENCY_SIGN[c] ?? c[0]}
                </span>
                <span className="main">
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 600 }}>{c}</span>
                  <span style={{ display: 'block', fontSize: 14, color: 'var(--text2)' }}>
                    {CURRENCY_NAMES[c]}
                  </span>
                </span>
                <input
                  className={`conv-input ${on ? 'on' : ''}`}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Amount in ${c}`}
                  placeholder="0"
                  value={
                    on
                      ? active.val
                      : v && conv != null
                        ? conv.toLocaleString('en-US', { maximumFractionDigits: 2 })
                        : v
                          ? '—'
                          : ''
                  }
                  onFocus={() => !on && setActive({ cur: c, val: '' })}
                  onChange={(e) => setActive({ cur: c, val: e.target.value.replace(/[^0-9.,]/g, '') })}
                />
              </label>
            </div>
          );
        })}
      </div>
      <div className="hint-line" style={{ justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <Icon name={online ? 'schedule' : 'cloud_off'} size={16} />
        {online ? `Rates updated ${when}` : `Offline · using rates saved ${when}`}
      </div>
    </>
  );
}
