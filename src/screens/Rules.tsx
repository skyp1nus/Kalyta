import { memo } from 'react';
import { usePinnedGlow } from '../components/hooks';
import { BackButton, CircleButton, EmptyState, Icon } from '../components/ui';
import { categoryMeta, isIncomeCat } from '../lib/meta';
import { ruleMatches } from '../lib/rules';
import type { View } from '../lib/types';
import { useNav } from '../nav';

export const Rules = memo(function Rules({ view }: { view: View }) {
  const nav = useNav();
  const glow = usePinnedGlow();
  const add = () => nav.open({ kind: 'rule' });
  return (
    <>
      <div className="glow" ref={glow.ref} />
      <div className="scroll" onScroll={glow.onScroll}>
        <div className="page">
          <h1 className="large-title">Category rules</h1>
          <p className="screen-intro">
            When a place contains the keyword, new records get that category. Rules are saved to your Sheet.
          </p>
          {view.rules.length > 0 ? (
            <div className="group" style={{ marginTop: 22 }}>
              {view.rules.map((r, i) => {
                const meta = categoryMeta(r.cat, view.income);
                const n = ruleMatches(view, r.kw).filter((t) => !isIncomeCat(t.category)).length;
                return (
                  <div key={r.kw}>
                    {i > 0 && <div className="sep" />}
                    <button
                      type="button"
                      className="row"
                      style={{ paddingRight: 14 }}
                      onClick={() => nav.open({ kind: 'rule', edit: r })}
                    >
                      <span className="avatar" style={{ background: meta.color }}>
                        <Icon name={meta.icon} />
                      </span>
                      <span className="main">
                        <span className="title ellipsis" style={{ display: 'block' }}>
                          “{r.kw}”
                        </span>
                        <span className="sub" style={{ display: 'block' }}>
                          {r.cat} · {n} record{n === 1 ? '' : 's'}
                        </span>
                      </span>
                      <Icon name="chevron_right" className="chev" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="rule"
              title="No rules yet"
              text="Change a record's category and Kalyta will offer to remember it."
              action="Add rule"
              onAction={add}
            />
          )}
        </div>
      </div>
      <div className="topbar">
        <BackButton onClick={nav.pop} />
        <CircleButton icon="add" label="New rule" iconSize={26} onClick={add} />
      </div>
    </>
  );
});
