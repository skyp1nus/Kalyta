import { useEffect, useMemo, useState } from 'react';
import { AmountInput, Avatar, Icon, Segmented } from '../components/ui';
import { deletedMessage, deleteEntry } from '../lib/entries';
import { nowLocal, parseAmount } from '../lib/format';
import { CATEGORY_META, CURRENCIES, categoryMeta, INCOME_META, isDebt } from '../lib/meta';
import { useMoney } from '../lib/money';
import { newId } from '../lib/outbox';
import { kwOf, norm, placeMatches, ruleFor } from '../lib/rules';
import { monthSummary } from '../lib/stats';
import { enqueue, useStore } from '../lib/store';
import { syncInfo } from '../lib/syncState';
import type { Tx, TxInput, View } from '../lib/types';
import type { ToastIcon } from '../nav';
import { useNav } from '../nav';
import { CloseButton, DateRow, DeleteButton, NoteRow, SaveButton, SheetHead, tintFor } from './common';

type Kind = 'expense' | 'income';

// The account used most recently for this kind of entry
function lastAccount(view: View, kind: Kind): string {
  const own = view.accounts.filter((a) => !isDebt(a)).map((a) => a.name);
  for (let i = view.tx.length - 1; i >= 0; i--) {
    const t = view.tx[i];
    if ((t.category === view.income) === (kind === 'income') && own.includes(t.account)) return t.account;
  }
  return own[0] ?? '';
}

export function TxSheet({
  view,
  edit,
  account: presetAccount,
  type,
  setTint,
}: {
  view: View;
  edit?: Tx;
  account?: string;
  type?: Kind;
  setTint: (t: string) => void;
}) {
  const nav = useNav();
  const money = useMoney(view);
  const info = syncInfo(useStore());
  const initialKind: Kind = edit
    ? edit.category === view.income
      ? 'income'
      : 'expense'
    : (type ?? 'expense');
  const initialAccount = edit?.account ?? presetAccount ?? lastAccount(view, initialKind);
  const accountCurrency = (name: string) => view.accounts.find((a) => a.name === name)?.currency;

  const [kind, setKind] = useState<Kind>(initialKind);
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [currency, setCurrency] = useState(edit?.currency ?? accountCurrency(initialAccount) ?? 'PLN');
  const [category, setCategory] = useState(edit && edit.category !== view.income ? edit.category : '');
  const [place, setPlace] = useState(edit?.merchant ?? '');
  const [account, setAccount] = useState(initialAccount);
  const [accountPicked, setAccountPicked] = useState(!!edit || !!presetAccount);
  const [date, setDate] = useState(edit?.date ?? nowLocal());
  const [note, setNote] = useState(edit?.note ?? '');
  const [picker, setPicker] = useState<'cur' | 'acc' | null>(null);
  const [armed, setArmed] = useState(false);
  const [autoCat, setAutoCat] = useState(false); // category filled in by a rule, not picked
  const [ruleChoice, setRuleChoice] = useState<'one' | 'future' | 'past'>('one');

  const n = parseAmount(amount);
  const valid = n > 0;
  const color =
    kind === 'income' ? INCOME_META.color : category ? categoryMeta(category, view.income).color : '#8e8e93';
  useEffect(() => setTint(tintFor(color)), [color, setTint]);

  const suggestions = useMemo(() => {
    if (place) return [];
    const counts = new Map<string, number>();
    for (const t of view.tx) {
      if (!t.merchant || (t.category === view.income) !== (kind === 'income')) continue;
      if (kind === 'expense' && category && t.category !== category) continue;
      counts.set(t.merchant, (counts.get(t.merchant) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([p]) => p);
  }, [view, kind, category, place]);

  function onPlace(v: string) {
    setPlace(v);
    // a matching rule picks the category for new records, unless the user chose one
    if (!edit && kind === 'expense' && (autoCat || !category)) {
      const r = ruleFor(view.rules, v);
      setCategory(r?.cat ?? '');
      setAutoCat(!!r);
    }
  }

  // Changing an expense's category offers to remember it for that place
  const kw = kwOf(place);
  const rulePrompt =
    !!edit &&
    kind === 'expense' &&
    !!category &&
    category !== edit.category &&
    !!place.trim() &&
    norm(kw).trim().length >= 2 &&
    !view.rules.some((r) => norm(r.kw) === norm(kw) && r.cat === category);
  const pastCount = rulePrompt
    ? view.tx.filter(
        (t) =>
          t.id !== edit?.id &&
          t.category !== view.income &&
          t.category !== category &&
          t.merchant &&
          placeMatches(kw, t.merchant),
      ).length
    : 0;

  // "Food · 92% of budget" when this expense crosses 80% or 100% of the category's limit,
  // or of the overall monthly limit
  function budgetToast(cat: string, usdNow: number | null): [string, ToastIcon] | null {
    const ym = view.today.slice(0, 7);
    if (kind !== 'expense' || usdNow == null || !date.startsWith(ym)) return null;
    const m = monthSummary(view, ym);
    // records without a known category count as Other, like in Statistics
    const catOf = (c: string) => (view.categories.includes(c) ? c : 'Other');
    const wasThisMonth = !!edit && edit.category !== view.income && edit.date.startsWith(ym);
    const check = (label: string, lim: number | undefined, before: number, old: number) => {
      if (!lim) return null;
      const after = before - old + usdNow;
      const p0 = (before / lim) * 100;
      const p1 = (after / lim) * 100;
      if (!((p0 < 80 && p1 >= 80) || (p0 <= 100 && p1 > 100))) return null;
      const over = p1 > 100;
      return [
        `${label} · ${Math.round(p1)}% of budget${over ? ` · ${money.B(after - lim)} over` : ''}`,
        { icon: over ? 'error' : 'donut_large', color: over ? 'var(--red)' : '#ff9f0a' },
      ] as [string, ToastIcon];
    };
    const c = catOf(cat);
    const oldCat = wasThisMonth && edit && catOf(edit.category) === c ? (edit.usd ?? 0) : 0;
    const oldAll = wasThisMonth && edit ? (edit.usd ?? 0) : 0;
    return (
      check(c, view.budgets.cats[c], new Map(m.cats).get(c) ?? 0, oldCat) ??
      check('All spending', view.budgets.total, m.spent, oldAll)
    );
  }

  function save() {
    if (!valid) return;
    const tx: TxInput = {
      id: edit?.id ?? newId(),
      kind,
      date,
      amount: String(n),
      currency,
      merchant: place.trim(),
      account,
      category: kind === 'income' ? view.income : category,
      note: note.trim(),
    };
    // work out the budget warning against the data before this change
    const cat = tx.category || ruleFor(view.rules, tx.merchant)?.cat || 'Other';
    const b = budgetToast(cat, money.toUsd(n, currency));
    if (edit) enqueue({ action: 'update', id: edit.id, tx });
    else enqueue({ action: 'add', tx });
    nav.close();
    if (rulePrompt && ruleChoice !== 'one') {
      enqueue({ action: 'rule', kw, cat: category, past: ruleChoice === 'past' });
      nav.toast(
        ruleChoice === 'past' ? `Rule added · ${pastCount} records in ${category}` : `Rule added for “${kw}”`,
        undefined,
        { icon: 'rule', color: 'var(--text)' },
      );
      if (b) setTimeout(() => nav.toast(b[0], undefined, b[1]), 2600);
      return;
    }
    if (b) return nav.toast(b[0], undefined, b[1]);
    nav.toast(
      info.mode === 'offline'
        ? 'Saved on iPhone · will sync later'
        : edit
          ? 'Changes saved to your Sheet'
          : 'Saved to Google Sheet',
    );
  }

  function remove() {
    if (!edit) return;
    if (!armed) return setArmed(true);
    const e = { kind: 'tx' as const, t: edit };
    const undo = deleteEntry(e);
    nav.close();
    nav.toast(deletedMessage(e), undo);
  }

  const usd = valid ? money.toUsd(n, currency) : null;
  const own = view.accounts.filter((a) => !isDebt(a));
  const accountRow = view.accounts.find((a) => a.name === account);

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title={edit ? 'Edit transaction' : kind === 'income' ? 'New income' : 'New expense'}
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      <Segmented
        label="Type"
        value={kind}
        options={[
          { value: 'expense', label: 'Expense', icon: 'north_east' },
          { value: 'income', label: 'Income', icon: 'south_west' },
          ...(edit ? [] : [{ value: 'transfer' as Kind, label: 'Transfer', icon: 'swap_horiz' }]),
        ]}
        onChange={(k) => {
          if ((k as string) === 'transfer') nav.open({ kind: 'transfer' });
          else {
            setKind(k);
            // follow the account usually used for this kind until the user picks one
            if (!accountPicked) {
              const acc = lastAccount(view, k);
              setAccount(acc);
              setCurrency(accountCurrency(acc) ?? currency);
            }
          }
        }}
      />

      <div className="amount-card">
        <div className="amount-line">
          <AmountInput value={amount} onChange={setAmount} charWidth={37} label="Amount" />
          <button
            type="button"
            className={`cur-btn ${picker === 'cur' ? 'open' : ''}`}
            aria-expanded={picker === 'cur'}
            aria-label={`Currency ${currency}`}
            onClick={() => setPicker(picker === 'cur' ? null : 'cur')}
          >
            {currency}
            <Icon name="expand_more" />
          </button>
        </div>
        <div className="eq">
          {!valid ? 'Enter amount' : currency !== money.base && usd != null ? `≈ ${money.B(usd)}` : ''}
        </div>
        {picker === 'cur' && (
          <div className="pick-chips">
            {[...new Set([...CURRENCIES, currency])].map((c, i) => (
              <button
                key={c}
                type="button"
                className={`pick-chip ${c === currency ? 'on' : ''}`}
                style={{ animationDelay: `${i * 25}ms` }}
                onClick={() => {
                  setCurrency(c);
                  setPicker(null);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {kind === 'expense' && (
        <div className="cat-chips">
          {view.categories.map((c) => {
            const meta = CATEGORY_META[c] ?? CATEGORY_META.Other;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                className="cat-chip"
                style={{ borderColor: category === c ? meta.color : 'transparent' }}
                onClick={() => {
                  setAutoCat(false);
                  setCategory(category === c ? '' : c);
                }}
              >
                <span className="ic" style={{ background: meta.color }}>
                  <Icon name={meta.icon} />
                </span>
                {c}
              </button>
            );
          })}
        </div>
      )}
      {kind === 'expense' && !category && !edit && (
        <div className="hint-line" style={{ marginTop: 10 }}>
          No category: your sheet picks one from its Rules.
        </div>
      )}
      {rulePrompt && (
        <div className="rule-prompt">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="ic" style={{ background: categoryMeta(category, view.income).color }}>
              <Icon name={categoryMeta(category, view.income).icon} size={18} />
            </span>
            <div
              style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, paddingTop: 4, textWrap: 'pretty' }}
            >
              Always use {category} for “{kw}”?
            </div>
          </div>
          <div className="vseg">
            {(
              [
                ['one', 'Just this one', ''],
                ['future', 'Future only', ''],
                ['past', 'Future + past', `${pastCount} record${pastCount === 1 ? '' : 's'}`],
              ] as const
            ).map(([k, label, note]) => (
              <button
                key={k}
                type="button"
                aria-pressed={ruleChoice === k}
                className={ruleChoice === k ? 'on' : ''}
                onClick={() => setRuleChoice(k)}
              >
                <span>{label}</span>
                <span style={{ fontWeight: 400, color: 'var(--text2)' }}>{note}</span>
              </button>
            ))}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text2)',
              marginTop: 10,
              lineHeight: 1.4,
              textWrap: 'pretty',
            }}
          >
            {ruleChoice === 'one'
              ? 'Only this record changes.'
              : ruleChoice === 'future'
                ? `New records from “${kw}” will go to ${category}. Manage rules in Settings → Category rules.`
                : `This record and ${pastCount} earlier one${pastCount === 1 ? '' : 's'} move to ${category}. New ones will too.`}
          </div>
        </div>
      )}

      <div className="group" style={{ margin: '16px 20px 0' }}>
        <label className="kv-row">
          <span>{kind === 'income' ? 'From' : 'Place'}</span>
          <input
            value={place}
            placeholder={kind === 'income' ? 'Who paid?' : 'Where?'}
            autoComplete="off"
            onChange={(e) => onPlace(e.target.value)}
          />
        </label>
        {suggestions.length > 0 && (
          <div className="sugs">
            {suggestions.map((p) => (
              <button key={p} type="button" onClick={() => onPlace(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="kv-sep" />
        <button
          type="button"
          className="kv-row"
          aria-expanded={picker === 'acc'}
          style={{ gap: 8, paddingRight: 14 }}
          onClick={() => setPicker(picker === 'acc' ? null : 'acc')}
        >
          <span style={{ flex: 1 }}>Account</span>
          {account && (
            <Avatar
              name={account}
              type={accountRow?.type}
              domain={accountRow?.domain}
              size={22}
              className="mini-avatar"
            />
          )}
          <span className="value">{account || 'None'}</span>
          <Icon
            name={picker === 'acc' ? 'expand_less' : 'chevron_right'}
            size={22}
            style={{ color: 'var(--text3)' }}
          />
        </button>
        {picker === 'acc' &&
          own.map((a, i) => (
            <button
              key={a.name}
              type="button"
              className="acc-opt"
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => {
                setAccount(a.name);
                setAccountPicked(true);
                setCurrency(a.currency);
                setPicker(null);
              }}
            >
              <Avatar name={a.name} type={a.type} domain={a.domain} size={30} className="avatar" />
              <span style={{ flex: 1, fontSize: 16 }}>{a.name}</span>
              <span style={{ fontSize: 15, color: 'var(--text2)' }}>{money.n(a.balance, a.currency)}</span>
              <Icon name={a.name === account ? 'check' : ''} size={20} style={{ width: 20 }} />
            </button>
          ))}
      </div>

      <div className="group" style={{ margin: '16px 20px 0' }}>
        <DateRow value={date} today={view.today} onChange={setDate} />
        <div className="kv-sep" />
        <NoteRow value={note} onChange={setNote} />
      </div>

      {(info.mode === 'offline' || info.mode === 'error') && (
        <div className="hint-line">
          <Icon name="cloud_off" />
          Offline. This will be saved on your iPhone and sent to your Sheet later.
        </div>
      )}

      {edit && <DeleteButton armed={armed} label="Delete transaction" onClick={remove} />}
    </>
  );
}
