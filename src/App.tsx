import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Cover, LockScreen, Reloading } from './components/Overlays';
import { Icon } from './components/ui';
import { getPrefs, usePrefs } from './lib/prefs';
import { isLocked, setPeek, usePrivacy } from './lib/privacy';
import { useStore, useView } from './lib/store';
import { launchNotice, useUpdate } from './lib/update';
import { type Nav, NavContext, type Screen, type SheetSpec, type ToastIcon } from './nav';
import { AccountScreen } from './screens/Account';
import { Accounts } from './screens/Accounts';
import { Categories } from './screens/Categories';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Rules } from './screens/Rules';
import { Statistics } from './screens/Statistics';
import { Subscriptions } from './screens/Subscriptions';
import { Transactions } from './screens/Transactions';
import { SheetContent } from './sheets/SheetContent';

interface Layer {
  id: number;
  screen: Screen;
}

type Pos = 'top' | 'under' | 'deep' | 'off';

let nextLayerId = 1;

function StackLayer({
  pos,
  initial,
  z,
  onGone,
  setNode,
  children,
}: {
  pos: Pos;
  initial: boolean;
  z: number;
  onGone: () => void;
  setNode: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(initial);

  // Mount off-screen, flush styles, then slide in
  useLayoutEffect(() => {
    if (entered) return;
    ref.current?.getBoundingClientRect();
    setEntered(true);
  }, [entered]);

  useEffect(() => {
    if (pos !== 'off') return;
    const t = setTimeout(onGone, 650);
    return () => clearTimeout(t);
  }, [pos, onGone]);

  const cls = !entered || pos === 'off' ? 'off' : pos === 'top' ? '' : 'under';
  return (
    <div
      ref={(el) => {
        ref.current = el;
        setNode(el);
      }}
      className={`layer ${cls}`}
      style={{ zIndex: z, visibility: pos === 'deep' ? 'hidden' : undefined }}
      aria-hidden={pos !== 'top'}
      inert={pos !== 'top'}
      onTransitionEnd={(e) => {
        if (e.target === ref.current && pos === 'off') onGone();
      }}
    >
      {children}
    </div>
  );
}

function useThemeAttr() {
  const { theme } = usePrefs();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const t = theme === 'auto' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = t;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', t === 'light' ? '#f2f2f7' : '#000000');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

// Attaches non-passive touch listeners (needed to stop the page from scrolling while dragging)
function useTouchDrag(
  ref: React.RefObject<HTMLElement | null>,
  handlers: { start: (e: TouchEvent) => void; move: (e: TouchEvent) => void; end: (e: TouchEvent) => void },
) {
  const h = useRef(handlers);
  h.current = handlers;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = (e: TouchEvent) => h.current.start(e);
    const move = (e: TouchEvent) => h.current.move(e);
    const end = (e: TouchEvent) => h.current.end(e);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref]);
}

export function App() {
  const s = useStore();
  const view = useView();
  const privacy = usePrivacy();
  const { lockOn } = usePrefs();
  const lockedNow = privacy.locked && lockOn && !!s.settings;
  useThemeAttr();

  // ----- screen stack -----
  const [stack, setStack] = useState<Layer[]>([{ id: 0, screen: { name: 'home' } }]);
  const [leaving, setLeaving] = useState<Layer[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const nodes = useRef(new Map<number, HTMLDivElement>());

  const pop = useCallback(() => {
    const st = stackRef.current;
    if (st.length < 2) return;
    stackRef.current = st.slice(0, -1);
    setLeaving((l) => [...l, st[st.length - 1]]);
    setStack(stackRef.current);
  }, []);

  const push = useCallback((screen: Screen) => {
    const st = stackRef.current;
    const kept = st.filter((l, i) => i === 0 || l.screen.name !== screen.name);
    stackRef.current = [...kept, { id: nextLayerId++, screen }];
    setStack(stackRef.current);
  }, []);

  const reset = useCallback((screens: Screen[]) => {
    const st = stackRef.current;
    if (st.length > 1) setLeaving((l) => [...l, st[st.length - 1]]);
    stackRef.current = [
      st[0],
      ...screens.filter((x) => x.name !== 'home').map((screen) => ({ id: nextLayerId++, screen })),
    ];
    setStack(stackRef.current);
  }, []);

  const goneHandlers = useRef(new Map<number, () => void>());
  const onGone = (id: number) => {
    let f = goneHandlers.current.get(id);
    if (!f) {
      f = () => {
        goneHandlers.current.delete(id);
        setLeaving((l) => l.filter((x) => x.id !== id));
      };
      goneHandlers.current.set(id, f);
    }
    return f;
  };

  // ----- bottom sheet -----
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [sheetOn, setSheetOn] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [tint, setTint] = useState('transparent');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sheetScroll = useRef<HTMLDivElement>(null);

  const open = useCallback((spec: SheetSpec) => {
    clearTimeout(closeTimer.current);
    setSheet(spec);
    setSheetKey((k) => k + 1);
    setTint('transparent');
    setSheetOn(true);
    sheetScroll.current?.scrollTo({ top: 0 });
  }, []);

  const close = useCallback(() => {
    setSheetOn(false);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setSheet(null), 520);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  // ----- toast -----
  const [toastState, setToastState] = useState<{
    msg: string;
    undo?: () => void;
    icon?: ToastIcon;
    on: boolean;
  }>({
    msg: '',
    on: false,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string, undo?: () => void, icon?: ToastIcon) => {
    clearTimeout(toastTimer.current);
    setToastState({ msg, undo, icon, on: true });
    toastTimer.current = setTimeout(() => setToastState((t) => ({ ...t, on: false })), undo ? 4200 : 2400);
  }, []);

  const nav = useMemo<Nav>(
    () => ({ push, pop, reset, open, close, toast }),
    [push, pop, reset, open, close, toast],
  );

  // "What's new" once after an update, "Ready to work offline" after the first install
  const upd = useUpdate();
  const [notice, setNotice] = useState<ReturnType<typeof launchNotice> | undefined>(undefined);
  useEffect(() => {
    if (!view || notice !== undefined) return;
    const n = launchNotice();
    setNotice(n);
    if (n === 'whatsnew') setTimeout(() => open({ kind: 'whatsnew' }), 600);
  }, [view, open, notice]);
  // the service worker may finish caching before onboarding is done
  const offlineToast = useRef(false);
  useEffect(() => {
    if (upd.offlineReady && notice === 'installed' && !offlineToast.current) {
      offlineToast.current = true;
      toast('Ready to work offline', undefined, { icon: 'offline_pin', color: 'var(--green)' });
    }
  }, [upd.offlineReady, notice, toast]);

  // Hide amounts: touch and hold anywhere to peek
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | null = null;
    let peeked = false;
    const down = (e: PointerEvent) => {
      peeked = false;
      if (!getPrefs().hide || isLocked()) return;
      if ((e.target as Element | null)?.closest?.('.keypad, .lock-screen')) return;
      start = { x: e.clientX, y: e.clientY };
      clearTimeout(timer);
      timer = setTimeout(() => {
        peeked = true;
        setPeek(true);
      }, 380);
    };
    const move = (e: PointerEvent) => {
      if (start && !peeked && (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8)) {
        clearTimeout(timer);
        start = null;
      }
    };
    const up = () => {
      clearTimeout(timer);
      start = null;
      setPeek(false);
    };
    // a long press that peeked shouldn't also tap whatever was under the finger
    const click = (e: MouseEvent) => {
      if (!peeked) return;
      peeked = false;
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('click', click, true);
    };
  }, []);

  // Escape closes the sheet, then goes back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isLocked()) return;
      if (sheetOn) close();
      else pop();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOn, close, pop]);

  // ----- swipe from the left edge to go back -----
  const appRef = useRef<HTMLDivElement>(null);
  const edge = useRef<{
    x: number;
    y: number;
    t: number;
    dx: number;
    on: boolean;
    top: HTMLElement;
    under?: HTMLElement;
  } | null>(null);
  useTouchDrag(appRef, {
    start(e) {
      const st = stackRef.current;
      const x = e.touches[0].clientX;
      if (st.length < 2 || x > 24 || e.touches.length > 1) return;
      const top = nodes.current.get(st[st.length - 1].id);
      if (!top) return;
      const under = nodes.current.get(st[st.length - 2].id);
      edge.current = { x, y: e.touches[0].clientY, t: e.timeStamp, dx: 0, on: false, top, under };
    },
    move(e) {
      const g = edge.current;
      if (!g) return;
      const dx = e.touches[0].clientX - g.x;
      const dy = e.touches[0].clientY - g.y;
      if (!g.on) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
          edge.current = null;
          return;
        }
        if (dx < 8) return;
        g.on = true;
        g.top.style.transition = 'none';
        if (g.under) g.under.style.transition = 'none';
      }
      e.preventDefault();
      g.dx = Math.max(0, dx);
      const w = appRef.current?.clientWidth ?? 390;
      g.top.style.transform = `translate3d(${g.dx}px,0,0)`;
      if (g.under) g.under.style.transform = `translate3d(${-0.3 * w + 0.3 * g.dx}px,0,0)`;
    },
    end(e) {
      const g = edge.current;
      edge.current = null;
      if (!g?.on) return;
      const w = appRef.current?.clientWidth ?? 390;
      const v = g.dx / Math.max(1, e.timeStamp - g.t);
      const back = g.dx > w * 0.35 || (v > 0.5 && g.dx > 40);
      g.top.style.transition = '';
      g.top.style.transform = back ? 'translate3d(100%,0,0)' : '';
      if (g.under) {
        g.under.style.transition = '';
        g.under.style.transform = '';
      }
      if (back) pop();
    },
  });

  // ----- drag the sheet down to close it -----
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetDrag = useRef<{ x: number; y: number; t: number; dy: number; on: boolean } | null>(null);
  useTouchDrag(sheetRef, {
    start(e) {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, .handle, .cat-chips, .acc-chips')) return;
      if ((sheetScroll.current?.scrollTop ?? 0) > 0) return;
      sheetDrag.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        t: e.timeStamp,
        dy: 0,
        on: false,
      };
    },
    move(e) {
      const g = sheetDrag.current;
      const el = sheetRef.current;
      if (!g || !el) return;
      const dx = e.touches[0].clientX - g.x;
      const dy = e.touches[0].clientY - g.y;
      if (!g.on) {
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
          sheetDrag.current = null;
          return;
        }
        if (dy < 8) return;
        g.on = true;
        el.classList.add('dragging');
      }
      e.preventDefault();
      g.dy = Math.max(0, dy - 8);
      el.style.transform = `translate3d(0,${g.dy}px,0)`;
    },
    end(e) {
      const g = sheetDrag.current;
      const el = sheetRef.current;
      sheetDrag.current = null;
      if (!g?.on || !el) return;
      const v = g.dy / Math.max(1, e.timeStamp - g.t);
      el.classList.remove('dragging');
      el.style.transform = '';
      if (g.dy > 140 || (v > 0.6 && g.dy > 30)) close();
    },
  });

  const renderScreen = (screen: Screen) => {
    switch (screen.name) {
      case 'home':
        return <Home view={view} />;
      case 'accounts':
        return view && <Accounts view={view} />;
      case 'account':
        return view && <AccountScreen view={view} name={screen.account} />;
      case 'transactions':
        return view && <Transactions view={view} ym={screen.ym} filter={screen.filter} />;
      case 'stats':
        return view && <Statistics view={view} ym={screen.ym} />;
      case 'subs':
        return view && <Subscriptions view={view} />;
      case 'rules':
        return view && <Rules view={view} />;
      case 'categories':
        return view && <Categories view={view} />;
    }
  };

  const layers: Array<{ layer: Layer; pos: Pos }> = [
    ...stack.map((layer, i) => ({
      layer,
      pos: (i === stack.length - 1 ? 'top' : i === stack.length - 2 ? 'under' : 'deep') as Pos,
    })),
    ...leaving.map((layer) => ({ layer, pos: 'off' as Pos })),
  ];

  return (
    <NavContext.Provider value={nav}>
      <div className="app" ref={appRef} inert={sheetOn || !s.settings || lockedNow} aria-hidden={lockedNow}>
        {layers.map(({ layer, pos }, i) => (
          <StackLayer
            key={layer.id}
            pos={pos}
            z={i + 1}
            initial={layer.id === 0}
            onGone={onGone(layer.id)}
            setNode={(el) => {
              if (el) nodes.current.set(layer.id, el);
              else nodes.current.delete(layer.id);
            }}
          >
            {renderScreen(layer.screen)}
          </StackLayer>
        ))}
      </div>

      <div className={`scrim ${sheetOn ? 'on' : ''}`} onClick={close} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`sheet ${sheetOn ? 'on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!sheetOn || lockedNow}
        inert={!sheetOn || lockedNow}
      >
        <div className="tint" style={{ background: tint }} />
        <div className="grabber" />
        <div className="scroll" ref={sheetScroll}>
          <div className="sheet-body">
            {sheet && view && <SheetContent key={sheetKey} spec={sheet} view={view} setTint={setTint} />}
          </div>
        </div>
      </div>

      {!s.settings && <Onboarding />}
      <LockScreen sheetName={view?.sheetName ?? ''} />
      <Cover />
      <Reloading />

      <div
        className={`toast-wrap ${toastState.on && !lockedNow && !privacy.cover ? 'on' : ''}`}
        role="status"
        aria-live="polite"
        inert={lockedNow || privacy.cover}
      >
        <div className={`toast ${toastState.undo ? 'has-undo' : ''}`}>
          {toastState.icon && (
            <Icon
              name={toastState.icon.icon}
              size={20}
              style={{ margin: '0 -4px', color: toastState.icon.color }}
            />
          )}
          <span>{toastState.msg}</span>
          {toastState.undo && (
            <button
              type="button"
              onClick={() => {
                toastState.undo?.();
                clearTimeout(toastTimer.current);
                setToastState((t) => ({ ...t, on: false, undo: undefined }));
              }}
            >
              Undo
            </button>
          )}
        </div>
      </div>
    </NavContext.Provider>
  );
}
