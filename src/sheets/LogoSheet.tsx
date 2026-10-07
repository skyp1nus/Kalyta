import { useState } from 'react';
import { Avatar, Icon } from '../components/ui';
import { accountDomain, BANKS } from '../lib/meta';
import { enqueue } from '../lib/store';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SaveButton, SheetHead } from './common';

const clean = (d: string) =>
  d
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

// Pick the bank (or type its website) whose logo shows on the account
export function LogoSheet({ view, account }: { view: View; account: string }) {
  const nav = useNav();
  const a = view.accounts.find((x) => x.name === account);
  const [domain, setDomain] = useState(accountDomain(account, a?.domain));
  const d = clean(domain);
  const valid = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);

  function save() {
    if (!valid) return;
    enqueue({ action: 'accountDomain', account, domain: d });
    nav.close();
    nav.toast(`${account} logo updated`);
  }

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title="Logo"
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      <div className="acc-hero" style={{ paddingTop: 22 }}>
        <Avatar key={d} name={account} type={a?.type} domain={valid ? d : ''} size={72} />
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 12 }}>{account}</div>
        <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 3 }}>
          {valid ? d : 'Pick a bank or type its website'}
        </div>
      </div>
      <div className="group" style={{ margin: '22px 20px 0' }}>
        <label className="kv-row">
          <span>Website</span>
          <input
            value={domain}
            placeholder="bank.com"
            inputMode="url"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDomain(e.target.value)}
          />
        </label>
      </div>
      <div className="sheet-section">Banks and exchanges</div>
      <div className="group">
        {BANKS.map((b, i) => (
          <div key={b.domain}>
            {i > 0 && <div className="sep" style={{ marginLeft: 62 }} />}
            <button
              type="button"
              className="row"
              style={{ minHeight: 0, padding: '10px 18px' }}
              onClick={() => setDomain(b.domain)}
            >
              <Avatar name={b.name} domain={b.domain} size={30} />
              <span className="main" style={{ fontSize: 16 }}>
                {b.name}
              </span>
              <span style={{ fontSize: 15, color: 'var(--text2)' }}>{b.domain}</span>
              <Icon name={b.domain === d ? 'check' : ''} size={20} style={{ width: 20 }} />
            </button>
          </div>
        ))}
      </div>
      <div className="sheet-note">Saved in the Domain column of the Accounts tab.</div>
    </>
  );
}
