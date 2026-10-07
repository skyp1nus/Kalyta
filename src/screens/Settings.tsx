import { RefreshCw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { native } from '../lib/format';
import { connect, discardOp, forgetDevice, retryOp, sync, useStore } from '../lib/store';
import type { Op } from '../lib/types';

function describe(op: Op): string {
  switch (op.action) {
    case 'add':
      return `${op.tx.kind === 'income' ? 'Income' : 'Expense'} ${native(Number(op.tx.amount), op.tx.currency)}${op.tx.merchant ? `, ${op.tx.merchant}` : ''}`;
    case 'update':
      return `Edit ${op.tx.merchant || 'entry'}`;
    case 'delete':
      return 'Delete entry';
    case 'transfer':
      return `Transfer ${op.tr.from} to ${op.tr.to}`;
    case 'deleteTransfer':
      return 'Delete transfer';
    case 'balance':
      return `Balance ${op.account}`;
  }
}

export function Settings({ onConnected }: { onConnected: () => void }) {
  const s = useStore();
  const [url, setUrl] = useState(s.settings?.url ?? '');
  const [key, setKey] = useState(s.settings?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);

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
    setBusy(true);
    setError('');
    try {
      await connect({ url: u, key: key.trim() });
      onConnected();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const last = s.lastSync ? new Date(s.lastSync) : null;
  return (
    <>
      {!s.settings && (
        <p className="hint" style={{ fontSize: 15, color: 'var(--ink-2)', marginBottom: 18 }}>
          Connect Kalyta to your Google Sheet. You need the web app URL of your Apps Script and the VIEW_KEY
          you set in it.
        </p>
      )}

      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="label">Web app URL</span>
          <input
            className="input"
            type="url"
            autoComplete="off"
            placeholder="https://script.google.com/macros/s/…/exec"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
          />
        </label>
        <label className="field">
          <span className="label">Access key</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder="VIEW_KEY from the script"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError('');
            }}
          />
          {error && <p className="error">{error}</p>}
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Connecting…' : s.settings ? 'Save and reconnect' : 'Connect'}
        </button>
      </form>

      {s.settings && (
        <>
          <h2 className="section">Sync</h2>
          <div className="list">
            <div className="kv">
              <span className="muted">Status</span>
              <span>{s.syncing ? 'Syncing…' : s.online ? 'Online' : 'Offline'}</span>
            </div>
            <div className="kv">
              <span className="muted">Last synced</span>
              <span>
                {last
                  ? last.toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'never'}
              </span>
            </div>
            {s.lastError && (
              <div className="kv">
                <span className="muted">Last problem</span>
                <span className="bad">{s.lastError}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 10 }}
            onClick={() => void sync()}
            disabled={s.syncing}
          >
            <RefreshCw size={18} />
            Sync now
          </button>

          <h2 className="section">
            Waiting to sync <span className="aside">{s.outbox.length}</span>
          </h2>
          <div className="list">
            {s.outbox.length === 0 && <p className="empty">Everything is saved in your sheet.</p>}
            {s.outbox.map((op) => (
              <div className="kv" key={op.opId} style={{ alignItems: 'center' }}>
                <span style={{ minWidth: 0 }}>
                  {describe(op)}
                  {op.error && (
                    <span className="error" style={{ display: 'block', margin: 0 }}>
                      {op.error}
                    </span>
                  )}
                </span>
                {op.error ? (
                  <span style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button type="button" className="btn small" onClick={() => retryOp(op.opId)}>
                      Retry
                    </button>
                    <button type="button" className="btn small danger" onClick={() => discardOp(op.opId)}>
                      Discard
                    </button>
                  </span>
                ) : (
                  <span className="muted small">queued</span>
                )}
              </div>
            ))}
          </div>

          <h2 className="section">This device</h2>
          <button
            type="button"
            className={`btn danger ${armed ? 'armed' : ''}`}
            onClick={() => {
              if (!armed) return setArmed(true);
              forgetDevice();
              setUrl('');
              setKey('');
              setArmed(false);
            }}
          >
            {armed ? 'Tap again: unsynced entries will be lost' : 'Disconnect this device'}
          </button>
          <p className="hint">Your sheet keeps all data. Disconnecting only clears this phone.</p>
        </>
      )}
    </>
  );
}
