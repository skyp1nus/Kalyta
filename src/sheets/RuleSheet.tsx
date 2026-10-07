import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/ui';
import { dayHeading } from '../lib/format';
import { categoryMeta } from '../lib/meta';
import { useMoney } from '../lib/money';
import { norm, ruleMatches } from '../lib/rules';
import { enqueue } from '../lib/store';
import type { Rule, View } from '../lib/types';
import { useNav } from '../nav';
import { CategoryChips, CloseButton, SaveButton, SheetHead, ToggleRow } from './common';

export function RuleSheet({
  view,
  edit,
  setTint,
}: {
  view: View;
  edit?: Rule;
  setTint: (t: string) => void;
}) {
  const nav = useNav();
  const money = useMoney(view);
  const [kw, setKw] = useState(edit?.kw ?? '');
  const [cat, setCat] = useState(edit?.cat ?? 'Food');
  const [past, setPast] = useState(true);
  const [armed, setArmed] = useState(false);
  const color = categoryMeta(cat, view.income).color;
  useEffect(
    () => setTint(`radial-gradient(120% 85% at 50% 0%, ${color}55 0%, transparent 72%)`),
    [color, setTint],
  );

  const k = kw.trim();
  const matches = useMemo(() => ruleMatches(view, k).sort((a, b) => (a.date < b.date ? 1 : -1)), [view, k]);
  const move = matches.filter((t) => t.category !== view.income && t.category !== cat).length;
  const valid = k.length >= 2;

  function save() {
    if (!valid) return;
    const replaces = edit && norm(edit.kw) !== norm(k) ? edit.kw : undefined;
    enqueue({ action: 'rule', kw: k, cat, past, replaces });
    nav.close();
    const n = past ? move : 0;
    nav.toast(n ? `Rule saved · ${n} record${n === 1 ? '' : 's'} moved to ${cat}` : 'Rule saved');
  }

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title={edit ? 'Edit rule' : 'New rule'}
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      <label className="kw-card">
        <span className="lbl">WHEN PLACE CONTAINS</span>
        <input
          value={kw}
          placeholder="e.g. Żabka"
          autoComplete="off"
          onChange={(e) => setKw(e.target.value)}
        />
      </label>
      <div className="sheet-section" style={{ marginTop: 22 }}>
        Set category
      </div>
      <CategoryChips categories={view.categories} value={cat} onChange={setCat} style={{ paddingTop: 0 }} />
      <ToggleRow
        label="Also update past records"
        sub={
          past
            ? move
              ? `${move} record${move === 1 ? '' : 's'} will move to ${cat}`
              : 'Nothing to move'
            : 'Only new records'
        }
        on={past}
        onChange={() => setPast(!past)}
      />
      <div className="section-head" style={{ margin: '26px 24px 10px' }}>
        <h2>Preview</h2>
        <span style={{ fontSize: 15, color: 'var(--text2)' }}>
          {matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : ''}
        </span>
      </div>
      <div className="group">
        {matches.length === 0 && (
          <div
            style={{
              padding: '22px 18px',
              textAlign: 'center',
              fontSize: 15,
              color: 'var(--text2)',
              lineHeight: 1.4,
            }}
          >
            {k.length < 2
              ? 'Type a keyword to see matching records.'
              : 'No records match yet. The rule will apply to new ones.'}
          </div>
        )}
        {matches.slice(0, 6).map((t, i) => {
          const meta = categoryMeta(t.category, view.income);
          const income = t.category === view.income;
          const change = !income && t.category !== cat;
          return (
            <div key={t.id}>
              {i > 0 && <div className="sep" style={{ marginLeft: 66 }} />}
              <div className="row" style={{ padding: '12px 16px 12px 18px', gap: 12, minHeight: 0 }}>
                <span className="ic36" style={{ background: meta.color }}>
                  <Icon name={meta.icon} size={20} />
                </span>
                <span className="main">
                  <span className="ellipsis" style={{ display: 'block', fontSize: 16 }}>
                    {t.merchant}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13,
                      color: change && past ? 'var(--text)' : 'var(--text2)',
                    }}
                  >
                    {income
                      ? 'Income'
                      : change
                        ? `${t.category || 'No category'} → ${cat}`
                        : `Already ${cat}`}
                  </span>
                </span>
                <span style={{ textAlign: 'right', flex: 'none' }}>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>
                    {money.n(t.amount, t.currency, income ? '+' : '−')}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                    {dayHeading(t.date, view.today)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {edit && (
        <button
          type="button"
          className={`danger-btn ${armed ? 'armed' : ''}`}
          onClick={() => {
            if (!armed) return setArmed(true);
            enqueue({ action: 'deleteRule', kw: edit.kw });
            nav.close();
            nav.toast('Rule deleted');
          }}
        >
          <Icon name="delete" size={22} />
          {armed ? 'Tap again to delete' : 'Delete rule'}
        </button>
      )}
    </>
  );
}
