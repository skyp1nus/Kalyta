import { type PointerEvent, useRef, useState } from 'react';
import { Icon, Toggle } from '../components/ui';
import { type Block, resetHome, setPrefs, usePrefs } from '../lib/prefs';
import { useNav } from '../nav';
import { SheetHead } from './common';

const META: Record<Block, [string, string]> = {
  cards: ['Week & month', 'bar_chart'],
  budgets: ['Budgets', 'savings'],
  upcoming: ['Upcoming', 'event_repeat'],
  accounts: ['Accounts', 'account_balance_wallet'],
  debts: ['Debts', 'handshake'],
  recent: ['Recent transactions', 'receipt_long'],
  places: ['Top places', 'location_on'],
};
const ROW = 60;

export function WidgetsSheet() {
  const nav = useNav();
  const prefs = usePrefs();
  const [dragging, setDragging] = useState<Block | null>(null);
  const drag = useRef<{ k: Block; y: number; start: Block[]; idx: number } | null>(null);

  const down = (k: Block, i: number) => (e: PointerEvent) => {
    drag.current = { k, y: e.clientY, start: prefs.order.slice(), idx: i };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(k);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const ni = Math.max(0, Math.min(d.start.length - 1, d.idx + Math.round((e.clientY - d.y) / ROW)));
    const order = d.start.filter((x) => x !== d.k);
    order.splice(ni, 0, d.k);
    if (order.join() !== prefs.order.join()) setPrefs({ order });
  };
  const up = () => {
    drag.current = null;
    setDragging(null);
  };

  return (
    <>
      <SheetHead
        left={
          <button type="button" className="tbtn" onClick={resetHome}>
            Reset
          </button>
        }
        title="Customize home"
        right={
          <button
            type="button"
            className="cbtn"
            aria-label="Done"
            onClick={nav.close}
            style={{ backdropFilter: 'none' }}
          >
            <Icon name="check" size={26} />
          </button>
        }
      />
      <div className="group" style={{ margin: '28px 20px 0', borderRadius: 28 }}>
        {prefs.order.map((k, i) => {
          const on = !prefs.hidden.includes(k);
          return (
            <div key={k}>
              {i > 0 && <div className="sep" style={{ marginLeft: 56 }} />}
              <div className={`widget-row ${dragging === k ? 'drag' : ''}`}>
                <Icon name={META[k][1]} style={{ color: 'var(--text2)' }} />
                <span style={{ flex: 1, fontSize: 17 }}>{META[k][0]}</span>
                <Toggle
                  on={on}
                  label={`Show ${META[k][0]}`}
                  onChange={() =>
                    setPrefs({ hidden: on ? [...prefs.hidden, k] : prefs.hidden.filter((x) => x !== k) })
                  }
                />
                <button
                  type="button"
                  className="handle"
                  aria-label={`Move ${META[k][0]}`}
                  onPointerDown={down(k, i)}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  onKeyDown={(e) => {
                    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                    const j = i + dir;
                    if (!dir || j < 0 || j >= prefs.order.length) return;
                    e.preventDefault();
                    const order = prefs.order.slice();
                    [order[i], order[j]] = [order[j], order[i]];
                    setPrefs({ order });
                  }}
                >
                  <Icon name="drag_handle" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ margin: '12px 36px 0', fontSize: 14, color: 'var(--text2)', lineHeight: 1.4 }}>
        Use the toggles to hide or show blocks. Drag ≡ to change their order.
      </div>
    </>
  );
}
