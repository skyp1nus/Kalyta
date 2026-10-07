import type { View } from '../lib/types';
import type { SheetSpec } from '../nav';
import { BalanceSheet } from './BalanceSheet';
import { BudgetsSheet } from './BudgetsSheet';
import { ConvertSheet } from './ConvertSheet';
import { LogoSheet } from './LogoSheet';
import { ReviewSheet } from './ReviewSheet';
import { RuleSheet } from './RuleSheet';
import { LockSetupSheet, SecuritySheet } from './SecuritySheet';
import { SettingsSheet } from './SettingsSheet';
import { SubSheet } from './SubSheet';
import { SyncSheet } from './SyncSheet';
import { TransferSheet } from './TransferSheet';
import { TxSheet } from './TxSheet';
import { WhatsNewSheet } from './WhatsNewSheet';
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
    case 'budgets':
      return <BudgetsSheet view={view} />;
    case 'sub':
      return <SubSheet view={view} edit={spec.edit} setTint={setTint} />;
    case 'rule':
      return <RuleSheet view={view} edit={spec.edit} setTint={setTint} />;
    case 'review':
      return <ReviewSheet view={view} />;
    case 'whatsnew':
      return <WhatsNewSheet />;
    case 'security':
      return <SecuritySheet />;
    case 'lockSetup':
      return <LockSetupSheet step={spec.step} change={spec.change} />;
    case 'logo':
      return <LogoSheet view={view} account={spec.account} />;
  }
}
