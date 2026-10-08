import { useState } from 'react';
import { Icon } from '../components/ui';
import { MONTHS } from '../lib/format';
import { categoryMeta } from '../lib/meta';
import { useMoney } from '../lib/money';
import { monthSummary, shiftYm } from '../lib/stats';
import { enqueue } from '../lib/store';
import { hasBudgets } from '../lib/subs';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, SaveButton, SheetHead } from './common';

const SYM: Record<string, string> = { USD: '$', EUR: '€', PLN: 'zł', UAH: '₴' };
const digits = (v: string) => v.replace(/[^0-9]/g, '');

export function BudgetsSheet({ view }: { view: View }) {
  const nav = useNav();
  const money = useMoney(view);
  const rate = money.rate(money.base) ?? 1; // USD per unit of the base currency
  const inBase = (usd: number) => (usd ? String(Math.round(usd / rate)) : '');
  const prev = monthSummary(view, shiftYm(view.today.slice(0, 7), -1));
  const prevCats = new Map(prev.cats);
  const prevName = MONTHS[Number(prev.ym.slice(5, 7)) - 1];
  const has = hasBudgets(view);

  const [total, setTotal] = useState(inBase(view.budgets.total));
  const [cats, setCats] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.categories.map((c) => [c, inBase(view.budgets.cats[c] ?? 0)])),
  );
  const [armed, setArmed] = useState(false);

  const sum = view.categories.reduce((a, c) => a + (Number(cats[c]) || 0), 0);
  const tot = Number(total) || 0;
  const tooMuch = tot > 0 && sum > tot;

  function save() {
    const out: Record<string, number> = {};
    for (const c of view.categories) {
      const v = Number(cats[c]) || 0;
      if (v > 0) out[c] = Math.round(v * rate * 100) / 100;
    }
    const t = tot > 0 ? Math.round(tot * rate * 100) / 100 : 0;
    enqueue({ action: 'budgets', total: t, cats: out });
    nav.close();
    nav.toast(Object.keys(out).length || t ? 'Budgets saved' : 'Budgets removed');
  }

  const row = (
    key: string,
    label: string,
    hint: string,
    value: string,
    onChange: (v: string) => void,
    icon: string,
    color?: string,
  ) => (
    <div className="row" style={{ padding: '12px 18px', minHeight: 0 }}>
      <span
        className="ic36"
        style={{
          background: color ?? 'var(--seg)',
          color: color ? '#fff' : 'var(--text)',
          boxShadow: color ? undefined : 'none',
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="main">
        <span style={{ display: 'block', fontSize: 17 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{hint}</span>
      </span>
      <label className="lim-input">
        <span style={{ color: 'var(--text2)' }}>{SYM[money.base] ?? money.base}</span>
        <input
          value={value}
          inputMode="numeric"
          placeholder="No limit"
          aria-label={`${key} limit`}
          onChange={(e) => onChange(digits(e.target.value))}
        />
      </label>
    </div>
  );

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title="Budgets"
        right={<SaveButton onClick={save} enabled />}
      />
      <div
        style={{
          margin: '16px 32px 0',
          textAlign: 'center',
          fontSize: 15,
          color: 'var(--text2)',
          lineHeight: 1.4,
          textWrap: 'pretty',
        }}
      >
        Monthly limits in {money.base}. Hints show what you spent in {prevName}.
      </div>
      <div className="center" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="soft-btn"
          style={{ height: 40, padding: '0 18px', fontSize: 15 }}
          onClick={() => {
            setCats(
              Object.fromEntries(
                view.categories.map((c) => {
                  const v = (prevCats.get(c) ?? 0) / rate;
                  return [c, v ? String(Math.ceil(v / 10) * 10) : ''];
                }),
              ),
            );
            setTotal(prev.spent ? String(Math.ceil(prev.spent / rate / 50) * 50) : '');
            nav.toast(`Filled in from ${prevName}`);
          }}
        >
          <Icon name="history" size={20} />
          Use last month
        </button>
      </div>

      <div className="sheet-section" style={{ marginTop: 24 }}>
        Overall
      </div>
      <div className="group">
        {row(
          'All spending',
          'All spending',
          `Last month: ${money.B(prev.spent)}`,
          total,
          setTotal,
          'savings',
        )}
      </div>

      <div className="sheet-section">Categories</div>
      <div className="group">
        {view.categories.map((c, i) => {
          const meta = categoryMeta(c);
          const lv = prevCats.get(c) ?? 0;
          return (
            <div key={c}>
              {i > 0 && <div className="sep" style={{ marginLeft: 68 }} />}
              {row(
                c,
                c,
                lv ? `Last month: ${money.B(lv)}` : 'Nothing last month',
                cats[c] ?? '',
                (v) => setCats((x) => ({ ...x, [c]: v })),
                meta.icon,
                meta.color,
              )}
            </div>
          );
        })}
      </div>
      <div className="sheet-note" style={{ color: tooMuch ? '#ff9f0a' : undefined }}>
        {sum
          ? `Categories add up to ${money.B(sum * rate)}${tooMuch ? ', more than the overall limit.' : '.'}`
          : 'No category limits yet.'}
      </div>
      <div className="sheet-note" style={{ marginTop: 6 }}>
        Stored in the Budgets tab of your Sheet. Editing works offline.
      </div>
      {has && (
        <button
          type="button"
          className={`danger-btn ${armed ? 'armed' : ''}`}
          style={{ marginTop: 20 }}
          onClick={() => {
            if (!armed) return setArmed(true);
            enqueue({ action: 'budgets', total: 0, cats: {} });
            nav.close();
            nav.toast('Budgets removed');
          }}
        >
          <Icon name="delete" size={22} />
          {armed ? 'Tap again to remove' : 'Remove all budgets'}
        </button>
      )}
    </>
  );
}
