import { registerSW } from 'virtual:pwa-register';
import { useSyncExternalStore } from 'react';
import { getPrefs, setPrefs } from './prefs';
import { getState } from './store';

export const VERSION = '2.1';

// What the service worker told us about new versions
interface UpdateState {
  available: boolean; // a new version is waiting
  dismissed: boolean; // the user closed the pill for now
  updating: boolean; // "Updating…"
  reloading: boolean; // full-screen splash while the page reloads
  offlineReady: boolean; // first install finished caching
}

let state: UpdateState = {
  available: false,
  dismissed: false,
  updating: false,
  reloading: false,
  offlineReady: false,
};
const listeners = new Set<() => void>();
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useUpdate(): UpdateState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export function startUpdates() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => set({ available: true }),
    onOfflineReady: () => set({ offlineReady: true }),
    onRegisteredSW: (_url, reg) => {
      // look for new versions when the app comes back to the foreground
      if (!reg) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    },
  });
}

export const dismissUpdate = () => set({ dismissed: true });

// skipWaiting + reload, only when the user asks for it
export function applyUpdate() {
  if (!updateSW || state.updating) return;
  set({ updating: true });
  setTimeout(() => set({ reloading: true }), 900);
  setTimeout(() => void updateSW?.(true), 1100);
}

// What to show once after start: "What's new" after an update, "Ready to work offline" after install
export function launchNotice(): 'whatsnew' | 'installed' | null {
  const seen = getPrefs().seenVersion;
  if (seen === VERSION) return null;
  setPrefs({ seenVersion: VERSION });
  // people on 2.0 never stored a version, but they are already connected
  if (seen || getState().settings) return 'whatsnew';
  return 'installed';
}
