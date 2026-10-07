import { useCallback, useRef } from 'react';
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

// The grey glow at the top of a screen lives outside the scroll area, pinned during the pull-down
// bounce (so no edge shows above it) and moved up with the content when scrolling. Past its own
// height it is off screen, so the handler stops touching it.
export function usePinnedGlow(max = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const y = useRef(0);
  const onScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      const v = Math.min(Math.max(0, e.currentTarget.scrollTop), max);
      if (v === y.current) return;
      y.current = v;
      if (ref.current) ref.current.style.transform = `translate3d(0,${-v}px,0)`;
    },
    [max],
  );
  return { ref, onScroll };
}
