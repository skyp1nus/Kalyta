import { House, Plus, ReceiptText, Settings as SettingsIcon, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BalanceForm, TransferDetails, TransferForm, TxForm } from './components/forms';
import { Sheet, SyncPill, ToastContext, TopBar } from './components/ui';
import { native } from './lib/format';
import { localToday } from './lib/outbox';
import { useStore, useView } from './lib/store';
import type { Account, Transfer, Tx } from './lib/types';
import { Accounts } from './screens/Accounts';
import { Activity } from './screens/Activity';
import { Add, type AddKind } from './screens/Add';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';

type Tab = 'home' | 'activity' | 'add' | 'accounts' | 'settings';
type Open =
  | { kind: 'tx'; t: Tx }
  | { kind: 'transfer'; t: Transfer }
  | { kind: 'account'; a: Account }
  | { kind: 'newTransfer' }
  | null;

const TITLES: Record<Tab, string> = {
  home: 'Kalyta',
  activity: 'Activity',
  add: 'New entry',
  accounts: 'Accounts',
  settings: 'Settings',
};

export function App() {
  const s = useStore();
  const view = useView();
  const [tab, setTab] = useState<Tab>(s.settings ? 'home' : 'settings');
  const [addKind, setAddKind] = useState<AddKind>('expense');
  const [ym, setYm] = useState(() => localToday().slice(0, 7));
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState('');

  const notify = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const close = useCallback(() => setOpen(null), []);
  const done = useCallback(
    (msg: string) => {
      setOpen(null);
      notify(msg);
    },
    [notify],
  );

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const connected = s.settings && view;
  const screen = !connected || tab === 'settings' ? 'settings' : tab;

  return (
    <ToastContext.Provider value={notify}>
      <div className="app">
        <TopBar
          title={
            screen === 'home' ? (
              <h1 className="wordmark">Kalyta</h1>
            ) : screen === 'activity' ? (
              <span />
            ) : (
              <h1 className="screen-title">{TITLES[screen]}</h1>
            )
          }
        >
          {s.settings && <SyncPill onOpen={() => go('settings')} />}
        </TopBar>

        <main>
          {screen === 'settings' && <Settings onConnected={() => go('home')} />}
          {connected && screen === 'home' && (
            <Home
              view={view}
              onOpenTx={(t) => setOpen({ kind: 'tx', t })}
              onOpenTransfer={(t) => setOpen({ kind: 'transfer', t })}
              onSeeAll={() => {
                setYm(view.today.slice(0, 7));
                go('activity');
              }}
              onAccounts={() => go('accounts')}
            />
          )}
          {connected && screen === 'activity' && (
            <Activity
              view={view}
              ym={ym}
              setYm={setYm}
              onOpenTx={(t) => setOpen({ kind: 'tx', t })}
              onOpenTransfer={(t) => setOpen({ kind: 'transfer', t })}
            />
          )}
          {connected && screen === 'add' && (
            <Add view={view} kind={addKind} setKind={setAddKind} onDone={notify} />
          )}
          {connected && screen === 'accounts' && (
            <Accounts
              view={view}
              onOpenAccount={(a) => setOpen({ kind: 'account', a })}
              onOpenTransfer={(t) => setOpen({ kind: 'transfer', t })}
              onNewTransfer={() => setOpen({ kind: 'newTransfer' })}
            />
          )}
        </main>
      </div>

      {connected && open?.kind === 'tx' && (
        <Sheet title={open.t.category === view.income ? 'Edit income' : 'Edit expense'} onClose={close}>
          <TxForm
            view={view}
            kind={open.t.category === view.income ? 'income' : 'expense'}
            initial={open.t}
            onDone={done}
          />
        </Sheet>
      )}
      {connected && open?.kind === 'transfer' && (
        <Sheet title="Transfer" onClose={close}>
          <TransferDetails t={open.t} onDone={done} />
        </Sheet>
      )}
      {connected && open?.kind === 'account' && (
        <Sheet title={`${open.a.name}, ${native(open.a.balance, open.a.currency)}`} onClose={close}>
          <BalanceForm view={view} account={open.a} onDone={done} />
        </Sheet>
      )}
      {connected && open?.kind === 'newTransfer' && (
        <Sheet title="Move money" onClose={close}>
          <TransferForm view={view} onDone={done} />
        </Sheet>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {s.settings && (
        <div className="tabbar">
          <nav aria-label="Main">
            <button
              type="button"
              className="tab"
              aria-current={tab === 'home' ? 'page' : undefined}
              onClick={() => go('home')}
            >
              <House size={22} />
              Home
            </button>
            <button
              type="button"
              className="tab"
              aria-current={tab === 'activity' ? 'page' : undefined}
              onClick={() => go('activity')}
            >
              <ReceiptText size={22} />
              Activity
            </button>
            <button
              type="button"
              className="tab-add"
              aria-label="New entry"
              aria-current={tab === 'add' ? 'page' : undefined}
              onClick={() => go('add')}
            >
              <Plus size={26} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="tab"
              aria-current={tab === 'accounts' ? 'page' : undefined}
              onClick={() => go('accounts')}
            >
              <Wallet size={22} />
              Accounts
            </button>
            <button
              type="button"
              className="tab"
              aria-current={tab === 'settings' ? 'page' : undefined}
              onClick={() => go('settings')}
            >
              <SettingsIcon size={22} />
              Settings
            </button>
          </nav>
        </div>
      )}
    </ToastContext.Provider>
  );
}
