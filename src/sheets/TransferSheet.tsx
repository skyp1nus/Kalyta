import { useEffect, useState } from 'react';
import { Avatar, Icon, Segmented } from '../components/ui';
import { deletedMessage, deleteEntry } from '../lib/entries';
import { nowLocal, parseAmount } from '../lib/format';
import { accountLook, TRANSFER_META } from '../lib/meta';
import { useMoney } from '../lib/money';
import { newId, sameCurrency } from '../lib/outbox';
import { enqueue, useStore } from '../lib/store';
import { syncInfo } from '../lib/syncState';
import type { Transfer, TransferInput, View } from '../lib/types';
import { useNav } from '../nav';
import { CloseButton, DateRow, DeleteButton, NoteRow, SaveButton, SheetHead, tintFor } from './common';

const round2 = (v: number) => Math.round(v * 100) / 100;
const clean = (v: string) => v.replace(/[^0-9.,]/g, '');

// Units of `to` per unit of `from`, from the latest transfer between these currencies
function lastRate(view: View, from: string, to: string): number | null {
  for (let i = view.transfers.length - 1; i >= 0; i--) {
    const t = view.transfers[i];
    if (t.sent <= 0 || t.received <= 0) continue;
    if (t.fromCurrency === from && t.toCurrency === to) return t.received / t.sent;
    if (t.fromCurrency === to && t.toCurrency === from) return t.sent / t.received;
  }
  return null;
}

export function TransferSheet({
  view,
  edit,
  from: presetFrom,
  setTint,
}: {
  view: View;
  edit?: Transfer;
  from?: string;
  setTint: (t: string) => void;
}) {
  const nav = useNav();
  const money = useMoney(view);
  const info = syncInfo(useStore());
  const names = view.accounts.map((a) => a.name);
  const last = view.transfers[view.transfers.length - 1];
  const startFrom = edit?.from ?? presetFrom ?? last?.from ?? names[0] ?? '';
  const startTo =
    edit?.to ?? (last && last.to !== startFrom ? last.to : (names.find((n) => n !== startFrom) ?? ''));

  const [from, setFrom] = useState(startFrom);
  const [to, setTo] = useState(startTo);
  const [a, setA] = useState(edit ? String(edit.sent) : '');
  const [b, setB] = useState(edit ? String(edit.received) : '');
  const [date, setDate] = useState(edit?.date ?? nowLocal());
  const [note, setNote] = useState(edit?.note ?? '');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [armed, setArmed] = useState(false);
  const [turned, setTurned] = useState(false);

  useEffect(() => setTint(tintFor(`${TRANSFER_META.color}`)), [setTint]);

  const acc = (name: string) => view.accounts.find((x) => x.name === name);
  const fa = acc(from);
  const ta = acc(to);
  const fromCur = (edit && from === edit.from ? edit.fromCurrency : fa?.currency) || 'PLN';
  const toCur = (edit && to === edit.to ? edit.toCurrency : ta?.currency) || fromCur;
  const sent = parseAmount(a);
  const received = parseAmount(b);
  const same = from === to;
  const valid = sent > 0 && received > 0 && !same && !!from && !!to;

  const market = sameCurrency(fromCur, toCur) ? 1 : money.convert(1, fromCur, toCur);
  const suggested = sameCurrency(fromCur, toCur) ? 1 : (lastRate(view, fromCur, toCur) ?? market);

  function onSent(v: string) {
    setA(v);
    const nv = parseAmount(v);
    const ratio = sent > 0 && received > 0 ? received / sent : suggested;
    setB(nv > 0 && ratio ? String(round2(nv * ratio)) : '');
  }

  let rateText = '—';
  let marketText = market
    ? `Market rate ${market >= 1 ? `1 ${fromCur} = ${market.toFixed(2)} ${toCur}` : `1 ${toCur} = ${(1 / market).toFixed(2)} ${fromCur}`}`
    : '';
  if (sent > 0 && received > 0 && !sameCurrency(fromCur, toCur)) {
    const r = received / sent;
    if (r < 1) {
      rateText = `1 ${toCur} = ${(sent / received).toFixed(2)} ${fromCur}`;
    } else {
      rateText = `1 ${fromCur} = ${r.toFixed(4)} ${toCur}`;
    }
    if (market) {
      const d = (market / r - 1) * 100;
      marketText += ` · ${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
    }
  } else if (sameCurrency(fromCur, toCur)) {
    rateText = 'Same currency';
    marketText = '';
  }

  function save() {
    if (!valid) return;
    const tr: TransferInput = {
      id: edit?.id ?? newId(),
      date,
      from,
      sent: String(sent),
      fromCurrency: fromCur,
      to,
      received: String(received),
      toCurrency: toCur,
      note: note.trim(),
    };
    if (edit) enqueue({ action: 'updateTransfer', id: edit.id, tr });
    else enqueue({ action: 'transfer', tr });
    nav.close();
    nav.toast(
      info.mode === 'offline'
        ? 'Saved on iPhone · will sync later'
        : edit
          ? 'Transfer updated'
          : 'Transfer saved',
    );
  }

  function remove() {
    if (!edit) return;
    if (!armed) return setArmed(true);
    const e = { kind: 'transfer' as const, t: edit };
    const undo = deleteEntry(e);
    nav.close();
    nav.toast(deletedMessage(e), undo);
  }

  const side = (which: 'from' | 'to') => {
    const isTo = which === 'to';
    const name = isTo ? to : from;
    const account = isTo ? ta : fa;
    return (
      <div className={`side ${isTo ? 'to' : ''}`}>
        <div className="lbl">{isTo ? 'TO' : 'FROM'}</div>
        <button
          type="button"
          className="who"
          aria-expanded={picker === which}
          onClick={() => setPicker(picker === which ? null : which)}
        >
          {name && (
            <Avatar name={name} type={account?.type} domain={account?.domain} size={32} className="avatar" />
          )}
          <span style={{ fontSize: 17, fontWeight: 600 }}>{name || 'Choose account'}</span>
          <span style={{ flex: 1, fontSize: 15, color: 'var(--text2)' }}>
            {account ? money.n(account.balance, account.currency) : ''}
          </span>
          <Icon
            name="expand_more"
            size={22}
            style={{
              color: 'var(--text3)',
              transition: 'transform .3s var(--ease)',
              transform: picker === which ? 'rotate(180deg)' : undefined,
            }}
          />
        </button>
        {picker === which && (
          <div className="acc-chips">
            {view.accounts.map((o, i) => (
              <button
                key={o.name}
                type="button"
                className={o.name === name ? 'on' : ''}
                style={{ animationDelay: `${i * 25}ms` }}
                onClick={() => {
                  if (isTo) setTo(o.name);
                  else setFrom(o.name);
                  setB('');
                  setPicker(null);
                }}
              >
                <i style={{ background: accountLook(o.name, o.type).color }} />
                {o.name}
              </button>
            ))}
          </div>
        )}
        <div className="val">
          <input
            value={isTo ? b : a}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-label={isTo ? 'Amount received' : 'Amount sent'}
            onChange={(e) => (isTo ? setB(clean(e.target.value)) : onSent(clean(e.target.value)))}
          />
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text2)' }}>
            {isTo ? toCur : fromCur}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <SheetHead
        left={<CloseButton onClick={nav.close} />}
        title={edit ? 'Edit transfer' : 'Transfer'}
        right={<SaveButton onClick={save} enabled={valid} />}
      />
      {!edit && (
        <Segmented
          label="Type"
          value="transfer"
          options={[
            { value: 'expense', label: 'Expense', icon: 'north_east' },
            { value: 'income', label: 'Income', icon: 'south_west' },
            { value: 'transfer', label: 'Transfer', icon: 'swap_horiz' },
          ]}
          onChange={(k) => {
            if (k !== 'transfer') nav.open({ kind: 'tx', type: k });
          }}
        />
      )}

      {side('from')}
      <div className="swap">
        <button
          type="button"
          aria-label="Swap accounts"
          className={turned ? 'turned' : ''}
          onClick={() => {
            setTurned(!turned);
            setFrom(to);
            setTo(from);
            setA(b);
            setB(a);
          }}
        >
          <Icon name="swap_vert" size={22} />
        </button>
      </div>
      {side('to')}

      <div className="group" style={{ margin: '16px 20px 0' }}>
        <div className="kv-row" style={{ padding: '12px 18px' }}>
          <span style={{ flex: 1 }}>Rate</span>
          <span style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 17 }}>{rateText}</span>
            {marketText && (
              <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                {marketText}
              </span>
            )}
          </span>
        </div>
        <div className="kv-sep" />
        <DateRow value={date} today={view.today} onChange={setDate} />
        <div className="kv-sep" />
        <NoteRow value={note} onChange={setNote} />
      </div>

      {same && (
        <div className="hint-line" style={{ color: 'var(--red)' }}>
          Choose two different accounts.
        </div>
      )}
      {!same && (
        <div className="hint-line">
          Transfers move money between your accounts. They don’t count as spending.
        </div>
      )}

      {edit && <DeleteButton armed={armed} label="Delete transfer" onClick={remove} />}
    </>
  );
}
