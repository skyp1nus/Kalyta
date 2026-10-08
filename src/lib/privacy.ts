import { useSyncExternalStore } from 'react';
import { getPrefs, setPrefs } from './prefs';

// In-memory state for App lock and Hide amounts (never stored)
interface PrivacyState {
  locked: boolean;
  peek: boolean; // amounts shown while a finger is held down
  cover: boolean; // app is in the background: show the blurred cover
  reason: string; // set when the lock screen only confirms an action ("Turn off App lock")
}

let state: PrivacyState = {
  locked: typeof localStorage !== 'undefined' && getPrefs().lockOn,
  peek: false,
  cover: false,
  reason: '',
};
const listeners = new Set<() => void>();
let afterUnlock: (() => void) | null = null;

function set(patch: Partial<PrivacyState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrivacy(): PrivacyState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function usePeek(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.peek,
    () => state.peek,
  );
}

export const setPeek = (peek: boolean) => state.peek !== peek && set({ peek });
export const lockNow = () => set({ locked: true });
export const isLocked = () => state.locked && getPrefs().lockOn;

export function unlock() {
  const fn = afterUnlock;
  afterUnlock = null;
  setPrefs({ passFails: 0, passWaitUntil: 0 });
  set({ locked: false, reason: '' });
  fn?.();
}

// Ask for the passcode or Face ID before a sensitive change
export function confirmWithLock(reason: string, action: () => void) {
  if (!getPrefs().lockOn) return action();
  afterUnlock = action;
  set({ locked: true, reason });
}

export function cancelConfirm() {
  afterUnlock = null;
  set({ locked: false, reason: '' });
}

// ----- passcode -----

const ITERATIONS = 150_000;
const enc = (s: string) => new TextEncoder().encode(s);

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derive(salt: string, code: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations },
    key,
    256,
  );
  return hex(bits);
}

export async function setPasscode(code: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  setPrefs({ passSalt: salt, passHash: `pbkdf2$${ITERATIONS}$${await derive(salt, code, ITERATIONS)}` });
}

export async function checkPasscode(code: string): Promise<boolean> {
  const p = getPrefs();
  if (!p.passHash) return false;
  if (p.passHash.startsWith('pbkdf2$')) {
    const [, iterations, h] = p.passHash.split('$');
    return (await derive(p.passSalt, code, Number(iterations))) === h;
  }
  // 2.1 stored a single SHA-256: upgrade on the first correct entry
  const old = hex(await crypto.subtle.digest('SHA-256', enc(`${p.passSalt}:${code}`)));
  if (old !== p.passHash) return false;
  await setPasscode(code);
  return true;
}

// After 5 wrong passcodes in a row: wait 1, then 5, then 15 minutes
const WAITS = [60e3, 300e3, 900e3];

export function passcodeWait(): number {
  return Math.max(0, getPrefs().passWaitUntil - Date.now());
}

export async function tryPasscode(code: string): Promise<'ok' | 'wrong' | 'wait'> {
  if (passcodeWait() > 0) return 'wait';
  if (await checkPasscode(code)) return 'ok';
  const fails = getPrefs().passFails + 1;
  const wait = fails >= 5 ? WAITS[Math.min(fails - 5, WAITS.length - 1)] : 0;
  setPrefs({ passFails: fails, passWaitUntil: wait ? Date.now() + wait : 0 });
  return 'wrong';
}

export function turnLockOff() {
  setPrefs({ lockOn: false, passHash: '', passSalt: '', credId: '', passFails: 0, passWaitUntil: 0 });
  unlock();
}

// ----- Face ID: a passkey on this device, checked locally -----

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function faceIdAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

// Called straight from the tap: Safari only shows the passkey prompt while the tap is still
// "fresh", so nothing may be awaited before credentials.create (availability is checked earlier).
export async function enrollFaceId(): Promise<'ok' | 'cancelled' | 'unavailable'> {
  if (typeof PublicKeyCredential === 'undefined') return 'unavailable';
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Kalyta' },
        // the same user id every time, so a new passkey replaces the old one
        user: { id: enc('kalyta-app-lock'), name: 'Kalyta', displayName: 'Kalyta' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return 'cancelled';
    setPrefs({ credId: b64(cred.rawId) });
    return 'ok';
  } catch (e) {
    return e instanceof DOMException && e.name === 'NotAllowedError' ? 'cancelled' : 'unavailable';
  }
}

export async function verifyFaceId(): Promise<boolean> {
  const id = getPrefs().credId;
  if (!id) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}

// ----- background: cover in the app switcher, auto-lock -----

const AUTO_MS: Record<string, number> = { Immediately: 0, '1 min': 60e3, '5 min': 300e3, '15 min': 900e3 };

export function startPrivacyWatch() {
  let hiddenAt = 0;
  let coverTimer: ReturnType<typeof setTimeout> | undefined;
  const root = document.documentElement;

  // iOS takes the app switcher snapshot as soon as the swipe starts, which is when the window
  // loses focus (the page is only hidden later). Cover then, synchronously, so the snapshot has it.
  const cover = () => {
    clearTimeout(coverTimer);
    if (!getPrefs().blurSw) return;
    root.classList.add('covered');
    if (!state.cover) set({ cover: true, peek: false });
  };
  const uncover = () => {
    clearTimeout(coverTimer);
    // let the cover fade out once we're back
    coverTimer = setTimeout(() => {
      root.classList.remove('covered');
      if (state.cover) set({ cover: false });
    }, 60);
  };

  window.addEventListener('blur', cover);
  window.addEventListener('pagehide', cover);

  // A Home Screen app gets no event before iOS takes the app switcher snapshot. But the swipe up
  // from the home indicator starts as a touch on the page that iOS cancels once it sees the
  // gesture, while the page is still drawn. Cover then; if the swipe was let go, uncover.
  let edgeTouch = false;
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      edgeTouch = !!t && t.clientY > window.innerHeight - 70;
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'touchcancel',
    () => {
      if (!edgeTouch) return;
      edgeTouch = false;
      cover();
      const check = () => {
        if (document.visibilityState !== 'visible') return;
        if (document.hasFocus()) uncover();
        else coverTimer = setTimeout(check, 400);
      };
      coverTimer = setTimeout(check, 900);
    },
    { capture: true, passive: true },
  );
  window.addEventListener('focus', () => {
    if (document.visibilityState === 'visible') uncover();
  });

  document.addEventListener('visibilitychange', () => {
    const p = getPrefs();
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      cover();
      const patch: Partial<PrivacyState> = { peek: false };
      if (state.reason) {
        afterUnlock = null;
        patch.reason = '';
        patch.locked = false;
      }
      if (p.lockOn && p.autoLock === 'Immediately') patch.locked = true;
      set(patch);
      return;
    }
    const away = Date.now() - hiddenAt;
    if (p.lockOn && hiddenAt && away >= (AUTO_MS[p.autoLock] ?? 60e3)) set({ locked: true });
    if (document.hasFocus()) uncover();
  });
}
