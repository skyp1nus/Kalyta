import { useEffect, useState } from 'react';
import { Icon, Segmented } from '../components/ui';
import { CATEGORY_COLORS, CATEGORY_EMOJI, type CategoryKind, categoryMeta } from '../lib/meta';
import { enqueue } from '../lib/store';
import type { View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, DeleteButton, SaveButton, SheetHead, tintFor } from './common';

// The last character as people see it (an emoji can be several code points), so typing a new
// emoji replaces the old one
function lastGlyph(s: string): string {
  const all = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.trim())];
  return all.length ? all[all.length - 1].segment : '';
}

export function CategorySheet({
  view,
  edit,
  kind: startKind = 'expense',
  setTint,
}: {
  view: View;
  edit?: string;
  kind?: CategoryKind;
  setTint: (t: string) => void;
}) {
  const nav = useNav();
  const meta = edit ? categoryMeta(edit) : null;
  const own = edit ? view.categoryLooks.find((r) => r[0] === edit) : undefined;
  const [kind, setKind] = useState<CategoryKind>(
    edit ? (view.incomeCategories.includes(edit) ? 'income' : 'expense') : startKind,
  );
  const [name, setName] = useState(edit ?? '');
  const [emoji, setEmoji] = useState(own?.[2] ?? '');
  const [color, setColor] = useState(own?.[3] || meta?.color || CATEGORY_COLORS[0]);
  const [armed, setArmed] = useState(false);

  useEffect(() => setTint(tintFor(color)), [color, setTint]);

  const n = name.trim();
  const all = [...view.categories, ...view.incomeCategories];
  const dup = !edit && all.some((c) => c.toLowerCase() === n.toLowerCase());
  const valid = !!n && !dup;
  const fixed = edit === 'Other' || edit === view.income;
  const records = edit ? view.tx.filter((t) => t.category === edit).length : 0;
  // keep a built-in category's own symbol unless an emoji was picked
  const icon = emoji || meta?.icon || '🏷️';

  function save() {
    if (!valid) return;
    enqueue({ action: 'category', cat: { name: n, kind, emoji, color } });
    nav.close();
    nav.toast(edit ? `${n} updated` : `${n} added`, undefined, { icon: icon, color });
  }

  function remove() {
    if (!edit || fixed) return;
    if (!armed) return setArmed(true);
    enqueue({ action: 'deleteCategory', name: edit });
    nav.close();
    nav.toast(`${edit} deleted`);
  }

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title={edit ? 'Category' : 'New category'}
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      {!edit && (
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
      )}
      <div className="acc-hero" style={{ padding: '18px 24px 0' }}>
        <span className="cat-big" style={{ background: color }}>
          <Icon name={icon} size={40} />
        </span>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 12 }}>{n || 'New category'}</div>
        <div
          style={{ fontSize: 15, color: dup ? 'var(--red)' : 'var(--text2)', marginTop: 2, minHeight: 20 }}
        >
          {dup ? `“${n}” already exists` : kind === 'income' ? 'Money coming in' : 'Spending'}
        </div>
      </div>

      <div className="group" style={{ margin: '18px 20px 0' }}>
        <label className="kv-row">
          <span>Name</span>
          <input
            value={name}
            placeholder={kind === 'income' ? 'e.g. Freelance' : 'e.g. Pets'}
            autoComplete="off"
            maxLength={30}
            disabled={!!edit}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="kv-sep" />
        <label className="kv-row">
          <span>Emoji</span>
          <input
            value={emoji}
            placeholder={edit && !emoji ? 'built-in icon' : 'type or pick below'}
            autoComplete="off"
            onChange={(e) => setEmoji(lastGlyph(e.target.value))}
          />
        </label>
      </div>

      <div className="emoji-grid">
        {CATEGORY_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={emoji === e}
            aria-label={e}
            onClick={() => setEmoji(emoji === e ? '' : e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="swatches">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            style={{ background: c }}
            onClick={() => setColor(c)}
          >
            {color === c && <Icon name="check" size={20} />}
          </button>
        ))}
      </div>

      {edit && !fixed && (
        <div style={{ margin: '24px 20px 0' }}>
          <DeleteButton armed={armed} label="Delete category" onClick={remove} />
          <div className="sheet-note" style={{ margin: '10px 8px 0', textAlign: 'center' }}>
            {records
              ? `${records} record${records === 1 ? '' : 's'} move to “${kind === 'income' ? view.income : 'Other'}”, its rules and budget are removed.`
              : 'No records use it.'}
          </div>
        </div>
      )}
      {fixed && (
        <div className="sheet-note" style={{ marginTop: 18, textAlign: 'center' }}>
          “{edit}” catches everything without a category, so it can’t be deleted.
        </div>
      )}
    </>
  );
}
