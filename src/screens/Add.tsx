import { BalanceForm, TransferForm, TxForm } from '../components/forms';
import type { View } from '../lib/types';

export type AddKind = 'expense' | 'income' | 'transfer' | 'balance';

const KINDS: Array<[AddKind, string]> = [
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['transfer', 'Transfer'],
  ['balance', 'Balance'],
];

export function Add({
  view,
  kind,
  setKind,
  onDone,
}: {
  view: View;
  kind: AddKind;
  setKind: (k: AddKind) => void;
  onDone: (message: string) => void;
}) {
  return (
    <>
      <fieldset className="segmented">
        <legend className="sr-only">What are you adding</legend>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </fieldset>
      {(kind === 'expense' || kind === 'income') && (
        <TxForm key={kind} view={view} kind={kind} onDone={onDone} />
      )}
      {kind === 'transfer' && <TransferForm view={view} onDone={onDone} />}
      {kind === 'balance' && <BalanceForm view={view} onDone={onDone} />}
    </>
  );
}
