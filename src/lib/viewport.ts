// iOS Home Screen apps: after the keyboard closes, WebKit can leave the viewport shorter than
// the screen until the app is relaunched. Everything sits ~60px too high and a black band shows
// at the bottom. Hiding and showing the full-height root for one reflow makes it measure again.

const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export function startViewportFix() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return;

  // tallest height seen per width, so rotating the phone doesn't count as shrinking
  const tallest = new Map<number, number>();
  const note = () => {
    if (typing()) return;
    const w = window.innerWidth;
    tallest.set(w, Math.max(tallest.get(w) ?? 0, window.innerHeight));
  };
  note();
  window.addEventListener('resize', note);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (typing()) return;
      // the keyboard may have scrolled the page itself; it never should be
      if (window.scrollY) window.scrollTo(0, 0);
      const full = tallest.get(window.innerWidth) ?? 0;
      if (window.innerHeight >= full - 40) return;
      const root = document.getElementById('root');
      if (!root) return;
      const scrolls = Array.from(document.querySelectorAll<HTMLElement>('.scroll'), (el) => [
        el,
        el.scrollTop,
      ]) as Array<[HTMLElement, number]>;
      root.style.display = 'none';
      void root.offsetHeight;
      root.style.display = '';
      for (const [el, top] of scrolls) el.scrollTop = top;
      note();
    }, 160);
  };
  document.addEventListener('focusout', check);
  window.visualViewport?.addEventListener('resize', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
