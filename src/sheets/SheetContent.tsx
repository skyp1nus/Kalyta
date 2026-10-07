import type { View } from '../lib/types';
import type { SheetSpec } from '../nav';
import { BalanceSheet } from './BalanceSheet';
import { ConvertSheet } from './ConvertSheet';
import { SettingsSheet } from './SettingsSheet';
import { SyncSheet } from './SyncSheet';
import { TransferSheet } from './TransferSheet';
import { TxSheet } from './TxSheet';
import { WidgetsSheet } from './WidgetsSheet';

export function SheetContent({
  spec,
  view,
  setTint,
}: {
  spec: SheetSpec;
  view: View;
  setTint: (t: string) => void;
}) {
  switch (spec.kind) {
    case 'tx':
      return (
        <TxSheet view={view} edit={spec.edit} account={spec.account} type={spec.type} setTint={setTint} />
      );
    case 'transfer':
      return <TransferSheet view={view} edit={spec.edit} from={spec.from} setTint={setTint} />;
    case 'balance':
      return <BalanceSheet view={view} name={spec.account} />;
    case 'convert':
      return <ConvertSheet view={view} />;
    case 'settings':
      return <SettingsSheet view={view} />;
    case 'sync':
      return <SyncSheet view={view} />;
    case 'widgets':
      return <WidgetsSheet />;
  }
}
