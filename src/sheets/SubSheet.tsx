import { useEffect, useMemo, useState } from 'react';
import { Avatar, Icon, Segmented } from '../components/ui';
import { parseAmount } from '../lib/format';
import { categoryMeta, isDebt } from '../lib/meta';
import { useMoney } from '../lib/money';
import { newId } from '../lib/outbox';
import { discardOp, enqueue, useStore } from '../lib/store';
import {
  addCadence,
  CADENCE_LABEL,
  CADENCE_WORDS,
  chargesOf,
  dShort,
  dWeekday,
  effectiveNext,
  nextOnOrAfter,
  priceChange,
} from '../lib/subs';
import { syncInfo } from '../lib/syncState';
import type { Cadence, Subscription, View } from '../lib/types';
import { useNav } from '../nav';
import { CategoryChips, CloseButton, Notice, SaveButton, SheetHead } from './common';

export function SubSheet({
  view,
  edit,
  setTint,
}: {
  view: View;
  edit?: Subscription;
  setTint: (t: string) => void;
}) {
  const nav = useNav();
  const money = useMoney(view);
  const info = syncInfo(useStore());
  const own = view.accounts.filter((a) => !isDebt(a));
  const firstAcc = own[0];
  const [name, setName] = useState(edit?.name ?? '');
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [currency, setCurrency] = useState(edit?.currency ?? firstAcc?.currency ?? 'PLN');
  const [cadence, setCadence] = useState<Cadence>(edit?.cadence ?? 'monthly');
  const [next, setNext] = useState(edit ? effectiveNext(view, edit) : addCadence(view.today, 'monthly'));
  const [account, setAccount] = useState(edit?.account ?? firstAcc?.name ?? '');
  const [category, setCategory] = useState(edit?.category ?? 'Subscriptions');
  const [picker, setPicker] = useState(false);
  const [armed, setArmed] = useState(false);

  const meta = categoryMeta(category, view.income);
  useEffect(
    () => setTint(`radial-gradient(120% 85% at 50% 0%, ${meta.color}55 0%, transparent 72%)`),
    [meta.color, setTint],
  );

  const n = parseAmount(amount);
  const amt = n > 0 ? n : 0;
  const isNew = !edit;
  const valid = amt > 0 && (!isNew || !!name.trim());
  const overdue = !!edit && !edit.paused && next < view.today;
  const usd = money.toUsd(amt, currency);
  const accountRow = view.accounts.find((a) => a.name === account);

  const past = useMemo(() => (edit ? chargesOf(view, edit).slice(0, 5) : []), [view, edit]);
  const change = useMemo(() => (edit ? priceChange(view, edit) : null), [view, edit]);

  const write = (patch: Partial<Subscription>, base?: Subscription) => {
    const s = base ?? edit;
    if (!s) return;
    const { pending: _p, ...rest } = { ...s, ...patch };
    enqueue({ action: 'subscription', sub: rest });
  };

  function save() {
    if (!valid) return;
    if (isNew) {
      enqueue({
        action: 'subscription',
        sub: {
          id: newId(),
          name: name.trim(),
          amount: amt,
          currency,
          cadence,
          next,
          account,
          category,
          paused: false,
          prev: null,
        },
      });
      nav.close();
      nav.toast(`${name.trim()} added to subscriptions`);
      return;
    }
    if (!edit) return;
    write({
      amount: amt,
      currency,
      cadence,
      next,
      account,
      category,
      prev: amt !== edit.amount ? edit.amount : edit.prev,
    });
    nav.close();
    nav.toast('Changes saved');
  }

  let notice = null;
  if (edit?.paused) {
    notice = (
      <Notice
        icon="pause_circle"
        color="var(--text2)"
        title="Paused"
        text="Not counted in totals or shown in Upcoming. Resume it when the charges start again."
      />
    );
  } else if (edit && overdue) {
    notice = (
      <Notice
        icon="event_busy"
        color="var(--red)"
        title={`Expected ${dShort(next)}, not found`}
        text={`${edit.name} usually charges ${edit.account} around this date. No matching record has appeared yet.`}
      >
        <div style={{ display: 'flex', gap: 8, margin: '14px 0 0 36px' }}>
          <button
            type="button"
            className="small-btn inv"
            onClick={() => {
              enqueue({
                action: 'add',
                tx: {
                  id: newId(),
                  kind: 'expense',
                  date: `${next}T09:00`,
                  amount: String(edit.amount),
                  currency: edit.currency,
                  merchant: edit.name,
                  account: edit.account,
                  category: edit.category,
                  note: '',
                },
              });
              write({ next: addCadence(next, edit.cadence) });
              nav.close();
              nav.toast(
                info.mode === 'offline' ? 'Saved on iPhone · will sync later' : 'Saved to Google Sheet',
              );
            }}
          >
            Mark as paid
          </button>
          <button
            type="button"
            className="small-btn"
            onClick={() => {
              const nn = addCadence(next, edit.cadence);
              write({ next: nn });
              nav.close();
              nav.toast(`Skipped · next charge ${dShort(nn)}`);
            }}
          >
            Skip this one
          </button>
        </div>
      </Notice>
    );
  } else if (change) {
    const d = money.toUsd(change.to - change.from, edit?.currency ?? 'USD') ?? 0;
    notice = (
      <Notice
        icon="trending_up"
        color="#ff9f0a"
        title={`Price went ${d >= 0 ? 'up' : 'down'} by ${money.B(Math.abs(d))}`}
        text={`Was ${money.n(change.from, edit?.currency ?? '')} until the last charge. Now ${money.n(change.to, edit?.currency ?? '')}.`}
      />
    );
  }

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title={isNew ? 'New subscription' : 'Subscription'}
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      <div className="acc-hero" style={{ padding: '20px 24px 0' }}>
        <span
          className="avatar"
          style={{ width: 60, height: 60, background: meta.color, opacity: edit?.paused ? 0.45 : 1 }}
        >
          <Icon name={meta.icon} size={30} />
        </span>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }}>
          {isNew ? name || 'New subscription' : edit?.name}
        </div>
        <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1.4, marginTop: 2 }}>
          {money.n(amt, currency)}
        </div>
        <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 2 }}>
          {currency !== money.base && amt && usd != null ? `≈ ${money.B(usd)} · ` : ''}
          {CADENCE_WORDS[cadence]}
        </div>
      </div>
      {notice}

      <div className="group" style={{ margin: '16px 20px 0' }}>
        {isNew && (
          <>
            <label className="kv-row">
              <span>Name</span>
              <input
                value={name}
                placeholder="e.g. Netflix"
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="kv-sep" />
          </>
        )}
        <label className="kv-row" style={{ gap: 8 }}>
          <span>Amount</span>
          <input
            value={amount}
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            style={{ fontWeight: 600 }}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
          <span className="value">{currency}</span>
        </label>
        <div className="kv-sep" />
        <label className="kv-row">
          <span style={{ flex: 1 }}>Next charge</span>
          <span className="value">{dWeekday(next, view.today)}</span>
          <input
            type="date"
            className="hidden-date"
            aria-label="Next charge"
            value={next}
            onChange={(e) => e.target.value && setNext(e.target.value)}
          />
        </label>
        <div className="kv-sep" />
        <button
          type="button"
          className="kv-row"
          style={{ gap: 8, paddingRight: 14 }}
          aria-expanded={picker}
          onClick={() => setPicker(!picker)}
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
          <Icon name={picker ? 'expand_less' : 'chevron_right'} size={22} style={{ color: 'var(--text3)' }} />
        </button>
        {picker &&
          own.map((a, i) => (
            <button
              key={a.name}
              type="button"
              className="acc-opt"
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => {
                setAccount(a.name);
                setCurrency(a.currency);
                setPicker(false);
              }}
            >
              <Avatar name={a.name} type={a.type} domain={a.domain} size={30} />
              <span style={{ flex: 1, fontSize: 16 }}>{a.name}</span>
              <span style={{ fontSize: 15, color: 'var(--text2)' }}>{a.currency}</span>
              <Icon name={a.name === account ? 'check' : ''} size={20} style={{ width: 20 }} />
            </button>
          ))}
      </div>

      <Segmented
        label="Repeats"
        value={cadence}
        onChange={setCadence}
        options={(['weekly', 'monthly', 'yearly'] as Cadence[]).map((k) => ({
          value: k,
          label: CADENCE_LABEL[k],
        }))}
      />
      <CategoryChips categories={view.categories} value={category} onChange={setCategory} />

      {edit && (
        <>
          <div className="group" style={{ margin: '16px 20px 0' }}>
            <button
              type="button"
              className="set-row tap"
              onClick={() => {
                // a resumed subscription starts from its next date, not from where it was paused
                write(
                  edit.paused
                    ? { paused: false, next: nextOnOrAfter(edit.next, edit.cadence, view.today) }
                    : { paused: true },
                );
                nav.close();
                nav.toast(
                  edit.paused ? `${edit.name} resumed` : `${edit.name} paused · not counted in totals`,
                );
              }}
            >
              <Icon name={edit.paused ? 'play_circle' : 'pause_circle'} />
              <span className="lbl">{edit.paused ? 'Resume' : 'Pause'}</span>
            </button>
            <div className="sep" style={{ marginLeft: 56 }} />
            <button
              type="button"
              className="set-row tap"
              style={{ color: 'var(--red)' }}
              onClick={() => {
                if (!armed) return setArmed(true);
                const opId = enqueue({ action: 'deleteSubscription', id: edit.id }, 4500);
                nav.close();
                nav.toast(`Stopped tracking ${edit.name}`, () => discardOp(opId));
              }}
            >
              <Icon name="block" />
              <span className="lbl">{armed ? 'Tap again to stop tracking' : 'Stop tracking'}</span>
            </button>
          </div>

          <div className="sheet-section">Past charges</div>
          <div className="group">
            {past.length === 0 && (
              <div style={{ padding: '22px 18px', textAlign: 'center', fontSize: 15, color: 'var(--text2)' }}>
                No charges from {edit.name} in your records yet.
              </div>
            )}
            {past.map((t, i) => {
              const older = past[i + 1];
              const dl =
                older && older.amount !== t.amount && older.currency === t.currency
                  ? t.amount - older.amount
                  : 0;
              const dUsd = dl ? money.toUsd(Math.abs(dl), t.currency) : null;
              return (
                <div key={t.id}>
                  {i > 0 && <div className="kv-sep" />}
                  <div className="kv-row">
                    <span style={{ flex: 1 }}>{dWeekday(t.date.slice(0, 10), view.today)}</span>
                    {dUsd != null && (
                      <span
                        style={{ fontSize: 13, fontWeight: 600, color: dl > 0 ? '#ff9f0a' : 'var(--green)' }}
                      >
                        {dl > 0 ? '+' : '−'}
                        {money.B(dUsd)}
                      </span>
                    )}
                    <span style={{ fontWeight: 600 }}>{money.n(t.amount, t.currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
