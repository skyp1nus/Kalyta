import { memo, useState } from 'react';
import { usePinnedGlow } from '../components/hooks';
import { BackButton, CircleButton, Icon, Segmented } from '../components/ui';
import { type CategoryKind, categoryMeta } from '../lib/meta';
import type { View } from '../lib/types';
import { useNav } from '../nav';

// All categories as a grid of circles, expense or income; tap one to change or delete it
export const Categories = memo(function Categories({ view }: { view: View }) {
  const nav = useNav();
  const glow = usePinnedGlow();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const list = kind === 'income' ? view.incomeCategories : view.categories;
  const used = new Map<string, number>();
  for (const t of view.tx) used.set(t.category, (used.get(t.category) ?? 0) + 1);

  return (
    <>
      <div className="glow" ref={glow.ref} />
      <div className="scroll" onScroll={glow.onScroll}>
        <div className="page">
          <h1 className="large-title">Categories</h1>
          <div style={{ marginTop: 14 }}>
            <Segmented
              label="Kind"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
              ]}
            />
          </div>
          <div className="cat-grid" key={kind}>
            {list.map((c) => {
              const meta = categoryMeta(c);
              const n = used.get(c) ?? 0;
              return (
                <button
                  key={c}
                  type="button"
                  className="cat-cell"
                  onClick={() => nav.open({ kind: 'category', edit: c, catKind: kind })}
                >
                  <span className="circle" style={{ background: meta.color }}>
                    <Icon name={meta.icon} size={30} />
                  </span>
                  <span className="ellipsis">{c}</span>
                  <span className="n">{n ? `${n} record${n === 1 ? '' : 's'}` : ' '}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="cat-cell add"
              onClick={() => nav.open({ kind: 'category', catKind: kind })}
            >
              <span className="circle">
                <Icon name="add" size={30} />
              </span>
              <span>New</span>
              <span className="n"> </span>
            </button>
          </div>
          <p className="screen-intro" style={{ marginTop: 18 }}>
            Saved on the Categories tab of your Sheet. Deleting one moves its records to{' '}
            {kind === 'income' ? `“${view.income}”` : '“Other”'}.
          </p>
        </div>
      </div>
      <div className="topbar">
        <BackButton onClick={nav.pop} />
        <CircleButton
          icon="add"
          label="New category"
          iconSize={28}
          onClick={() => nav.open({ kind: 'category', catKind: kind })}
        />
      </div>
    </>
  );
});
