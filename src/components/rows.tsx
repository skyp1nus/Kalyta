import { memo, type PointerEvent, useRef } from 'react';
import { type Entry, type RowLook, rowLook } from '../lib/entries';
import type { Money } from '../lib/money';
import type { View } from '../lib/types';
import { Icon } from './ui';

function RowBody({ look }: { look: RowLook }) {
  return (
    <>
      <span className="avatar" style={{ background: look.color }}>
        <Icon name={look.icon} />
      </span>
      <span className="main">
        <span className="title">
          <span className="ellipsis">{look.title}</span>
          {look.pending && <Icon name="schedule" size={15} style={{ color: 'var(--text2)' }} />}
          {look.failed && <Icon name="error" size={16} style={{ color: 'var(--red)' }} />}
        </span>
        <span className="sub ellipsis" style={{ display: 'block' }}>
          {look.sub}
        </span>
      </span>
      <span className="amt" style={look.income ? { color: 'var(--green)' } : undefined}>
        {look.amt}
        <span className="amt2" style={{ display: 'block' }}>
          {look.amt2}
        </span>
      </span>
    </>
  );
}

export const EntryRow = memo(function EntryRow({
  entry,
  view,
  money,
  onOpen,
}: {
  entry: Entry;
  view: View;
  money: Money;
  onOpen: (e: Entry) => void;
}) {
  const look = rowLook(entry, view, money);
  return (
    <button type="button" className="row" onClick={() => onOpen(entry)}>
      <RowBody look={look} />
    </button>
  );
});

const OPEN = -88;
const DELETE = -130;

// Swipe left: past 44 px it stays open on "Delete", past 130 px it deletes right away
export const SwipeRow = memo(function SwipeRow({
  entry,
  view,
  money,
  open,
  onOpen,
  onReveal,
  onDelete,
}: {
  entry: Entry;
  view: View;
  money: Money;
  open: boolean;
  onOpen: (e: Entry) => void;
  onReveal: (e: Entry | null) => void;
  onDelete: (e: Entry) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const look = rowLook(entry, view, money);

  function collapseAndDelete() {
    const w = wrap.current;
    const f = front.current;
    if (!w || !f) return onDelete(entry);
    w.style.height = `${w.offsetHeight}px`;
    w.classList.add('dragging');
    f.style.transition = 'transform .25s var(--ease)';
    f.style.transform = 'translate3d(-100%,0,0)';
    requestAnimationFrame(() => {
      w.style.transition = 'height .25s var(--ease)';
      w.style.height = '0px';
    });
    setTimeout(() => onDelete(entry), 230);
  }

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, dx: 0 };
  }

  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      d.moved = true;
      front.current?.setPointerCapture(e.pointerId);
      wrap.current?.classList.add('dragging');
    }
    const base = open ? OPEN : 0;
    d.dx = Math.min(0, Math.max(-150, base + dx));
    if (front.current) front.current.style.transform = `translate3d(${d.dx}px,0,0)`;
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 60);
    if (d.dx < DELETE) return collapseAndDelete();
    wrap.current?.classList.remove('dragging');
    if (front.current) front.current.style.transform = '';
    onReveal(d.dx < -44 ? entry : null);
  }

  return (
    <div ref={wrap} className={`swipe ${open ? 'open' : ''}`}>
      <div className="under-delete">
        <button type="button" onClick={collapseAndDelete} tabIndex={open ? 0 : -1}>
          <Icon name="delete" size={22} />
          Delete
        </button>
      </div>
      <button
        ref={front}
        type="button"
        className="row front"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          if (suppressClick.current) return;
          if (open) return onReveal(null);
          onOpen(entry);
        }}
      >
        <RowBody look={look} />
      </button>
    </div>
  );
});
