import { useSyncExternalStore } from 'react';
import { getPrefs, setPrefs } from './prefs';

// In-memory state for App lock and Hide amounts (never stored)
interface PrivacyState {
  locked: boolean;
  peek: boolean; // amounts shown while a finger is held down
  cover: boolean; // app is in the background: show the blurred cover
}

let state: PrivacyState = {
  locked: typeof localStorage !== 'undefined' && getPrefs().lockOn,
  peek: false,
  cover: false,
};
const listeners = new Set<() => void>();

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
export const unlock = () => set({ locked: false });

// ----- passcode -----

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hash(salt: string, code: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${code}`)));
}

export async function setPasscode(code: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  setPrefs({ passSalt: salt, passHash: await hash(salt, code) });
}

export async function checkPasscode(code: string): Promise<boolean> {
  const p = getPrefs();
  return !!p.passHash && (await hash(p.passSalt, code)) === p.passHash;
}

export function turnLockOff() {
  setPrefs({ lockOn: false, passHash: '', passSalt: '', credId: '' });
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

export async function enrollFaceId(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Kalyta' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Kalyta', displayName: 'Kalyta' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    setPrefs({ credId: b64(cred.rawId) });
    return true;
  } catch {
    return false;
  }
}

export async function verifyFaceId(): Promise<boolean> {
  const id = getPrefs().credId;
  if (!id) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(id) }],
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
  document.addEventListener('visibilitychange', () => {
    const p = getPrefs();
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (p.blurSw) set({ cover: true });
      return;
    }
    const away = Date.now() - hiddenAt;
    if (p.lockOn && hiddenAt && away >= (AUTO_MS[p.autoLock] ?? 60e3)) set({ locked: true });
    // let the cover fade out once we're back
    setTimeout(() => set({ cover: false }), 60);
  });
}
