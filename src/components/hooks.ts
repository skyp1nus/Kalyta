import { useCallback } from 'react';
import { deletedMessage, deleteEntry, type Entry } from '../lib/entries';
import { useNav } from '../nav';

// What tapping a record does: open its editor
export function useOpenEntry(): (e: Entry) => void {
  const nav = useNav();
  return useCallback(
    (e: Entry) => {
      if (e.kind === 'tx') nav.open({ kind: 'tx', edit: e.t });
      else if (e.kind === 'transfer') nav.open({ kind: 'transfer', edit: e.t });
      else nav.toast('Swipe left to remove an adjustment');
    },
    [nav],
  );
}

export function useDeleteEntry(): (e: Entry) => void {
  const nav = useNav();
  return useCallback(
    (e: Entry) => {
      const undo = deleteEntry(e);
      nav.toast(deletedMessage(e), undo);
    },
    [nav],
  );
}
