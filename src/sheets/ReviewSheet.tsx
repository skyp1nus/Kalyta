import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { Icon, Toggle } from '../components/ui';
import { txInputOf } from '../lib/entries';
import { dayHeading, time } from '../lib/format';
import { categoryMeta } from '../lib/meta';
import { useMoney } from '../lib/money';
import { kwOf, needsReview, norm, placeMatches } from '../lib/rules';
import { enqueue } from '../lib/store';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SheetHead } from './common';

const EASE = 'cubic-bezier(.32,.72,0,1)';

// Uncategorized records one card at a time: tap a category, swipe to skip or go back
export function ReviewSheet({ view }: { view: View }) {
  const nav = useNav();
  const money = useMoney(view);
  const [list] = useState(() =>
    view.tx
      .filter(needsReview)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => t.id),
  );
  const [i, setI] = useState(0);
  const [done, setDone] = useState(list.length === 0);
  const [remember, setRemember] = useState(true);
  const [stats, setStats] = useState({ n: 0, r: 0 });
  const card = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const drag = useRef<{ x: number; dx: number; moved: boolean } | null>(null);
  // cards already sorted along with another one ("Remember" for the same place)
  const handled = useRef(new Set<string>());

  const t = view.tx.find((x) => x.id === list[i]);

  // the record went away (deleted on another device): move on instead of showing "Done"
  useEffect(() => {
    if (done || t || !list.length) return;
    const ni = list.findIndex((id, k) => k > i && view.tx.some((x) => x.id === id));
    if (ni < 0) setDone(true);
    else setI(ni);
  }, [done, t, list, i, view.tx]);
  const acc = t ? view.accounts.find((a) => a.name === t.account) : undefined;
  const left = view.tx.filter(needsReview).length;

  const place = (dx: number, tr: string) => {
    const el = card.current;
    if (!el) return;
    el.style.transition = tr;
    el.style.transform = `translateX(${dx}px) rotate(${(dx / 40).toFixed(2)}deg)`;
  };

  // fly out one way, bring the next card in from the other side
  function go(dir: 1 | -1) {
    let ni = i + dir;
    while (ni >= 0 && ni < list.length && handled.current.has(list[ni])) ni += dir;
    if (ni < 0) return place(0, `transform .35s ${EASE}`);
    busy.current = true;
    place(-dir * 440, 'transform .28s ease-in');
    setTimeout(() => {
      busy.current = false;
      if (ni >= list.length) {
        setDone(true);
        return;
      }
      setI(ni);
      place(dir * 420, 'none');
      requestAnimationFrame(() => requestAnimationFrame(() => place(0, `transform .4s ${EASE}`)));
    }, 260);
  }

  function assign(cat: string) {
    if (!t || busy.current) return;
    enqueue({ action: 'update', id: t.id, tx: txInputOf(t, view, { category: cat }) });
    const kw = kwOf(t.merchant);
    const addRule = remember && kw.trim().length >= 2 && !view.rules.some((r) => norm(r.kw) === norm(kw));
    if (addRule) enqueue({ action: 'rule', kw, cat });
    // the other cards for the same place get the same category
    let more = 0;
    if (remember && kw.trim().length >= 2) {
      for (const id of list) {
        const x = view.tx.find((y) => y.id === id);
        if (
          !x ||
          x.id === t.id ||
          handled.current.has(id) ||
          !needsReview(x) ||
          !placeMatches(kw, x.merchant)
        )
          continue;
        enqueue({ action: 'update', id: x.id, tx: txInputOf(x, view, { category: cat }) });
        handled.current.add(id);
        more++;
      }
    }
    handled.current.add(t.id);
    setStats((s) => ({ n: s.n + 1 + more, r: s.r + (addRule ? 1 : 0) }));
    go(1);
  }

  const down = (e: PointerEvent) => {
    drag.current = { x: e.clientX, dx: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.dx = e.clientX - d.x;
    if (Math.abs(d.dx) > 6) d.moved = true;
    if (d.moved) place(d.dx, 'none');
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || busy.current) return;
    if (d.dx < -90) go(1);
    else if (d.dx > 90 && i > 0) go(-1);
    else place(0, `transform .35s ${EASE}`);
  };

  const usd = t ? money.toUsd(t.amount, t.currency) : null;
  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title="Needs a category"
        right={
          <div style={{ minWidth: 44, textAlign: 'right', fontSize: 15, color: 'var(--text2)' }}>
            {!done && list.length ? `${i + 1} of ${list.length}` : ''}
          </div>
        }
      />
      {!done && t ? (
        <>
          <div style={{ padding: '22px 20px 0', overflow: 'hidden' }}>
            <div
              ref={card}
              className="review-card"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <div className="src">
                <Icon name="contactless" size={17} />
                APPLE PAY · {(acc?.name ?? t.account).toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 14 }}>{t.merchant}</div>
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.2, marginTop: 4 }}>
                {money.n(t.amount, t.currency, '−')}
              </div>
              <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 4 }}>
                {t.currency !== money.base && usd != null ? `≈ ${money.B(usd)} · ` : ''}
                {dayHeading(t.date, view.today)}, {time(t.date)}
              </div>
            </div>
          </div>
          <div className="dots" aria-hidden="true">
            {list.map((id, k) => (
              <span key={id} className={k === i ? 'on' : ''} />
            ))}
          </div>
          <div className="review-cats">
            {view.categories.map((c) => {
              const meta = categoryMeta(c);
              return (
                <button key={c} type="button" onClick={() => assign(c)}>
                  <span className="ic" style={{ background: meta.color }}>
                    <Icon name={meta.icon} size={20} />
                  </span>
                  {c}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="toggle-row"
            aria-pressed={remember}
            onClick={() => setRemember(!remember)}
          >
            <span className="ellipsis" style={{ flex: 1, fontSize: 16 }}>
              Remember for “{kwOf(t.merchant)}”
            </span>
            <Toggle on={remember} label="Remember" />
          </button>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)', marginTop: 12 }}>
            Swipe the card to skip or go back
          </div>
        </>
      ) : (
        <div className="empty" style={{ paddingTop: 90 }}>
          <span className="done-circle">
            <Icon name="check" size={40} />
          </span>
          <div className="et">{!list.length ? 'Nothing to sort' : left ? 'Done for now' : 'All sorted'}</div>
          <div className="ex">
            {!list.length
              ? 'Every record has a category.'
              : `${stats.n} record${stats.n === 1 ? '' : 's'} categorized${stats.r ? `, ${stats.r} rule${stats.r === 1 ? '' : 's'} added` : ''}.${left ? ` ${left} left for later.` : ''}`}
          </div>
          <button
            type="button"
            className="fill-btn"
            style={{ marginTop: 24, padding: '0 28px' }}
            onClick={nav.close}
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
